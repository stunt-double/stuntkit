// A `BrowserDriver` over Playwright, adapted from the browser toolset's example
// (`packages/browser-toolset/examples/src/playwright-driver.ts`), as its header
// invites. The changes: playwright-core instead of playwright, and a persistent
// context on a profile directory, so a run gets the person's own Chrome with a
// fresh profile (or the actor's kept one), never their everyday profile.

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
} from '@stunt-double/browser-toolset/driver';
import { hostMatchesDomain } from '@stunt-double/browser-toolset/safety';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

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
  async addInitScript(source: string): Promise<void> {
    await this.context.addInitScript(source);
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

export type LaunchOptions = {
  profileDir: string;
  headless: boolean;
  viewport: { width: number; height: number };
  touch: boolean;
  locale?: string;
};

export class PlaywrightDriver implements BrowserDriver {
  readonly context: PlaywrightContext;
  private readonly browserContext: BrowserContext;

  private constructor(context: BrowserContext) {
    this.browserContext = context;
    this.context = new PlaywrightContext(context);
  }

  /**
   * The installed Google Chrome, or Playwright's own Chromium when Chrome is
   * missing and `npx playwright install chromium` has been run.
   */
  static async launch(options: LaunchOptions): Promise<PlaywrightDriver> {
    const settings = {
      headless: options.headless,
      viewport: options.viewport,
      hasTouch: options.touch,
      ...(options.locale ? { locale: options.locale } : {}),
    };
    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(options.profileDir, {
        ...settings,
        channel: 'chrome',
      });
    } catch (chromeError) {
      try {
        context = await chromium.launchPersistentContext(options.profileDir, settings);
      } catch {
        throw new Error(
          `Could not start Chrome (${(chromeError as Error).message.split('\n')[0]}). Install Google Chrome, or run \`npx playwright install chromium\`.`
        );
      }
    }
    const driver = new PlaywrightDriver(context);
    if (context.pages().length === 0) await driver.context.newPage();
    return driver;
  }

  /** Instruction-style actions need a model of their own. Nothing here calls them. */
  async act(): Promise<DriverActResult> {
    throw new Error('act is not supported by this driver: use the browser toolset instead');
  }
  async extract(): Promise<unknown> {
    throw new Error('extract is not supported by this driver: use the browser toolset instead');
  }
  close() {
    return this.browserContext.close();
  }
}
