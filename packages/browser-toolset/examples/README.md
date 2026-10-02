# Examples

Two complete agent loops over Playwright. Both use `PlaywrightDriver` in [`src/playwright-driver.ts`](./src/playwright-driver.ts), a `BrowserDriver` you can copy into your own project, and both run with every safety guard on (`INDEX_SESSION_SAFETY`).

| File                                               | Loop                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`src/anthropic-loop.ts`](./src/anthropic-loop.ts) | Claude on Anthropic's browser use toolset, through `BrowserToolsetExecutor` and the Anthropic SDK |
| [`src/ai-sdk-loop.ts`](./src/ai-sdk-loop.ts)       | The provider-neutral direct tools on the Vercel AI SDK; swap the provider to try another model    |

From the repository root:

```sh
pnpm install
pnpm --filter @stdbl/browser-toolset-examples exec playwright install chromium
export ANTHROPIC_API_KEY=...
pnpm --filter @stdbl/browser-toolset-examples anthropic "What is the heading on https://example.com?"
pnpm --filter @stdbl/browser-toolset-examples ai-sdk "What is the heading on https://example.com?"
```

The scripts run the TypeScript directly (Node 22.18 or later strips the types) against the package source, through the `@stdbl/source` export condition, so there is no build step. CI type-checks the examples but does not run them.
