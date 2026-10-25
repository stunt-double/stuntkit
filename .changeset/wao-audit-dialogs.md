---
'@stunt-double/wao': minor
---

Adds `audit()`, which reports what WAO would change and leaves the page as it was; the script build exposes it as `window.waoAudit()`, and `waoOptions.auto = false` stops it optimising on load, so a test harness can see a page exactly as its users do. Reports are now plain data (`element` is non-enumerable), so they cross `page.evaluate` and `JSON.stringify` unmapped. A new `dialogs` repair gives modal containers a dialog role named by their heading. Icon names follow the action (`fa-times` is "Close", `fa-bars` is "Menu"). Rules take `hidden: true`. Shadow roots are found once per pass, and `inert` content is left alone.
