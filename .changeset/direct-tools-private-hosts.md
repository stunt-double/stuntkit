---
'@stunt-double/browser-toolset': patch
---

`DirectBrowserTools` now takes `allowPrivateHosts` and `checkNavigation` and passes them to the executor, so the direct tools can reach a local dev server or an intranet under the caller's own network policy. Both were already executor options; the direct tools refused every private host.
