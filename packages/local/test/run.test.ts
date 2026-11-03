/**
 * The run lifecycle on a fake browser: start, the refusals that keep verdicts
 * honest, finish, an interrupted run resumed by a new process, and Stop.
 */

import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { nodeSupported } from '../src/doctor.ts';
import type { LaunchOptions, LocalDriver } from '../src/driver.ts';
import {
  appendJsonl,
  effectiveStatus,
  readJson,
  RunSchema,
  writeFileAtomic,
} from '../src/files.ts';
import { isTrustedHost, LocalSession, rebase } from '../src/run.ts';

/** A page that shows `visible` and nothing else. */
function fakeBrowser(visible: string[]) {
  const visited: string[] = [];
  let current = 'about:blank';
  const page = {
    id: 'page-1',
    goto: async (url: string) => {
      visited.push(url);
      current = url;
    },
    url: () => current,
    title: async () => 'Shop',
    screenshot: async () => Buffer.from('png'),
    evaluate: async (expr: unknown, arg?: { text: string | null }) =>
      typeof expr === 'function'
        ? arg?.text && visible.some((v) => v.toLowerCase().includes(arg.text!.toLowerCase()))
          ? 'text'
          : null
        : { ok: true, text: 'textbox "Search mugs" [ref_1]', truncated: false },
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    close: async () => {},
  };
  let closed = false;
  const driver = {
    context: { activePage: async () => page, pages: async () => [page] },
    takeRefusal: () => null,
    close: async () => {
      closed = true;
    },
  } as unknown as LocalDriver;
  return { driver, visited, isClosed: () => closed };
}

const projects: string[] = [];
after(() => Promise.all(projects.map((p) => rm(p, { recursive: true, force: true }))));

async function project(
  checklist: Record<string, unknown> = {},
  actor: Record<string, unknown> = {}
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'stuntdouble-run-'));
  projects.push(dir);
  const sd = join(dir, '.stuntdouble');
  await mkdir(join(sd, 'actors'), { recursive: true });
  await mkdir(join(sd, 'checklists'), { recursive: true });
  const json = (data: unknown) => JSON.stringify(data, null, 2);
  await writeFile(
    join(sd, 'stuntdouble.json'),
    json({ format: 'stuntdouble/1', local_base_url: 'http://localhost:4100', headless: true })
  );
  await writeFile(
    join(sd, 'actors', 'shopper.json'),
    json({
      name: 'First-time shopper',
      description: 'New to the site',
      persist_login: false,
      ...actor,
    })
  );
  await writeFile(
    join(sd, 'checklists', 'checkout.json'),
    json({
      name: 'Checkout',
      actor: 'shopper',
      url: 'https://staging.example.com/shop?ref=1',
      instructions: 'Buy the cheapest mug as a guest.',
      checks: [
        { key: 'search-box', description: 'The home page shows a search box' },
        {
          key: 'guest-checkout',
          description: 'Guest checkout needs no account',
          on_failure: 'stop',
        },
        {
          key: 'shipping-early',
          description: 'Shipping is shown early',
          type: 'weighted',
          weight: 2,
        },
        { key: 'order-total', description: 'Record the order total', type: 'informational' },
      ],
      pass_threshold: 80,
      ...checklist,
    })
  );
  return dir;
}

const runJson = async (dir: string, id: string) =>
  RunSchema.parse(
    JSON.parse(await readFile(join(dir, '.stuntdouble', 'runs', id, 'run.json'), 'utf8'))
  );

const runId = (text: string) => text.match(/Run (\S+) (?:started|resumed)/)![1]!;

test('rebase swaps only the origin', () => {
  assert.equal(
    rebase('https://staging.example.com/shop?ref=1', 'http://localhost:4100'),
    'http://localhost:4100/shop?ref=1'
  );
  assert.equal(rebase('https://example.com/a', null), 'https://example.com/a');
  // The checklist's port must not survive a base without one.
  assert.equal(
    rebase('https://staging.example.com:8443/a', 'http://localhost'),
    'http://localhost/a'
  );
});

