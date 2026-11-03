// Stunt Double Studio: the viewer grown into a local app (`stuntdouble
// studio`). It adds editing actors and checklists, starting a run on the
// person's own model connection or in the cloud, and settings for both.
//
// Policy line: a Studio run uses only a connection the person configures (an
// Anthropic API key or an OpenAI-compatible endpoint), never a Claude
// subscription. Keys stay in ~/.stuntdouble/credentials.json (credentials.ts):
// the page is told only whether one is set and where from. The MCP server
// never imports this module, so inside Claude Code nothing here runs.
//
// The security model is the viewer's (ui-server.ts): loopback only, the
// per-start key cookie, the Host check on every request, no CORS. Every write
// here also needs this server's own Origin and a JSON body, so neither another
// site nor a plain form can make one.

import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod';

import {
  beginLogin,
  chooseWorkspace,
  CloudRefusal,
  cloudStatus,
  completeLogin,
  listWorkspaces,
  logout,
  startCloudRun,
} from './cloud.ts';
import {
  connectionStatus,
  PROVIDERS,
  resolveConnection,
  saveConnection,
  type Connection,
} from './credentials.ts';
import { ActorSchema, ChecklistSchema, sdDir, writeFileAtomic, writeJsonAtomic } from './files.ts';
import { LocalSession, type Launch } from './run.ts';
import { DEFAULT_LIMITS, startStandaloneRun, testConnection, type RunUsage } from './runner.ts';
import { send, startUi, type UiServer } from './ui-server.ts';

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const MAX_BODY = 1_000_000;

type Job = {
  kind: 'local' | 'cloud';
  run_id: string;
  checklist: string;
  model: { provider: string; id: string } | null;
  usage: RunUsage | null;
  last: string;
};

export type Studio = {
  ui: UiServer;
  link(path?: string): string;
  close(): Promise<void>;
};

const json = (res: ServerResponse, status: number, data: unknown) =>
  send(res, status, JSON.stringify(data), 'application/json');
const problem = (res: ServerResponse, status: number, message: string) =>
  json(res, status, { error: message });

type Issue = { path: string; message: string };
const issuesOf = (error: z.ZodError): Issue[] =>
  error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

async function readBody(req: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error('Body too large');
  }
  return body ? JSON.parse(body) : {};
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  );

/** A connection that can make a call: a key, unless the endpoint is on this machine. */
function usable(connection: Connection | null): connection is Connection {
  if (!connection) return false;
  if (connection.apiKey) return true;
  const host = new URL(connection.baseUrl).hostname;
  return connection.provider === 'openai' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
}

/** The starter files for a project with no `.stuntdouble/` yet. */
export async function createStarter(project: string, url: string): Promise<void> {
  const root = sdDir(project);
  await writeJsonAtomic(join(root, 'stuntdouble.json'), {
    format: 'stuntdouble/1',
    local_base_url: null,
    headless: false,
    model_screenshots: 'on_request',
    safety: 'third_party',
  });
  await writeFileAtomic(join(root, '.gitignore'), '.live/\n');
  const actor = join(root, 'actors', 'first-time-visitor.json');
  if (!(await exists(actor))) {
    await writeJsonAtomic(actor, {
      name: 'First-time visitor',
      description:
        'Has never used the product, arrives from a search result and decides within a minute whether it is worth their time',
      knowledge: [],
      persist_login: false,
    });
  }
  const checklist = join(root, 'checklists', 'first-look.json');
  if (!(await exists(checklist))) {
    await writeJsonAtomic(checklist, {
      name: 'First look',
      actor: 'first-time-visitor',
      url,
      instructions:
        'Arrive at the home page as someone who has never heard of the product. Work out what it is, try the main next step without paying or signing up, and follow the main navigation.',
      checks: [
        {
          key: 'says-what-it-is',
          description: 'The first screen says plainly what the product is and who it is for',
        },
        {
          key: 'clear-next-step',
          description: 'There is one clear next step, such as a sign-up button, without scrolling',
        },
        {
          key: 'navigation-works',
          description: 'The main navigation links open working pages, with no error or empty page',
        },
        {
          key: 'first-impression',
          description: 'Record what a new visitor would read or do first',
          type: 'informational',
        },
      ],
    });
  }
}

const InitInput = z.object({ url: z.url({ protocol: /^https?$/ }) });
const RunInput = z.object({
  checklist: z.string().regex(SLUG),
  where: z.enum(['local', 'cloud']).default('local'),
  resume: z.boolean().optional(),
});
const ConnectionInput = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1, 'Name the model').max(200),
  base_url: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).nullish(),
  api_key: z.string().max(500).nullish(),
  clear_key: z.boolean().optional(),
});

