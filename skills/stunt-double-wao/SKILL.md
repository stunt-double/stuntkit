---
name: stunt-double-wao
description: Use when making a website work for AI agents with @stunt-double/wao (Web Agent Optimiser), or when an agent's browser struggles with a legacy page (clickable divs, unnamed icon buttons, fields labelled by table cells, no main landmark). Covers adding WAO to a site by script tag or npm, writing rules from its report, injecting it into Playwright, Puppeteer or CDP sessions, and reading report() from an agent harness.
---

# Web Agent Optimiser (`@stunt-double/wao`)

WAO repairs the accessibility tree agents read (Playwright's aria snapshot, CDP's Accessibility domain, `read_page` tools) with attributes only. It never moves, replaces or restyles a node, never overwrites an attribute the page set (only rules do), and `restore()` undoes everything.

## Pick the integration

| Situation                                 | Do this                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| You own the site, no build step           | Script tag, options on `window.waoOptions` before it                   |
| You own the site, bundled app             | `import { optimise } from '@stunt-double/wao'`, once, on the client    |
| You build the agent, not the site         | Inject `@stunt-double/wao/script` with an init script in every context |
| You want to know what an agent cannot see | Run it and read `report().issues`                                      |

Install: `pnpm add @stunt-double/wao`. Until the scope is on npm, it is on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

### Script tag

```html
<script>
  window.waoOptions = { rules: [{ selector: '.btn-go', label: 'Check out' }] };
</script>
<script src="https://cdn.jsdelivr.net/npm/@stunt-double/wao@2/dist/wao.global.js" defer></script>
```

### Bundled app (React shown)

The npm entry has no side effects. Call `optimise` in the browser only (never during SSR), and tie it to a lifetime:

```tsx
useEffect(() => {
  const controller = new AbortController();
  optimise({ signal: controller.signal });
  return () => controller.abort();
}, []);
```

### Agent harness (Playwright)

```ts
import type {} from '@stunt-double/wao'; // Types window.wao and window.waoOptions.
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.resolve('@stunt-double/wao/script'));
await context.addInitScript(() => {
  window.waoOptions = { observe: true };
});
await context.addInitScript({ path: script });
```

- Register both init scripts on the context **before** navigating. `page.setContent` reuses the `about:blank` document WAO already ran on, so test with `page.route` plus `goto` instead.
- Puppeteer: `page.evaluateOnNewDocument(fs.readFileSync(script, 'utf8'))`. Raw CDP: `Page.addScriptToEvaluateOnNewDocument`.
- `report()` holds live elements. Map to plain data inside `page.evaluate` before returning it: `changes.map(({ kind, target, value, source }) => ...)`.
- The script build only starts once per window, so injecting into a site that already ships WAO is harmless.

## Writing rules

Heuristics guess; rules know. Turn each `report().issues` entry (`unnamed-control`, `image-without-alt`, `no-main`) into a rule, or better, a fix in the site's markup:

```ts
optimise({
  rules: [
    { selector: '#hdr .links', role: 'navigation', label: 'Primary' },
    { selector: '.btn-go', label: 'Check out', description: 'Pays for everything in the basket' },
  ],
});
```

Rules override the page. An invalid selector is skipped, not thrown. `description` becomes `aria-description`.

## Options worth knowing

`root`, `observe` (default on, a `MutationObserver` with a 50ms batch), `keyboard` (Enter and Space click repaired clickables), `shadow` (default on: open shadow roots are repaired and observed), `repairs: { clickables, names, landmarks }`, `rules`, `signal` (abort to restore), `onReport` (hears every pass). The handle has `report()`, `refresh()` (for changes the observer cannot see, such as a class toggle that sets `cursor: pointer`), `restore()` and `[Symbol.dispose]`, so `using wao = optimise()` works.

## Checking the result

Compare an aria snapshot before and after (`await page.locator('body').ariaSnapshot()`). Repaired elements carry `data-wao="role focus name"`, so an agent can tell inferred semantics from authored ones.

## Limits to state plainly

- Inferred names are a best guess for agents, not an accessibility fix for people. Recommend real labels in the source.
- Closed shadow roots and cross-origin iframes are out of reach.
- It makes no network requests and sends nothing anywhere.
