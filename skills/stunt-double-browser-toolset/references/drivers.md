# Implementing `BrowserDriver`

Types come from `@stunt-double/browser-toolset/driver`. The tools use only:

- `driver.context`: `activePage()`, `pages()`, `newPage(url?)`, `setActivePage(page)`. `activePage` and `pages` may be sync or async.
- On `DriverPage`: `id`, `goto`, `goBack`, `goForward`, `url`, `title`, `screenshot`, `evaluate` (always a **string** expression), `click(x, y, { button, clickCount })`, `hover`, `scroll(x, y, dx, dy)`, `dragAndDrop`, `type` (into the focused element), `keyPress` (one key or chord in Playwright spelling, `Control+A`, `PageDown`), `waitForTimeout`, `waitForLoadState` and `close`.

Everything else (`act`, `extract`, `locator`, `waitForSelector`, `setViewportSize`, `setDomainPolicy`, `clearCookies`) is for callers that also drive the page another way. A driver used only by these tools may throw from them, but implement `setDomainPolicy` if you want the payment network block.

## Invariants that bite

- `id` is stable for the life of a tab. Engines that hand back a fresh page object on every read (Stagehand 4) need a lasting key: a `WeakMap` from the engine's own page to an id, or the engine's target id.
- `screenshot` returns a Node `Buffer`. Convert a `Uint8Array` with `Buffer.from(bytes)`.
- `newPage` makes the new tab active. Popups and `target="_blank"` should become active too, as in a real browser.
- Coordinates are CSS pixels in the viewport. Screenshot at device scale factor 1, or the model's coordinates from the screenshot will not match.

## Playwright

The reference implementation is `packages/browser-toolset/examples/src/playwright-driver.ts` in the stuntkit repository: `PlaywrightDriver.launch(browser, viewport)` opens a fresh context with one tab. Copy it whole. Its `setDomainPolicy` routes `**/*` and aborts blocked hosts with `hostMatchesDomain` from `/safety`.

## Puppeteer

Mostly a rename of the Playwright driver:

| Playwright                         | Puppeteer                                                         |
| ---------------------------------- | ----------------------------------------------------------------- |
| `page.mouse.click(x, y, opts)`     | `page.mouse.click(x, y, { button, count: clickCount })`           |
| `page.mouse.wheel(dx, dy)`         | `page.mouse.wheel({ deltaX: dx, deltaY: dy })`                    |
| `page.keyboard.press('Control+A')` | Split on `+`: `down` each modifier, `press` the key, `up` in turn |
| `page.waitForLoadState(state)`     | `page.waitForNavigation({ waitUntil })` or `waitForNetworkIdle`   |
| `context.route`                    | `page.setRequestInterception(true)` and `request.abort()`         |
| `context.on('page')`               | `browser.on('targetcreated')`, then `target.page()`               |

`screenshot()` returns a `Uint8Array` in recent versions: wrap it in `Buffer.from`. Puppeteer key names match Playwright's for single keys.

## Raw CDP

- `goto`: `Page.navigate`, then wait for `Page.loadEventFired`.
- `evaluate`: `Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true })`.
- `click`, `hover`, `dragAndDrop`: `Input.dispatchMouseEvent` (`mouseMoved`, `mousePressed`, `mouseReleased` with `clickCount`).
- `scroll`: `Input.dispatchMouseEvent` with `type: 'mouseWheel'`, `deltaX`, `deltaY`.
- `type`: `Input.insertText`. `keyPress`: `Input.dispatchKeyEvent` `keyDown`/`keyUp` with `modifiers` set from the chord.
- `screenshot`: `Page.captureScreenshot` (base64) into `Buffer.from(data, 'base64')`, with `clip` when asked.
- `id`: the CDP `targetId`.

## Stagehand

The interface began as the intersection of Stagehand 3 and 4, so its context and pages fit almost directly. Wrap pages so `id` comes from a stable key, since Stagehand 4 returns fresh page objects. Stagehand's own `act` and `extract` can back the driver's `act`/`extract` for callers that want them; the toolset never calls them.

## Hosted browsers (Browserbase, Steel, Browserless and similar)

Connect with Playwright over CDP (`chromium.connectOverCDP(wsUrl)`), take the existing context (`browser.contexts()[0]`) instead of creating one, and wrap it with the same `PlaywrightContext` and `PlaywrightPage` classes. Close the remote session in `driver.close()`.

## Checking a driver

A smoke test before wiring a model:

```ts
const tools = new DirectBrowserTools(driver, { viewport });
console.log((await tools.run('navigate', { url: 'https://example.com' })).text);
console.log((await tools.run('read_page', { filter: 'interactive' })).text); // expect ref_N handles
const click = await tools.run('click', { ref: 'ref_1' });
console.log(click.text, Boolean(click.screenshotBase64));
```
