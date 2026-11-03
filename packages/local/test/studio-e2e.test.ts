/**
 * `stuntdouble studio` end to end: build the CLI, start the Studio over an
 * empty project, set it up from the onboarding route, edit an actor and a
 * checklist through the API, and run the checklist in headless Chrome with a
 * scripted OpenAI-compatible server as the model, so no key is needed. Then
 * the files, the verdicts and the page that shows them. Skipped, saying so, on
 * a machine with no Chrome.
 */

import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { RunSchema } from '../src/files.ts';
import { fakeModel, type FakeModel } from './helpers/fake-model.ts';

const PKG = fileURLToPath(new URL('..', import.meta.url));

const PAGES: Record<string, string> = {
  '/': `<!doctype html><title>Mug Shop</title>
    <header><h1>Mug Shop</h1><input type="search" placeholder="Search mugs"></header>
    <main><a href="/checkout">Checkout</a></main>`,
  '/checkout': `<!doctype html><title>Checkout</title>
    <h1>Checkout</h1><button id="guest">Continue as guest</button>`,
};

let site: Server;
let base: string;
let model: FakeModel;
let dir: string;
let home: string;
let studio: ChildProcess;
let origin: string;
let cookie: string;
let link: string;
let chromeMissing = false;

before(async () => {
  try {
    const b = await chromium.launch({ channel: 'chrome', headless: true });
    await b.close();
  } catch {
    chromeMissing = true;
    return;
  }
  execFileSync('pnpm', ['run', 'build'], { cwd: PKG, stdio: 'ignore' });
  site = createServer((req, res) => {
    const page = PAGES[req.url ?? '/'];
    res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' }).end(page ?? 'Not found');
  });
  await new Promise<void>((ok) => site.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

  model = await fakeModel([
    { calls: [{ name: 'read_page', arguments: {} }] },
    {
      calls: [
        {
          name: 'evaluate_check',
          arguments: {
            check: 'search-box',
            status: 'passed',
            evidence: 'The header has a "Search mugs" box.',
            locator: { text: 'Mug Shop' },
          },
        },
      ],
    },
    // A verdict that cites text not on the page is refused, and the actor goes on.
    {
      calls: [
        {
          name: 'evaluate_check',
          arguments: {
            check: 'free-shipping',
            status: 'passed',
            evidence: 'Free shipping.',
            locator: { text: 'Free shipping on every order' },
          },
        },
      ],
    },
    {
      calls: [
        {
          name: 'evaluate_check',
          arguments: {
            check: 'free-shipping',
            status: 'failed',
            evidence: 'Nothing on the home page mentions shipping.',
          },
        },
        { name: 'navigate', arguments: { url: `${base}/checkout` } },
      ],
    },
    {
      calls: [
        {
          name: 'evaluate_check',
          arguments: {
            check: 'guest-checkout',
            status: 'passed',
            evidence: 'Checkout offers "Continue as guest".',
            locator: { text: 'Continue as guest' },
          },
        },
      ],
    },
    {
      calls: [
        { name: 'finish_run', arguments: { summary: 'Guest checkout works; no shipping offer.' } },
      ],
    },
  ]);

  dir = await mkdtemp(join(tmpdir(), 'stuntdouble-studio-e2e-'));
  home = await mkdtemp(join(tmpdir(), 'stuntdouble-home-'));
  await writeFile(
    join(home, 'credentials.json'),
    JSON.stringify({ connection: { provider: 'openai', model: 'scripted', base_url: model.url } }),
    { mode: 0o600 }
  );
  studio = spawn(process.execPath, [join(PKG, 'dist', 'cli.js'), 'studio', dir, '--no-open'], {
    env: { ...process.env, STUNTDOUBLE_HOME: home, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  link = await new Promise<string>((ok, fail) => {
    let out = '';
    studio.stdout!.on('data', (chunk) => {
      out += chunk;
      const match = out.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=\S+/);
      if (match) ok(match[0]);
    });
    studio.on('exit', (code) => fail(new Error(`studio exited ${code}`)));
  });
  origin = new URL(link).origin;
  const signIn = await fetch(link, { redirect: 'manual' });
  cookie = signIn.headers.get('set-cookie')!.split(';')[0]!;
});

after(async () => {
  studio?.kill('SIGTERM');
  await new Promise((ok) => setTimeout(ok, 300));
  site?.close();
  await model?.close();
  for (const d of [dir, home]) if (d) await rm(d, { recursive: true, force: true });
});

const api = (path: string, method = 'GET', body?: unknown) =>
  fetch(origin + path, {
    method,
    headers: {
      Cookie: cookie,
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test('studio: onboarding, editing, a run on a scripted model, and the run in the page', async (t) => {
  if (chromeMissing) return t.skip('No Chrome on this machine');

  // Onboarding: no project yet, then the starter files.
  assert.equal((await (await api('/api/studio')).json()).initialised, false);
  const init = await api('/api/studio/init', 'POST', { url: `${base}/` });
  assert.equal(init.status, 200);
  const sd = join(dir, '.stuntdouble');
  assert.ok(await stat(join(sd, 'checklists', 'first-look.json')));
  assert.ok(await stat(join(sd, 'actors', 'first-time-visitor.json')));
  await writeFile(
    join(sd, 'stuntdouble.json'),
    JSON.stringify({ format: 'stuntdouble/1', headless: true })
  );

  // Editing, validated by the same schema start_run uses.
  const actor = await api('/api/studio/actors/shopper', 'PUT', {
    data: { name: 'First-time shopper', description: 'New to the site' },
    create: true,
  });
  assert.equal(actor.status, 200);
  const checklist = {
    name: 'Shop',
    actor: 'shopper',
    url: `${base}/`,
    instructions: 'Find a mug and check out as a guest.',
    checks: [
      { key: 'search-box', description: 'The home page has a search box' },
      {
        key: 'free-shipping',
        description: 'Free shipping is offered',
        type: 'weighted',
        weight: 1,
      },
      {
        key: 'guest-checkout',
        description: 'Checkout offers a guest option',
        type: 'weighted',
        weight: 3,
      },
    ],
    pass_threshold: 70,
  };
  const bad = await api('/api/studio/checklists/shop', 'PUT', {
    data: { ...checklist, checks: [{ key: 'Not A Slug', description: '' }] },
    create: true,
  });
  assert.equal(bad.status, 422);
  const paths = (await bad.json()).issues.map((i: { path: string }) => i.path);
  assert.ok(
    paths.includes('checks.0.key') && paths.includes('checks.0.description'),
    String(paths)
  );
  assert.equal(
    (await api('/api/studio/checklists/shop', 'PUT', { data: checklist, create: true })).status,
    200
  );

  const run = await api('/api/studio/run', 'POST', { checklist: 'shop', where: 'local' });
  const started = await run.json();
  assert.equal(run.status, 200, JSON.stringify(started));
  const id = started.run_id as string;

  let final;
  for (let i = 0; i < 120; i++) {
    const data = await (await api(`/api/runs/${encodeURIComponent(id)}`)).json();
    if (data.run && data.run.status !== 'running') {
      final = data;
      break;
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  assert.ok(final, 'the run finished');
  const runJson = RunSchema.parse(
    JSON.parse(await readFile(join(sd, 'runs', id, 'run.json'), 'utf8'))
  );
  assert.equal(runJson.status, 'completed');
  assert.equal(runJson.runner.kind, 'local');
  assert.equal(runJson.runner.judged, false);
  assert.deepEqual(runJson.runner.model, { provider: 'openai', id: 'scripted' });
  assert.equal(runJson.runner.usage?.steps, 6);
  assert.equal(runJson.runner.usage?.input_tokens, 6000);
  assert.deepEqual(Object.fromEntries(runJson.results.map((r) => [r.check, r.status])), {
    'search-box': 'passed',
    'free-shipping': 'failed',
    'guest-checkout': 'passed',
  });
  // 3 of 4 weighted points: 75%, over the 70 threshold, and the pass/fail check passed.
  assert.equal(runJson.score?.score, 75);
  assert.equal(runJson.score?.outcome, 'passed');
  assert.equal(runJson.summary, 'Guest checkout works; no shipping offer.');
  const shots = await readdir(join(sd, 'runs', id, 'shots'));
  assert.deepEqual(shots.sort(), ['free-shipping.png', 'guest-checkout.png', 'search-box.png']);
  const activity = (await readFile(join(sd, 'runs', id, 'activity.jsonl'), 'utf8'))
    .trim()
    .split('\n');
  assert.ok(activity.some((l) => JSON.parse(l).tool === 'navigate'));

  // The refused citation went back to the model as an error, and the viewer's key never did.
  const sent = JSON.stringify(model.requests);
  assert.match(sent, /is not visible on the current page/);
  assert.doesNotMatch(sent, /\?t=/);
  assert.equal(model.requests[0]!.authorization, null);

  // The page shows the run, labelled with its model.
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(
      `${origin}/runs/${encodeURIComponent(id)}?t=${new URL(link).searchParams.get('t')}`
    );
    await page.getByRole('heading', { name: 'Shop' }).waitFor();
    assert.ok(await page.getByText('Local, scripted, self-judged').first().isVisible());
    assert.ok(await page.getByText('Free shipping is offered').isVisible());
    assert.ok(await page.getByRole('button', { name: 'Run again' }).isVisible());
  } finally {
    await browser.close();
  }
});
