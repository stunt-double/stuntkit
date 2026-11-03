/**
 * The Studio's API and its guards: the viewer's Host check and key cookie on
 * every route, this server's Origin and a JSON body on every write, no CORS,
 * schema errors by field, cloud ids kept from the file, and a key that is
 * stored 0600 outside the project and never sent to the page.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { startStudio, type Studio } from '../src/studio.ts';

let dir: string;
let home: string;
let app: Studio;
let cookie: string;
let host: string;

type Reply = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function call(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: app.ui.port,
        path,
        method: options.method ?? 'GET',
        headers: { Host: host, ...options.headers },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: text }));
      }
    );
    req.on('error', reject);
    req.end(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
}

/** A write as the Studio's own page makes it. */
const write = (path: string, body: unknown, method = 'POST', extra: Record<string, string> = {}) =>
  call(path, {
    method,
    body,
    headers: {
      Cookie: cookie,
      Origin: `http://${host}`,
      'Content-Type': 'application/json',
      ...extra,
    },
  });

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stuntdouble-studio-'));
  home = await mkdtemp(join(tmpdir(), 'stuntdouble-home-'));
  process.env.STUNTDOUBLE_HOME = home;
  delete process.env.ANTHROPIC_API_KEY;
  app = await startStudio({ project: dir, port: 4830 });
  host = `127.0.0.1:${app.ui.port}`;
  const signIn = await call(`/?t=${app.ui.token}`);
  cookie = String(signIn.headers['set-cookie']).split(';')[0]!;
});

