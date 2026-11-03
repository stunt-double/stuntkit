/**
 * The viewer's guards: only its own Host, only with the key, only files inside
 * `.stuntdouble/`, and never a CORS header.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { startUi, type UiServer } from '../src/ui-server.ts';

let dir: string;
let ui: UiServer;
let cookie: string;

type Reply = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function get(
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
  body?: string
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: ui.port,
        path,
        method,
        headers: { Host: `127.0.0.1:${ui.port}`, ...headers },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: text }));
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stuntdouble-ui-'));
  const root = join(dir, '.stuntdouble');
  await mkdir(join(root, 'runs', 'r1', 'shots'), { recursive: true });
  await writeFile(join(root, 'runs', 'r1', 'shots', 'a.png'), 'png');
  await writeFile(join(dir, 'secret.json'), '{"secret":true}');
  await symlink(join(dir, 'secret.json'), join(root, 'runs', 'r1', 'escape.json'));
  ui = await startUi({ root, port: 4790 });
  const signIn = await get(`/?t=${ui.token}`);
  cookie = String(signIn.headers['set-cookie']).split(';')[0]!;
});

after(async () => {
  await ui.close();
  await rm(dir, { recursive: true, force: true });
});

test('the key in the link becomes an HttpOnly, SameSite=Strict cookie', async () => {
  const signIn = await get(`/runs/r1?t=${ui.token}`);
  assert.equal(signIn.status, 302);
  assert.equal(signIn.headers.location, '/runs/r1');
  assert.match(String(signIn.headers['set-cookie']), /HttpOnly; SameSite=Strict; Path=\//);
  const page = await get('/', { Cookie: cookie });
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>Stunt Double Local<\/title>/);
  assert.equal(page.headers['access-control-allow-origin'], undefined);
});

test('no key, a wrong key or a wrong cookie is refused', async () => {
  assert.equal((await get('/')).status, 403);
  assert.equal((await get('/api/runs')).status, 403);
  assert.equal((await get('/?t=not-the-key')).status, 403);
  assert.equal((await get('/api/runs', { Cookie: `stuntdouble_${ui.port}=guess` })).status, 403);
  // The identity probe answers anyone on the right Host, and says nothing else.
  const probe = await get('/__stuntdouble');
  assert.equal(probe.status, 200);
  assert.deepEqual(JSON.parse(probe.body), { stuntdouble: true });
});

test('a foreign Host header is refused, key or not', async () => {
  for (const host of ['evil.example', `evil.example:${ui.port}`, `127.0.0.1:${ui.port + 1}`]) {
    assert.equal((await get('/__stuntdouble', { Host: host })).status, 403, host);
    assert.equal((await get(`/?t=${ui.token}`, { Host: host })).status, 403, host);
  }
  assert.equal((await get('/__stuntdouble', { Host: `localhost:${ui.port}` })).status, 200);
});

test('files are served from inside .stuntdouble/ only', async () => {
  const shot = await get('/files/runs/r1/shots/a.png', { Cookie: cookie });
  assert.equal(shot.status, 200);
  assert.equal(shot.headers['content-type'], 'image/png');
  for (const path of [
    '/files/..%2fsecret.json',
    '/files/runs/..%2f..%2fsecret.json',
    '/files/%2e%2e%2f%2e%2e%2fsecret.json',
    '/files/runs/r1/escape.json',
  ]) {
    const res = await get(path, { Cookie: cookie });
    assert.equal(res.status, 403, path);
    assert.doesNotMatch(res.body, /secret/, path);
  }
});

test('Stop refuses another origin and a run that is not going', async () => {
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const foreign = await get(
    '/api/stop',
    { ...headers, Origin: 'https://evil.example' },
    'POST',
    '{"run":"r1"}'
  );
  assert.equal(foreign.status, 403);
  assert.equal((await get('/api/stop', headers, 'POST', '{"run":"r1"}')).status, 409);
});

test('the runs list sends a summary per run, and one run is read alone', async () => {
  const root = join(dir, '.stuntdouble');
  await mkdir(join(root, 'actors'), { recursive: true });
  await writeFile(join(root, 'actors', 'shopper.json'), '{"name":"First-time shopper"}');
  await mkdir(join(root, 'runs', 'r2'), { recursive: true });
  await writeFile(
    join(root, 'runs', 'r2', 'run.json'),
    JSON.stringify({
      format: 'stuntdouble.run/1',
      id: 'r2',
      runner: { kind: 'local', judged: false },
      status: 'completed',
      url: 'http://localhost:3000',
      started_at: '2026-11-03T04:00:00Z',
      finished_at: '2026-11-03T04:01:00Z',
      checklist: 'sign-up',
      actor: 'shopper',
      checklist_snapshot: {
        name: 'Sign-up',
        checks: [
          { key: 'a', description: 'A' },
          { key: 'b', description: 'B' },
          { key: 'c', description: 'C', type: 'informational' },
        ],
      },
      results: [
        { check: 'a', status: 'passed', evidence: 'x' },
        { check: 'b', status: 'failed', evidence: 'y' },
      ],
      score: { score: null, outcome: 'failed' },
      summary: 'Half.',
      cloud: null,
    })
  );
  const list = JSON.parse((await get('/api/runs', { Cookie: cookie })).body);
  const r2 = list.find((e: { id: string }) => e.id === 'r2');
  assert.deepEqual(r2.tally, { passed: 1, total: 2 });
  assert.equal(r2.checklist_name, 'Sign-up');
  assert.equal(r2.actor_name, 'First-time shopper');
  assert.equal(r2.results, undefined);
  assert.equal(r2.checklist_snapshot, undefined);
  const one = JSON.parse((await get('/api/runs/r2', { Cookie: cookie })).body);
  assert.equal(one.run.results.length, 2);
  assert.equal(one.run.actor_name, 'First-time shopper');
  for (const id of ['..', '.live', 'r2%2f..', 'nope']) {
    assert.equal((await get(`/api/runs/${id}`, { Cookie: cookie })).status, 404, id);
  }
});

test('the favicon request is answered without the key, with nothing', async () => {
  const res = await get('/favicon.ico');
  assert.equal(res.status, 204);
  assert.equal(res.body, '');
});

test('the viewer shows no collapsed-row thumbnail and says why an unweighted run has no score', async () => {
  const page = (await get('/', { Cookie: cookie })).body;
  assert.doesNotMatch(page, /class: 'thumb'/);
  assert.match(
    page,
    /No score: with no weighted checks, it passes only when every pass\/fail check passes/
  );
  assert.match(page, /Copy cloud command/);
  assert.doesNotMatch(page, /'\?v=' \+ Date\.now\(\)/);
});
