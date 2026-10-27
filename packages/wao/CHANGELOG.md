# @stunt-double/wao

## 2.2.1

### Patch Changes

- [#36](https://github.com/stunt-double/stuntkit/pull/36) [`193d758`](https://github.com/stunt-double/stuntkit/commit/193d75895052b33367ba5bd0c26be26e8e8d296a) Thanks [@mrprkr](https://github.com/mrprkr)! - A control named by a descendant's `title` (an empty icon element with a tooltip inside a link, as on Hacker News) now counts as named, as it does in browsers, so WAO no longer replaces "upvote" with a name guessed from the URL.

## 2.2.0

### Minor Changes

- [#31](https://github.com/stunt-double/stuntkit/pull/31) [`01dd6fb`](https://github.com/stunt-double/stuntkit/commit/01dd6fb26e6ba70025e1a0949af07396d72d989b) Thanks [@mrprkr](https://github.com/mrprkr)! - Adds `audit()`, which reports what WAO would change and leaves the page as it was; the script build exposes it as `window.waoAudit()`, and `waoOptions.auto = false` stops it optimising on load, so a test harness can see a page exactly as its users do. Reports are now plain data (`element` is non-enumerable), so they cross `page.evaluate` and `JSON.stringify` unmapped. A new `dialogs` repair gives modal containers a dialog role named by their heading. Icon names follow the action (`fa-times` is "Close", `fa-bars` is "Menu"). Rules take `hidden: true`. Shadow roots are found once per pass, and `inert` content is left alone.

## 2.1.0

### Minor Changes

- [#12](https://github.com/stunt-double/stuntkit/pull/12) [`bfb475f`](https://github.com/stunt-double/stuntkit/commit/bfb475f573aeab3ce90e90eff7eb0e4b4e6f2861) Thanks [@mrprkr](https://github.com/mrprkr)! - Repairs now reach inside open shadow roots (web components), and keep observing them for content added later; opt out with `shadow: false`. `optimise` takes an `AbortSignal` (`signal`) that restores the page when it aborts, and an `onReport` callback that hears every pass. The handle is `Disposable`, so `using wao = optimise()` restores the page at the end of a block, and `restore()` is now safe to call twice. After `restore()`, `refresh()` no longer re-optimises the page: create a new handle with `optimise()` instead. `window.wao` and `window.waoOptions` are typed by the package, for agent harnesses that inject the script build and read its report. `aria-labelledby` and `label[for]` now resolve within the element's own shadow root.

## 2.0.0

### Major Changes

- [#1](https://github.com/stunt-double/stuntkit/pull/1) [`5ed92ce`](https://github.com/stunt-double/stuntkit/commit/5ed92ce616d4e5fa23bb9c8b9527f5569c32b385) Thanks [@mrprkr](https://github.com/mrprkr)! - Rewrite of the Web Agent Optimiser. WAO now repairs the accessibility tree that agents read, with attributes only and no visual change: clickable `div`s become focusable buttons, unnamed controls get names inferred from tooltips, icon classes, nearby text, field names and URLs, and a page with no `<main>` gets one when the candidate is obvious. Rules let a site name its own controls, `report()` lists what changed and what could not be fixed, and `restore()` undoes everything. Ships as an ESM module and a drop-in `<script>` build. The 1.x overlays, `window.WAO` API, `data-wao-*` attributes and React components are removed; see the README for the upgrade table. Now licensed Apache-2.0.
