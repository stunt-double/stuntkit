# @stunt-double/browser-toolset

Browser tools for AI agents, over a provider-neutral `BrowserDriver`.

- **An executor for Anthropic's browser use toolset** (`browser_toolset_20260801`). Claude emits `tool_use` blocks naming toolset members (`navigate`, `read_page`, `left_click`, `type`, ...); `BrowserToolsetExecutor` runs them against your browser and builds the `tool_result`s the API expects, including the parts of the wire contract that are enforced by the API rather than by types.
- **Provider-neutral function tools** (`DirectBrowserTools`). The same page reading and acting, as eleven plain function tools with flat parameters, so any model with function calling (Claude, Gemini, GPT, open models) can be offered exactly the same vocabulary.
- **Opt-in safety guards** that refuse paying, subscribing, creating accounts and typing passwords or card numbers, enforced in the tools rather than asked for in a prompt.
- **A screenshot pruner** for agent loops on the Anthropic SDK or the Vercel AI SDK.

No tool makes a model call of its own: pages are read as an accessibility-style tree with `ref_N` handles and acted on by ref or by screenshot coordinate, so the agent's own model does all of the reasoning. There are no runtime dependencies, and the package does not depend on any browser library: you bring the browser by implementing `BrowserDriver` (Playwright, Stagehand, a hosted browser, a CDP client, ...).

Extracted from [Stunt Double](https://stuntdouble.io), where it drives every agent's browser.

## Install

Releases are on [GitHub Packages](https://github.com/orgs/stunt-double/packages) until the `@stunt-double` scope is available on npm. Point the scope at it in your project's `.npmrc`, with a GitHub token that has `read:packages`:

```ini
@stunt-double:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install:

```sh
pnpm add @stunt-double/browser-toolset
# or: npm install @stunt-double/browser-toolset
```

`@anthropic-ai/sdk` and `ai` are optional peer dependencies, used for types only; nothing imports them at runtime. Their types are referenced by these declarations:

| Import                                                                    | Needs the types of           |
| ------------------------------------------------------------------------- | ---------------------------- |
| `@stunt-double/browser-toolset`, `@stunt-double/browser-toolset/executor` | `@anthropic-ai/sdk`          |
| `@stunt-double/browser-toolset/prune`                                     | `@anthropic-ai/sdk` and `ai` |
| `./direct-tools`, `./safety`, `./driver`, `./keys`, `./page-script`       | Neither                      |

So a project on the direct tools alone, with no Anthropic SDK, imports from the subpaths (or sets `skipLibCheck`).

Requires Node 20 or later, or any runtime with `Buffer` (Cloudflare Workers with `nodejs_compat`, Bun, Deno).

## Quick start

### Claude, on the browser use toolset

```ts
import Anthropic from '@anthropic-ai/sdk';
import {
  BROWSER_TOOLSET,
  BrowserToolsetExecutor,
  INDEX_SESSION_SAFETY,
  isBrowserToolsetCall,
} from '@stunt-double/browser-toolset';

const client = new Anthropic();
const executor = new BrowserToolsetExecutor(driver, { safety: INDEX_SESSION_SAFETY });
const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: task }];

for (;;) {
  const response = await client.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    tools: [BROWSER_TOOLSET],
    messages,
  });
  messages.push({ role: 'assistant', content: response.content });
  const calls = response.content.filter((b): b is Anthropic.Messages.ToolUseBlock =>
    isBrowserToolsetCall(b)
  );
  if (calls.length === 0) break;
  const { results } = await executor.runTurn(calls);
  messages.push({ role: 'user', content: results });
}
```

### Any model, on the direct tools

```ts
import { DIRECT_TOOL_SPECS, DirectBrowserTools } from '@stunt-double/browser-toolset';

const tools = new DirectBrowserTools(driver, { viewport: { width: 1280, height: 800 } });

// Offer DIRECT_TOOL_SPECS to your model in its SDK's tool format, then for each call:
const result = await tools.run(call.name, call.input);
// result.text for the model, result.screenshotBase64 (a PNG) after anything that can change the page.
```

`run` never throws: a failure comes back as `{ text, error }` with text the model can act on, and every call has a 45 second ceiling.

Complete, type-checked loops are in [`examples/`](./examples): Playwright with the Anthropic SDK, and Playwright with the Vercel AI SDK, each with a `BrowserDriver` implemented over Playwright you can copy.

## Safety: `BrowserSafetyOptions` and `INDEX_SESSION_SAFETY`

> If your agent browses sites that are not yours, turn the guards on.

A line in a prompt saying "never pay or sign up" is a request the model may ignore, and an agent under test ignoring it is exactly the failure you cannot afford on a real site. So the guards live in the tools: when one refuses, the action never reaches the page, and the model gets an ordinary result (not an error) telling it what was refused and to report what it saw instead. The rest of its turn still runs.

```ts
import { INDEX_SESSION_SAFETY } from '@stunt-double/browser-toolset';

