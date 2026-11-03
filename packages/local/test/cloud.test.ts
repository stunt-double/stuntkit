/**
 * Cloud runs against a fake Stunt Double: an OAuth 2.1 server with dynamic
 * registration and PKCE, and a hosted MCP over Streamable HTTP with the tools
 * the push uses. Sign-in, the push and the ids written back, the run pulled
 * back as a cloud run.json, and the plan gate and refusals relayed with the
 * billing link.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { z } from 'zod';

import {
  beginLogin,
  cloudStatus,
  completeLogin,
  listWorkspaces,
  logout,
  planGate,
  startCloudRun,
} from '../src/cloud.ts';
import { readJson, RunSchema } from '../src/files.ts';

let server: Server;
let origin: string;
let home: string;
let dir: string;
const TOKEN = 'access-token-1';
const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
const state = {
  plan: undefined as string | undefined,
  refuseRun: false,
  challenge: '',
  redirect: '',
};

function hosted(): McpServer {
  const mcp = new McpServer({ name: 'fake-stuntdouble', version: '0.0.0' });
  const tool = (
    name: string,
    handler: (args: Record<string, unknown>) => unknown,
    refuse?: () => string | null
  ) =>
    mcp.registerTool(name, { inputSchema: z.looseObject({}) as never }, ((
      args: Record<string, unknown>
    ) => {
      calls.push({ name, args });
      const refusal = refuse?.();
      if (refusal) return { content: [{ type: 'text', text: refusal }], isError: true };
      const data = handler(args) as Record<string, unknown>;
      return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    }) as never);
  tool('list_workspaces', () => ({
    workspaces: [
      {
        id: 'ws_1',
        name: 'Acme',
        slug: 'acme',
        role: 'owner',
        ...(state.plan ? { plan: state.plan } : {}),
      },
    ],
  }));
  tool('create_project', () => ({ id: 'proj_1' }));
  tool('create_actor', () => ({ id: 'actor_1' }));
  tool('update_actor', () => ({ success: true }));
  tool('list_actor_knowledge', () => ({
    knowledge: [{ id: 'k0', title: 'Already there', content: 'x', kind: 'reference' }],
  }));
  tool('add_actor_knowledge', () => ({ id: 'k1' }));
  tool('create_checklist', () => ({ checklist_id: 'cl_1', project_id: 'proj_1' }));
  tool('update_checklist', () => ({ checklist_id: 'cl_1', updated: true }));
  tool('get_checklist', () => ({
    checks: [
      { id: 'chk_b', sort_order: 1 },
      { id: 'chk_a', sort_order: 0 },
    ],
  }));
  tool(
    'run_checklist',
    () => ({ run_id: 'run_1' }),
    () => (state.refuseRun ? 'Run limit reached: 60 of 60 compute minutes used this month.' : null)
  );
  tool('get_checklist_run', () => ({
    id: 'run_1',
    status: 'completed',
    outcome: 'failed',
    score: null,
    score_unit: null,
    summary: 'Guest checkout is missing.',
    started_at: '2026-11-03T04:00:00Z',
    completed_at: '2026-11-03T04:03:00Z',
    results: [
      {
        check_id: 'chk_a',
        status: 'passed',
        evidence: 'Search box present.',
        evaluated_at: '2026-11-03T04:01:00Z',
      },
      {
        check_id: 'chk_b',
        status: 'failed',
        evidence: 'No guest option.',
        evaluated_at: '2026-11-03T04:02:00Z',
      },
    ],
  }));
  return mcp;
}

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'stuntdouble-cloud-home-'));
  process.env.STUNTDOUBLE_HOME = home;
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, origin);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const reply = (status: number, data: unknown, headers: Record<string, string> = {}) =>
      res
        .writeHead(status, { 'Content-Type': 'application/json', ...headers })
        .end(JSON.stringify(data));
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      return reply(200, { resource: origin, authorization_servers: [origin] });
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return reply(200, {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    }
    if (url.pathname === '/oauth/register') {
      const body = JSON.parse(raw);
      assert.ok(body.redirect_uris.every((u: string) => u.startsWith('http://127.0.0.1:')));
      return reply(201, { ...body, client_id: 'client_1' });
    }
    if (url.pathname === '/oauth/token') {
      const body = Object.fromEntries(new URLSearchParams(raw));
      const verified =
        createHash('sha256')
          .update(body.code_verifier ?? '')
          .digest('base64url') === state.challenge;
      if (body.code !== 'code-1' || !verified || body.redirect_uri !== state.redirect) {
        return reply(400, { error: 'invalid_grant' });
      }
      return reply(200, { access_token: TOKEN, token_type: 'Bearer', expires_in: 3600 });
    }
    if (url.pathname === '/api/mcp') {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        return reply(
          401,
          { error: 'invalid_token' },
          {
            'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
          }
        );
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const mcp = hosted();
      await mcp.connect(transport);
      await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
      return;
    }
    reply(404, {});
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.STUNTDOUBLE_CLOUD_URL = `${origin}/api/mcp`;

  dir = await mkdtemp(join(tmpdir(), 'stuntdouble-cloud-'));
  const sd = join(dir, '.stuntdouble');
  await mkdir(join(sd, 'actors'), { recursive: true });
  await mkdir(join(sd, 'checklists'), { recursive: true });
  await writeFile(
    join(sd, 'stuntdouble.json'),
    JSON.stringify({ format: 'stuntdouble/1', local_base_url: 'http://localhost:3000' })
  );
  await writeFile(
    join(sd, 'actors', 'shopper.json'),
    JSON.stringify({
      name: 'First-time shopper',
      system_prompt: 'Compare prices first.',
      knowledge: [
        { kind: 'account', title: 'Test login', content: 'shopper@example.com' },
        { kind: 'reference', title: 'Already there', content: 'x' },
      ],
    })
  );
  await writeFile(
    join(sd, 'checklists', 'shop.json'),
    JSON.stringify({
      name: 'Shop',
      actor: 'shopper',
      url: 'https://shop.example.com/',
      instructions: 'Check out as a guest.',
      checks: [
        { key: 'search', description: 'There is a search box' },
        { key: 'guest', description: 'Guest checkout', on_failure: 'stop' },
      ],
    })
  );
});

after(async () => {
  server.closeAllConnections();
  server.close();
  await rm(home, { recursive: true, force: true });
  await rm(dir, { recursive: true, force: true });
});

test('sign-in: registration, PKCE, a loopback redirect and a state only this process issued', async () => {
  const redirect = 'http://127.0.0.1:4747/oauth/callback';
  const url = new URL(await beginLogin(redirect));
  assert.equal(url.origin + url.pathname, `${origin}/oauth/authorize`);
  assert.equal(url.searchParams.get('redirect_uri'), redirect);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('client_id'), 'client_1');
  state.challenge = url.searchParams.get('code_challenge')!;
  state.redirect = redirect;
  await assert.rejects(completeLogin('forged-state', 'code-1'), /expired/);
  await completeLogin(url.searchParams.get('state')!, 'code-1');
  const status = await cloudStatus();
  assert.equal(status.signed_in, true);
  // One workspace: chosen for you.
  assert.deepEqual(status.workspace, { id: 'ws_1', slug: 'acme', name: 'Acme' });
  const file = join(home, 'credentials.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.match(await readFile(file, 'utf8'), new RegExp(TOKEN));
  assert.equal((await listWorkspaces())[0]!.slug, 'acme');
});

test('a cloud run pushes the files, writes the ids back and pulls the run back', async () => {
  calls.length = 0;
  const run = await startCloudRun({ project: dir, checklist: 'shop', pollMs: 10 });
  const { report } = await run.done;
  const names = calls.map((c) => c.name);
  assert.deepEqual(names, [
    'list_workspaces',
    'create_project',
    'create_actor',
    'update_actor',
    'list_actor_knowledge',
    'add_actor_knowledge',
    'create_checklist',
    'get_checklist',
    'run_checklist',
    'get_checklist_run',
  ]);
  const sd = join(dir, '.stuntdouble');
  const checklist = JSON.parse(await readFile(join(sd, 'checklists', 'shop.json'), 'utf8'));
  assert.deepEqual(checklist.cloud, {
    checklist_id: 'cl_1',
    check_ids: { search: 'chk_a', guest: 'chk_b' },
  });
  assert.equal(
    JSON.parse(await readFile(join(sd, 'actors', 'shopper.json'), 'utf8')).cloud.actor_id,
    'actor_1'
  );
  assert.equal(
    JSON.parse(await readFile(join(sd, 'stuntdouble.json'), 'utf8')).cloud.project_id,
    'proj_1'
  );
  const sent = calls.find((c) => c.name === 'create_checklist')!.args as {
    checks: Array<Record<string, unknown>>;
  };
  assert.equal(sent.checks[0]!.key, undefined, 'keys stay local');

  const saved = await readJson(join(sd, 'runs', run.runId, 'run.json'), RunSchema);
  assert.equal(saved.runner.kind, 'cloud');
  assert.equal(saved.runner.judged, true);
  assert.equal(saved.runner.url, `${origin}/w/acme/checklists/cl_1/runs/run_1`);
  assert.equal(saved.status, 'completed');
  assert.deepEqual(
    saved.results.map((r) => [r.check, r.status]),
    [
      ['search', 'passed'],
      ['guest', 'failed'],
    ]
  );
  assert.equal(saved.score?.outcome, 'failed');
  assert.match(report, /Run \S+-shop-cloud completed: failed\. 1\/2 checks passed/);
  assert.equal(await stat(join(sd, '.live', 'running', run.runId)).catch(() => null), null);

  // A second run updates rather than duplicating.
  calls.length = 0;
  await (
    await startCloudRun({ project: dir, checklist: 'shop', pollMs: 10 })
  ).done;
  assert.ok(calls.some((c) => c.name === 'update_checklist'));
  assert.ok(!calls.some((c) => c.name.startsWith('create_')));
  const update = calls.find((c) => c.name === 'update_checklist')!.args as {
    checks: Array<{ id?: string }>;
  };
  assert.deepEqual(
    update.checks.map((c) => c.id),
    ['chk_a', 'chk_b']
  );
  assert.equal((await readdir(join(sd, 'runs'))).length >= 1, true);
});

test('the plan gate: a free plan when the server says so, the server’s refusal otherwise', async () => {
  assert.match(
    planGate({ id: 'w', name: 'Acme', slug: 'acme', plan: 'free' })!,
    /need a paid plan.*\/w\/acme\/settings\/billing/
  );
  assert.equal(planGate({ id: 'w', name: 'Acme', slug: 'acme', plan: 'team' }), null);
  assert.equal(planGate({ id: 'w', name: 'Acme', slug: 'acme' }), null);

  state.plan = 'free';
  await assert.rejects(startCloudRun({ project: dir, checklist: 'shop', pollMs: 10 }), /Free plan/);
  state.plan = undefined;
  state.refuseRun = true;
  await assert.rejects(
    startCloudRun({ project: dir, checklist: 'shop', pollMs: 10 }),
    (err: Error) =>
      /60 of 60 compute minutes/.test(err.message) &&
      /Plans and billing: .*\/w\/acme\/settings\/billing/.test(err.message)
  );
  state.refuseRun = false;
});

test('signing out forgets the token', async () => {
  await logout();
  assert.equal((await cloudStatus()).signed_in, false);
  await assert.rejects(listWorkspaces(), /Sign in to Stunt Double first/);
});
