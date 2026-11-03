// Cloud runs from the Studio: sign in to Stunt Double with OAuth 2.1 and PKCE
// against the hosted MCP (dynamic client registration, a loopback redirect to
// the Studio's own 127.0.0.1 port), then push the project's files and run them
// through the hosted MCP tools, as `/stuntdouble cloud` does in Claude Code
// (stuntdouble-mcp, skills/stuntdouble/SKILL.md). The token is kept in
// `~/.stuntdouble/credentials.json` and never reaches the page.
//
// Cloud runs are billed to the workspace, never to anyone's model connection.

import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { isPrivateHost } from '@stuntkit/browser-toolset/executor';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { readCredentials, updateCredentials } from './credentials.ts';
import {
  ActorSchema,
  ChecklistSchema,
  ConfigSchema,
  readJson,
  type Run,
  runningMarker,
  writeFileAtomic,
  writeJsonAtomic,
} from './files.ts';
import { PACKAGE } from './run.ts';

export const cloudServer = (): string =>
  process.env.STUNTDOUBLE_CLOUD_URL || 'https://app.stuntdouble.io/api/mcp';
const appOrigin = () => new URL(cloudServer()).origin;
export const billingUrl = (slug: string) => `${appOrigin()}/w/${slug}/settings/billing`;

/** The hosted MCP said no: its words, relayed as they are. */
export class CloudRefusal extends Error {}

class StudioOAuth implements OAuthClientProvider {
  readonly stateValue = randomBytes(24).toString('base64url');
  authorizationUrl: URL | null = null;
  private verifier = '';

  private readonly redirect: string | undefined;
  private readonly server = cloudServer();

  constructor(redirect: string | undefined) {
    this.redirect = redirect;
  }

  get redirectUrl() {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Stunt Double Studio',
      redirect_uris: this.redirect ? [this.redirect] : [],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  state() {
    return this.stateValue;
  }

  private async cloud() {
    const cloud = (await readCredentials()).cloud;
    return cloud?.server === this.server ? cloud : undefined;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const client = (await this.cloud())?.client as OAuthClientInformationMixed | undefined;
    if (!client) return undefined;
    // Registered for another port: register again for this one.
    const uris = (client as { redirect_uris?: string[] }).redirect_uris;
    if (this.redirect && !uris?.includes(this.redirect)) return undefined;
    return client;
  }

  async saveClientInformation(client: OAuthClientInformationMixed) {
    await updateCredentials((c) => ({
      ...c,
      cloud: { ...(c.cloud?.server === this.server ? c.cloud : {}), server: this.server, client },
    }));
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.cloud())?.tokens as OAuthTokens | undefined;
  }

  async saveTokens(tokens: OAuthTokens) {
    await updateCredentials((c) => ({
      ...c,
      cloud: { ...(c.cloud?.server === this.server ? c.cloud : {}), server: this.server, tokens },
    }));
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  saveCodeVerifier(verifier: string) {
    this.verifier = verifier;
  }

  codeVerifier() {
    return this.verifier;
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'verifier' || scope === 'discovery') return;
    await updateCredentials((c) => {
      if (!c.cloud) return c;
      const { tokens: _t, client: _c, ...rest } = c.cloud;
      return {
        ...c,
        cloud: {
          ...rest,
          ...(scope === 'client' ? { tokens: c.cloud.tokens } : {}),
          ...(scope === 'tokens' ? { client: c.cloud.client } : {}),
        },
      };
    });
  }
}

/** Sign-ins waiting for their callback, by OAuth state. */
const pending = new Map<string, StudioOAuth>();

/** The address to send the person to, to approve the Studio. */
export async function beginLogin(redirect: string): Promise<string> {
  // A fresh sign-in: an old token is dropped, a registration for this port kept.
  await updateCredentials((c) =>
    c.cloud ? { ...c, cloud: { ...c.cloud, tokens: undefined, workspace: undefined } } : c
  );
  const provider = new StudioOAuth(redirect);
  await auth(provider, { serverUrl: cloudServer() });
  if (!provider.authorizationUrl) throw new Error('Stunt Double did not offer a sign-in page.');
  // ponytail: kept in memory, a handful at most; a restart means signing in again.
  if (pending.size >= 5) pending.delete(pending.keys().next().value!);
  pending.set(provider.stateValue, provider);
  return provider.authorizationUrl.href;
}