new BrowserToolsetExecutor(driver, { safety: INDEX_SESSION_SAFETY });
new DirectBrowserTools(driver, { viewport, safety: INDEX_SESSION_SAFETY });
```

`INDEX_SESSION_SAFETY` turns every guard on. It is named for the [Stunt Double Index](https://index.stuntdouble.io), whose benchmark sessions on third-party sites promise they never pay or register for real, and every one of them runs with it.

| Option                 | Refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refuseSensitiveInput` | Typing or filling a password field, a payment card field (by `cc-*` autocomplete, or by name, id, label or placeholder: card number, CVC, expiry, cardholder) or a card field inside a payment provider's iframe (Stripe, PayPal, Adyen, Braintree, Klarna and others). Also any typed or filled value containing a Luhn-valid card number, whatever field it is headed for.                                                                                                           |
| `blockSubmit`          | A click, Enter or Space that would submit a form holding a password or card field; that would submit a form whose button reads as pay, purchase, place order, subscribe, buy now, sign up, create account, register, join or start a trial; or that presses a payment button ("Pay now", "Place order", "Confirm and pay") even outside a form. A link that only navigates (a "Sign up" link to the sign-up page) is always allowed, and so are billing toggles such as "Pay monthly". |

Everything is off by default. An agent testing your own product (filling a sign-up form with test data, completing a checkout in a sandbox) should keep doing so, and that is the default.

Building blocks, if you want your own policy:

- `paymentBlocklistFor(targetHost)`: payment provider hosts to block at the network layer (for example with `DriverContext.setDomainPolicy`), exempting the provider's own site when it is the one under test.
- `containsCardNumber`, `luhnValid`, `sensitiveFieldReason`, `submitReason`, `enterSubmitReason`, and the patterns they use (`CARD_FIELD_PATTERN`, `PAYMENT_ACTION_PATTERN`, `COMMIT_ACTION_PATTERN`, `FORMLESS_COMMIT_PATTERN`, `PAYMENT_PROVIDER_DOMAINS`).

The guards are a strong default, not a sandbox: they read the DOM the page shows, so a page built to disguise a payment form can get past them. Pair them with a network block on payment providers and with test accounts that hold no real payment details.

## Network safety

`navigate` refuses anything but `http` and `https`, and by default refuses loopback, private and link-local hosts (`localhost`, `10.0.0.0/8`, `169.254.169.254`, `*.internal`, ...), so a page cannot talk the model into probing the machine the browser runs on or a cloud metadata endpoint. Pass `allowPrivateHosts: true` when reaching private hosts is the point (an intranet, a local dev server). `checkNavigation(url)` adds your own policy: return a message to refuse, or `null` to allow.

## The tools

### Browser use toolset members (`BrowserToolsetExecutor`)

