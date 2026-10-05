---
name: stunt-double-browser-toolset
description: Use when building an AI agent that drives a real browser with @stunt-double/browser-toolset, on Anthropic's browser use toolset (BrowserToolsetExecutor) or on any model's function calling (DirectBrowserTools), including implementing BrowserDriver over Playwright, Stagehand, a hosted browser or CDP, turning on the payment, sign-up and secret guards, and pruning screenshots from long agent transcripts.
---

# Browser toolset (`@stunt-double/browser-toolset`)

Browser tools for agents over a provider-neutral `BrowserDriver`. No tool calls a model; the agent's own model does the reasoning. No runtime dependencies. `@anthropic-ai/sdk` and `ai` are optional peers used for types only.

Install: `pnpm add @stunt-double/browser-toolset`. Until the scope is on npm it is on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

## Choose the surface

| Model and SDK                                  | Use                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Anthropic's browser use toolset, Anthropic SDK | `BROWSER_TOOLSET` in `tools`, `BrowserToolsetExecutor.runTurn(calls)` |
| Any model with function calling, or the AI SDK | `DIRECT_TOOL_SPECS` as tools, `DirectBrowserTools.run(name, input)`   |

Without the Anthropic SDK installed, import from subpaths (`/direct-tools`, `/safety`, `/driver`) so its types are never needed.

## Anthropic loop, the parts people get wrong

```ts
const executor = new BrowserToolsetExecutor(driver, { safety: INDEX_SESSION_SAFETY });
// each turn:
const calls = response.content.filter((b) => isBrowserToolsetCall(b));
if (calls.length === 0) break;
const { results } = await executor.runTurn(calls); // all calls in one turn, in order
messages.push({ role: 'user', content: results });
```

- Pass the whole turn to `runTurn`, not one call at a time: after the first failure it answers every later call with `HALT_TEXT`, which the API expects.
- Push the assistant message (with its `tool_use` blocks) before the results.

## Direct tools

```ts
const tools = new DirectBrowserTools(driver, { viewport: { width: 1280, height: 800 } });
const result = await tools.run(call.name, call.input); // never throws
// result.text for the model; result.screenshotBase64 (PNG) after anything that can change the page
```

Send the screenshot back as an image part, not as text. `done` is a signal for your loop to stop; give it no `execute` in the AI SDK so calling it ends the run. `STEP_BUDGET_FINAL_NOTE` gets a final answer out of an agent that ran out of steps.

## Safety: on for any site you do not own

```ts
import { INDEX_SESSION_SAFETY } from '@stunt-double/browser-toolset';
```

Turns on `refuseSensitiveInput` (passwords, card fields, payment iframes, any Luhn-valid number) and `blockSubmit` (pay, purchase, subscribe, sign up, create account). A refusal is an ordinary result telling the model what was refused, so the turn continues. Everything is off by default, which is right for testing your own product with test data.

Pair the guards with a network block on payment providers (`paymentBlocklistFor(targetHost)`) and with accounts holding no real payment details. They read the DOM, so they are a strong default, not a sandbox.

`navigate` refuses non-http(s) URLs and private, loopback and metadata hosts. Set `allowPrivateHosts: true` only when a local or intranet target is the point; add policy with `checkNavigation(url)`.

## Implementing `BrowserDriver`

Start from `packages/browser-toolset/examples/src/playwright-driver.ts` in the stuntkit repository and copy it. The tools use `driver.context` (`activePage`, `pages`, `newPage`, `setActivePage`) and, on each page, `id`, `goto`, `goBack`, `goForward`, `url`, `title`, `screenshot`, `evaluate` (string expressions), `click`, `hover`, `scroll`, `dragAndDrop`, `type`, `keyPress`, `waitForTimeout`, `waitForLoadState` and `close`. The rest of the interface may throw. Keys arrive in Playwright spelling. `DriverPage.id` must stay stable for a tab's life even if your engine returns fresh page objects.

## Long transcripts

Screenshots dominate tokens. Keep the newest few:

- Anthropic SDK: `messages: pruneAnthropicImages(messages, 3)` when sending.
- AI SDK: `prepareStep: ({ messages }) => ({ messages: pruneAiSdkImages(messages, 3) })`.

Both are pure, so store the full history and send the pruned copy.

## Legacy pages

If `read_page` shows unnamed links, clickable `div`s missing from the tree or unlabelled fields, inject `@stunt-double/wao` into the context first (see the `stunt-double-wao` skill). It repairs the same tree these tools read.
