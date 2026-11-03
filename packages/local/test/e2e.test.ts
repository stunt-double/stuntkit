/**
 * The published CLI end to end: build it, start `dist/cli.js mcp` as an MCP
 * client would, and run a checklist against a small site on localhost in
 * headless Chrome. Skipped, saying so, on a machine with no Chrome.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { RunSchema } from '../src/files.ts';

const PKG = fileURLToPath(new URL('..', import.meta.url));

const PAGES: Record<string, string> = {
  '/': `<!doctype html><title>Mug Shop</title>
    <header><h1>Mug Shop</h1><input type="search" placeholder="Search mugs"></header>
    <main style="height: 3000px"><a href="/checkout">Checkout</a>
      <a href="__INTERNAL__">Staff admin</a>
      <input type="password" aria-label="Password">
      <div style="display:none">Free shipping on every order</div></main>
    <footer>Prices include GST</footer>`,
  '/checkout': `<!doctype html><title>Checkout</title>
    <h1>Checkout</h1><button id="guest">Continue as guest</button>`,
};

let site: Server;
/** Another service on this machine, which the actor must never reach. */
let internal: Server;
let internalUrl: string;
let dir: string;
let client: Client;

before(async () => {
  execFileSync('pnpm', ['run', 'build'], { cwd: PKG, stdio: 'ignore' });
  internal = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Admin</title>SECRET-DATA');
  });
  await new Promise<void>((ok) => internal.listen(0, '127.0.0.1', ok));
  internalUrl = `http://127.0.0.1:${(internal.address() as AddressInfo).port}/`;
  site = createServer((req, res) => {
    if (req.url === '/away') return res.writeHead(302, { Location: internalUrl }).end();
    const page = PAGES[req.url ?? '/']?.replace('__INTERNAL__', internalUrl);
    res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' }).end(page ?? 'Not found');
  });
  await new Promise<void>((ok) => site.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

  dir = await mkdtemp(join(tmpdir(), 'stuntdouble-e2e-'));
  const sd = join(dir, '.stuntdouble');
  await mkdir(join(sd, 'actors'), { recursive: true });
  await mkdir(join(sd, 'checklists'), { recursive: true });
  await writeFile(
    join(sd, 'stuntdouble.json'),
    JSON.stringify({ format: 'stuntdouble/1', local_base_url: base, headless: true })
  );
  await writeFile(
    join(sd, 'actors', 'shopper.json'),
    JSON.stringify({ name: 'First-time shopper', description: 'New to the site' })
  );
  await writeFile(
    join(sd, 'checklists', 'shop.json'),
    JSON.stringify({
      name: 'Shop',
      actor: 'shopper',
      // Rebased onto local_base_url for a local run.
      url: 'https://shop.example.com/',
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
    })
  );

  client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(PKG, 'dist', 'cli.js'), 'mcp'],
      env: { ...getDefaultEnvironment(), STUNTDOUBLE_PROJECT_DIR: dir },
    })
  );
});

