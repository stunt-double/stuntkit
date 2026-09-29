// The index harness's browser tools, run directly against the page with no
// model call inside any of them.
//
// The shared `act` / `extract` tools each hand the instruction to Stagehand,
// which asks a second model (Sonnet on Vertex) to resolve it, so every step
// the arm under test took paid for a hidden Claude call as well: on a Gemini
// session in prod, `extract` alone took 178s of a 6.4 minute run. These tools
// read the page as an accessibility tree with `ref_N` handles and act on those
// refs (or on screenshot coordinates), through the same executor the
// `claude-native` arm and actor runs use (`lib/browser-toolset/`). The arm's
// own model does all of the reasoning, which is what the index measures.
//
// They are provider-neutral function tools rather than Anthropic's toolset
// type, because Gemini and ChatGPT have no equivalent: every published arm is
// offered exactly these, so the arms stay comparable with each other.
//
// No runtime imports beyond the executor, so it runs under `node --test`.

import type { BrowserDriver, DriverPage } from './driver.ts';
import { BrowserToolsetExecutor, ToolsetError } from './executor.ts';
import type { BrowserSafetyOptions } from './safety.ts';

export type DirectToolName =
  | 'navigate'
  | 'read_page'
  | 'find'
  | 'get_page_text'
  | 'click'
  | 'type'
  | 'form_input'
  | 'key'
  | 'scroll'
  | 'screenshot'
  | 'done';

export type DirectToolResult = {
  text: string;
  screenshotBase64?: string;
  error?: string;
};

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

export type DirectToolSpec = {
  name: DirectToolName;
  description: string;
  parameters: JsonSchema;
};

/**
 * Page reads are re-sent on every later turn, and Gemini's loop has no explicit
 * cache, so a full 50k-character tree would be paid for again on each step.
 * 20k is enough for most pages' interactive tree; the note tells the model how
 * to narrow a read when it is not.
 */
export const MAX_READ_CHARS = 20_000;

/** One tool call, end to end. Past this the page is treated as stuck. */
export const TOOL_TIMEOUT_MS = 45_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SCREENSHOT_TIMEOUT_MS = 10_000;
/** Settling after an input: long enough for a click's navigation to begin. */
const SETTLE_MS = 400;
const SETTLE_LOAD_TIMEOUT_MS = 5_000;

const TARGET_PROPERTIES = {
  ref: {
    type: 'string',
    description: 'An element ref from read_page or find, e.g. "ref_12". Preferred.',
  },
  x: {
    type: 'number',
    description: 'Viewport x coordinate in screenshot pixels, when there is no ref.',
  },
  y: {
    type: 'number',
    description: 'Viewport y coordinate in screenshot pixels, when there is no ref.',
  },
};

/**
 * The tools every published arm is offered, in a provider-neutral shape; each
 * harness adapts them into its SDK's format. Flat parameters rather than a
 * nested target object, because every provider's function calling handles
 * those reliably.
 */
export const DIRECT_TOOL_SPECS: DirectToolSpec[] = [
  {
    name: 'navigate',
    description:
      'Go to a URL, or "back" / "forward" in history. Returns the page it landed on and a screenshot.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'A full URL, "back" or "forward".' } },
      required: ['url'],
    },
  },
  {
    name: 'read_page',
    description:
      'Read the page as an accessibility tree. Each element worth acting on carries a ref (ref_N) to pass to click, type, form_input or scroll. The filter "visible" (default) covers what is on screen, "interactive" only controls, "all" the whole page. Pass a ref to read just that part of the page.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['visible', 'interactive', 'all'] },
        ref: { type: 'string', description: 'Read only this element and its descendants.' },
      },
    },
  },
  {
    name: 'find',
    description:
      'Find elements matching a description or text (e.g. "search box", "Add to cart"). Returns up to 20 matches with refs.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look for.' } },
      required: ['query'],
    },
  },
  {
    name: 'get_page_text',
    description: "The page's visible text as plain text, for reading content such as a policy.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'click',
    description:
      'Click an element by ref, or at a coordinate from a screenshot. Returns the resulting page and a screenshot.',
    parameters: { type: 'object', properties: TARGET_PROPERTIES },
  },
  {
    name: 'type',
    description:
      'Type text. With a ref (or coordinate), clicks that field first; without one, types into whatever has focus. Does not press Enter: use key for that.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type.' },
        ...TARGET_PROPERTIES,
      },
      required: ['text'],
    },
  },
  {
    name: 'form_input',
    description:
      'Set a form control directly by ref: choose a select option (by its label or value), tick or untick a checkbox or radio ("true" / "false"), or fill an input.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'The control ref from read_page or find.' },
        // A string on every provider: a union type is not something Gemini's
        // function declarations take reliably, and the page script reads
        // "true" / "false" as a checked state.
        value: { type: 'string', description: 'The option, "true" / "false", or the text.' },
      },
      required: ['ref', 'value'],
    },
  },
  {
    name: 'key',
    description:
      'Press a key or chord, e.g. "Enter", "Escape", "Tab", "ctrl+a". Space-separate several to press them in turn.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The key or keys.' } },
      required: ['text'],
    },
  },
  {
    name: 'scroll',
    description:
      'Scroll the page (or the element at a ref or coordinate) up, down, left or right. amount is in wheel notches of about 100px, default 5.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'number', description: 'Notches, 1 to 10.' },
        ...TARGET_PROPERTIES,
      },
      required: ['direction'],
    },
  },
  {
    name: 'screenshot',
    description: 'Look at the current page.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'done',
    description:
      'Signal that the task is complete. Provide a concise summary of what was accomplished.',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Summary.' } },
      required: ['message'],
    },
  },
];

