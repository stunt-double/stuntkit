---
name: stunt-double-wao
description: Use when making a website work for AI agents with @stunt-double/wao (Web Agent Optimiser), or when an agent's browser struggles with a legacy page (clickable divs, unnamed icon buttons, fields labelled by table cells, no main landmark). Covers adding WAO to a site by script tag or npm (React, Next.js, Vue, Svelte, Angular, server-rendered pages), writing rules from its report, injecting it into Playwright, Puppeteer, CDP or Stagehand sessions, reading report() from an agent harness or CI, and upgrading from @stdbl/wao 1.x.
---

# Web Agent Optimiser (`@stunt-double/wao`)

WAO repairs the accessibility tree agents read (Playwright's aria snapshot, CDP's Accessibility domain, `read_page` tools) with attributes only. It never moves, replaces or restyles a node, never overwrites an attribute the page set (only rules do), and `restore()` undoes everything. About 4 KB gzipped, no dependencies, no network requests.

```sh
pnpm add @stunt-double/wao
```

Releases are on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

## Pick the integration

| Situation                                 | Do this                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| You own the site, no build step           | Serve `@stunt-double/wao/script` (`dist/wao.global.js`); options on `window.waoOptions` first |
| You own the site, bundled app             | `import { optimise } from '@stunt-double/wao'`, once, on the client                           |
| You build the agent, not the site         | Inject the script build with one init script per context, before navigating                   |
| You want to know what an agent cannot see | Run it and read `report().issues`                                                             |

Framework recipes (React, Next.js, Vue, Svelte, Angular, plain HTML): [references/sites.md](references/sites.md). Harness recipes (Playwright, Puppeteer, CDP, Stagehand, browser-toolset): [references/harness.md](references/harness.md).

## Bundled app, the one rule

The npm entry has no side effects. Call `optimise` in the browser only (never during SSR), once, tied to a lifetime:

```tsx
useEffect(() => {
  const controller = new AbortController();
  optimise({ signal: controller.signal });
  return () => controller.abort();
}, []);
```

## Agent harness, the one rule

```ts
const script = readFileSync(fileURLToPath(import.meta.resolve('@stunt-double/wao/script')), 'utf8');
await context.addInitScript({
  content: `window.waoOptions = ${JSON.stringify(options)};\n${script}`,
});
```

**One** init script with the options prepended (Playwright does not order separate init scripts), registered on the context **before** navigating. `report()` holds live elements: map to plain data inside `page.evaluate`. The script build starts once per window, so a site that already ships WAO is harmless.

## Rules

Heuristics guess; rules know. A rule is `{ selector, role?, label?, description? }` and overrides the page. Turn each `report().issues` entry into a rule, or better, a fix in the markup:

```ts
optimise({
  rules: [
    { selector: '#hdr .links', role: 'navigation', label: 'Primary' },
    { selector: '.btn-go', label: 'Check out', description: 'Pays for everything in the basket' },
  ],
});
```

An invalid selector is skipped, not thrown. `description` becomes `aria-description`. Patterns for common legacy markup: [references/rules.md](references/rules.md).

## Options and handle

`root`, `observe` (default on, `MutationObserver`, 50 ms batch), `keyboard` (Enter and Space click repaired clickables), `shadow` (default on, open shadow roots), `repairs: { clickables, names, landmarks }`, `rules`, `signal` (abort restores), `onReport` (hears every pass). The handle has `report()`, `refresh()` (for changes the observer cannot see, such as a class toggle setting `cursor: pointer`), `restore()` and `[Symbol.dispose]`, so `using wao = optimise()` works. After `restore()`, call `optimise()` again rather than `refresh()`.

`accessibleName(el)` and `inferName(el)` (returns `{ name, source }` or `null`) are exported for tooling.

## Checking the result

Compare `await page.locator('body').ariaSnapshot()` before and after. Repaired elements carry `data-wao="role focus name"` (`WAO_ATTRIBUTE`), so an agent can tell inferred semantics from authored ones. Fail CI on new issues: [references/harness.md](references/harness.md#ci-check).

## Limits to state plainly

- Inferred names are a best guess for agents, not an accessibility fix for people. Recommend real labels in the source.
- Closed shadow roots and cross-origin iframes are out of reach.
- It sends nothing anywhere.

## Upgrading from 1.x

`@stdbl/wao` 1.x drew overlays and waited for `window.WAO`; 2.x is a rewrite under a new name. Map: `describeElementVisually` and `highlightElementRole` become rules, `describePage` becomes rules with `role: 'main'` / `'navigation'`, `analyzeAccessibility()` becomes `report().issues`, `deactivateOptimizer()` becomes `restore()`, and `<WAOProvider>` / `useWAO()` become one `optimise()` in an effect. Remove the `data-wao-*` attributes and overlay CSS. 1.x was MIT; 2.x is Apache-2.0.

For an end-to-end audit of a site (inject, read the report, write rules, verify with an agent), use the `stuntkit-agent-ready-site` skill.
