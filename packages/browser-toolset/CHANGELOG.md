# @stunt-double/browser-toolset

## 0.2.0

### Minor Changes

- [#34](https://github.com/stunt-double/stuntkit/pull/34) [`231a7c8`](https://github.com/stunt-double/stuntkit/commit/231a7c829816ef84db5b9d547b6255b95a962e9c) Thanks [@mrprkr](https://github.com/mrprkr)! - Adds `DriverContext.addInitScript(source)`, which runs a script in every document the browser loads before the page's own scripts, for harnesses that install something like `@stunt-double/wao` on each page. The Playwright example implements it. `read_page` and `find` now show an element's `aria-description`, and mark semantics WAO inferred (`data-wao`) with `inferred="role name"`, so an agent can tell authored names from guessed ones.