after(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

test('every Studio route needs the right Host and the key, and sends no CORS header', async () => {
  for (const path of ['/api/studio', '/studio.js', '/checklists', '/settings']) {
    assert.equal((await call(path)).status, 403, `${path} without the key`);
    assert.equal(
      (await call(path, { headers: { Cookie: cookie, Host: 'evil.example' } })).status,
      403,
      `${path} on a foreign Host`
    );
  }
  const page = await call('/checklists', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  assert.match(page.body, /<script src="\/studio\.js"><\/script>/);
  assert.match(
    String(page.headers['content-security-policy']),
    /script-src 'self' 'unsafe-inline'/
  );
  assert.equal(page.headers['access-control-allow-origin'], undefined);
  const script = await call('/studio.js', { headers: { Cookie: cookie } });
  assert.equal(script.status, 200);
  assert.match(String(script.headers['content-type']), /javascript/);
});

test('writes need this server’s Origin and a JSON body', async () => {
  const body = { url: 'http://localhost:3000' };
  assert.equal(
    (await write('/api/studio/init', body, 'POST', { Origin: 'https://evil.example' })).status,
    403
  );
  const noOrigin = await call('/api/studio/init', {
    method: 'POST',
    body,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  });
  assert.equal(noOrigin.status, 403);
  assert.equal(
    (await write('/api/studio/init', body, 'POST', { 'Content-Type': 'text/plain' })).status,
    415
  );
  const noKey = await call('/api/studio/init', {
    method: 'POST',
    body,
    headers: { Origin: `http://${host}`, 'Content-Type': 'application/json' },
  });
  assert.equal(noKey.status, 403);
  assert.equal(
    await stat(join(dir, '.stuntdouble')).catch(() => null),
    null,
    'nothing was written'
  );
});

test('onboarding writes the starter files once', async () => {
  assert.equal(
    JSON.parse((await call('/api/studio', { headers: { Cookie: cookie } })).body).initialised,
    false
  );
  const bad = await write('/api/studio/init', { url: 'javascript:alert(1)' });
  assert.equal(bad.status, 422);
  assert.equal(JSON.parse(bad.body).issues[0].path, 'url');
  assert.equal((await write('/api/studio/init', { url: 'http://localhost:3000/' })).status, 200);
  assert.equal((await write('/api/studio/init', { url: 'http://localhost:3000/' })).status, 409);
  const checklist = JSON.parse(
    await readFile(join(dir, '.stuntdouble', 'checklists', 'first-look.json'), 'utf8')
  );
  assert.equal(checklist.actor, 'first-time-visitor');
});

test('saving a definition: errors by field, a taken name, a missing actor, cloud ids kept', async () => {
  const path = join(dir, '.stuntdouble', 'checklists', 'first-look.json');
  const original = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(
    path,
    JSON.stringify({ ...original, cloud: { checklist_id: 'cl_1', check_ids: {} } })
  );

  const invalid = await write(
    '/api/studio/checklists/first-look',
    {
      data: {
        ...original,
        url: 'nope',
        checks: [{ key: 'Bad Key', description: 'x' }],
        actor: 'ghost',
      },
    },
    'PUT'
  );
  assert.equal(invalid.status, 422);
  const paths = JSON.parse(invalid.body).issues.map((i: { path: string }) => i.path);
  for (const p of ['url', 'checks.0.key', 'actor'])
    assert.ok(paths.includes(p), `${p} in ${paths}`);

  assert.equal(
    (await write('/api/studio/checklists/first-look', { data: original, create: true }, 'PUT'))
      .status,
    409
  );
  assert.equal(
    (await write('/api/studio/checklists/Not%20A%20Slug', { data: original }, 'PUT')).status,
    422
  );
  assert.equal(
    (await write('/api/studio/checklists/..%2Fescape', { data: original }, 'PUT')).status,
    422
  );

  // The form cannot change cloud ids: the file's stay.
  const saved = await write(
    '/api/studio/checklists/first-look',
    { data: { ...original, name: 'Renamed', cloud: { checklist_id: 'forged' } } },
    'PUT'
  );
  assert.equal(saved.status, 200);
  const after = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(after.name, 'Renamed');
  assert.equal(after.cloud.checklist_id, 'cl_1');
});

test('the key is stored 0600 outside the project and the page only hears that it is set', async () => {
  const bad = await write('/api/studio/connection', { provider: 'anthropic', model: '' });
  assert.equal(bad.status, 422);
  assert.equal(JSON.parse(bad.body).issues[0].path, 'model');
  const saved = await write('/api/studio/connection', {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    api_key: 'sk-ant-secret-value',
  });
  assert.equal(saved.status, 200);
  assert.doesNotMatch(saved.body, /sk-ant-secret-value/);
  const status = (await call('/api/studio', { headers: { Cookie: cookie } })).body;
  assert.doesNotMatch(status, /sk-ant-secret-value/);
  assert.equal(JSON.parse(status).connection.key, 'stored');
  const file = join(home, 'credentials.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.match(await readFile(file, 'utf8'), /sk-ant-secret-value/);
  // Nothing under the project holds it.
  const { readdir } = await import('node:fs/promises');
  for (const name of await readdir(join(dir, '.stuntdouble'), { recursive: true })) {
    const full = join(dir, '.stuntdouble', String(name));
    if ((await stat(full)).isFile())
      assert.doesNotMatch(await readFile(full, 'utf8'), /sk-ant-secret/);
  }
  // An empty key keeps the stored one; clear_key drops it.
  await write('/api/studio/connection', {
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    api_key: '',
  });
  assert.match(await readFile(file, 'utf8'), /sk-ant-secret-value/);
  await write('/api/studio/connection', {
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    clear_key: true,
  });
  assert.doesNotMatch(await readFile(file, 'utf8'), /sk-ant-secret-value/);
});

test('a run needs a connection, and a Run with none is refused in words', async () => {
  const res = await write('/api/studio/run', { checklist: 'first-look', where: 'local' });
  assert.equal(res.status, 400);
  assert.match(JSON.parse(res.body).error, /Connect a model first/);
  const cloud = await write('/api/studio/run', { checklist: 'first-look', where: 'cloud' });
  assert.equal(cloud.status, 403);
  assert.match(JSON.parse(cloud.body).error, /cannot reach http:\/\/localhost:3000/);
});

test('the OAuth callback needs no cookie but only answers a state this process issued', async () => {
  const res = await call('/oauth/callback?state=forged&code=x<script>');
  assert.equal(res.status, 400);
  assert.match(res.body, /This sign-in has expired/);
  assert.doesNotMatch(res.body, /<script/i);
  assert.match(String(res.headers['content-security-policy']), /default-src 'none'/);
});

test('the plain viewer has none of it', async () => {
  const { startUi } = await import('../src/ui-server.ts');
  const ui = await startUi({ root: join(dir, '.stuntdouble'), port: 4840 });
  try {
    const signIn = await new Promise<string>((ok) =>
      request(
        {
          host: '127.0.0.1',
          port: ui.port,
          path: `/?t=${ui.token}`,
          headers: { Host: `127.0.0.1:${ui.port}` },
        },
        (res) => {
          ok(String(res.headers['set-cookie']).split(';')[0]!);
          res.resume();
        }
      ).end()
    );
    for (const [path, method] of [
      ['/api/studio', 'GET'],
      ['/studio.js', 'GET'],
      ['/settings', 'GET'],
      ['/oauth/callback', 'GET'],
      ['/api/studio/run', 'POST'],
    ] as const) {
      const status = await new Promise<number>((ok) =>
        request(
          {
            host: '127.0.0.1',
            port: ui.port,
            path,
            method,
            headers: {
              Host: `127.0.0.1:${ui.port}`,
              Cookie: signIn,
              Origin: `http://127.0.0.1:${ui.port}`,
            },
          },
          (res) => {
            ok(res.statusCode!);
            res.resume();
          }
        ).end()
      );
      assert.ok(status === 404 || status === 405 || status === 403, `${method} ${path}: ${status}`);
    }
  } finally {
    await ui.close();
  }
});
