/**
 * The direct tools are the index's measuring instrument: every published arm
 * is offered exactly these, and none of them may make a model call. These pin
 * what each tool does to the page and what it hands back to the arm.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clampRead,
  DIRECT_TOOL_NAMES,
  DIRECT_TOOL_SPECS,
  DirectBrowserTools,
  MAX_READ_CHARS,
  targetOf,
} from './direct-tools.ts';
import type { BrowserDriver, DriverPage } from './driver.ts';

type Call = { method: string; args: unknown[] };

function fakeDriver(evaluate: (expr: string) => unknown = () => ({ ok: true, text: 'tree' })) {
  const calls: Call[] = [];
  let current = 'https://example.com/';
  const page = {
    id: 'page-1',
    goto: async (u: string) => {
      calls.push({ method: 'goto', args: [u] });
      current = u;
    },
    goBack: async () => void calls.push({ method: 'back', args: [] }),
    goForward: async () => {},
    screenshot: async () => Buffer.from('png-bytes'),
    evaluate: async (expr: string) => evaluate(expr),
    url: async () => current,
    title: async () => 'Example',
    click: async (...args: unknown[]) => void calls.push({ method: 'click', args }),
    hover: async () => {},
    scroll: async (...args: unknown[]) => void calls.push({ method: 'scroll', args }),
    dragAndDrop: async () => {},
    type: async (...args: unknown[]) => void calls.push({ method: 'type', args }),
    keyPress: async (...args: unknown[]) => void calls.push({ method: 'key', args }),
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    close: async () => {},
  } as unknown as DriverPage;
  const driver = {
    context: {
      activePage: async () => page,
      pages: async () => [page],
      setDomainPolicy: async () => {},
      newPage: async () => page,
      setActivePage: async () => {},
    },
    act: async () => {
      throw new Error('act must never be called');
    },
    extract: async () => {
      throw new Error('extract must never be called');
    },
    close: async () => {},
  } as unknown as BrowserDriver;
  return { driver, calls };
}

const tools = (driver: BrowserDriver, toolTimeoutMs?: number) =>
  new DirectBrowserTools(driver, {
    viewport: { width: 1280, height: 720 },
    settleMs: 0,
    ...(toolTimeoutMs ? { toolTimeoutMs } : {}),
  });

// The page script answers `resolve` with a point and `read` / `find` / `text`
// with text; the op name is in the JSON-encoded argument.
const pageScript = (expr: string) =>
  expr.includes('"op":"resolve"')
    ? { ok: true, x: 40, y: 60, inViewport: true }
    : expr.includes('"op":"form"')
      ? { ok: true, description: 'Selected "Large"' }
      : { ok: true, text: 'button "Buy" [ref_3]', truncated: false };

test('the tool set is the shared vocabulary, with no model-backed tools', () => {
  assert.deepEqual([...DIRECT_TOOL_NAMES].sort(), [
    'click',
    'done',
    'find',
    'form_input',
    'get_page_text',
    'key',
    'navigate',
    'read_page',
    'screenshot',
    'scroll',
    'type',
  ]);
  for (const spec of DIRECT_TOOL_SPECS) {
    assert.equal(spec.parameters.type, 'object');
    // Flat scalar parameters only: a union or nested object is where
    // providers' function calling disagrees.
    for (const [key, prop] of Object.entries(spec.parameters.properties)) {
      const type = (prop as { type?: unknown }).type;
      assert.ok(typeof type === 'string', `${spec.name}.${key} has a single scalar type`);
      assert.notEqual(type, 'object', `${spec.name}.${key} is not nested`);
    }
  }
});

test('click by ref resolves the ref and clicks its centre, then shows the page', async () => {
  const { driver, calls } = fakeDriver(pageScript);
  const r = await tools(driver).run('click', { ref: 'ref_3' });
  assert.equal(r.error, undefined);
  assert.deepEqual(calls.find((c) => c.method === 'click')?.args, [
    40,
    60,
    { button: 'left', clickCount: 1 },
  ]);
  assert.match(r.text, /Now on https:\/\/example\.com\/ \(Example\)/);
  assert.equal(r.screenshotBase64, Buffer.from('png-bytes').toString('base64'));
});

test('click by coordinate clicks there without touching the page script', async () => {
  const { driver, calls } = fakeDriver(() => {
    throw new Error('no page script for a coordinate click');
  });
  const r = await tools(driver).run('click', { x: 100.4, y: 200.6 });
  assert.equal(r.error, undefined);
  assert.deepEqual(calls.find((c) => c.method === 'click')?.args?.slice(0, 2), [100, 201]);
});

test('click with no target is an error the model can correct', async () => {
  const { driver, calls } = fakeDriver(pageScript);
  const r = await tools(driver).run('click', {});
  assert.ok(r.error);
  assert.match(r.text, /needs a ref, or both x and y/);
  assert.equal(calls.length, 0);
});

test('type with a ref focuses the field first, and never presses Enter', async () => {
  const { driver, calls } = fakeDriver(pageScript);
  const r = await tools(driver).run('type', { ref: 'ref_3', text: 'running shoes' });
  assert.equal(r.error, undefined);
  assert.deepEqual(
    calls.map((c) => c.method),
    ['click', 'type']
  );
  assert.deepEqual(calls[1].args, ['running shoes']);
  assert.ok(r.screenshotBase64);
});

test('type without a target types into the focused element', async () => {
  const { driver, calls } = fakeDriver(pageScript);
  await tools(driver).run('type', { text: 'hello' });
  assert.deepEqual(
    calls.map((c) => c.method),
    ['type']
  );
});

test('reads return text with no screenshot', async () => {
  const { driver } = fakeDriver(pageScript);
  const t = tools(driver);
  for (const [name, input] of [
    ['read_page', {}],
    ['read_page', { filter: 'interactive', ref: 'ref_1' }],
    ['find', { query: 'buy button' }],
    ['get_page_text', {}],
  ] as const) {
    const r = await t.run(name, input);
    assert.equal(r.error, undefined, name);
    assert.equal(r.text, 'button "Buy" [ref_3]', name);
    assert.equal(r.screenshotBase64, undefined, name);
  }
});

test('a long read is clamped with a note on how to read less', () => {
  const out = clampRead('x'.repeat(MAX_READ_CHARS + 10));
  assert.ok(out.startsWith('x'.repeat(MAX_READ_CHARS)));
  assert.match(out, /truncated at 20000 characters/);
  assert.equal(clampRead('short'), 'short');
});

test('scroll defaults to the middle of the viewport and five notches', async () => {
  const { driver, calls } = fakeDriver(pageScript);
  const r = await tools(driver).run('scroll', { direction: 'down' });
  assert.equal(r.error, undefined);
  assert.deepEqual(calls.find((c) => c.method === 'scroll')?.args, [640, 360, 0, 500]);
});

test('form_input passes a string value through to the page script', async () => {
  let seen = '';
  const { driver } = fakeDriver((expr) => {
    seen = expr;
    return { ok: true, description: 'Checked ref_9' };
  });
  const r = await tools(driver).run('form_input', { ref: 'ref_9', value: 'true' });
  assert.equal(r.error, undefined);
  assert.match(r.text, /^Checked ref_9/);
  assert.match(seen, /"value":"true"/);
});

test('navigate refuses private hosts and non-http schemes', async () => {
  const { driver, calls } = fakeDriver(pageScript);
  const t = tools(driver);
  const meta = await t.run('navigate', { url: 'http://169.254.169.254/latest/meta-data' });
  assert.ok(meta.error);
  const file = await t.run('navigate', { url: 'file:///etc/passwd' });
  assert.ok(file.error);
  assert.equal(calls.filter((c) => c.method === 'goto').length, 0);
  const ok = await t.run('navigate', { url: 'example.org/pricing' });
  assert.equal(ok.error, undefined);
  assert.deepEqual(calls.find((c) => c.method === 'goto')?.args, ['https://example.org/pricing']);
  assert.match(ok.text, /Navigated to https:\/\/example\.org\/pricing/);
  assert.ok(ok.screenshotBase64);
});

test('an unknown tool names the ones that exist', async () => {
  const { driver } = fakeDriver(pageScript);
  const r = await tools(driver).run('act', { action: 'click buy' });
  assert.ok(r.error);
  assert.match(r.text, /act is not an available tool/);
  assert.match(r.text, /read_page/);
});

test('a stuck page times out as a tool error instead of hanging the loop', async () => {
  const { driver } = fakeDriver(() => new Promise(() => {}));
  const r = await tools(driver, 20).run('read_page', {});
  assert.ok(r.error);
  assert.match(r.text, /read_page did not finish/);
});

test('targetOf prefers a ref and needs both coordinates', () => {
  assert.deepEqual(targetOf({ ref: ' ref_1 ', x: 1, y: 2 }), { type: 'ref', ref: 'ref_1' });
  assert.deepEqual(targetOf({ x: 1, y: 2 }), { type: 'coordinate', x: 1, y: 2 });
  assert.equal(targetOf({ x: 1 }), null);
  assert.equal(targetOf({ ref: '' }), null);
});
