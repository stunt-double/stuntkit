# @stdbl/wao

## 2.0.0

### Major Changes

- [#1](https://github.com/stunt-double/stuntkit/pull/1) [`5ed92ce`](https://github.com/stunt-double/stuntkit/commit/5ed92ce616d4e5fa23bb9c8b9527f5569c32b385) Thanks [@mrprkr](https://github.com/mrprkr)! - Rewrite of the Web Agent Optimiser. WAO now repairs the accessibility tree that agents read, with attributes only and no visual change: clickable `div`s become focusable buttons, unnamed controls get names inferred from tooltips, icon classes, nearby text, field names and URLs, and a page with no `<main>` gets one when the candidate is obvious. Rules let a site name its own controls, `report()` lists what changed and what could not be fixed, and `restore()` undoes everything. Ships as an ESM module and a drop-in `<script>` build. The 1.x overlays, `window.WAO` API, `data-wao-*` attributes and React components are removed; see the README for the upgrade table. Now licensed Apache-2.0.
