// The browser surface the toolset drives, kept provider-neutral so the same
// tools run over Playwright, Stagehand, a hosted browser or anything else that
// can implement it (see the Playwright driver in `examples/`).
//
// It began as the intersection of Stagehand 3 and 4, which is why the accessors
// Stagehand 4 made asynchronous (`context.activePage()`, `context.pages()`,
// `page.url()`) are declared `MaybePromise` and every caller awaits them, and
// why `act` results keep Stagehand 3's flat shape. The toolset itself only
// uses `context` and the raw input methods on `DriverPage`; `act` and
// `extract` are there for callers that also drive the page with a model.

type MaybePromise<T> = T | Promise<T>;

export type DriverLoadState = 'load' | 'domcontentloaded' | 'networkidle';

export type DriverNavigateOptions = {
  waitUntil?: DriverLoadState;
  /** Navigation timeout in milliseconds. */
  timeoutMs?: number;
};

export type DriverScreenshotOptions = {
  type?: 'png' | 'jpeg';
  fullPage?: boolean;
  quality?: number;
  timeout?: number;
  /** Capture only this viewport rectangle, in CSS pixels. */
  clip?: { x: number; y: number; width: number; height: number };
};

export type DriverClickOptions = {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
};

export type DriverWaitForSelectorOptions = {
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  timeout?: number;
};

export interface DriverLocator {
  isVisible(): Promise<boolean>;
}

export interface DriverPage {
  /**
   * Stable for the life of the tab. Page objects are not: Stagehand 4 hands
   * back a fresh one from every `pages()` / `activePage()`, so identity
   * comparison between two reads says nothing.
   */
  readonly id: string;
  goto(url: string, options?: DriverNavigateOptions): Promise<unknown>;
  goBack(): Promise<unknown>;
  goForward(): Promise<unknown>;
  /** A Node `Buffer` (convert from `Uint8Array` if your engine returns one). */
  screenshot(options?: DriverScreenshotOptions): Promise<Buffer>;
  evaluate<R = unknown, Arg = unknown>(
    expression: string | ((arg: Arg) => R | Promise<R>),
    arg?: Arg
  ): Promise<R>;
  /** May be synchronous or asynchronous: callers always `await` it. */
  url(): MaybePromise<string>;
  title(): Promise<string>;
  setViewportSize(width: number, height: number): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  waitForSelector(selector: string, options?: DriverWaitForSelectorOptions): Promise<unknown>;
  waitForLoadState(state: DriverLoadState, timeoutMs?: number): Promise<void>;
  locator(selector: string): DriverLocator;

  // Raw input at viewport coordinates, for callers that drive the page
  // themselves (the browser toolset executor) rather than through `act`.
  click(x: number, y: number, options?: DriverClickOptions): Promise<void>;
  hover(x: number, y: number): Promise<void>;
  /** Wheel scroll at (x, y) by the given deltas, in CSS pixels. */
  scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void>;
  dragAndDrop(fromX: number, fromY: number, toX: number, toY: number): Promise<void>;
  /** Type into whatever has focus. */
  type(text: string): Promise<void>;
  /** One key or chord in Playwright's spelling (`Enter`, `Control+A`). */
  keyPress(key: string): Promise<void>;
  close(): Promise<void>;
}

/** A navigation allow / block list, as host suffixes. */
export type DriverDomainPolicy = {
  allowedDomains?: string[];
  blockedDomains?: string[];
};

export interface DriverContext {
  /** May be synchronous or asynchronous: callers always `await` it. */
  activePage(): MaybePromise<DriverPage | undefined>;
  /** May be synchronous or asynchronous: callers always `await` it. */
  pages(): MaybePromise<DriverPage[]>;
  setDomainPolicy(policy: DriverDomainPolicy): Promise<void>;
  /** Open a tab (optionally at `url`); it becomes the active page. */
  newPage(url?: string): Promise<DriverPage>;
  setActivePage(page: DriverPage): Promise<void>;
  /** Delete every cookie in the browser, for every site. */
  clearCookies(): Promise<void>;
}

/**
 * A concrete browser action: what an `act` resolved an instruction to, and
 * what a caller can hand back to `act` to repeat it without a model call.
 */
export type DriverAction = {
  selector: string;
  description: string;
  method?: string;
  arguments?: string[];
};

/** What an `act` resolved to, in a flat shape. */
export type DriverActResult = {
  success: boolean;
  message?: string;
  actionDescription?: string;
  actions?: DriverAction[];
};

export type DriverActOptions = { timeout?: number };

export type DriverExtractOptions = {
  timeout?: number;
  /** Put a viewport screenshot in front of the extraction model. */
  screenshot?: boolean;
};

export interface BrowserDriver {
  readonly context: DriverContext;
  act(instruction: string | DriverAction, options?: DriverActOptions): Promise<DriverActResult>;
  /** Schema-less extraction, conventionally `{ extraction: string }`. */
  extract(instruction: string, options?: DriverExtractOptions): Promise<unknown>;
  close(): Promise<void>;
}

/** The page a driver is on, or a clear error rather than a `!` that throws later. */
export async function activePageOf(driver: BrowserDriver): Promise<DriverPage> {
  const page = await driver.context.activePage();
  if (!page) throw new Error('The browser has no active page');
  return page;
}
