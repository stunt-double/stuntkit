// Client-side executor for Anthropic's browser use toolset
// (`browser_toolset_20260801`, GA on Vertex): Claude emits `tool_use` blocks
// with `toolset_name: 'browser'` naming one of the toolset's members, and this
// runs each against the `BrowserDriver` and builds the `tool_result` the API
// expects back. Spec: https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool
//
// Contract points the API enforces or relies on, all handled here:
// - every result echoes `toolset_name: 'browser'`;
// - a turn's calls run sequentially, and after the first failure every later
//   call is answered with exactly `HALT_TEXT` rather than run;
// - tab-management results are exactly one `browser_state` block; other
//   results may carry at most one, never on an error;
// - navigation refuses anything but http(s), and the caller's network policy.
//
// No runtime imports beyond the driver's types, so it runs under `node --test`.

import type Anthropic from '@anthropic-ai/sdk';
import type { BrowserDriver, DriverPage } from './driver.ts';
import { toPlaywrightKeySequence } from './keys.ts';
import {
  buildPageCall,
  type FormResult,
  type PageOp,
  type ReadResult,
  type ResolveResult,
} from './page-script.ts';

type ToolResult = Anthropic.Messages.ToolResultBlockParam;
type ToolUse = Pick<Anthropic.Messages.ToolUseBlock, 'id' | 'name' | 'input' | 'toolset_name'>;
type ResultContent = Exclude<ToolResult['content'], string | undefined>;
type BrowserState = Anthropic.Messages.BrowserStateBlockParam;

/** The tool entry for `tools`. Optional members (scripting, uploads, console,
 *  network) stay disabled: actors browse like people, not like developers. */
export const BROWSER_TOOLSET: Anthropic.Messages.BrowserToolset20260801 = {
  type: 'browser_toolset_20260801',
};

export const BROWSER_TOOLSET_NAME = 'browser';

/** Exact text the API expects for calls skipped after an earlier failure. */
export const HALT_TEXT = 'Not executed: an earlier action in this turn failed.';

const DISABLED_MEMBERS = new Set([
  'javascript_exec',
  'file_upload',
  'read_console',
  'read_network',
]);
const TAB_MEMBERS = new Set(['new_tab', 'list_tabs', 'switch_tab', 'close_tab']);
const MAX_WAIT_SECONDS = 30;
const SCROLL_NOTCH_PX = 100;
const FIELD_LIMIT = 4_096;

type Target = { type: 'ref'; ref: string } | { type: 'coordinate'; x: number; y: number };

export class ToolsetError extends Error {}

export type BrowserToolsetOptions = {
  /**
   * The caller's network policy: return an error message to refuse `url`, or
   * null to allow it. Scheme checks happen before this is called.
   */
  checkNavigation?: (url: string) => string | null;
  /**
   * Allow loopback, private and link-local hosts. Off by default: a browser
   * running inside our own infrastructure (a Trigger.dev task) can otherwise be
   * steered at the container's own services or the cloud metadata endpoint by
   * anything on a page that talks the model into navigating there. Internal-
   * network runs on a customer's worker turn it on, since reaching their
   * private hosts is the point, and their network policy still applies.
   */
  allowPrivateHosts?: boolean;
  navigationTimeoutMs?: number;
  screenshotTimeoutMs?: number;
};

/** One executed call, for the caller's transcript and evidence. */
export type ToolsetCallRecord = {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  text: string;
  screenshotBase64?: string;
  isError: boolean;
};

export type ToolsetTurnResult = {
  /** In call order, one per browser `tool_use`, ready for the next user turn. */
  results: ToolResult[];
  records: ToolsetCallRecord[];
};

/**
 * Whether a URL's host is loopback, private or link-local, by name or literal
 * address. Names that resolve to a private address (DNS rebinding) are not
 * caught here; the in-browser domain policy is the layer for those.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    return true;
  if (host === 'metadata.google.internal') return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (host.includes(':')) {
    return (
      host === '::1' ||
      host === '::' ||
      /^f[cd]/.test(host) ||
      /^fe[89ab]/.test(host) ||
      host.startsWith('::ffff:')
    );
  }
  return false;
}

/**
 * The input as it may be recorded: typed text and form values can be a
 * password or a code, so the transcript and events get their length, never the
 * value. The model still receives the real input; only records are redacted.
 */
export function redactInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  if (name === 'type' && typeof input.text === 'string') {
    return { ...input, text: `[${input.text.length} characters]` };
  }
  if (name === 'form_input' && 'value' in input) {
    const v = input.value;
    return { ...input, value: typeof v === 'boolean' ? v : `[${String(v).length} characters]` };
  }
  return input;
}