after(async () => {
  await client?.close();
  site?.close();
  internal?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = result.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  return { result, text, images: result.content.filter((c) => c.type === 'image') };
}

test('a checklist runs end to end over MCP in headless Chrome', { timeout: 60_000 }, async (t) => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'navigate',
      'read_page',
      'find',
      'get_page_text',
      'click',
      'type',
      'form_input',
      'key',
      'scroll',
      'screenshot',
      'start_run',
      'evaluate_check',
      'finish_run',
      'open_ui',
    ]
  );

  const started = await call('start_run', { checklist: 'shop' });
  if (/Could not start Chrome/.test(started.text)) return t.skip('No Chrome on this machine');
  assert.equal(started.result.isError, undefined, started.text);
  const [, link, id] = started.text.match(/(http:\/\/127\.0\.0\.1:\d+\/runs\/(\S+)\?t=\S+)/)!;
  assert.match(started.text, /Now on http:\/\/127\.0\.0\.1:\d+\/ \(Mug Shop\)/);
  assert.equal(started.images.length, 0, 'screenshots go to the model only on request');

  const read = (await call('read_page', { filter: 'all' })).text;
  assert.match(read, /Search mugs/);
  assert.equal((await call('screenshot')).images.length, 1);
  const base = started.text.match(/Now on (http:\/\/127\.0\.0\.1:\d+)\//)![1];

  // A form value can be a password: it reaches the page, never the log.
  const password = read.match(/textbox "Password"[^\n]*?\b(ref_\d+)/)![1];
  const filled = await call('form_input', { ref: password, value: 'hunter2-real-password' });
  assert.doesNotMatch(filled.text, /hunter2/);

  // Other services on this machine stay out of reach, however the browser is
  // sent there: the viewer and another port on the app's own host included.
  for (const url of [internalUrl, link!]) {
    assert.match((await call('navigate', { url })).text, /Navigation refused/, url);
  }
  const redirected = await call('navigate', { url: `${base}/away` });
  assert.equal(redirected.result.isError, true);
  assert.match(redirected.text, /Navigation refused/);
  assert.doesNotMatch((await call('get_page_text')).text, /SECRET-DATA/);
  await call('navigate', { url: `${base}/` });
  const reread = (await call('read_page', { filter: 'all' })).text;
  const admin = reread.match(/link "Staff admin"[^\n]*?\b(ref_\d+)/)![1];
  assert.match((await call('click', { ref: admin })).text, /Navigation refused/);
  assert.doesNotMatch((await call('get_page_text')).text, /SECRET-DATA/);
  await call('navigate', { url: `${base}/` });

  const uncited = await call('evaluate_check', {
    check: 'search-box',
    status: 'passed',
    evidence: 'There is a search box.',
    locator: { text: 'Find your next mug' },
  });
  assert.equal(uncited.result.isError, true);
  assert.match(uncited.text, /not visible on the current page/);

  // Text in the page but hidden is not evidence.
  const hidden = await call('evaluate_check', {
    check: 'free-shipping',
    status: 'passed',
    evidence: 'Free shipping on every order.',
    locator: { text: 'Free shipping on every order' },
  });
  assert.match(hidden.text, /not visible on the current page/);

  // Two verdicts at once (one turn, two checks) are both recorded.
  const [search, shipping] = await Promise.all([
    call('evaluate_check', {
      check: 'search-box',
      status: 'passed',
      evidence: 'A search field reading "Search mugs" sits in the header.',
      locator: { text: 'Search mugs' },
    }),
    call('evaluate_check', {
      check: 'free-shipping',
      status: 'failed',
      evidence:
        'Nothing on the home page mentions shipping; the footer only says prices include GST.',
      locator: { text: 'Prices include GST' },
    }),
  ]);
  assert.match(search.text, /Recorded \[search-box\] as passed/);
  assert.match(shipping.text, /Recorded \[free-shipping\] as failed/);
  await call('navigate', { url: `${base}/checkout` });
  await call('evaluate_check', {
    check: 'guest-checkout',
    status: 'passed',
    evidence: 'A "Continue as guest" button is the first choice.',
    locator: { selector: '#guest' },
  });

  const finished = await call('finish_run', {
    summary: 'Search and guest checkout work; no free shipping.',
  });
  assert.match(finished.text, /completed: passed\. Scored 75% against a 70% threshold/);
  assert.match((await call('open_ui')).text, /^http:\/\/127\.0\.0\.1:\d+\/\?t=/);

  const runDir = join(dir, '.stuntdouble', 'runs', id!);
  const run = RunSchema.parse(JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8')));
  assert.equal(run.status, 'completed');
  assert.equal(run.url, `${base}/`);
  assert.deepEqual(run.score, {
    score: 75,
    unit: null,
    outcome: 'passed',
    pass_threshold: 70,
    grade: null,
  });
  const log = await readFile(join(runDir, 'activity.jsonl'), 'utf8');
  assert.doesNotMatch(log, /hunter2/);
  assert.doesNotMatch(log, /SECRET-DATA/);
  const activity = log.trim().split('\n');
  assert.ok(activity.length >= 8, `${activity.length} activity lines`);
  for (const key of ['search-box', 'free-shipping', 'guest-checkout']) {
    const png = await readFile(join(runDir, 'shots', `${key}.png`));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', key);
  }

  // The viewer: refused without the key, signed in with it.
  const origin = new URL(link!).origin;
  assert.equal((await fetch(`${origin}/api/runs`)).status, 403);
  const signIn = await fetch(link!, { redirect: 'manual' });
  assert.equal(signIn.status, 302);
  const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!;
  const runs = await fetch(`${origin}/api/runs`, { headers: { Cookie: cookie } });
  assert.equal(runs.status, 200);
  assert.equal(((await runs.json()) as Array<{ id: string }>)[0]!.id, id);
  const page = await fetch(`${origin}/runs/${id}`, { headers: { Cookie: cookie } });
  assert.match(await page.text(), /<title>Stunt Double Local<\/title>/);
});
