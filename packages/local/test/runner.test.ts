/**
 * The standalone runner on a fake browser and a fake model that emits tool
 * calls: the same LocalSession, files and scoring as an MCP run, plus Stop,
 * the step limit, a broken connection and the viewer's key kept back.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import type { Connection } from '../src/credentials.ts';
import type { LocalDriver } from '../src/driver.ts';
import { readJson, RunSchema } from '../src/files.ts';
import { LocalSession } from '../src/run.ts';
import { scrub, startStandaloneRun } from '../src/runner.ts';

function fakeDriver(visible: string[]): LocalDriver {
  let current = 'about:blank';
  const page = {
    id: 'page-1',
    goto: async (url: string) => {
      current = url;
    },
    url: () => current,
    title: async () => 'Shop',
    screenshot: async () => Buffer.from('png'),
    evaluate: async (expr: unknown, arg?: { text: string | null }) =>
      typeof expr === 'function'
        ? arg?.text && visible.some((v) => v.includes(arg.text!))
          ? 'text'
          : null
        : { ok: true, text: 'heading "Mug Shop" [ref_1]', truncated: false },
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    close: async () => {},
  };
  return {
    context: { activePage: async () => page, pages: async () => [page] },
    takeRefusal: () => null,
    close: async () => {},
  } as unknown as LocalDriver;
}

const dirs: string[] = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'stuntdouble-runner-'));
  dirs.push(dir);
  const sd = join(dir, '.stuntdouble');
  await mkdir(join(sd, 'actors'), { recursive: true });
  await mkdir(join(sd, 'checklists'), { recursive: true });
  await writeFile(
    join(sd, 'stuntdouble.json'),
    JSON.stringify({ format: 'stuntdouble/1', headless: true })
  );
  await writeFile(
    join(sd, 'actors', 'shopper.json'),
    JSON.stringify({ name: 'First-time shopper' })
  );
  await writeFile(
    join(sd, 'checklists', 'shop.json'),
    JSON.stringify({
      name: 'Shop',
      actor: 'shopper',
      url: 'http://localhost:4100/',
      instructions: 'Look around.',
      checks: [
        { key: 'heading', description: 'The page has a heading' },
        { key: 'shipping', description: 'Shipping is shown' },
      ],
    })
  );
  return dir;
}

const connection: Connection = {
  provider: 'openai',
  model: 'fake',
  baseUrl: 'http://localhost:9/v1',
  apiKey: null,
  keySource: 'none',
};

type Call = { name: string; arguments: Record<string, unknown> };
/** A model that answers each request with the next step, and records what it was sent. */
function fakeFetch(next: (n: number) => Call[] | Error) {
  const bodies: string[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const step = next(bodies.length - 1);
    if (step instanceof Error) {
      return new Response(JSON.stringify({ error: { message: step.message } }), { status: 400 });
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: null,
              tool_calls: step.map((c, i) => ({
                id: `c${bodies.length}-${i}`,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.arguments) },
              })),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      })
    );
  }) as unknown as typeof fetch;
  return { fn, bodies };
}

const session = (dir: string) =>
  new LocalSession({
    project: dir,
    launch: async () => fakeDriver(['Mug Shop']),
    runner: { model: { provider: 'openai', id: 'fake' } },
  });