/** The callback: the state must be one this process issued, or nothing happens. */
export async function completeLogin(state: string, code: string): Promise<void> {
  const provider = pending.get(state);
  if (!provider) throw new Error('This sign-in has expired. Start it again from the Studio.');
  pending.delete(state);
  await auth(provider, { serverUrl: cloudServer(), authorizationCode: code });
  const workspaces = await listWorkspaces();
  if (workspaces.length === 1) await chooseWorkspace(workspaces[0]!.id);
}

export async function logout(): Promise<void> {
  await updateCredentials((c) => {
    const { cloud: _cloud, ...rest } = c;
    return rest;
  });
}

export type Workspace = { id: string; name: string; slug: string; role?: string; plan?: string };

export async function cloudStatus() {
  const cloud = (await readCredentials()).cloud;
  const signedIn = Boolean(cloud?.server === cloudServer() && cloud.tokens);
  return { signed_in: signedIn, workspace: signedIn ? (cloud?.workspace ?? null) : null };
}

type Call = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function withCloud<T>(work: (call: Call) => Promise<T>): Promise<T> {
  const provider = new StudioOAuth(undefined);
  if (!(await provider.tokens())) {
    throw new CloudRefusal('Sign in to Stunt Double first: Settings, or `stuntdouble login`.');
  }
  const client = new Client({ name: 'stuntdouble-studio', version: PACKAGE.split('@')[1]! });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(cloudServer()), { authProvider: provider })
    );
  } catch (err) {
    throw new CloudRefusal(
      /unauthori[sz]ed|401/i.test(String(err))
        ? 'Your Stunt Double sign-in has expired: sign in again.'
        : `Could not reach Stunt Double: ${(err as Error).message}`
    );
  }
  const call: Call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text?: string }>)
      .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
      .join('\n');
    if (result.isError) throw new CloudRefusal(text || `${name} was refused.`);
    if (result.structuredContent) return result.structuredContent as Record<string, unknown>;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { text };
    }
  };
  try {
    return await work(call);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return withCloud(async (call) => (await call('list_workspaces', {})).workspaces as Workspace[]);
}

export async function chooseWorkspace(id: string): Promise<Workspace> {
  const workspace = (await listWorkspaces()).find((w) => w.id === id || w.slug === id);
  if (!workspace) throw new CloudRefusal('That workspace is not one of yours.');
  await updateCredentials((c) => ({
    ...c,
    cloud: c.cloud && {
      ...c.cloud,
      workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    },
  }));
  return workspace;
}

/**
 * Whether this workspace may run in the cloud. The hosted MCP does not say
 * which plan a workspace is on yet: when it sends `plan`, a free workspace is
 * told here; when it does not, run_checklist's own allowance check decides,
 * and its refusal is relayed with the billing link.
 */
export function planGate(workspace: Workspace): string | null {
  if (workspace.plan && /^free$/i.test(workspace.plan)) {
    return `Cloud runs from the Studio need a paid plan, and ${workspace.name} is on the Free plan. Upgrade at ${billingUrl(workspace.slug)}, or run it locally.`;
  }
  return null;
}

/** Rewrite a file's `cloud` ids, keeping everything else exactly as it was. */
async function patchCloud(path: string, patch: Record<string, unknown>): Promise<void> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  const cloud = (raw.cloud as Record<string, unknown> | null | undefined) ?? {};
  await writeJsonAtomic(path, { ...raw, cloud: { ...cloud, ...patch } });
}

function stamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export const CLOUD_POLL_MS = 30_000;

export type CloudRun = { runId: string; done: Promise<{ report: string; run: Run }> };

/**
 * Push the checklist, its actor and the project to the workspace, reusing the
 * cloud ids already in the files, start a run and pull it back as
 * `runs/<stamp>-<checklist>-cloud/run.json` beside the local runs.
 */
