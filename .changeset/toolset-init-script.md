---
'@stunt-double/browser-toolset': minor
---

Adds `DriverContext.addInitScript(source)`, which runs a script in every document the browser loads before the page's own scripts, for harnesses that install something like `@stunt-double/wao` on each page. The Playwright example implements it. `read_page` and `find` now show an element's `aria-description`, and mark semantics WAO inferred (`data-wao`) with `inferred="role name"`, so an agent can tell authored names from guessed ones.
