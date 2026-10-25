# Injecting WAO into an agent's browser

You do not need to own a site. Inject the script build into every page the agent opens, so the agent reads the repaired tree.

## Loading the script

```ts
import type {} from '@stunt-double/wao'; // Types window.wao and window.waoOptions.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WaoOptions } from '@stunt-double/wao';

const WAO = readFileSync(fileURLToPath(import.meta.resolve('@stunt-double/wao/script')), 'utf8');

export function waoInit(options: WaoOptions = {}): string {
  // Options travel as JSON: rules are fine, but `root`, `signal` and `onReport` cannot be serialised.
  return `window.waoOptions = ${JSON.stringify(options)};\n${WAO}`;
}
```

On CommonJS or older Node, use `require.resolve('@stunt-double/wao/script')`.

## Playwright

```ts
const context = await browser.newContext();
await context.addInitScript({ content: waoInit({ rules }) }); // before any navigation
const page = await context.newPage();
await page.goto(url);
```

- One init script, options first. Separate init scripts have no defined order.
- `page.setContent` reuses the `about:blank` document WAO already ran on. In tests, serve the fixture with `page.route` plus `goto`.

## Puppeteer

```ts
await page.evaluateOnNewDocument(waoInit({ rules }));
```

Register it on each new page (listen for `targetcreated` to cover popups).

## Raw CDP

```ts
await cdp.send('Page.enable');
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: waoInit({ rules }) });
```

## Stagehand and hosted browsers

They expose a Playwright context (`stagehand.context`, or `browser.contexts()[0]` after `connectOverCDP`). Call `addInitScript` on it before the first `goto`. Pages that were already open when you injected need a reload.

## With `@stunt-double/browser-toolset`

Inject on the Playwright context inside your driver's `launch`, before `newPage`. `read_page` and `find` then read the repaired tree with no other change. Repaired elements carry `data-wao`, which shows in the tree only as the role and name it produced.

## Reading the report

A report is plain data (each entry's `element` is non-enumerable and stays in the page), so return it directly:

```ts
const report = await page.evaluate(() => window.wao!.report());
```

To see a page exactly as its users do (a test run, a scorecard), audit instead of repairing: inject with `auto: false` and call `window.waoAudit()` when the page settles. It returns the same report and leaves the page unchanged. Switch to `window.wao = ...optimise` only as an assist when the agent is stuck, and record that it had help.

Change kinds: `rule`, `role`, `focus`, `name`, `landmark`, `dialog`. Issue kinds: `unnamed-control`, `image-without-alt`, `no-main`. Give issues to the agent as context ("these controls have no name") or to a person as a to-do list.

After a client-side change the observer cannot see (a class toggled to `cursor: pointer`), call `window.wao.refresh()`, which returns the new report.

## CI check

Fail a pull request when pages gain issues an agent would hit:

```ts
import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript({ content: waoInit() });
let failed = false;
for (const url of PAGES) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const { issues } = await page.evaluate(() => window.wao!.report());
  if (issues.length) {
    failed = true;
    console.error(url, issues);
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
```

Report `changes` too if the goal is markup that needs no repair: every change is a place the source could be fixed.

## Before and after

```ts
const repaired = await page.locator('body').ariaSnapshot();
await page.evaluate(() => window.wao!.restore());
const original = await page.locator('body').ariaSnapshot();
```

Two contexts (one with WAO, one without) give the clearest diff for a write-up.