export async function startCloudRun(options: {
  project: string;
  checklist: string;
  pollMs?: number;
}): Promise<CloudRun> {
  const root = join(options.project, '.stuntdouble');
  const configPath = join(root, 'stuntdouble.json');
  const checklistPath = join(root, 'checklists', `${options.checklist}.json`);
  const config = await readJson(configPath, ConfigSchema, '.stuntdouble/stuntdouble.json');
  const checklist = await readJson(
    checklistPath,
    ChecklistSchema,
    `.stuntdouble/checklists/${options.checklist}.json`
  );
  const actorPath = join(root, 'actors', `${checklist.actor}.json`);
  const actor = await readJson(
    actorPath,
    ActorSchema,
    `.stuntdouble/actors/${checklist.actor}.json`
  );

  const target = new URL(checklist.url);
  if (isPrivateHost(target.hostname)) {
    throw new CloudRefusal(
      `The cloud cannot reach ${checklist.url}. Set the checklist's URL to a public or preview address, and put the local one in stuntdouble.json's local_base_url so local runs keep using it.`
    );
  }

  const credentials = await readCredentials();
  const workspaceId =
    (config.cloud?.workspace_id as string | undefined) ?? credentials.cloud?.workspace?.id;
  if (!workspaceId) throw new CloudRefusal('Choose a Stunt Double workspace in Settings first.');

  return withCloud(async (call) => {
    const workspaces = (await call('list_workspaces', {})).workspaces as Workspace[];
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) throw new CloudRefusal('That workspace is not one of yours any more.');
    const gate = planGate(workspace);
    if (gate) throw new CloudRefusal(gate);
    const billing = (err: unknown) =>
      err instanceof CloudRefusal
        ? new CloudRefusal(`${err.message}\n\nPlans and billing: ${billingUrl(workspace.slug)}`)
        : err;

    try {
      // Project.
      let projectId = config.cloud?.project_id as string | undefined;
      if (!projectId) {
        const project = await call('create_project', {
          workspace_id: workspace.id,
          name: basename(options.project),
          url: target.origin,
        });
        projectId = String(project.id);
      }
      await patchCloud(configPath, {
        workspace_id: workspace.id,
        workspace_slug: workspace.slug,
        project_id: projectId,
      });

      // Actor, then its instructions and knowledge.
      let actorId = actor.cloud?.actor_id as string | undefined;
      if (!actorId) {
        actorId = String(
          (
            await call('create_actor', {
              workspace_id: workspace.id,
              name: actor.name,
              ...(actor.description ? { description: actor.description } : {}),
            })
          ).id
        );
        await patchCloud(actorPath, { actor_id: actorId });
        if (actor.system_prompt) {
          await call('update_actor', { actor_id: actorId, system_prompt: actor.system_prompt });
        }
      } else {
        await call('update_actor', {
          actor_id: actorId,
          name: actor.name,
          ...(actor.description ? { description: actor.description } : {}),
          ...(actor.system_prompt ? { system_prompt: actor.system_prompt } : {}),
        });
      }
      const known = actor.knowledge.length
        ? new Set(
            (
              ((await call('list_actor_knowledge', { actor_id: actorId })).knowledge ??
                []) as Array<{
                title: string;
              }>
            ).map((k) => k.title)
          )
        : new Set<string>();
      for (const k of actor.knowledge.filter((k) => !known.has(k.title))) {
        await call('add_actor_knowledge', {
          actor_id: actorId,
          title: k.title,
          content: k.content,
          kind: k.kind,
        });
      }

      // Checklist, its checks in file order, then their ids back by key.
      const checkIds = (checklist.cloud?.check_ids ?? {}) as Record<string, string>;
      const checks = checklist.checks.map((c) => ({
        ...(checkIds[c.key] ? { id: checkIds[c.key] } : {}),
        description: c.description,
        type: c.type,
        ...(c.weight != null ? { weight: c.weight } : {}),
        run_condition: c.run_condition,
        on_failure: c.on_failure,
      }));
      const fields = {
        name: checklist.name,
        actor_id: actorId,
        instructions: checklist.instructions,
        url: checklist.url,
        checks,
        ...(checklist.pass_threshold != null ? { pass_threshold: checklist.pass_threshold } : {}),
        score_type: checklist.score_type,
        ...(checklist.score_unit != null ? { score_unit: checklist.score_unit } : {}),
        ...(checklist.score_bands ? { score_bands: checklist.score_bands } : {}),
        ...(checklist.run_mode ? { run_mode: checklist.run_mode } : {}),
        ...(checklist.record_session != null ? { record_session: checklist.record_session } : {}),
      };
      let checklistId = checklist.cloud?.checklist_id as string | undefined;
      if (checklistId) {
        await call('update_checklist', { checklist_id: checklistId, ...fields });
      } else {
        checklistId = String(
          (
            await call('create_checklist', {
              workspace_id: workspace.id,
              project_id: projectId,
              ...fields,
            })
          ).checklist_id
        );
      }
      await patchCloud(checklistPath, { checklist_id: checklistId });
      const remote = (await call('get_checklist', { checklist_id: checklistId })).checks as Array<{
        id: string;
        sort_order: number;
      }>;
      const ordered = [...remote].sort((a, b) => a.sort_order - b.sort_order);
      const ids = Object.fromEntries(checklist.checks.map((c, i) => [c.key, ordered[i]?.id]));
      await patchCloud(checklistPath, { check_ids: ids });

      // The run, pulled back beside the local ones.
      const cloudRunId = String(
        (await call('run_checklist', { checklist_id: checklistId })).run_id
      );
      const id = `${stamp()}-${options.checklist}-cloud`;
      const dir = join(root, 'runs', id);
      await mkdir(dir, { recursive: true });
      const snapshot = { ...checklist, cloud: undefined };
      const keyOf = new Map(Object.entries(ids).map(([key, checkId]) => [checkId, key]));
      const run: Run = {
        format: 'stuntdouble.run/1',
        id,
        runner: {
          kind: 'cloud',
          run_id: cloudRunId,
          judged: true,
          url: `${appOrigin()}/w/${workspace.slug}/checklists/${checklistId}/runs/${cloudRunId}`,
        },
        status: 'running',
        pid: process.pid,
        url: checklist.url,
        started_at: new Date().toISOString(),
        finished_at: null,
        checklist: options.checklist,
        actor: checklist.actor,
        checklist_snapshot: snapshot,
        results: [],
        score: null,
        summary: null,
        cloud: null,
      };
      await writeJsonAtomic(join(dir, 'run.json'), run);
      // The live marker makes the viewer show it as running while this process polls.
      await writeFileAtomic(runningMarker(root, id), String(process.pid));
      const done = poll({
        run,
        dir,
        root,
        keyOf,
        passThreshold: checklist.pass_threshold ?? 100,
        pollMs: options.pollMs ?? CLOUD_POLL_MS,
      });
      return { runId: id, done };
    } catch (err) {
      throw billing(err);
    }
  });
}