test('writes inside .stuntdouble/ refuse to follow a symlink', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sd-links-'));
  after(() => rm(dir, { recursive: true, force: true }));
  const outside = join(dir, 'outside.txt');
  const run = join(dir, '.stuntdouble', 'runs', 'r');
  await mkdir(run, { recursive: true });
  await symlink(outside, join(run, 'activity.jsonl'));
  await symlink(dir, join(run, 'shots'));
  await assert.rejects(appendJsonl(join(run, 'activity.jsonl'), { a: 1 }), /symlink/);
  await assert.rejects(writeFileAtomic(join(run, 'shots', 'k.png'), 'x'), /symlink/);
  assert.equal(await stat(outside).catch(() => null), null);
});

test('start_run names every field to fix in an invalid checklist', async () => {
  const dir = await project({
    instructions: '',
    checks: [{ key: 'Bad Key', description: 'x', type: 'vibes' }],
  });
  const session = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  await assert.rejects(session.startRun({ checklist: 'checkout' }), (err: Error) => {
    assert.match(err.message, /checklists\/checkout\.json: instructions:/);
    assert.match(err.message, /checks\.0\.key: Use lowercase letters/);
    assert.match(err.message, /checks\.0\.type:/);
    return true;
  });
  await session.close();
});

test('start_run refuses an actor the hosted inputs would refuse', async () => {
  const dir = await project(
    {},
    {
      system_prompt: 'x'.repeat(1001),
      knowledge: [{ title: 't'.repeat(121), content: 'c'.repeat(8001) }],
    }
  );
  const session = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  await assert.rejects(session.startRun({ checklist: 'checkout' }), (err: Error) => {
    assert.match(err.message, /actors\/shopper\.json: system_prompt:/);
    assert.match(err.message, /knowledge\.0\.title:/);
    assert.match(err.message, /knowledge\.0\.content:/);
    return true;
  });
  await session.close();
});

test('a cloud run written in the documented shape is listed, not unreadable', () => {
  const run = RunSchema.parse({
    format: 'stuntdouble.run/1',
    id: '20261103-150000-checkout-cloud',
    runner: { kind: 'cloud', run_id: 'r1', judged: true, url: 'https://app.stuntdouble.io/w/x' },
    status: 'completed',
    url: 'https://staging.example.com',
    started_at: '2026-11-03T04:00:00Z',
    finished_at: '2026-11-03T04:05:00Z',
    checklist: 'checkout',
    actor: 'shopper',
    checklist_snapshot: { checks: [{ key: 'search-box', description: 'A search box' }] },
    results: [{ check: 'search-box', status: 'passed', evidence: 'In the header.' }],
    score: { score: 100, outcome: 'passed', inconclusive: false },
    summary: 'Fine.',
    cloud: null,
  });
  assert.equal(run.score?.outcome, 'passed');
});

test('writes to one path at the same moment all land', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stuntdouble-write-'));
  projects.push(dir);
  const path = join(dir, 'run.json');
  await Promise.all(Array.from({ length: 8 }, (_, i) => writeFileAtomic(path, String(i))));
  assert.match(await readFile(path, 'utf8'), /^[0-7]$/);
});

