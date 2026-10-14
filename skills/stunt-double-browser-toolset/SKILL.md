---
name: stunt-double-browser-toolset
description: Use when building an AI agent that drives a real browser with @stunt-double/browser-toolset, on Anthropic's browser use toolset (BrowserToolsetExecutor) or on any model's function calling (DirectBrowserTools, the Vercel AI SDK, OpenAI, Gemini), including writing the agent loop, implementing BrowserDriver over Playwright, Puppeteer, Stagehand, a hosted browser or CDP, turning on the payment, sign-up and secret guards, blocking payment providers at the network layer, pruning screenshots from long transcripts, and debugging an agent that halts, loops or cannot see a control.
---

# Browser toolset (`@stunt-double/browser-toolset`)

Browser tools for agents over a provider-neutral `BrowserDriver`. No tool calls a model: pages are read as an accessibility-style tree with `ref_N` handles and acted on by ref or screenshot coordinate, so the agent's own model does the reasoning. No runtime dependencies; `@anthropic-ai/sdk` and `ai` are optional peers used for types only.

```sh
pnpm add @stunt-double/browser-toolset
```

Releases are on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`. Node 20+, or any runtime with `Buffer` (Workers with `nodejs_compat`, Bun, Deno).

## The three decisions

1. **Surface.** Claude on the Anthropic SDK: `BROWSER_TOOLSET` plus `BrowserToolsetExecutor.runTurn(calls)`. Any other model or SDK (AI SDK, OpenAI, Gemini, open models): `DIRECT_TOOL_SPECS` plus `DirectBrowserTools.run(name, input)`, eleven flat-parameter function tools.
2. **Driver.** Copy `packages/browser-toolset/examples/src/playwright-driver.ts` from the stuntkit repository; the package depends on no browser library on purpose. Other engines: [references/drivers.md](references/drivers.md).
3. **Safety.** Any site you do not own: `safety: INDEX_SESSION_SAFETY` plus a network block from `paymentBlocklistFor(host)`. Your own product with test data: leave it off (the default). [references/safety.md](references/safety.md).

Without the Anthropic SDK installed, import from subpaths (`/direct-tools`, `/safety`, `/driver`, `/keys`); the root and `/executor` reference its types, and `/prune` references both SDKs' types.

## Anthropic loop: the shape that works

```ts
const executor = new BrowserToolsetExecutor(driver, { safety: INDEX_SESSION_SAFETY });
for (let turn = 0; turn < MAX_TURNS; turn++) {
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    tools: [BROWSER_TOOLSET],
    messages: pruneAnthropicImages(messages, 3), // send pruned, store full
  });
  messages.push({ role: 'assistant', content: response.content }); // before the results
  const calls = response.content.filter((b) => isBrowserToolsetCall(b));
  if (calls.length === 0) break;
  const { results, records } = await executor.runTurn(calls); // the whole turn, in order
  messages.push({ role: 'user', content: results });
}
```

- Pass **every** browser call of a turn to one `runTurn`. After the first failure it answers each later call with exactly `HALT_TEXT`, which the API expects; calling `execute` per call breaks that contract.
- `records` (name, redacted input, text, screenshot, `isError`) is your evidence log. Typed text is redacted there (`[7 characters]`), never in what runs.
- `runTurn(calls, { signal })` halts the rest of a turn when you abort a stuck one.

## Direct tools: the shape that works

```ts
const tools = new DirectBrowserTools(driver, {
  viewport: { width: 1280, height: 800 },
  safety: INDEX_SESSION_SAFETY,
});
const result = await tools.run(call.name, call.input); // never throws, 45 s ceiling
// result.text for the model; result.screenshotBase64 (PNG) after anything that can change the page
```

- Send the screenshot back as an **image part**, never as base64 text.
- `done` is your loop's stop signal: in the AI SDK give it no `execute`, so calling it ends `generateText`.
- When the step budget runs out, make one more call offering only `done` with `STEP_BUDGET_FINAL_NOTE`, so the run ends with an answer instead of "Max steps reached".
- One `DirectBrowserTools` per session: it holds the tab ids.

Full loops for the Anthropic SDK, the AI SDK, OpenAI-style function calling and a step-budget wrapper: [references/agent-loops.md](references/agent-loops.md). Every tool, parameter and result: [references/tools.md](references/tools.md).

## Long transcripts

Screenshots dominate tokens. `pruneAnthropicImages(messages, 3)` or, in the AI SDK, `prepareStep: ({ messages }) => ({ messages: pruneAiSdkImages(messages, 3) })`. Both are pure: store the full history, send the pruned copy. Older screenshots become `PRUNED_SCREENSHOT` text.

## Mistakes to avoid

- Guards off on a third-party site, or relying on a prompt line ("never pay") instead of `INDEX_SESSION_SAFETY`.
- Expecting `allowPrivateHosts` on `DirectBrowserTools`: only `BrowserToolsetExecutor` takes it, so direct tools always refuse `localhost` and private hosts. For a local dev server, use the executor or a public tunnel.
- A `DriverPage.id` that changes between reads (a fresh id per wrapper object). Tab tools then lose track; key the id on the engine's stable page object.
- Implementing `evaluate` for functions only: the tools always pass a **string** expression.
- Using `javascript_exec`, `file_upload`, `read_console` or `read_network`: they are disabled and say so. Raw mouse down/up and held keys are refused with an alternative.

When something goes wrong (halts, loops on refs, blank screenshots, refused navigation): [references/troubleshooting.md](references/troubleshooting.md).

## Legacy pages

If `read_page` shows unnamed links, clickable `div`s missing from the tree or unlabelled fields, inject `@stunt-double/wao` into the browser context before navigating (see the `stunt-double-wao` skill). It repairs the same tree these tools read.

## Agents in this plugin

- `browser-agent-builder` scaffolds a complete, type-checked agent (driver, loop, guards, pruning) in your project.
- `browser-agent-reviewer` audits an existing integration against everything above.
