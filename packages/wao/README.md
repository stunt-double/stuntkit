# @stunt-double/wao

**Web Agent Optimiser.** A small drop-in script that makes existing and legacy websites work for AI agents, without a rebuild.

Agents read a page through its accessibility tree (Playwright's aria snapshot, CDP's Accessibility domain, `read_page` in [`@stunt-double/browser-toolset`](../browser-toolset)) and through screenshots. Legacy pages fail the first. A `<div onclick>` is not a button, an icon link has no name, and a field's label is the table cell beside it. To an agent, those controls are missing or unnamed. WAO repairs them in place:

Before (Chromium's aria snapshot of a legacy page):

```yaml
- text: ACME
- link:
    - /url: /cart
- table:
    - rowgroup:
        - row "Email:":
            - cell "Email:"
            - cell:
                - textbox
- text: Buy now
```

After WAO:

```yaml
- text: ACME
- link "Shopping cart":
    - /url: /cart
- button "Search"
- main:
    - table:
        - rowgroup:
            - row "Email:":
                - cell "Email:"
                - cell:
                    - textbox "Email"
    - button "Buy now"
```

The search control was a `<div onclick>` holding a Glyphicon, and the cart link held only a Font Awesome icon.

- **Attributes only.** WAO never replaces, moves or restyles a node. Event handlers, framework state and what a screenshot shows are untouched.
- **Never overwrites the page.** The automatic repairs only fill in attributes the page has not set. Only rules you write can override.
- **Reversible.** `restore()` puts every attribute back exactly as it was.
- **Keeps up.** A `MutationObserver` optimises content that single-page apps add later.
- **Reaches web components.** Controls inside open shadow roots are repaired and observed too.
- **Small.** About 4 KB gzipped, with no dependencies.

Extracted from [Stunt Double](https://stuntdouble.io), where AI personas test real products in real browsers. This is version 2, a rewrite of [`stunt-double/wao`](https://github.com/stunt-double/wao). See [Upgrading from 1.x](#upgrading-from-1x).

## Install

As a script tag, on any site. Serve `dist/wao.global.js` from the package (also exported as `@stunt-double/wao/script`) alongside your pages. Once the scope is on npm, jsDelivr will serve it at `https://cdn.jsdelivr.net/npm/@stunt-double/wao@2/dist/wao.global.js`.

```html
<script src="/wao.global.js" defer></script>
```

Or as a package, in a bundled app:

```sh
pnpm add @stunt-double/wao
# or: npm install @stunt-double/wao
```

Until the `@stunt-double` scope is available on npm, packages are published to [GitHub Packages](https://github.com/orgs/stunt-double/packages): add `@stunt-double:registry=https://npm.pkg.github.com` and a GitHub token with `read:packages` to your `.npmrc`.

```ts
import { optimise } from '@stunt-double/wao';

const wao = optimise();
```

The npm entry has no side effects: nothing runs until you call `optimise`. The script build runs `optimise` once the DOM is ready and exposes the handle as `window.wao`.

In a React app, optimise once from an effect and restore on cleanup:

```tsx
import { optimise } from '@stunt-double/wao';
import { useEffect } from 'react';

export function AgentReady() {
  useEffect(() => {
    const controller = new AbortController();
    optimise({ signal: controller.signal });
    return () => controller.abort();
  }, []);
  return null;
}
```

## In an agent's browser

You do not need to own a site to use WAO on it. An agent harness can inject the script build into every page it opens, so the agent reads the repaired tree. With Playwright:

```ts
import type {} from '@stunt-double/wao'; // Types `window.wao` and `window.waoOptions`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = readFileSync(fileURLToPath(import.meta.resolve('@stunt-double/wao/script')), 'utf8');
const options = { rules: [{ selector: '#hdr .links', role: 'navigation', label: 'Primary' }] };

// One init script, options first: Playwright does not define the order of
// separate init scripts. It runs before the page's own scripts.
await context.addInitScript({
  content: `window.waoOptions = ${JSON.stringify(options)};\n${script}`,
});

const page = await context.newPage();
await page.goto('https://legacy.example.com');
console.log(await page.locator('body').ariaSnapshot()); // The repaired tree.

// What WAO changed and what it could not fix, for logs or for the agent itself.
const { changes, issues } = await page.evaluate(() => {
  const { changes, issues } = window.wao!.report();
  return {
    changes: changes.map(({ kind, target, value, source }) => ({ kind, target, value, source })),
    issues: issues.map(({ kind, target }) => ({ kind, target })),
  };
});
```

Reports hold live elements, so map them to plain data before they leave the page. With Puppeteer, pass the same combined content to `page.evaluateOnNewDocument`. Over raw CDP, pass it as the `source` of `Page.addScriptToEvaluateOnNewDocument`. Pair it with [`@stunt-double/browser-toolset`](../browser-toolset), whose `read_page` reads the same tree.

The script only runs once per page, so a second injection (or a site that already ships WAO) is harmless.

## What it repairs

| Repair       | What it does                                                                                                                                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clickables` | A non-semantic element with an `onclick` handler (attribute or property), or the outermost element with `cursor: pointer`, gets `role="button"` and `tabindex="0"`. Enter and Space then click it, as they would a button. Elements inside a link or button, or wrapping one, are left alone.                              |
| `names`      | A control with no accessible name gets an `aria-label`, inferred from a tooltip attribute (`data-tooltip`, `data-bs-original-title`, ...), an icon font class (`fa-trash`, `bi-x`, `glyphicon-search`, `icon-cart`), the short text beside a field (`<td>Email:</td><td><input></td>`), a field's `name`, or a link's URL. |
| `landmarks`  | A page with no `<main>` gets `role="main"` on its one obvious candidate (`#main`, `#content`, `.main-content`, ...). When there are several candidates, WAO does nothing.                                                                                                                                                  |

Each repaired element is marked with `data-wao`, listing what changed (`data-wao="role focus name"`). An agent can then tell which roles and names were inferred and which ones the page wrote.

Each repair can be switched off:

```ts
optimise({ repairs: { landmarks: false } });
```

## Rules

Heuristics cannot know what a control means. Rules can. A rule names a selector and the role, name or description its elements should have. Rules override the page:

```ts
optimise({
  rules: [
    { selector: '#hdr .links', role: 'navigation', label: 'Primary' },
    { selector: '.btn-go', label: 'Check out', description: 'Pays for everything in the basket' },
    { selector: '#q', role: 'searchbox', label: 'Search products' },
  ],
});
```

With the script build, set the options before the script loads:

```html
<script>
  window.waoOptions = { rules: [{ selector: '.btn-go', label: 'Check out' }] };
</script>
<script src="/wao.global.js" defer></script>
```

`description` is written as `aria-description`, which Chromium exposes in the accessibility tree.

## Reports

`report()` lists every change in effect and what WAO found but could not fix:

```ts
const { changes, issues } = wao.report();
// changes: [{ kind: 'name', target: 'a.cart', attribute: 'aria-label', value: 'Shopping cart', source: 'icon', element }]
// issues:  [{ kind: 'unnamed-control', target: 'button#b', element }]
```

Issue kinds are `unnamed-control`, `image-without-alt` and `no-main`. Each one is a good candidate for a rule, or for a fix in the site itself. An agent driving the page can read the same report with `window.wao.report()`.

## API

### `optimise(options?)`

Runs one pass now and returns a handle. Options:

| Option     | Default                    | What                                                                           |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ |
| `root`     | `document.documentElement` | The subtree to optimise.                                                       |
| `observe`  | `true`                     | Optimise content added later.                                                  |
| `keyboard` | `true`                     | Activate repaired clickables with Enter and Space.                             |
| `shadow`   | `true`                     | Optimise and observe inside open shadow roots.                                 |
| `repairs`  | all `true`                 | `{ clickables, names, landmarks }`.                                            |
| `rules`    | `[]`                       | `{ selector, role?, label?, description? }[]`. An invalid selector is skipped. |
| `signal`   |                            | An `AbortSignal`. Aborting it restores the page, as `restore()` does.          |
| `onReport` |                            | Called with the report after every pass, including passes over later content.  |

### The handle

- `report()`: changes and issues as of the last pass.
- `refresh()`: run a full pass now, for a change the observer cannot see (a `cursor` set by a class toggle, for example).
- `restore()`: undo every change, stop observing and remove the keyboard handler. Calling it twice is harmless.

The handle is also `Disposable`, so `using wao = optimise()` restores the page when the block ends (TypeScript 5.2 or later, or a runtime with explicit resource management).

### `accessibleName(element)` and `inferName(element)`

The two building blocks, exported for tooling. `accessibleName` is the subset of the accname computation WAO uses to decide whether a control already has a name. `inferName` is the name WAO would give an unnamed control, and where it came from.

## What it does not do

- It does not make a page accessible. Inferred names are a best guess for agents. A site that people use with assistive technology needs real labels.
- It does not change what a page looks like or how it behaves, except that Enter and Space click a repaired clickable.
- It does not send anything anywhere, and makes no network requests.
- It cannot reach inside closed shadow roots or cross-origin iframes, as no script outside them can.

## What's new in 2.1

- **Shadow roots.** Controls inside open shadow roots (web components) are repaired and observed for later content. Opt out with `shadow: false`.
- **Cancelling.** `optimise()` takes an `AbortSignal` (`signal`). Aborting it restores the page.
- **Reports.** `onReport` is called with the report after every pass.
- **Disposable handle.** `using wao = optimise()` restores the page at the end of the block. `restore()` is now safe to call twice.
- **Changed:** after `restore()`, `refresh()` no longer re-optimises the page. Create a new handle with `optimise()` instead.
- **Typed globals.** `window.wao` and `window.waoOptions` are typed by the package.
- **Fix.** `aria-labelledby` and `label[for]` resolve within the element's own shadow root.

## Upgrading from 1.x

Version 1 was published as `@stdbl/wao`. Version 2 is `@stunt-double/wao`, so swap the package name (and the script URL) as well:

```sh
pnpm remove @stdbl/wao
pnpm add @stunt-double/wao
```

Version 1 drew overlays on the page (borders, tags and panels) and waited for an agent to activate it through `window.WAO`. Version 2 is a rewrite. It changes the accessibility tree instead, because that is how agents read a page, and it runs on load. The overlays, the `window.WAO` methods, the `data-wao-*` attributes and the React components are gone:

| 1.x                                              | 2.x                                                         |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `describeElementVisually(selector, description)` | A rule: `{ selector, description }`                         |
| `highlightElementRole(selector, role)`           | A rule: `{ selector, role }`                                |
| `describePage({ mainContent, navigation })`      | Rules with `role: 'main'` and `role: 'navigation'`          |
| `analyzeAccessibility()`                         | `report().issues`                                           |
| `deactivateOptimizer()`                          | `restore()`                                                 |
| `<WAOProvider>`, `useWAO()`                      | Call `optimise()` once in an effect, `restore()` on cleanup |

Version 1 was released under the MIT licence. Version 2 is Apache-2.0.

## Licence

[Apache-2.0](./LICENSE)