test('a run starts, refuses bad verdicts, is interrupted, resumes and finishes', async () => {
  const dir = await project();
  const first = fakeBrowser(['Search mugs']);
  const session = new LocalSession({ project: dir, launch: async () => first.driver });

  const started = await session.startRun({ checklist: 'checkout' });
  const id = runId(started);
  assert.match(started, /http:\/\/127\.0\.0\.1:\d+\/runs\/.+\?t=/);
  assert.match(started, /- \[shipping-early\] \(weighted x2, always\) Shipping is shown early/);
  assert.match(started, /- \[guest-checkout\] \(pass\/fail, always, the run stops if it fails\)/);
  assert.match(started, /Next: \[search-box\]/);
  // The checklist's origin is swapped for local_base_url.
  assert.deepEqual(first.visited, ['http://localhost:4100/shop?ref=1']);
  assert.equal((await runJson(dir, id)).status, 'running');

  await assert.rejects(
    session.evaluateCheck({ check: 'nope', status: 'passed', evidence: 'x' }),
    /No check "nope".*search-box, guest-checkout/
  );
  await assert.rejects(
    session.evaluateCheck({ check: 'search-box', status: 'informational', evidence: 'x' }),
    /is scored/
  );
  await assert.rejects(
    session.evaluateCheck({ check: 'order-total', status: 'passed', evidence: 'x' }),
    /is informational/
  );
  await assert.rejects(
    session.evaluateCheck({ check: 'search-box', status: 'passed', evidence: 'There is one.' }),
    /needs a locator/
  );
  await assert.rejects(
    session.evaluateCheck({
      check: 'search-box',
      status: 'passed',
      evidence: 'There is one.',
      locator: { text: 'Find a gift' },
    }),
    /"Find a gift" is not visible on the current page/
  );

  const passed = await session.evaluateCheck({
    check: 'search-box',
    status: 'passed',
    evidence: 'A field labelled Search mugs sits in the header.',
    locator: { text: 'Search mugs' },
  });
  assert.match(passed, /Recorded \[search-box\] as passed\.\nNext: \[guest-checkout\]/);
  await assert.rejects(
    session.evaluateCheck({ check: 'search-box', status: 'failed', evidence: 'x' }),
    /already has a verdict/
  );
  // A failure may cite an absence.
  await session.evaluateCheck({
    check: 'shipping-early',
    status: 'failed',
    evidence: 'Shipping first appears on the payment step.',
  });
  await stat(join(dir, '.stuntdouble', 'runs', id, 'shots', 'search-box.png'));

  // The process dies mid-run: run.json still says running, with a pid that is gone.
  await session.close();
  const path = join(dir, '.stuntdouble', 'runs', id, 'run.json');
  await writeFile(
    path,
    JSON.stringify({ ...(await runJson(dir, id)), status: 'running', pid: 2 ** 31 - 1 })
  );
  assert.ok(first.isClosed());

  const second = fakeBrowser(['Continue as guest']);
  const restarted = new LocalSession({ project: dir, launch: async () => second.driver });
  await assert.rejects(
    restarted.startRun({ checklist: 'missing' }),
    /checklists\/missing\.json: file not found/
  );
  const resumed = await restarted.startRun({ checklist: 'checkout', resume: true });
  assert.equal(runId(resumed), id);
  assert.match(resumed, /- \[guest-checkout\]/);
  assert.match(resumed, /- \[order-total\]/);
  assert.doesNotMatch(resumed, /- \[search-box\]/);
  assert.doesNotMatch(resumed, /- \[shipping-early\]/);

  await restarted.evaluateCheck({
    check: 'guest-checkout',
    status: 'passed',
    evidence: 'A Continue as guest button skips the account step.',
    locator: { text: 'continue as guest' },
  });
  const last = await restarted.evaluateCheck({
    check: 'order-total',
    status: 'informational',
    evidence: '$27.45 including shipping',
  });
  assert.match(last, /Every check has a verdict: call finish_run/);

  const finished = await restarted.finishRun({
    summary: 'Guest checkout works; shipping shows late.',
  });
  assert.match(finished, /completed: failed\. Scored 0% against a 80% threshold/);
  assert.match(finished, /Failed:\n- \[shipping-early\] Shipping first appears/);
  assert.ok(second.isClosed());

  const run = await runJson(dir, id);
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.score, {
    score: 0,
    unit: null,
    outcome: 'failed',
    pass_threshold: 80,
    grade: null,
  });
  assert.deepEqual(
    run.results.map((r) => [r.check, r.status]),
    [
      ['search-box', 'passed'],
      ['shipping-early', 'failed'],
      ['guest-checkout', 'passed'],
      ['order-total', 'informational'],
    ]
  );
  assert.equal(run.runner.judged, false);
  const activity = (await readFile(join(dir, '.stuntdouble', 'runs', id, 'activity.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).tool);
  assert.deepEqual(
    [activity[0], activity[1], activity.at(-1)],
    ['start_run', 'navigate', 'finish_run']
  );
  assert.equal(await readFile(join(dir, '.stuntdouble', '.gitignore'), 'utf8'), '.live/\n');
  await restarted.close();
});

test('a failed stop check skips the rest, and Stop ends the run at the next call', async () => {
  const dir = await project();
  const session = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  const id = runId(await session.startRun({ checklist: 'checkout' }));
  const halted = await session.evaluateCheck({
    check: 'guest-checkout',
    status: 'failed',
    evidence: 'Checkout asks for an account first.',
  });
  assert.match(
    halted,
    /\[search-box\] Skipped: the run stopped when "Guest checkout needs no account" failed\./
  );
  assert.match(halted, /Every check has a verdict/);
  await session.finishRun({ summary: 'Blocked by an account wall.' });
  assert.equal((await runJson(dir, id)).score?.outcome, 'failed');

  const next = runId(await session.startRun({ checklist: 'checkout' }));
  await writeFile(join(dir, '.stuntdouble', '.live', 'stop'), next);
  const refused = await session.browserTool('read_page', {});
  assert.equal(refused.isError, true);
  assert.match(refused.text, /stopped from the viewer.*call finish_run/);
  assert.equal((await runJson(dir, next)).status, 'stopped');
  const finished = await session.finishRun({ summary: 'Stopped before judging anything.' });
  assert.match(finished, /stopped: inconclusive/);
  await assert.rejects(stat(join(dir, '.stuntdouble', '.live', 'stop')));

  // A run still open in this process (the actor was interrupted) is resumed in place.
  const open = runId(await session.startRun({ checklist: 'checkout' }));
  await session.evaluateCheck({ check: 'shipping-early', status: 'failed', evidence: 'Late.' });
  await assert.rejects(
    session.startRun({ checklist: 'checkout' }),
    new RegExp(`Run ${open} of checkout is still going: .*resume`)
  );
  const carried = await session.startRun({ checklist: 'checkout', resume: true });
  assert.equal(runId(carried), open);
  assert.match(carried, /still open where the run left off/);
  assert.doesNotMatch(carried, /- \[shipping-early\]/);
  await session.finishRun({ summary: 'Carried on.' });

  // A stopped run resumes with every check nobody judged.
  const resumed = await session.startRun({ checklist: 'checkout', resume: true });
  assert.equal(runId(resumed), next);
  assert.match(resumed, /Next: \[search-box\].*\(4 left\)/);
  assert.equal((await runJson(dir, next)).results.length, 0);
  await session.close();
  assert.equal((await runJson(dir, next)).status, 'interrupted');
});

const PASS_FAIL = {
  checks: [
    { key: 'search-box', description: 'The home page shows a search box' },
    { key: 'guest-checkout', description: 'Guest checkout needs no account' },
  ],
  pass_threshold: 50,
};

test('a checklist without weights says it has no score, at start and finish', async () => {
  const dir = await project(PASS_FAIL, { description: 'New to the site.' });
  const session = new LocalSession({
    project: dir,
    launch: async () => fakeBrowser(['Search mugs']).driver,
  });
  const started = await session.startRun({ checklist: 'checkout' });
  assert.match(started, /pass_threshold \(50\) applies to weighted checks only/);
  // The description's own full stop is not doubled.
  assert.match(started, /You are First-time shopper: New to the site\.\n/);
  await session.evaluateCheck({
    check: 'search-box',
    status: 'passed',
    evidence: 'In the header.',
    locator: { text: 'Search mugs' },
  });
  await session.evaluateCheck({ check: 'guest-checkout', status: 'failed', evidence: 'No.' });
  const finished = await session.finishRun({ summary: 'Half.' });
  assert.match(
    finished,
    /completed: failed\. 1\/2 checks passed\. No score: this checklist has no weighted checks, so it passes only when every pass\/fail check passes\. Its pass_threshold \(50\) applies/
  );
  // A second finish_run, which subagents send, is answered rather than refused.
  assert.match(
    await session.finishRun({ summary: 'Again.' }),
    /has already finished: its report is at http/
  );
  assert.match(
    await session.evaluateCheck({ check: 'search-box', status: 'failed', evidence: 'x' }),
    /has already finished/
  );
  await session.close();
});

test('start_run keeps the start page out of its reply', async () => {
  const dir = await project();
  const session = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  const started = await session.startRun({ checklist: 'checkout' });
  assert.match(
    started,
    /The browser is open at http:\/\/localhost:4100\/shop\?ref=1: read the page/
  );
  assert.doesNotMatch(started, /Now on|Navigated to/);
  await session.close();
});

test('a missing file says what exists, or how to make one', async () => {
  const dir = await project();
  const session = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  await assert.rejects(
    session.startRun({ checklist: 'nope' }),
    /checklists\/nope\.json: file not found\. The checklists here are: checkout\./
  );
  await rm(join(dir, '.stuntdouble', 'stuntdouble.json'));
  await assert.rejects(
    session.startRun({ checklist: 'checkout' }),
    /stuntdouble\.json: file not found\. Run \/stuntdouble setup/
  );
  // A file that is there but unreadable is not "not found".
  const file = join(dir, 'locked.json');
  await writeFile(file, '{}');
  await chmod(file, 0o000);
  await assert.rejects(readJson(file, RunSchema), /could not read \(EACCES\)/);
  await session.close();
});

test('a page with no host gets the third-party guard', () => {
  const trusted = ['localhost', 'staging.example.com'];
  for (const url of ['about:blank', 'data:,', 'blob:https://evil.example/123']) {
    assert.equal(isTrustedHost(URL.parse(url)?.hostname ?? '', trusted), false, url);
  }
  assert.equal(isTrustedHost('evil.example', trusted), false);
  assert.equal(isTrustedHost('localhost', trusted), true);
});

test('a kept login is kept per project, not shared by actor name', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sd-home-'));
  projects.push(home);
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    const dirs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const dir = await project({}, { persist_login: true });
      const session = new LocalSession({
        project: dir,
        launch: async (options: LaunchOptions) => {
          dirs.push(options.profileDir);
          return fakeBrowser([]).driver;
        },
      });
      await session.startRun({ checklist: 'checkout' });
      await session.close();
    }
    assert.equal(dirs.length, 2);
    assert.notEqual(dirs[0], dirs[1]);
    for (const d of dirs) assert.match(d, /\.stuntdouble\/profiles\/[0-9a-f]{12}\/shopper$/);
  } finally {
    process.env.HOME = before;
  }
});

