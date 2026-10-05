---
'@stunt-double/wao': minor
---

Repairs now reach inside open shadow roots (web components), and keep observing them for content added later; opt out with `shadow: false`. `optimise` takes an `AbortSignal` (`signal`) that restores the page when it aborts, and an `onReport` callback that hears every pass. The handle is `Disposable`, so `using wao = optimise()` restores the page at the end of a block, and `restore()` is now safe to call twice. After `restore()`, `refresh()` no longer re-optimises the page: create a new handle with `optimise()` instead. `window.wao` and `window.waoOptions` are typed by the package, for agent harnesses that inject the script build and read its report. `aria-labelledby` and `label[for]` now resolve within the element's own shadow root.