| Member                                                                               | Notes                                                                                                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `navigate`                                                                           | A URL, or `"back"` / `"forward"`. A bare word (`"Pricing"`) is refused as not a URL. Returns text plus a `browser_state`.  |
| `screenshot`, `zoom`                                                                 | PNG. `zoom` crops a region at the page's own resolution.                                                                   |
| `read_page`, `find`, `get_page_text`                                                 | The page as a tree with `ref_N` handles, a ranked search, or plain text, capped at 50,000 characters.                      |
| `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `hover` | By ref (scrolled into view, then clicked at its centre) or by coordinate.                                                  |
| `mouse_move`, `left_click_drag`, `scroll`, `scroll_to`                               | Coordinates, wheel scrolling in notches of 100px, or scrolling a ref into view.                                            |
| `type`, `key`, `form_input`                                                          | Typing into the focused element, keys in the toolset's xdotool spelling (`ctrl+a`, `Return`), or setting a control by ref. |
| `wait`                                                                               | Up to 30 seconds.                                                                                                          |
| `new_tab`, `list_tabs`, `switch_tab`, `close_tab`                                    | Each returns exactly one `browser_state` block.                                                                            |

`javascript_exec`, `file_upload`, `read_console` and `read_network` are disabled and say so. `left_mouse_down`, `left_mouse_up`, `hold_key` and clicks with modifiers are refused with a pointer to an alternative, since `BrowserDriver` has no raw mouse buttons or held keys.

The contract points the API relies on are handled and tested: every result echoes `toolset_name: 'browser'`; a turn's calls run in order, and after the first failure every later call is answered with exactly `HALT_TEXT`; `browser_state` fields are stripped of control characters and capped; tab ids stay stable across drivers that return a fresh page object on every read. Typed text and form values are redacted in the call records (`[7 characters]`), never in what runs.

### Direct tools (`DirectBrowserTools`)

| Tool            | Parameters                                                | Returns                                         |
| --------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `navigate`      | `url` (or `"back"` / `"forward"`)                         | Where it landed, and a screenshot               |
| `read_page`     | `filter` (`visible`, `interactive`, `all`), `ref`         | The tree with refs, capped at 20,000 characters |
| `find`          | `query`                                                   | Up to 20 matches with refs                      |
| `get_page_text` | none                                                      | The page's visible text                         |
| `click`         | `ref`, or `x` and `y`                                     | The resulting page, and a screenshot            |
| `type`          | `text`, optionally `ref` or `x` and `y` to focus first    | The resulting page, and a screenshot            |
| `form_input`    | `ref`, `value` (an option, `"true"` / `"false"`, or text) | The resulting page, and a screenshot            |
| `key`           | `text` (`"Enter"`, `"ctrl+a"`, space-separated)           | The resulting page, and a screenshot            |
| `scroll`        | `direction`, `amount`, optionally a target                | The resulting page, and a screenshot            |
| `screenshot`    | none                                                      | A screenshot                                    |
| `done`          | `message`                                                 | A signal for your loop to end                   |

Parameters are flat scalars on purpose: unions and nested objects are where providers' function calling disagrees. `STEP_BUDGET_FINAL_NOTE` is a message for an agent that has used its step budget, to get a final answer out of one last call offered only `done`.

## Implementing `BrowserDriver`

The toolset uses `driver.context` (`activePage`, `pages`, `newPage`, `setActivePage`) and these methods on `DriverPage`: `id`, `goto`, `goBack`, `goForward`, `url`, `title`, `screenshot`, `evaluate` (always with a string expression), `click`, `hover`, `scroll`, `dragAndDrop`, `type`, `keyPress`, `waitForTimeout`, `waitForLoadState` and `close`. Keys arrive in Playwright's spelling (`Control+A`, `PageDown`). `DriverPage.id` must be stable for the life of a tab, even if your engine hands back a new page object on every read.

The rest of the interface (`act`, `extract`, `locator`, `setDomainPolicy`, `clearCookies`, ...) is there for callers that also drive the page another way; a driver used only by these tools can throw from them. [`examples/src/playwright-driver.ts`](./examples/src/playwright-driver.ts) is a complete implementation.

Pages are read by a script evaluated in the page, which tags each element it reports with a `data-sd-ref` attribute. Refs last as long as the element stays in the DOM. Cross-origin iframes are not walked; the model falls back to coordinates from a screenshot there.

## API overview

Each subpath can be imported on its own; the root re-exports all of them except `./prune`.

| Import                                       | What                                                                                                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@stunt-double/browser-toolset/executor`     | `BrowserToolsetExecutor` (`runTurn`, `execute`), `BROWSER_TOOLSET`, `BROWSER_TOOLSET_NAME`, `HALT_TEXT`, `isBrowserToolsetCall`, `isPrivateHost`, `redactInput`, `sanitiseStateField`, `ToolsetError`, and the option and record types |
| `@stunt-double/browser-toolset/direct-tools` | `DirectBrowserTools`, `DIRECT_TOOL_SPECS`, `DIRECT_TOOL_NAMES`, `clampRead`, `targetOf`, `MAX_READ_CHARS`, `TOOL_TIMEOUT_MS`, `STEP_BUDGET_FINAL_NOTE`, `STEP_BUDGET_FALLBACK_OUTPUT`                                                  |
| `@stunt-double/browser-toolset/safety`       | `BrowserSafetyOptions`, `INDEX_SESSION_SAFETY`, `paymentBlocklistFor`, `containsCardNumber`, `luhnValid`, the reason functions and patterns, `refusalText`                                                                             |
| `@stunt-double/browser-toolset/driver`       | The `BrowserDriver`, `DriverContext` and `DriverPage` interfaces, and `activePageOf`                                                                                                                                                   |
| `@stunt-double/browser-toolset/prune`        | `pruneAnthropicImages`, `pruneAiSdkImages`, `isAiSdkImagePart`, `PRUNED_SCREENSHOT`: keep the newest screenshots in a transcript, replacing older ones with a placeholder                                                              |
| `@stunt-double/browser-toolset/keys`         | `toPlaywrightChord`, `toPlaywrightKeySequence`: the toolset's xdotool key names to Playwright's                                                                                                                                        |
| `@stunt-double/browser-toolset/page-script`  | `buildPageCall` and the result types of the in-page script, for drivers or tools of your own                                                                                                                                           |

The pruners are pure: they return a new array and never mutate the messages they are given, so you can prune what you send while keeping the full history you store.

## Licence

[Apache-2.0](./LICENSE), copyright 2026 Turnout Labs Ltd.