/** Strip what the toolset forbids in `browser_state` fields and cap the length. */
export function sanitiseStateField(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').slice(0, FIELD_LIMIT);
}

export function isBrowserToolsetCall(block: {
  type: string;
  toolset_name?: string | null;
}): boolean {
  return block.type === 'tool_use' && block.toolset_name === BROWSER_TOOLSET_NAME;
}

function parseTarget(raw: unknown, allow: 'any' | 'ref' | 'coordinate'): Target {
  const t = (raw ?? {}) as Record<string, unknown>;
  if (t.type === 'ref' && typeof t.ref === 'string' && allow !== 'coordinate') {
    return { type: 'ref', ref: t.ref };
  }
  if (
    t.type === 'coordinate' &&
    typeof t.x === 'number' &&
    typeof t.y === 'number' &&
    allow !== 'ref'
  ) {
    return { type: 'coordinate', x: Math.round(t.x), y: Math.round(t.y) };
  }
  const want =
    allow === 'ref'
      ? 'a ref target'
      : allow === 'coordinate'
        ? 'a coordinate target'
        : 'a ref or coordinate target';
  throw new ToolsetError(`Error: expected ${want}.`);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

export class BrowserToolsetExecutor {
  /** Tab ids by the driver's stable page id (page objects are not stable). */
  private readonly tabIds = new Map<string, string>();
  private tabSeq = 0;

  // Plain fields rather than parameter properties: `node --test` runs this
  // file with type stripping only, which rejects parameter properties.
  private readonly driver: BrowserDriver;
  private readonly options: BrowserToolsetOptions;

  constructor(driver: BrowserDriver, options: BrowserToolsetOptions = {}) {
    this.driver = driver;
    this.options = options;
  }

  /** Run every browser call in a turn, in order, halting after the first failure. */
  /** Turns run one at a time: two batches interleaving on one page would be nonsense. */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Run every browser call in a turn, in order, halting after the first
   * failure. An aborted `signal` halts the rest the same way, so a caller that
   * gave up on a stuck turn does not have its remaining calls land on the
   * connection it rebuilt.
   */
  runTurn(
    calls: readonly ToolUse[],
    opts: { signal?: AbortSignal } = {}
  ): Promise<ToolsetTurnResult> {
    const run = this.queue.then(() => this.runTurnNow(calls, opts.signal));
    this.queue = run.catch(() => {});
    return run;
  }

  private async runTurnNow(
    calls: readonly ToolUse[],
    signal?: AbortSignal
  ): Promise<ToolsetTurnResult> {
    const results: ToolResult[] = [];
    const records: ToolsetCallRecord[] = [];
    let failed = false;
    for (const call of calls) {
      const input = redactInput(call.name, (call.input ?? {}) as Record<string, unknown>);
      if (failed || signal?.aborted) {
        results.push(this.errorResult(call.id, HALT_TEXT));
        records.push({
          toolUseId: call.id,
          name: call.name,
          input,
          text: HALT_TEXT,
          isError: true,
        });
        continue;
      }
      try {
        const content = await this.execute(
          call.name,
          (call.input ?? {}) as Record<string, unknown>
        );
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          toolset_name: BROWSER_TOOLSET_NAME,
          content,
        });
        const text = content
          .map((b) =>
            b.type === 'text' ? b.text : b.type === 'browser_state' ? describeState(b) : ''
          )
          .filter(Boolean)
          .join('\n');
        const image = content.find((b) => b.type === 'image');
        records.push({
          toolUseId: call.id,
          name: call.name,
          input,
          text,
          screenshotBase64:
            image && image.type === 'image' && image.source.type === 'base64'
              ? image.source.data
              : undefined,
          isError: false,
        });
      } catch (err) {
        failed = true;
        const message =
          err instanceof ToolsetError
            ? err.message
            : `Error: ${err instanceof Error ? err.message : String(err)}`;
        results.push(this.errorResult(call.id, message));
        records.push({ toolUseId: call.id, name: call.name, input, text: message, isError: true });
      }
    }
    return { results, records };
  }

  private errorResult(toolUseId: string, text: string): ToolResult {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      toolset_name: BROWSER_TOOLSET_NAME,
      is_error: true,
      content: text,
    };
  }

  /** Execute one member. Throws `ToolsetError` (or anything) to fail the call. */
  async execute(name: string, input: Record<string, unknown>): Promise<ResultContent> {
    if (DISABLED_MEMBERS.has(name)) {
      throw new ToolsetError(`Error: ${name} is not enabled in this environment.`);
    }
    if (TAB_MEMBERS.has(name)) return [await this.tabMember(name, input)];

    const page = await this.pageFor(input.tab_id);
    switch (name) {
      case 'navigate':
        return this.navigate(page, input);
      case 'screenshot':
        return [await this.screenshot(page)];
      case 'zoom':
        return [await this.zoom(page, input)];
      case 'left_click':
      case 'right_click':
      case 'middle_click':
      case 'double_click':
      case 'triple_click':
        return [text(await this.click(page, name, input))];
      case 'hover': {
        const { x, y } = await this.point(page, parseTarget(input.target, 'any'));
        await page.hover(x, y);
        return [text(`Hovered at (${x}, ${y})`)];
      }
      case 'mouse_move': {
        const { x, y } = await this.point(page, parseTarget(input.target, 'coordinate'));
        await page.hover(x, y);
        return [text(`Moved the mouse to (${x}, ${y})`)];
      }
      case 'left_click_drag': {
        const from = await this.point(page, parseTarget(input.from, 'coordinate'));
        const to = await this.point(page, parseTarget(input.target, 'coordinate'));
        await page.dragAndDrop(from.x, from.y, to.x, to.y);
        return [text(`Dragged from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`)];
      }
      case 'left_mouse_down':
      case 'left_mouse_up':
      case 'hold_key':
        throw new ToolsetError(
          `Error: ${name} is not supported by this browser. Use left_click, left_click_drag or key instead.`
        );
      case 'scroll':
        return [text(await this.scroll(page, input))];
      case 'scroll_to': {
        const target = parseTarget(input.target, 'ref') as Extract<Target, { type: 'ref' }>;
        const r = await this.pageCall<ResolveResult>(page, {
          op: 'resolve',
          ref: target.ref,
          scroll: true,
        });
        if (!r.ok) throw new ToolsetError(`Error: ${r.error}`);
        return [text(`Scrolled ${target.ref} into view`)];
      }
      case 'type': {
        const value = String(input.text ?? '');
        await page.type(value);
        return [text(`Typed ${value.length} character${value.length === 1 ? '' : 's'}`)];
      }
      case 'key': {
        const keys = toPlaywrightKeySequence(String(input.text ?? ''));
        if (keys.length === 0) throw new ToolsetError('Error: key needs text.');
        const repeat = Math.round(clampNumber(input.repeat, 1, 100, 1));
        for (let i = 0; i < repeat; i++) for (const k of keys) await page.keyPress(k);
        return [text(`Pressed ${keys.join(' ')}${repeat > 1 ? ` x${repeat}` : ''}`)];
      }
      case 'wait': {
        const seconds = clampNumber(input.duration, 0, MAX_WAIT_SECONDS, 1);
        await page.waitForTimeout(seconds * 1000);
        return [text(`Waited ${seconds}s`)];
      }
      case 'read_page': {
        const filter =
          input.filter === 'interactive' || input.filter === 'all' ? input.filter : 'visible';
        const depth = Math.round(clampNumber(input.depth, 1, 100, 15));
        const ref = typeof input.ref === 'string' ? input.ref : undefined;
        const r = await this.pageCall<ReadResult>(page, { op: 'read', filter, depth, ref });
        if (!r.ok) throw new ToolsetError(`Error: ${r.error}`);
        return [text(r.text)];
      }
      case 'find': {
        const r = await this.pageCall<ReadResult>(page, {
          op: 'find',
          query: String(input.query ?? ''),
        });
        if (!r.ok) throw new ToolsetError(`Error: ${r.error}`);
        return [text(r.text)];
      }
      case 'get_page_text': {
        const r = await this.pageCall<ReadResult>(page, { op: 'text' });
        if (!r.ok) throw new ToolsetError(`Error: ${r.error}`);
        return [text(r.text)];
      }
      case 'form_input': {
        const target = parseTarget(input.target, 'ref') as Extract<Target, { type: 'ref' }>;
        const value = input.value;
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          throw new ToolsetError('Error: form_input needs a string, number or boolean value.');
        }
        const r = await this.pageCall<FormResult>(page, { op: 'form', ref: target.ref, value });
        if (!r.ok) throw new ToolsetError(`Error: ${r.error}`);
        return [text(r.description)];
      }
      default:
        throw new ToolsetError(
          `Error: ${name} is not a browser toolset member this executor knows.`
        );
    }
  }

  // --- members -------------------------------------------------------------

  private async navigate(page: DriverPage, input: Record<string, unknown>): Promise<ResultContent> {
    const raw = String(input.url ?? '').trim();
    // History moves, which Claude reaches for as `navigate("back")`.
    if (raw === 'back' || raw === 'forward') {
      await (raw === 'back' ? page.goBack() : page.goForward());
      return [text(`Went ${raw} to ${await page.url()}`), await this.browserState()];
    }
    let url: URL;
    try {
      // A scheme is `scheme://` or one of the schemes that take no slashes;
      // `example.com:8080` is a host and port, not a scheme called example.com.
      const hasScheme =
        /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ||
        /^(javascript|data|file|about|blob|mailto|vbscript|chrome|view-source):/i.test(raw);
      url = new URL(hasScheme ? raw : `https://${raw}`);
    } catch {
      throw new ToolsetError(`Error: "${raw.slice(0, 200)}" is not a valid URL.`);
    }
    // A bare word ("Pricing") is not a site; without this it becomes
    // https://pricing/ and fails somewhere far less clear.
    if (
      /^https?:$/.test(url.protocol) &&
      !url.hostname.includes('.') &&
      url.hostname !== 'localhost'
    ) {
      throw new ToolsetError(
        `Error: "${raw.slice(0, 200)}" is not a URL. Pass a full address, or click the link with left_click.`
      );
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ToolsetError('Error: Navigation refused. Only http and https URLs are allowed.');
    }
    if (!this.options.allowPrivateHosts && isPrivateHost(url.hostname)) {
      throw new ToolsetError(
        'Error: Navigation refused. Local and private network addresses are not reachable from this browser.'
      );
    }
    const refusal = this.options.checkNavigation?.(url.href);
    if (refusal) throw new ToolsetError(`Error: Navigation refused. ${refusal}`);
    await page.goto(url.href, {
      waitUntil: 'domcontentloaded',
      ...(this.options.navigationTimeoutMs ? { timeoutMs: this.options.navigationTimeoutMs } : {}),
    });
    return [text(`Navigated to ${await page.url()}`), await this.browserState()];
  }

  private async screenshot(page: DriverPage): Promise<Anthropic.Messages.ImageBlockParam> {
    const bytes = await page.screenshot({
      type: 'png',
      ...(this.options.screenshotTimeoutMs ? { timeout: this.options.screenshotTimeoutMs } : {}),
    });
    return image(bytes.toString('base64'));
  }

  private async zoom(
    page: DriverPage,
    input: Record<string, unknown>
  ): Promise<Anthropic.Messages.ImageBlockParam> {
    const region = input.region;
    if (
      !Array.isArray(region) ||
      region.length !== 4 ||
      !region.every((n) => typeof n === 'number')
    ) {
      throw new ToolsetError('Error: zoom needs region [x0, y0, x1, y1].');
    }
    const [x0, y0, x1, y1] = region as number[];
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    if (width < 1 || height < 1) throw new ToolsetError('Error: zoom region is empty.');
    // Captured at the page's own resolution: without an image library in the
    // task there is no upscale, so a small region reads as small as it is.
    const bytes = await page.screenshot({
      type: 'png',
      clip: { x: Math.min(x0, x1), y: Math.min(y0, y1), width, height },
      ...(this.options.screenshotTimeoutMs ? { timeout: this.options.screenshotTimeoutMs } : {}),
    });
    return image(bytes.toString('base64'));
  }

  private async click(
    page: DriverPage,
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    if (Array.isArray(input.modifiers) ? input.modifiers.length > 0 : input.modifiers) {
      throw new ToolsetError(
        'Error: modifier clicks are not supported by this browser. Click without modifiers, or use key.'
      );
    }
    const target = parseTarget(input.target, 'any');
    const { x, y } = await this.point(page, target);
    const button = name === 'right_click' ? 'right' : name === 'middle_click' ? 'middle' : 'left';
    const clickCount = name === 'double_click' ? 2 : name === 'triple_click' ? 3 : 1;
    await page.click(x, y, { button, clickCount });
    const where = target.type === 'ref' ? `${target.ref} at (${x}, ${y})` : `(${x}, ${y})`;
    return `${name.replace('_', ' ')} on ${where}`;
  }

  private async scroll(page: DriverPage, input: Record<string, unknown>): Promise<string> {
    const direction = input.scroll_direction;
    if (
      direction !== 'up' &&
      direction !== 'down' &&
      direction !== 'left' &&
      direction !== 'right'
    ) {
      throw new ToolsetError('Error: scroll_direction must be up, down, left or right.');
    }
    const amount = Math.round(clampNumber(input.scroll_amount, 1, 10, 3));
    const { x, y } = await this.point(page, parseTarget(input.target, 'any'));
    const delta = amount * SCROLL_NOTCH_PX;
    const dx = direction === 'left' ? -delta : direction === 'right' ? delta : 0;
    const dy = direction === 'up' ? -delta : direction === 'down' ? delta : 0;
    await page.scroll(x, y, dx, dy);
    return `Scrolled ${direction} ${amount} at (${x}, ${y})`;
  }

  private async tabMember(name: string, input: Record<string, unknown>): Promise<BrowserState> {
    const ctx = this.driver.context;
    if (name === 'list_tabs') return this.browserState();
    if (name === 'new_tab') {
      // Number the tabs already open first, so ids follow the order tabs were
      // opened in rather than the order Claude happened to mention them.
      for (const existing of await ctx.pages()) this.tabId(existing);
      const page = await ctx.newPage();
      return this.browserState([{ type: 'tab_opened', tab_id: this.tabId(page) }]);
    }
    const page = await this.pageFor(input.tab_id, true);
    if (name === 'switch_tab') {
      await ctx.setActivePage(page);
      return this.browserState();
    }
    // close_tab: keep a tab active afterwards if there is one to fall back to.
    const wasActive = (await ctx.activePage())?.id === page.id;
    await page.close();
    if (wasActive) {
      const remaining = await ctx.pages();
      if (remaining.length > 0) await ctx.setActivePage(remaining[remaining.length - 1]);
    }
    return this.browserState();
  }

  // --- helpers -------------------------------------------------------------

  private tabId(page: DriverPage): string {
    let id = this.tabIds.get(page.id);
    if (!id) {
      this.tabSeq += 1;
      id = `tab-${this.tabSeq}`;
      this.tabIds.set(page.id, id);
    }
    return id;
  }

  private async pageFor(tabId: unknown, required = false): Promise<DriverPage> {
    const ctx = this.driver.context;
    if (typeof tabId === 'string' && tabId.length > 0) {
      for (const page of await ctx.pages()) if (this.tabId(page) === tabId) return page;
      throw new ToolsetError(
        `Error: no tab with tab_id ${tabId}. Call list_tabs for the current tabs.`
      );
    }
    if (required) throw new ToolsetError('Error: tab_id is required.');
    const page = await ctx.activePage();
    if (!page) throw new ToolsetError('Error: the browser has no open tab. Call new_tab first.');
    return page;
  }

  private async point(page: DriverPage, target: Target): Promise<{ x: number; y: number }> {
    if (target.type === 'coordinate') return { x: target.x, y: target.y };
    let r = await this.pageCall<ResolveResult>(page, {
      op: 'resolve',
      ref: target.ref,
      scroll: true,
    });
    if (r.ok && !r.inViewport) {
      // A page with its own scroll handling (sticky headers, scroll-snap) can
      // still be settling; look once more before giving up.
      await page.waitForTimeout(250);
      r = await this.pageCall<ResolveResult>(page, {
        op: 'resolve',
        ref: target.ref,
        scroll: false,
      });
    }
    if (!r.ok) throw new ToolsetError(`Error: ${r.error}`);
    if (!r.inViewport) {
      throw new ToolsetError(
        `Error: ${target.ref} could not be scrolled into view. Try coordinates from a screenshot.`
      );
    }
    return { x: r.x, y: r.y };
  }

  private pageCall<R>(page: DriverPage, op: PageOp): Promise<R> {
    return page.evaluate<R>(buildPageCall(op));
  }

  private async browserState(stateChanges?: BrowserState['state_changes']): Promise<BrowserState> {
    const ctx = this.driver.context;
    const [pages, active] = await Promise.all([ctx.pages(), ctx.activePage()]);
    const tabs = await Promise.all(
      pages.slice(0, 100).map(async (page) => ({
        tab_id: this.tabId(page),
        title: sanitiseStateField(await page.title().catch(() => '')),
        url: sanitiseStateField(await Promise.resolve(page.url()).catch(() => '')),
        ...(active && page.id === active.id ? { active: true } : {}),
      }))
    );
    if (tabs.length > 0 && !tabs.some((t) => t.active)) tabs[tabs.length - 1].active = true;
    return {
      type: 'browser_state',
      tabs,
      ...(stateChanges && stateChanges.length > 0 ? { state_changes: stateChanges } : {}),
    };
  }
}

function text(value: string): Anthropic.Messages.TextBlockParam {
  return { type: 'text', text: value };
}

function image(data: string): Anthropic.Messages.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data } };
}

function describeState(state: BrowserState): string {
  const active = state.tabs.find((t) => t.active);
  return active ? `Tab ${active.tab_id}: ${active.url}` : `${state.tabs.length} tabs`;
}
