/**
 * The browser toolset's wire contract is enforced by the API, not by types:
 * a result without `toolset_name`, a halt message worded differently, or a
 * tab-management result carrying text is a 400 on the next turn, well after
 * the call that caused it. These pin the parts that fail that way.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BrowserDriver, DriverPage } from './driver.ts';
import {
  BrowserToolsetExecutor,
  HALT_TEXT,
  isBrowserToolsetCall,
  isPrivateHost,
  redactInput,
  sanitiseStateField,
} from './executor.ts';
import { toPlaywrightChord, toPlaywrightKeySequence } from './keys.ts';

type Call = { method: string; args: unknown[] };
let pageSeq = 0;

function fakePage(
  url: string,
  calls: Call[],
  evaluate: (expr: string) => unknown = () => ({ ok: true, x: 10, y: 20, inViewport: true })
): DriverPage {
  let current = url;
  const page = {
    id: `page-${++pageSeq}`,
    goBack: async () => void calls.push({ method: 'back', args: [] }),
    goForward: async () => void calls.push({ method: 'forward', args: [] }),
    goto: async (u: string) => {
      calls.push({ method: 'goto', args: [u] });
      current = u;
    },
    screenshot: async () => Buffer.from('png-bytes'),
    evaluate: async (expr: string) => evaluate(expr),
    url: async () => current,
    title: async () => `Title\nof ${current}`,
    click: async (...args: unknown[]) => void calls.push({ method: 'click', args }),
    hover: async (...args: unknown[]) => void calls.push({ method: 'hover', args }),
    scroll: async (...args: unknown[]) => void calls.push({ method: 'scroll', args }),
    dragAndDrop: async (...args: unknown[]) => void calls.push({ method: 'drag', args }),
    type: async (...args: unknown[]) => void calls.push({ method: 'type', args }),
    keyPress: async (...args: unknown[]) => void calls.push({ method: 'key', args }),
    waitForTimeout: async () => {},
    close: async () => void calls.push({ method: 'close', args: [] }),
  };
  return page as unknown as DriverPage;
}

function fakeDriver(evaluate?: (expr: string) => unknown) {
  const calls: Call[] = [];
  const pages: DriverPage[] = [fakePage('https://example.com/', calls, evaluate)];
  let active = pages[0];
  const driver = {
    context: {
      activePage: async () => active,
      pages: async () => pages,
      setDomainPolicy: async () => {},
      newPage: async () => {
        const p = fakePage('about:blank', calls, evaluate);
        pages.push(p);
        active = p;
        return p;
      },
      setActivePage: async (p: DriverPage) => {
        active = p;
      },
    },
    act: async () => ({ success: true }),
    extract: async () => ({}),
    close: async () => {},
  } as unknown as BrowserDriver;
  return { driver, calls, pages };
}

const use = (id: string, name: string, input: Record<string, unknown> = {}) => ({
  id,
  name,
  input,
  toolset_name: 'browser',
});

test('every result echoes toolset_name browser', async () => {
  const { driver } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  const { results } = await ex.runTurn([use('a', 'screenshot'), use('b', 'wait', { duration: 0 })]);
  assert.equal(results.length, 2);
  for (const r of results) assert.equal(r.toolset_name, 'browser');
  assert.equal(results[0].tool_use_id, 'a');
});

test('a failure halts the rest of the turn with the exact halt text', async () => {
  const { driver, calls } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  const { results } = await ex.runTurn([
    use('a', 'navigate', { url: 'file:///etc/passwd' }),
    use('b', 'left_click', { target: { type: 'coordinate', x: 1, y: 2 } }),
  ]);
  assert.equal(results[0].is_error, true);
  assert.equal(
    results[0].content,
    'Error: Navigation refused. Only http and https URLs are allowed.'
  );
  assert.equal(results[1].is_error, true);
  assert.equal(results[1].content, HALT_TEXT);
  assert.equal(calls.filter((c) => c.method === 'click').length, 0, 'halted calls must not run');
});

test('navigate honours the caller network policy and returns a browser_state', async () => {
  const { driver } = fakeDriver();
  const blocked = new BrowserToolsetExecutor(driver, {
    checkNavigation: (url) =>
      url.includes('internal') ? 'That host is outside this run’s network policy.' : null,
  });
  const refused = await blocked.runTurn([
    use('a', 'navigate', { url: 'https://internal.example' }),
  ]);
  assert.match(String(refused.results[0].content), /Navigation refused\. That host/);

  const ok = await blocked.runTurn([use('b', 'navigate', { url: 'example.org/pricing' })]);
  const content = ok.results[0].content as Array<{
    type: string;
    tabs?: Array<Record<string, unknown>>;
  }>;
  assert.equal(content[0].type, 'text');
  assert.equal(content[1].type, 'browser_state');
  assert.equal(content[1].tabs?.[0].url, 'https://example.org/pricing');
  assert.equal(content[1].tabs?.[0].active, true);
});

test('navigate handles back and forward, and refuses a bare word', async () => {
  const { driver, calls } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  const back = await ex.runTurn([use('a', 'navigate', { url: 'back' })]);
  assert.equal(back.results[0].is_error, undefined);
  assert.equal(calls.filter((c) => c.method === 'back').length, 1);
  const word = await ex.runTurn([use('b', 'navigate', { url: 'Pricing' })]);
  assert.equal(word.results[0].is_error, true);
  assert.match(String(word.results[0].content), /is not a URL/);
});

test('tab ids follow the driver page id, not object identity', async () => {
  const { driver } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  await ex.runTurn([use('a', 'new_tab')]);
  // A fresh object for the same tab, as some drivers return on every read.
  const pages = await driver.context.pages();
  (driver.context as unknown as { pages: () => Promise<DriverPage[]> }).pages = async () =>
    pages.map((p) => ({ ...p }) as DriverPage);
  const { results } = await ex.runTurn([use('b', 'switch_tab', { tab_id: 'tab-1' })]);
  assert.equal(results[0].is_error, undefined);
});

test('browser_state fields carry no control characters or newlines', async () => {
  assert.equal(sanitiseStateField('Title\nof\u2028page'), 'Title of page');
  assert.equal(sanitiseStateField('x'.repeat(5000)).length, 4096);
});

test('tab members return exactly one browser_state block, new_tab with tab_opened', async () => {
  const { driver } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  const { results } = await ex.runTurn([use('a', 'new_tab'), use('b', 'list_tabs')]);
  const opened = results[0].content as unknown as Array<Record<string, unknown>>;
  assert.equal(opened.length, 1);
  assert.equal(opened[0].type, 'browser_state');
  assert.deepEqual(opened[0].state_changes, [{ type: 'tab_opened', tab_id: 'tab-2' }]);
  const listed = results[1].content as Array<{ tabs: Array<{ active?: boolean }> }>;
  assert.equal(listed[0].tabs.length, 2);
  assert.equal(listed[0].tabs.filter((t) => t.active).length, 1);
  assert.equal(listed[0].tabs[1].active, true);
});

test('a ref target clicks the resolved element centre with the right button and count', async () => {
  const { driver, calls } = fakeDriver(() => ({ ok: true, x: 42, y: 7, inViewport: true }));
  const ex = new BrowserToolsetExecutor(driver);
  await ex.runTurn([use('a', 'double_click', { target: { type: 'ref', ref: 'ref_3' } })]);
  assert.deepEqual(calls.find((c) => c.method === 'click')?.args, [
    42,
    7,
    { button: 'left', clickCount: 2 },
  ]);
});

test('a stale ref fails the call with a re-read hint', async () => {
  const { driver } = fakeDriver(() => ({
    ok: false,
    error:
      'ref_9 is stale or not found on the current page. Re-read the page to get fresh references.',
  }));
  const ex = new BrowserToolsetExecutor(driver);
  const { results } = await ex.runTurn([
    use('a', 'left_click', { target: { type: 'ref', ref: 'ref_9' } }),
  ]);
  assert.equal(results[0].is_error, true);
  assert.match(String(results[0].content), /^Error: ref_9 is stale/);
});

test('disabled and unsupported members fail rather than silently succeed', async () => {
  const { driver } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  const js = await ex.runTurn([use('a', 'javascript_exec', { text: '1' })]);
  assert.equal(js.results[0].content, 'Error: javascript_exec is not enabled in this environment.');
  const mod = await ex.runTurn([
    use('b', 'left_click', { target: { type: 'coordinate', x: 1, y: 1 }, modifiers: ['shift'] }),
  ]);
  assert.equal(mod.results[0].is_error, true);
});

test('scroll turns notches into wheel deltas at the target', async () => {
  const { driver, calls } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  await ex.runTurn([
    use('a', 'scroll', {
      target: { type: 'coordinate', x: 640, y: 360 },
      scroll_direction: 'down',
      scroll_amount: 5,
    }),
  ]);
  assert.deepEqual(calls.find((c) => c.method === 'scroll')?.args, [640, 360, 0, 500]);
});

test('screenshots are recorded for the caller as base64 PNG', async () => {
  const { driver } = fakeDriver();
  const ex = new BrowserToolsetExecutor(driver);
  const { records } = await ex.runTurn([use('a', 'screenshot')]);
  assert.equal(records[0].screenshotBase64, Buffer.from('png-bytes').toString('base64'));
});

test('only browser toolset tool_use blocks are routed to the executor', () => {
  assert.equal(isBrowserToolsetCall({ type: 'tool_use', toolset_name: 'browser' }), true);
  assert.equal(isBrowserToolsetCall({ type: 'tool_use', toolset_name: null }), false);
  assert.equal(isBrowserToolsetCall({ type: 'text' }), false);
});

test('keys map from the toolset spelling to Playwright', () => {
  assert.equal(toPlaywrightChord('ctrl+a'), 'Control+A');
  assert.equal(toPlaywrightChord('cmd+shift+t'), 'Meta+Shift+T');
  assert.equal(toPlaywrightChord('Return'), 'Enter');
  assert.equal(toPlaywrightChord('Page_Down'), 'PageDown');
  assert.equal(toPlaywrightChord('f5'), 'F5');
  assert.equal(toPlaywrightChord('a'), 'a');
  assert.deepEqual(toPlaywrightKeySequence('Backspace Backspace'), ['Backspace', 'Backspace']);
  assert.deepEqual(toPlaywrightKeySequence(' '), [' ']);
});

test('private, loopback and metadata hosts are refused unless the run allows them', async () => {
  for (const h of [
    'localhost',
    '127.0.0.1',
    '10.0.0.5',
    '172.20.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'metadata.google.internal',
    'api.localhost',
  ]) {
    assert.equal(isPrivateHost(h), true, h);
  }
  for (const h of ['example.com', '8.8.8.8', '172.32.0.1', 'example.net']) {
    assert.equal(isPrivateHost(h), false, h);
  }
  const { driver } = fakeDriver();
  const refused = await new BrowserToolsetExecutor(driver).runTurn([
    use('a', 'navigate', { url: 'http://169.254.169.254/computeMetadata/v1/' }),
  ]);
  assert.match(String(refused.results[0].content), /private network/);
  const allowed = await new BrowserToolsetExecutor(driver, { allowPrivateHosts: true }).runTurn([
    use('b', 'navigate', { url: 'http://10.0.0.5/' }),
  ]);
  assert.equal(allowed.results[0].is_error, undefined);
});

test('a host and port is not mistaken for a scheme', async () => {
  const { driver, calls } = fakeDriver();
  const { results } = await new BrowserToolsetExecutor(driver).runTurn([
    use('a', 'navigate', { url: 'example.com:8080/pricing' }),
  ]);
  assert.equal(results[0].is_error, undefined);
  assert.equal(calls.find((c) => c.method === 'goto')?.args[0], 'https://example.com:8080/pricing');
});

test('typed text and form values are redacted in records, not in what runs', async () => {
  const { driver, calls } = fakeDriver();
  const { records } = await new BrowserToolsetExecutor(driver).runTurn([
    use('a', 'type', { text: 'hunter2' }),
  ]);
  assert.equal(records[0].input.text, '[7 characters]');
  assert.deepEqual(calls.find((c) => c.method === 'type')?.args, ['hunter2']);
  assert.deepEqual(
    redactInput('form_input', { value: 'secret', target: {} }).value,
    '[6 characters]'
  );
});

test('an aborted turn halts the calls it has not reached', async () => {
  const { driver, calls } = fakeDriver();
  const abort = new AbortController();
  abort.abort();
  const { results } = await new BrowserToolsetExecutor(driver).runTurn(
    [use('a', 'left_click', { target: { type: 'coordinate', x: 1, y: 1 } })],
    { signal: abort.signal }
  );
  assert.equal(results[0].content, HALT_TEXT);
  assert.equal(calls.filter((c) => c.method === 'click').length, 0);
});