test('a running run.json whose pid was reused is still interrupted', async () => {
  const dir = await project();
  const session = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  const id = runId(await session.startRun({ checklist: 'checkout' }));
  const root = join(dir, '.stuntdouble');
  assert.equal(effectiveStatus(root, await runJson(dir, id)), 'running');
  await session.close();
  // A clone, or a crash: no marker, and a pid that answers (this process).
  const path = join(root, 'runs', id, 'run.json');
  await writeFile(
    path,
    JSON.stringify({ ...(await runJson(dir, id)), status: 'running', pid: process.pid })
  );
  assert.equal(effectiveStatus(root, await runJson(dir, id)), 'interrupted');
  await writeFile(path, JSON.stringify({ ...(await runJson(dir, id)), pid: 1 }));
  const again = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  assert.equal(runId(await again.startRun({ checklist: 'checkout', resume: true })), id);
  await again.close();
});

test('open_ui lists the latest runs with their outcome and tally', async () => {
  const dir = await project(PASS_FAIL);
  const session = new LocalSession({ project: dir, launch: async () => fakeBrowser([]).driver });
  const id = runId(await session.startRun({ checklist: 'checkout' }));
  await session.evaluateCheck({ check: 'guest-checkout', status: 'failed', evidence: 'No.' });
  await session.finishRun({ summary: 'Failed.' });
  const overview = await session.overview();
  assert.match(overview, /^http:\/\/127\.0\.0\.1:\d+\/\?t=/);
  assert.match(
    overview,
    new RegExp(`- checkout: completed, failed, 0/2 checks passed, started just now \\(${id}\\)`)
  );
  await session.close();
});

test('a cloud run pulled back before it started still reads', () => {
  const run = RunSchema.parse({
    format: 'stuntdouble.run/1',
    id: 'r',
    runner: { kind: 'cloud', judged: true },
    status: 'running',
    url: 'https://example.com',
    started_at: null,
    finished_at: null,
    checklist: 'c',
    actor: 'a',
    checklist_snapshot: { checks: [] },
    results: [],
    score: null,
    summary: null,
    cloud: null,
  });
  assert.equal(run.started_at, null);
});

test('the CLI refuses a Node older than 22.18', () => {
  assert.equal(nodeSupported('22.17.1'), false);
  assert.equal(nodeSupported('20.19.0'), false);
  assert.equal(nodeSupported('22.18.0'), true);
  assert.equal(nodeSupported('24.1.0'), true);
});
