/**
 * The run lifecycle on a fake browser: start, the refusals that keep verdicts
 * honest, finish, an interrupted run resumed by a new process, and Stop.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import type { BrowserDriver } from '@stunt-double/browser-toolset/driver';

import { RunSchema } from '../src/files.ts';
import { LocalSession, rebase } from '../src/run.ts';

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
    close: async () => {
      closed = true;
    },
  } as unknown as BrowserDriver;
  return { driver, visited, isClosed: () => closed };
}

const projects: string[] = [];
after(() => Promise.all(projects.map((p) => rm(p, { recursive: true, force: true }))));

async function project(checklist: Record<string, unknown> = {}): Promise<string> {
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
    json({ name: 'First-time shopper', description: 'New to the site', persist_login: false })
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

  // A stopped run resumes with every check nobody judged.
  const resumed = await session.startRun({ checklist: 'checkout', resume: true });
  assert.equal(runId(resumed), next);
  assert.match(resumed, /Next: \[search-box\].*\(4 left\)/);
  assert.equal((await runJson(dir, next)).results.length, 0);
  await session.close();
  assert.equal((await runJson(dir, next)).status, 'interrupted');
});
