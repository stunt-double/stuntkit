# WAO examples

A with/without comparison for [`@stunt-double/wao`](..). It loads a legacy fixture shop (and two real public sites) in Chromium twice, once as it is and once with WAO injected through `context.addInitScript`, and records what an agent that reads the accessibility tree would see.

From the repository root:

```sh
pnpm install
pnpm --filter @stunt-double/wao-examples exec playwright install chromium
pnpm --filter @stunt-double/wao-examples compare
```

The command builds WAO first (`pnpm --filter @stunt-double/wao build`) and reads `dist/wao.global.js`, so every run reflects the current source.

## What it does

- **Fixture** ([`src/fixture`](./src/fixture)): a three-page shop with `div onclick` buttons, icon-font-only links and buttons, table-cell labels, a tooltip-only control, a custom `div` dropdown, a modal without `role="dialog"`, a cookie banner, a menu toggle without `aria-expanded` and no `<main>`.
- **Per page**: Playwright `ariaSnapshot()` (saved as YAML), interactive elements by role, named and unnamed controls, snapshot size in characters and approximate tokens (characters / 4), WAO's `report()`, and a full-page screenshot with a pixel diff to show the page looks the same.
- **Role-only agent**: completes the task (search, add to basket, enter an email, pick delivery, check out) using only `page.getByRole(role, { name })`. A step it cannot reach by role is run by CSS so the later steps can still be measured, and counts as a failure.
- **LLM loop** (optional): with `ANTHROPIC_API_KEY` set, a short Claude loop over the aria snapshot attempts the same task, with and without WAO. Without a key it is skipped.
- **Real sites**: page load and snapshot metrics only. Nothing is clicked or submitted.

Results land in [`results/`](./results): `summary.md`, `snapshots/*.yaml` and `screenshots/*.png`. Live sites change, so their numbers vary between runs, and their snapshots and screenshots are not committed (third-party content).