async function poll(input: {
  run: Run;
  dir: string;
  root: string;
  keyOf: Map<string, string>;
  passThreshold: number;
  pollMs: number;
}): Promise<{ report: string; run: Run }> {
  const { run, dir, root, keyOf } = input;
  try {
    for (;;) {
      await new Promise((ok) => setTimeout(ok, input.pollMs));
      const remote = await withCloud((call) =>
        call('get_checklist_run', { run_id: run.runner.run_id })
      ).catch((err: Error) => ({ error: err.message }));
      if ('error' in remote) continue;
      const results = (remote.results ?? []) as Array<{
        check_id: string;
        status: string;
        evidence: string | null;
        evaluated_at: string;
      }>;
      Object.assign(run, {
        status:
          remote.status === 'completed' || remote.status === 'failed' ? remote.status : 'running',
        started_at: (remote.started_at as string | null) ?? run.started_at,
        finished_at: (remote.completed_at as string | null) ?? null,
        results: results.map((r) => ({
          check: keyOf.get(r.check_id) ?? r.check_id,
          status: r.status,
          evidence: r.evidence ?? '',
          at: r.evaluated_at,
        })),
        score: remote.outcome
          ? {
              score: (remote.score as number | null) ?? null,
              unit: (remote.score_unit as string | null) ?? null,
              outcome: remote.outcome,
              pass_threshold: input.passThreshold,
              grade: null,
            }
          : null,
        summary: (remote.summary as string | null) ?? null,
      });
      await writeJsonAtomic(join(dir, 'run.json'), run);
      if (run.status !== 'running') break;
    }
  } finally {
    await rm(runningMarker(root, run.id), { force: true });
  }
  const failed = run.results.filter((r) => r.status === 'failed');
  const scored = run.results.filter((r) => r.status !== 'informational' && r.status !== 'skipped');
  return {
    run,
    report: [
      `Run ${run.id} ${run.status}: ${run.score?.outcome ?? 'no outcome'}. ${scored.filter((r) => r.status === 'passed').length}/${scored.length} checks passed. Judged in the cloud by Stunt Double's judge.`,
      failed.length
        ? `Failed:\n${failed.map((r) => `- [${r.check}] ${r.evidence}`).join('\n')}`
        : '',
      `Report: ${run.runner.url}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}
