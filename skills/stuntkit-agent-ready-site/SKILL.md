---
name: stuntkit-agent-ready-site
description: Use when asked to make a website or web app work for AI agents (agent-ready, agent-friendly, "agents can't use our site", browser-use or computer-use agents failing on it), or to audit how an agent sees a site. A workflow over @stunt-double/wao and @stunt-double/browser-toolset - measure the accessibility tree an agent reads, repair it with WAO and rules, fix the source where you can, and prove the result with a real agent task.
---

# Making a site agent-ready

Agents read a page through its accessibility tree and screenshots. A control with no role or name is, to an agent, missing. This workflow finds those gaps, repairs them, and proves the repair with an agent. It uses `@stunt-double/wao` (see `stunt-double-wao`) and, for the proof, `@stunt-double/browser-toolset` (see `stunt-double-browser-toolset`).

Work on the user's own site, or one they are authorised to test. Turn on `INDEX_SESSION_SAFETY` for any agent run on a site with real payments or sign-ups.

## 1. Pick the pages

The pages an agent's tasks pass through: home, navigation, search, a listing, a detail page, the basket or form a task ends at. Five to ten pages beat a crawl. Write each task in a sentence ("find the price of the cheapest plan", "add a blue XL t-shirt to the basket").

## 2. Measure

With Playwright, for each page, in two contexts (one plain, one with WAO injected as in `stunt-double-wao` [references/harness.md](../stunt-double-wao/references/harness.md)):

```ts
const before = await plainPage.locator('body').ariaSnapshot();
const after = await waoPage.locator('body').ariaSnapshot();
const report = await waoPage.evaluate(() => {
  const { changes, issues } = window.wao!.report();
  return {
    changes: changes.map(({ kind, target, value, source }) => ({ kind, target, value, source })),
    issues: issues.map(({ kind, target }) => ({ kind, target })),
  };
});
```

Record per page: the number of `changes` by kind (`role`, `name`, `landmark`), and every `issue` (`unnamed-control`, `image-without-alt`, `no-main`). Each change is a gap WAO repaired; each issue is a gap it could not.

## 3. Repair, in this order

1. **Fix the source** where the team owns the markup: a `<button>` for a clickable `div`, an `aria-label` on an icon button, a `<label for>` for a field, a `<main>`. This helps people using assistive technology too, which WAO does not.
2. **Rules** for what cannot change soon: one `{ selector, role?, label?, description? }` per issue or wrong guess (see [rules.md](../stunt-double-wao/references/rules.md)). Add `description` to consequential buttons ("Pays for everything in the basket").
3. **Ship WAO** with those rules on the site (see [sites.md](../stunt-double-wao/references/sites.md)) so any agent benefits, not only the ones you control.

Re-measure. The target is no `issues` on the chosen pages and, over time, fewer `changes` as fixes move into the source.

## 4. Prove it with an agent

Run each task from step 1 with a browser-toolset agent, once without WAO and once with it injected (or shipped). Use the same model, step cap and viewport for both. Record success, steps taken and where it got stuck; the `records` from `runTurn` (or each direct tool result) are the evidence. A task that only succeeds with WAO is the clearest argument for the fix.

The `browser-agent-builder` agent can scaffold this harness; keep it in the repository as a regression check.

## 5. Keep it

Add the CI check from [harness.md](../stunt-double-wao/references/harness.md#ci-check) over the chosen pages so new issues fail a pull request.

## Report

Per page: issues before and after, changes WAO makes, source fixes made, rules added. Per task: result without and with WAO. Then what remains (closed shadow roots and cross-origin iframes WAO cannot reach, controls only a human can name) and the recommended source fixes, most impactful first.
