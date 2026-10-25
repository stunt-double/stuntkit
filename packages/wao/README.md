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

## Which agents it helps

Most browser agents that act through text read a page as its accessibility tree, with a reference for each element: Playwright MCP, Chrome DevTools MCP, Vercel's agent-browser, Stagehand, Browser Use, and the `read_page`-style tools in Anthropic's and OpenAI's browser toolsets. Google's Lighthouse now audits the same tree in its experimental Agentic Browsing category. These agents see what WAO repairs.

Agents that work from screenshots alone (computer-use models clicking on coordinates) never read the tree, so WAO neither helps nor hinders them. Its repairs never change what a page looks like.

Extracted from [Stunt Double](https://stuntdouble.io), where AI personas test real products in real browsers. This is version 2, a rewrite of [`stunt-double/wao`](https://github.com/stunt-double/wao). See [Upgrading from 1.x](#upgrading-from-1x).

## Install

As a script tag, on any site. Serve `dist/wao.global.js` from the package (also exported as `@stunt-double/wao/script`) alongside your pages.

```html
<script src="/wao.global.js" defer></script>
```

Or as a package, in a bundled app:

```sh
pnpm add @stunt-double/wao
# or: npm install @stunt-double/wao
```

Packages are published to [GitHub Packages](https://github.com/orgs/stunt-double/packages): add `@stunt-double:registry=https://npm.pkg.github.com` and a GitHub token with `read:packages` to your `.npmrc`.

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
const { changes, issues } = await page.evaluate(() => window.wao!.report());
```

A report is plain data: each entry's `element` is a non-enumerable property, so it stays in the page and the rest serialises. With Puppeteer, pass the same combined content to `page.evaluateOnNewDocument`. Over raw CDP, pass it as the `source` of `Page.addScriptToEvaluateOnNewDocument`. Pair it with [`@stunt-double/browser-toolset`](../browser-toolset), whose `read_page` reads the same tree.

With Playwright MCP, write the options and the script into one file and pass it as an init script:

```sh
{ echo 'window.waoOptions = {};'; cat node_modules/@stunt-double/wao/dist/wao.global.js; } > wao-init.js
npx @playwright/mcp --init-script ./wao-init.js
```

The script only runs once per page, so a second injection (or a site that already ships WAO) is harmless.

### Audit without changing the page

A harness that must see a page exactly as its users do (a test run, a scorecard) can ask what WAO would change without keeping any of it. Set `auto: false` so the script build does not optimise on load, then call `window.waoAudit()` whenever the page settles:

```ts
await context.addInitScript({
  content: `window.waoOptions = { auto: false };\n${script}`,
});
// ...
const { changes, issues } = await page.evaluate(() => window.waoAudit!());
```

`changes` are the defects WAO knows how to repair (a clickable `div` with no role, an icon button with no name), and `issues` the ones it cannot. `audit()` is also exported from the npm entry. It sets and removes attributes in one synchronous pass, so nothing renders in between, though the page's own attribute observers can see them.

You can also turn WAO on only when an agent gets stuck: audit by default, then `optimise()` when a control cannot be found, and record that the run had help.

## What it repairs

| Repair       | What it does                                                                                                                                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clickables` | A non-semantic element with an `onclick` handler (attribute or property), or the outermost element with `cursor: pointer`, gets `role="button"` and `tabindex="0"`. Enter and Space then click it, as they would a button. Elements inside a link or button, or wrapping one, are left alone.                              |
| `names`      | A control with no accessible name gets an `aria-label`, inferred from a tooltip attribute (`data-tooltip`, `data-bs-original-title`, ...), an icon font class (`fa-trash`, `bi-x`, `glyphicon-search`, `icon-cart`), the short text beside a field (`<td>Email:</td><td><input></td>`), a field's `name`, or a link's URL. |
| `landmarks`  | A page with no `<main>` gets `role="main"` on its one obvious candidate (`#main`, `#content`, `.main-content`, ...). When there are several candidates, WAO does nothing.                                                                                                                                                  |
| `dialogs`    | The outermost modal container (class `modal`, `dialog`, `popup` or `lightbox`) with no role gets `role="dialog"`, named by its first heading, so an agent can tell a modal is open and what it is about.                                                                                                                   |

Icon names follow the action, not the picture: `fa-times`, `bi-x` and `glyphicon-remove` are "Close", `fa-bars` is "Menu", `fa-cog` is "Settings" and `fa-ellipsis-v` is "More", because an agent told to close a dialog looks for "Close".

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
    { selector: '.ad-slot', hidden: true },
  ],
});
```

`hidden: true` sets `aria-hidden`, taking noise (ads, a duplicated mobile menu, decoration) out of the tree an agent reads. Never hide a control a person can use.

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

| Option     | Default                    | What                                                                                   |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `root`     | `document.documentElement` | The subtree to optimise.                                                               |
| `observe`  | `true`                     | Optimise content added later.                                                          |
| `keyboard` | `true`                     | Activate repaired clickables with Enter and Space.                                     |
| `shadow`   | `true`                     | Optimise and observe inside open shadow roots.                                         |
| `repairs`  | all `true`                 | `{ clickables, names, landmarks, dialogs }`.                                           |
| `rules`    | `[]`                       | `{ selector, role?, label?, description?, hidden? }[]`. Invalid selectors are skipped. |
| `signal`   |                            | An `AbortSignal`. Aborting it restores the page, as `restore()` does.                  |
| `onReport` |                            | Called with the report after every pass, including passes over later content.          |

### The handle

- `report()`: changes and issues as of the last pass.
- `refresh()`: run a full pass now, for a change the observer cannot see (a `cursor` set by a class toggle, for example).
- `restore()`: undo every change, stop observing and remove the keyboard handler. Calling it twice is harmless.

The handle is also `Disposable`, so `using wao = optimise()` restores the page when the block ends (TypeScript 5.2 or later, or a runtime with explicit resource management).

### `audit(options?)`

Takes the same options (except `observe`, `keyboard`, `signal` and `onReport`), runs one pass, restores the page and returns the report. The script build exposes it as `window.waoAudit`, with `window.waoOptions` as defaults.

### `accessibleName(element)` and `inferName(element)`

The two building blocks, exported for tooling. `accessibleName` is the subset of the accname computation WAO uses to decide whether a control already has a name. `inferName` is the name WAO would give an unnamed control, and where it came from.

## What it does not do

- It is not an accessibility overlay, and makes no compliance claim. Inferred names are a best guess for agents. A site that people use with assistive technology needs real labels in its source, and `report()` lists where.
- It does not detect assistive technology or treat anyone differently. Every visitor gets the same page.
- It does not guess where a wrong guess is costly. A wrong name is worse for an agent than none, because agents believe labels. So WAO only fills in names that are missing, says where each came from (`source`), and leaves the rest as issues. Name a payment or destructive control with a rule, or in the markup.
- It does not change what a page looks like or how it behaves, except that Enter and Space click a repaired clickable.
- It does not send anything anywhere, and makes no network requests.
- It cannot reach inside closed shadow roots or cross-origin iframes, as no script outside them can.

## What's new in 2.2

- **Audit.** `audit()` (and `window.waoAudit()` in the script build) reports what WAO would change and leaves the page as it was. `waoOptions.auto = false` stops the script build optimising on load.
- **Plain-data reports.** `element` is non-enumerable, so a report crosses `page.evaluate` and `JSON.stringify` without mapping.
- **Dialogs.** A new `dialogs` repair gives modal containers a dialog role and a name.
- **Action names for icons.** `fa-times` is "Close", not "Times"; `fa-bars` is "Menu".
- **Hiding noise.** Rules take `hidden: true`.
- **Faster passes.** Shadow roots are found once per pass rather than once per rule, and `inert` content is left alone.
- **Measured.** [`examples/`](./examples) compares a legacy shop with and without WAO: an agent that addresses controls by role and name completes the task only with WAO, and screenshots are pixel-identical.

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
