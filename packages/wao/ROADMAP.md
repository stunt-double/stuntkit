# WAO roadmap

Where the Web Agent Optimiser could go next. Each item is a proposal, open for discussion in an issue before anyone builds it. Nothing here changes what WAO is: attributes only, reversible, no network requests, never an accessibility overlay.

## Distribution

**Harness flags before new servers.** Playwright MCP (`--init-script`), Vercel's agent-browser (`--init-script`), Stagehand (`context.addInitScript`), Puppeteer (`evaluateOnNewDocument`) and raw CDP (`Page.addScriptToEvaluateOnNewDocument`) already inject a script into every page. Documenting those reaches most agent builders. A dedicated MCP server that wraps a browser would mostly duplicate Playwright MCP, so it is not planned.

**A browser extension.** For agents that drive a person's own browser through an extension, a Manifest V3 build would carry WAO to every page in that profile:

- A content script at `document_start`, in the page's own JavaScript world (`"world": "MAIN"`), with `all_frames` and `match_origin_as_fallback`. In the default isolated world a script cannot see `el.onclick`, even for inline handlers, so clickables would be missed.
- Off by default per site, with an "audit only" mode that shows `audit()` results in the popup and changes nothing.
- No network access. Rule packs are imported by the user, not fetched.
- The trade-off to state plainly: a script in the main world can be tampered with by the page, and `<all_urls>` needs a clear justification in store review.

## Repairs and reports

- **Hints from the harness.** A page script cannot see listeners added with `addEventListener`. A harness with CDP can (`DOMDebugger.getEventListeners`). Accept a list of elements the harness knows are clickable, and repair them as `onclick` elements are today.
- **Blockers as issues, never fixed.** Report an overlay covering the viewport (found with `elementFromPoint`), a consent banner, `aria-hidden` over a focusable element, `content-visibility: hidden` regions, canvas-only controls and hover-only menus. WAO must never accept a cookie banner or dismiss a dialog for the agent.
- **State that stays true.** `aria-disabled`, `aria-expanded` and `aria-invalid` would help agents, but a state attribute that goes stale is worse than none. They need the observer to watch class changes on the elements involved, and tests that toggle them.
- **Name confidence.** Mark names inferred from a URL or a field's `name` as low confidence in the report, so a harness can choose to ignore them.

## WebMCP

Chrome's WebMCP origin trial lets a form declare itself as a tool with attributes (`toolname`, `tooldescription`, `toolparamdescription`). A rule could write those on a site's own forms, so a site adopts WebMCP without a rebuild. It would never set `toolautosubmit`. Worth doing once the API settles; until then the attributes do nothing outside the trial.

## Rule packs

Rules written for one site are reusable by everyone whose agents visit it. A shared format would let them travel:

- A pack is `{ domain, paths?, version, rules }`, the same `WaoRule` shape.
- A site owner can publish its own pack at `/.well-known/wao.json`. Packs from the origin itself are the only ones a harness should apply by default.
- Community packs belong in an open registry (a sequence registry such as OpenSequence is a natural home, since its sequences could then name controls by role and name) with review and evidence from runs. They are opt-in, because a rule overrides the page: a malicious pack that labels "Delete account" as "Save" is an attack on agents. A registry should refuse rules that rename visible text or touch payment, sign-in or destructive controls.