export async function startStudio(options: {
  project: string;
  port?: number;
  launch?: Launch;
  fetch?: typeof fetch;
  cloudPollMs?: number;
}): Promise<Studio> {
  const project = options.project;
  const root = sdDir(project);
  let job: Job | null = null;
  let session: LocalSession | null = null;
  const cloudJobs = new Map<string, Job>();

  async function status() {
    return {
      project,
      initialised: await exists(join(root, 'stuntdouble.json')),
      connection: await connectionStatus(),
      cloud: await cloudStatus(),
      jobs: [...(job ? [job] : []), ...cloudJobs.values()],
      limits: DEFAULT_LIMITS,
    };
  }

  /** Write one actor or checklist, validated by the schema `start_run` reads it with. */
  async function saveDefinition(
    res: ServerResponse,
    folder: 'actors' | 'checklists',
    slug: string,
    body: unknown
  ): Promise<void> {
    const input = z
      .object({ data: z.record(z.string(), z.unknown()), create: z.boolean().optional() })
      .safeParse(body);
    if (!input.success) return problem(res, 400, 'Send {"data": {...}}.');
    if (!SLUG.test(slug)) {
      return json(res, 422, {
        issues: [{ path: 'slug', message: 'Use lowercase letters, digits and hyphens' }],
      });
    }
    const path = join(root, folder, `${slug}.json`);
    const existing = await readFile(path, 'utf8')
      .then((t) => JSON.parse(t) as Record<string, unknown>)
      .catch(() => null);
    if (input.data.create && existing) {
      return json(res, 409, {
        issues: [
          { path: 'slug', message: `There is already a ${folder.slice(0, -1)} called ${slug}` },
        ],
      });
    }
    // Cloud ids are written by a push, never by the form.
    const { cloud: _ignored, ...fields } = input.data.data;
    const data = existing?.cloud ? { ...fields, cloud: existing.cloud } : fields;
    const schema = folder === 'actors' ? ActorSchema : ChecklistSchema;
    const parsed = schema.safeParse(data);
    const issues = parsed.success ? [] : issuesOf(parsed.error);
    if (folder === 'checklists' && typeof data.actor === 'string' && SLUG.test(data.actor)) {
      if (!(await exists(join(root, 'actors', `${data.actor}.json`)))) {
        issues.push({ path: 'actor', message: `There is no actor called ${data.actor}` });
      }
    }
    if (issues.length) return json(res, 422, { issues });
    await writeJsonAtomic(path, data);
    return json(res, 200, { slug });
  }

  async function startRun(res: ServerResponse, body: unknown): Promise<void> {
    const input = RunInput.safeParse(body);
    if (!input.success) return problem(res, 400, 'Name a checklist to run.');
    const { checklist, where, resume } = input.data;
    if (where === 'cloud') {
      const run = await startCloudRun({ project, checklist, pollMs: options.cloudPollMs });
      const entry: Job = {
        kind: 'cloud',
        run_id: run.runId,
        checklist,
        model: null,
        usage: null,
        last: 'Running in the cloud',
      };
      cloudJobs.set(run.runId, entry);
      run.done.catch(() => {}).finally(() => cloudJobs.delete(run.runId));
      return json(res, 200, { run_id: run.runId });
    }
    if (job) return problem(res, 409, `A run of ${job.checklist} is still going.`);
    const connection = await resolveConnection();
    if (!usable(connection)) {
      return problem(res, 400, 'Connect a model first: Settings, then Connection.');
    }
    const model = { provider: connection.provider, id: connection.model };
    session = new LocalSession({ project, ui, launch: options.launch, runner: { model } });
    const current: Job = { kind: 'local', run_id: '', checklist, model, usage: null, last: '' };
    job = current;
    try {
      const run = await startStandaloneRun({
        session,
        connection,
        checklist,
        resume,
        fetch: options.fetch,
        onProgress: (p) => {
          current.usage = p.usage;
          current.last = p.last;
        },
      });
      current.run_id = run.runId;
      const ended = session;
      run.done
        .catch(() => {})
        .finally(() => {
          if (job === current) job = null;
          void ended.close();
        });
      return json(res, 200, { run_id: run.runId });
    } catch (err) {
      job = null;
      await session.close().catch(() => {});
      throw err;
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname;
    if (path === '/studio.js' && req.method === 'GET') {
      const script = await readFile(new URL('./studio.js', import.meta.url));
      send(res, 200, script, 'text/javascript; charset=utf-8');
      return true;
    }
    if (!path.startsWith('/api/studio')) return false;
    if (req.method === 'GET') {
      if (path === '/api/studio') json(res, 200, await status());
      else if (path === '/api/studio/cloud/workspaces') {
        json(res, 200, { workspaces: await listWorkspaces() });
      } else problem(res, 404, 'Not found');
      return true;
    }
    // Writes: only from this server's own page.
    if (req.headers.origin !== `http://${req.headers.host}`) {
      problem(res, 403, 'Forbidden');
      return true;
    }
    if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) {
      problem(res, 415, 'Send JSON.');
      return true;
    }
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      problem(res, 400, 'That was not JSON.');
      return true;
    }
    const definition = path.match(/^\/api\/studio\/(actors|checklists)\/([^/]+)$/);
    try {
      if (definition && req.method === 'PUT') {
        await saveDefinition(
          res,
          definition[1] as 'actors' | 'checklists',
          decodeURIComponent(definition[2]!),
          body
        );
      } else if (req.method !== 'POST') {
        problem(res, 405, 'Method not allowed');
      } else if (path === '/api/studio/init') {
        const input = InitInput.safeParse(body);
        if (!input.success) {
          json(res, 422, {
            issues: [{ path: 'url', message: 'Enter a web address, http or https' }],
          });
        } else if (await exists(join(root, 'stuntdouble.json'))) {
          problem(res, 409, 'This project is already set up.');
        } else {
          await createStarter(project, input.data.url);
          json(res, 200, { checklist: 'first-look' });
        }
      } else if (path === '/api/studio/run') {
        await startRun(res, body);
      } else if (path === '/api/studio/connection') {
        const input = ConnectionInput.safeParse(body);
        if (!input.success) json(res, 422, { issues: issuesOf(input.error) });
        else {
          await saveConnection(input.data);
          json(res, 200, await connectionStatus());
        }
      } else if (path === '/api/studio/connection/test') {
        const connection = await resolveConnection();
        json(
          res,
          200,
          usable(connection)
            ? await testConnection(connection, options.fetch)
            : { ok: false, message: 'There is no key for this connection yet.' }
        );
      } else if (path === '/api/studio/cloud/login') {
        json(res, 200, { url: await beginLogin(`http://127.0.0.1:${ui.port}/oauth/callback`) });
      } else if (path === '/api/studio/cloud/logout') {
        await logout();
        json(res, 200, await cloudStatus());
      } else if (path === '/api/studio/cloud/workspace') {
        const id = (body as { id?: unknown }).id;
        if (typeof id !== 'string') problem(res, 400, 'Name a workspace.');
        else json(res, 200, { workspace: await chooseWorkspace(id) });
      } else {
        problem(res, 404, 'Not found');
      }
    } catch (err) {
      // Our own errors say what to fix (a file, a refusal from Stunt Double); the page shows them as text.
      problem(res, err instanceof CloudRefusal ? 403 : 400, (err as Error).message);
    }
    return true;
  }

  async function oauthCallback(_req: IncomingMessage, res: ServerResponse, url: URL) {
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code');
    let message = 'Signed in to Stunt Double.';
    let ok = true;
    try {
      if (!code)
        throw new Error(url.searchParams.get('error_description') ?? 'Sign-in was cancelled.');
      await completeLogin(state, code);
    } catch (err) {
      ok = false;
      message = (err as Error).message;
    }
    const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    // A same-origin navigation from here carries the Strict cookie again.
    send(
      res,
      ok ? 200 : 400,
      `<!doctype html><meta charset="utf-8"><title>Stunt Double Studio</title>${ok ? '<meta http-equiv="refresh" content="1;url=/settings">' : ''}<body style="font:15px system-ui;padding:3rem;max-width:32rem"><p>${escape(message)}</p><p><a href="/settings">Back to the Studio</a></p></body>`,
      'text/html; charset=utf-8',
      { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }
    );
  }

  const ui = await startUi({
    root,
    port: options.port,
    extension: {
      pages: /^\/(checklists|actors|settings)(\/[^/]+(\/run)?)?$/,
      script: '/studio.js',
      handle,
      oauthCallback,
    },
  });

  return {
    ui,
    link: (path) => ui.link(path),
    close: async () => {
      await session?.close().catch(() => {});
      await ui.close();
    },
  };
}