test('a model that calls the tools gets the same verdicts, files and score as an MCP run', async () => {
  const dir = await project();
  const script: Call[][] = [
    [{ name: 'read_page', arguments: {} }],
    [
      {
        name: 'evaluate_check',
        arguments: {
          check: 'heading',
          status: 'passed',
          evidence: 'It says Mug Shop.',
          locator: { text: 'Mug Shop' },
        },
      },
      // Not on the page: refused, and the refusal goes back to the model.
      {
        name: 'evaluate_check',
        arguments: {
          check: 'shipping',
          status: 'passed',
          evidence: 'Shipping.',
          locator: { text: 'Free shipping' },
        },
      },
    ],
    [
      {
        name: 'evaluate_check',
        arguments: { check: 'shipping', status: 'failed', evidence: 'No shipping anywhere.' },
      },
    ],
    [{ name: 'finish_run', arguments: { summary: 'Heading fine, no shipping.' } }],
  ];
  const { fn, bodies } = fakeFetch((n) => script[n]!);
  const s = session(dir);
  const run = await startStandaloneRun({ session: s, connection, checklist: 'shop', fetch: fn });
  const done = await run.done;
  await s.close();
  assert.match(done.report, /^Run \S+ completed: failed\./);
  assert.equal(done.usage.steps, 4);
  const saved = await readJson(join(dir, '.stuntdouble', 'runs', run.runId, 'run.json'), RunSchema);
  assert.deepEqual(saved.runner.model, { provider: 'openai', id: 'fake' });
  assert.equal(saved.runner.judged, false);
  assert.equal(saved.runner.usage?.input_tokens, 400);
  assert.deepEqual(
    saved.results.map((r) => [r.check, r.status]),
    [
      ['heading', 'passed'],
      ['shipping', 'failed'],
    ]
  );
  assert.match(bodies[2]!, /is not visible on the current page/);
  // The brief went to the model without the viewer's key.
  assert.doesNotMatch(bodies.join('\n'), /\?t=/);
});

test('Stop from the Studio ends the run without another model call', async () => {
  const dir = await project();
  let runId = '';
  const { fn, bodies } = fakeFetch((n) => {
    if (n === 2) void writeFile(join(dir, '.stuntdouble', '.live', 'stop'), runId);
    return [{ name: 'read_page', arguments: {} }];
  });
  const s = session(dir);
  const run = await startStandaloneRun({ session: s, connection, checklist: 'shop', fetch: fn });
  runId = run.runId;
  const done = await run.done;
  await s.close();
  assert.ok(bodies.length <= 4, `stopped after ${bodies.length} calls`);
  const saved = await readJson(join(dir, '.stuntdouble', 'runs', run.runId, 'run.json'), RunSchema);
  assert.equal(saved.status, 'stopped');
  assert.match(saved.summary!, /Stopped from the Studio/);
  assert.match(done.report, /stopped/);
});

test('at the step limit the model is told to finish, then the runner finishes for it', async () => {
  const dir = await project();
  const { fn, bodies } = fakeFetch(() => [{ name: 'read_page', arguments: {} }]);
  const s = session(dir);
  const run = await startStandaloneRun({
    session: s,
    connection,
    checklist: 'shop',
    fetch: fn,
    limits: { maxSteps: 3 },
  });
  await run.done;
  await s.close();
  assert.equal(bodies.length, 4, 'three steps and one more to finish');
  assert.match(bodies[3]!, /You have used every step you were given/);
  const saved = await readJson(join(dir, '.stuntdouble', 'runs', run.runId, 'run.json'), RunSchema);
  assert.equal(saved.status, 'completed');
  assert.match(saved.summary!, /reached its limit of 3 model calls/);
  assert.deepEqual(
    saved.results.map((r) => r.status),
    ['error', 'error']
  );
});

test('a broken connection ends the run as failed, saying why', async () => {
  const dir = await project();
  const { fn } = fakeFetch(() => new Error('model "fake" not found'));
  const s = session(dir);
  const run = await startStandaloneRun({ session: s, connection, checklist: 'shop', fetch: fn });
  const done = await run.done;
  await s.close();
  assert.equal(done.failed, true);
  const raw = JSON.parse(
    await readFile(join(dir, '.stuntdouble', 'runs', run.runId, 'run.json'), 'utf8')
  );
  assert.equal(raw.status, 'failed');
  assert.match(raw.summary, /localhost:9 answered 400: model "fake" not found/);
});

test('scrub drops the viewer key from loopback links', () => {
  assert.equal(
    scrub('Watch it at http://127.0.0.1:4747/runs/x?t=abc123 now'),
    'Watch it at the Studio now'
  );
  assert.equal(scrub('https://example.com/?t=1'), 'https://example.com/?t=1');
});
