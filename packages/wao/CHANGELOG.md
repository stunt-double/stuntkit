# @stunt-double/wao

## 2.1.0

### Minor Changes

- [#12](https://github.com/stunt-double/stuntkit/pull/12) [`bfb475f`](https://github.com/stunt-double/stuntkit/commit/bfb475f573aeab3ce90e90eff7eb0e4b4e6f2861) Thanks [@mrprkr](https://github.com/mrprkr)! - Repairs now reach inside open shadow roots (web components), and keep observing them for content added later; opt out with `shadow: false`. `optimise` takes an `AbortSignal` (`signal`) that restores the page when it aborts, and an `onReport` callback that hears every pass. The handle is `Disposable`, so `using wao = optimise()` restores the page at the end of a block, and `restore()` is now safe to call twice. After `restore()`, `refresh()` no longer re-optimises the page: create a new handle with `optimise()` instead. `window.wao` and `window.waoOptions` are typed by the package, for agent harnesses that inject the script build and read its report. `aria-labelledby` and `label[for]` now resolve within the element's own shadow root.

## 2.0.0

### Major Changes

- [#1](https://github.com/stunt-double/stuntkit/pull/1) [`5ed92ce`](https://github.com/stunt-double/stuntkit/commit/5ed92ce616d4e5fa23bb9c8b9527f5569c32b385) Thanks [@mrprkr](https://github.com/mrprkr)! - Rewrite of the Web Agent Optimiser. WAO now repairs the accessibility tree that agents read, with attributes only and no visual change: clickable `div`s become focusable buttons, unnamed controls get names inferred from tooltips, icon classes, nearby text, field names and URLs, and a page with no `<main>` gets one when the candidate is obvious. Rules let a site name its own controls, `report()` lists what changed and what could not be fixed, and `restore()` undoes everything. Ships as an ESM module and a drop-in `<script>` build. The 1.x overlays, `window.WAO` API, `data-wao-*` attributes and React components are removed; see the README for the upgrade table. Now licensed Apache-2.0.
