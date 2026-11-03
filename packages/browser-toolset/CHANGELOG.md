# @stunt-double/browser-toolset

## 0.2.1

### Patch Changes

- [#40](https://github.com/stunt-double/stuntkit/pull/40) [`f2047ed`](https://github.com/stunt-double/stuntkit/commit/f2047edeca2116b0b684ec518de5dfae50d3ff20) Thanks [@mrprkr](https://github.com/mrprkr)! - `DirectBrowserTools` now takes `allowPrivateHosts` and `checkNavigation` and passes them to the executor, so the direct tools can reach a local dev server or an intranet under the caller's own network policy. Both were already executor options; the direct tools refused every private host.

- [#40](https://github.com/stunt-double/stuntkit/pull/40) [`f2047ed`](https://github.com/stunt-double/stuntkit/commit/f2047edeca2116b0b684ec518de5dfae50d3ff20) Thanks [@mrprkr](https://github.com/mrprkr)! - `form_input` results no longer repeat the value that was set: a text field reports its length (`Set ref_4 (12 characters)`) and a missing select option no longer quotes the value. Results are recorded in transcripts and run logs, and the value can be a password or a one-time code. The model still sends the value as before.

## 0.2.0

### Minor Changes

- [#34](https://github.com/stunt-double/stuntkit/pull/34) [`231a7c8`](https://github.com/stunt-double/stuntkit/commit/231a7c829816ef84db5b9d547b6255b95a962e9c) Thanks [@mrprkr](https://github.com/mrprkr)! - Adds `DriverContext.addInitScript(source)`, which runs a script in every document the browser loads before the page's own scripts, for harnesses that install something like `@stunt-double/wao` on each page. The Playwright example implements it. `read_page` and `find` now show an element's `aria-description`, and mark semantics WAO inferred (`data-wao`) with `inferred="role name"`, so an agent can tell authored names from guessed ones.