export const DIRECT_TOOL_NAMES: readonly DirectToolName[] = DIRECT_TOOL_SPECS.map((s) => s.name);

export function clampRead(text: string): string {
  if (text.length <= MAX_READ_CHARS) return text;
  return `${text.slice(0, MAX_READ_CHARS)}\n[truncated at ${MAX_READ_CHARS} characters: read_page with a ref or the "interactive" filter, or find, reads less]`;
}

/**
 * The executor's target shape from our flat parameters. A ref wins over a
 * coordinate; neither is an error the model can correct.
 */
export function targetOf(
  input: Record<string, unknown>
): { type: 'ref'; ref: string } | { type: 'coordinate'; x: number; y: number } | null {
  if (typeof input.ref === 'string' && input.ref.trim()) {
    return { type: 'ref', ref: input.ref.trim() };
  }
  const x = Number(input.x);
  const y = Number(input.y);
  if (input.x !== undefined && input.y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
    return { type: 'coordinate', x, y };
  }
  return null;
}

function blocksToText(blocks: readonly unknown[]): string {
  return blocks
    .map((b) => {
      const block = b as { type?: string; text?: string };
      return block.type === 'text' && typeof block.text === 'string' ? block.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ToolsetError(`Error: ${what} did not finish within ${ms / 1000}s.`)),
      ms
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export type DirectBrowserToolsOptions = {
  viewport: { width: number; height: number };
  /** Overridable for tests. */
  settleMs?: number;
  toolTimeoutMs?: number;
  /**
   * The executor's pay / sign-up / secrets guards. Every Index arm turns them
   * on, since the Index promises its sessions never pay or register for real.
   */
  safety?: BrowserSafetyOptions;
};

/**
 * Runs `DIRECT_TOOL_SPECS` calls against a driver. One per session: the
 * executor inside it holds the tab ids for the session's life.
 */
export class DirectBrowserTools {
  private readonly driver: BrowserDriver;
  private readonly executor: BrowserToolsetExecutor;
  private readonly viewport: { width: number; height: number };
  private readonly settleMs: number;
  private readonly toolTimeoutMs: number;

  constructor(driver: BrowserDriver, options: DirectBrowserToolsOptions) {
    this.driver = driver;
    this.executor = new BrowserToolsetExecutor(driver, {
      navigationTimeoutMs: NAVIGATION_TIMEOUT_MS,
      screenshotTimeoutMs: SCREENSHOT_TIMEOUT_MS,
      ...(options.safety ? { safety: options.safety } : {}),
    });
    this.viewport = options.viewport;
    this.settleMs = options.settleMs ?? SETTLE_MS;
    this.toolTimeoutMs = options.toolTimeoutMs ?? TOOL_TIMEOUT_MS;
  }

  /**
   * Run one call. Never throws: a failure comes back as `error` with text the
   * model can act on, so a harness loop can always build its tool result.
   */
  async run(name: string, input: Record<string, unknown>): Promise<DirectToolResult> {
    try {
      return await withTimeout(this.execute(name, input), this.toolTimeoutMs, name);
    } catch (err) {
      const text =
        err instanceof ToolsetError
          ? err.message
          : `Error: ${err instanceof Error ? err.message : String(err)}`;
      return { text, error: text };
    }
  }

  private async execute(name: string, input: Record<string, unknown>): Promise<DirectToolResult> {
    switch (name) {
      case 'navigate': {
        const out = await this.executor.execute('navigate', { url: input.url });
        return this.afterInput(blocksToText(out.filter((b) => b.type === 'text')));
      }
      case 'read_page': {
        const out = await this.executor.execute('read_page', {
          filter: input.filter,
          ...(typeof input.ref === 'string' && input.ref ? { ref: input.ref } : {}),
        });
        return { text: clampRead(blocksToText(out)) };
      }
      case 'find': {
        const out = await this.executor.execute('find', { query: input.query });
        return { text: clampRead(blocksToText(out)) };
      }
      case 'get_page_text': {
        const out = await this.executor.execute('get_page_text', {});
        return { text: clampRead(blocksToText(out)) };
      }
      case 'click': {
        const target = targetOf(input);
        if (!target) throw new ToolsetError('Error: click needs a ref, or both x and y.');
        const out = await this.executor.execute('left_click', { target });
        return this.afterInput(blocksToText(out));
      }
      case 'type': {
        const value = String(input.text ?? '');
        const target = targetOf(input);
        const said: string[] = [];
        if (target) {
          said.push(blocksToText(await this.executor.execute('left_click', { target })));
        }
        said.push(blocksToText(await this.executor.execute('type', { text: value })));
        return this.afterInput(said.join('\n'));
      }
      case 'form_input': {
        if (typeof input.ref !== 'string' || !input.ref) {
          throw new ToolsetError('Error: form_input needs a ref from read_page or find.');
        }
        const out = await this.executor.execute('form_input', {
          target: { type: 'ref', ref: input.ref },
          value:
            typeof input.value === 'boolean' || typeof input.value === 'number'
              ? input.value
              : String(input.value ?? ''),
        });
        return this.afterInput(blocksToText(out));
      }
      case 'key': {
        const out = await this.executor.execute('key', { text: input.text });
        return this.afterInput(blocksToText(out));
      }
      case 'scroll': {
        const target = targetOf(input) ?? {
          type: 'coordinate' as const,
          x: Math.round(this.viewport.width / 2),
          y: Math.round(this.viewport.height / 2),
        };
        const out = await this.executor.execute('scroll', {
          scroll_direction: input.direction,
          scroll_amount: input.amount ?? 5,
          target,
        });
        return this.afterInput(blocksToText(out));
      }
      case 'screenshot': {
        const page = await this.activePage();
        return {
          text: `Screenshot of ${await page.url()}`,
          screenshotBase64: await this.capture(page),
        };
      }
      case 'done':
        // A signal tool; every loop ends the session before it would get here.
        return { text: 'Done tool invoked' };
      default:
        throw new ToolsetError(
          `Error: ${name} is not an available tool. Use one of: ${DIRECT_TOOL_NAMES.join(', ')}.`
        );
    }
  }

  /**
   * After anything that can change the page: let it settle, then report where
   * the browser is with a screenshot, which is what `act` used to return. The
   * arm sees the effect of its action without spending a turn asking.
   */
  private async afterInput(said: string): Promise<DirectToolResult> {
    const page = await this.activePage();
    if (this.settleMs > 0) {
      await page.waitForTimeout(this.settleMs);
      await page.waitForLoadState('domcontentloaded', SETTLE_LOAD_TIMEOUT_MS).catch(() => {});
    }
    const [url, title] = await Promise.all([
      Promise.resolve(page.url()).catch(() => ''),
      page.title().catch(() => ''),
    ]);
    const where = title ? `Now on ${url} (${title.slice(0, 120)})` : `Now on ${url}`;
    return {
      text: said ? `${said}\n${where}` : where,
      screenshotBase64: await this.capture(page),
    };
  }

  private async capture(page: DriverPage): Promise<string> {
    const bytes = await page.screenshot({ type: 'png', timeout: SCREENSHOT_TIMEOUT_MS });
    return Buffer.from(bytes).toString('base64');
  }

  private async activePage(): Promise<DriverPage> {
    const page = await this.driver.context.activePage();
    if (!page) throw new ToolsetError('Error: the browser has no open page.');
    return page;
  }
}
