// A `BrowserDriver` over Playwright, enough to run every tool in
// `@stdbl/browser-toolset`. Copy it into your project and adapt it: the
// package deliberately does not depend on any browser library.

import type {
  BrowserDriver,
  DriverActResult,
  DriverContext,
  DriverDomainPolicy,
  DriverLoadState,
  DriverLocator,
  DriverNavigateOptions,
  DriverPage,
  DriverScreenshotOptions,
  DriverWaitForSelectorOptions,
} from '@stdbl/browser-toolset/driver';
import { hostMatchesDomain } from '@stdbl/browser-toolset/safety';
import type { Browser, BrowserContext, Page } from 'playwright';

/** Playwright's `Page` objects are stable, so a WeakMap gives each tab a lasting id. */
const pageIds = new WeakMap<Page, string>();
let pageSeq = 0;

function idOf(page: Page): string {
  let id = pageIds.get(page);
  if (!id) {
    pageSeq += 1;
    id = `pw-${pageSeq}`;
    pageIds.set(page, id);
  }
  return id;
}

class PlaywrightPage implements DriverPage {
  readonly id: string;
  readonly raw: Page;

  constructor(page: Page) {
    this.raw = page;
    this.id = idOf(page);
  }

  goto(url: string, options: DriverNavigateOptions = {}) {
    return this.raw.goto(url, {
      ...(options.waitUntil ? { waitUntil: options.waitUntil } : {}),
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    });
  }
  goBack() {
    return this.raw.goBack();
  }
  goForward() {
    return this.raw.goForward();
  }
  screenshot(options: DriverScreenshotOptions = {}): Promise<Buffer> {
    return this.raw.screenshot(options);
  }
  evaluate<R = unknown, Arg = unknown>(
    expression: string | ((arg: Arg) => R | Promise<R>),
    arg?: Arg
  ): Promise<R> {
    // The toolset only ever passes a string expression (see `buildPageCall`).
    if (typeof expression === 'string') return this.raw.evaluate(expression) as Promise<R>;
    return this.raw.evaluate(expression as (arg: unknown) => R | Promise<R>, arg) as Promise<R>;
  }
  url() {
    return this.raw.url();
  }
  title() {
    return this.raw.title();
  }
  setViewportSize(width: number, height: number) {
    return this.raw.setViewportSize({ width, height });
  }
  waitForTimeout(ms: number) {
    return this.raw.waitForTimeout(ms);
  }
  waitForSelector(selector: string, options: DriverWaitForSelectorOptions = {}) {
    return this.raw.waitForSelector(selector, options);
  }
  waitForLoadState(state: DriverLoadState, timeoutMs?: number) {
    return this.raw.waitForLoadState(state, timeoutMs ? { timeout: timeoutMs } : undefined);
  }
  locator(selector: string): DriverLocator {
    return this.raw.locator(selector).first();
  }
  click(x: number, y: number, options: Parameters<DriverPage['click']>[2] = {}) {
    return this.raw.mouse.click(x, y, options);
  }
  hover(x: number, y: number) {
    return this.raw.mouse.move(x, y);
  }
  async scroll(x: number, y: number, deltaX: number, deltaY: number) {
    await this.raw.mouse.move(x, y);
    await this.raw.mouse.wheel(deltaX, deltaY);
  }
  async dragAndDrop(fromX: number, fromY: number, toX: number, toY: number) {
    await this.raw.mouse.move(fromX, fromY);
    await this.raw.mouse.down();
    await this.raw.mouse.move(toX, toY, { steps: 10 });
    await this.raw.mouse.up();
  }
  type(text: string) {
    return this.raw.keyboard.type(text);
  }
  keyPress(key: string) {
    return this.raw.keyboard.press(key);
  }
  close() {
    return this.raw.close();
  }
}

class PlaywrightContext implements DriverContext {
  private readonly context: BrowserContext;
  private active: Page | undefined;
  private policy: DriverDomainPolicy = {};
  private routed = false;

  constructor(context: BrowserContext) {
    this.context = context;
    // Popups and `target="_blank"` links become the active tab, as in a browser.
    context.on('page', (page) => {
      this.active = page;
    });
  }

  activePage(): DriverPage | undefined {
    const open = this.context.pages();
    if (!this.active || this.active.isClosed()) this.active = open[open.length - 1];
    return this.active ? new PlaywrightPage(this.active) : undefined;
  }
  pages(): DriverPage[] {
    return this.context.pages().map((p) => new PlaywrightPage(p));
  }
  async newPage(url?: string): Promise<DriverPage> {
    const page = await this.context.newPage();
    this.active = page;
    if (url) await page.goto(url);
    return new PlaywrightPage(page);
  }
  async setActivePage(page: DriverPage): Promise<void> {
    const raw = this.context.pages().find((p) => idOf(p) === page.id);
    if (!raw) throw new Error(`No open tab with id ${page.id}`);
    this.active = raw;
    await raw.bringToFront();
  }
  clearCookies() {
    return this.context.clearCookies();
  }
  /** Abort requests to blocked hosts, or to anything outside the allow list. */
  async setDomainPolicy(policy: DriverDomainPolicy): Promise<void> {
    this.policy = policy;
    if (this.routed) return;
    this.routed = true;
    await this.context.route('**/*', (route) => {
      let host = '';
      try {
        host = new URL(route.request().url()).hostname;
      } catch {
        return route.continue();
      }
      const { allowedDomains, blockedDomains } = this.policy;
      const blocked =
        (blockedDomains ?? []).some((d) => hostMatchesDomain(host, d)) ||
        (allowedDomains !== undefined &&
          allowedDomains.length > 0 &&
          !allowedDomains.some((d) => hostMatchesDomain(host, d)));
      return blocked ? route.abort('blockedbyclient') : route.continue();
    });
  }
}

export class PlaywrightDriver implements BrowserDriver {
  readonly context: PlaywrightContext;
  private readonly browser: Browser;

  private constructor(browser: Browser, context: BrowserContext) {
    this.browser = browser;
    this.context = new PlaywrightContext(context);
  }

  /** A fresh browser context with one blank tab. */
  static async launch(
    browser: Browser,
    viewport = { width: 1280, height: 800 }
  ): Promise<PlaywrightDriver> {
    const context = await browser.newContext({ viewport });
    const driver = new PlaywrightDriver(browser, context);
    await driver.context.newPage();
    return driver;
  }

  /**
   * Instruction-style actions need a model of their own, which is what the
   * toolset exists to avoid. Nothing in `@stdbl/browser-toolset` calls these.
   */
  async act(): Promise<DriverActResult> {
    throw new Error('act is not supported by this driver: use the browser toolset instead');
  }
  async extract(): Promise<unknown> {
    throw new Error('extract is not supported by this driver: use the browser toolset instead');
  }
  close() {
    return this.browser.close();
  }
}
