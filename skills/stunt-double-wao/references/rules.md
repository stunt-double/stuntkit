# Rules cookbook

A rule is `{ selector, role?, label?, description? }`. Every match gets the attributes; rules override what the page set, which the automatic repairs never do. Write rules from `report()` and the aria snapshot, not from guesses.

## What the heuristics already do

Before writing a rule, check whether a repair covers it:

| Repair       | Covers                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clickables` | `onclick` (attribute or property) or outermost `cursor: pointer` on a non-semantic element: `role="button"`, `tabindex="0"`, Enter and Space     |
| `names`      | Tooltip attributes, icon font classes (`fa-trash`, `bi-x`, `glyphicon-search`, `icon-cart`), adjacent label text, a field's `name`, a link's URL |
| `landmarks`  | One obvious main candidate (`#main`, `#content`, `.main-content`) when there is no `<main>`                                                      |

Write a rule when the guess is wrong, missing or ambiguous.

## Patterns

**Icon-only controls with no hint**

```ts
{ selector: 'header .icon-btn:nth-of-type(1)', label: 'Search' },
{ selector: 'a[href="/basket"]', label: 'Basket' },
```

**Navigation built from `div`s**

```ts
{ selector: '#hdr .links', role: 'navigation', label: 'Primary' },
{ selector: 'footer .links', role: 'navigation', label: 'Footer' },
```

**Several main candidates (WAO picks none)**

```ts
{ selector: '#content-wrapper > .page', role: 'main' },
```

**Search boxes and filters**

```ts
{ selector: '#q', role: 'searchbox', label: 'Search products' },
{ selector: '.filters', role: 'region', label: 'Filters' },
```

**Ambiguous buttons the agent must tell apart**

```ts
{ selector: '.cart-row .x', label: 'Remove from basket' },
{ selector: '.btn-go', label: 'Check out', description: 'Pays for everything in the basket' },
```

`description` is written as `aria-description`; use it for consequence ("pays", "deletes"), which agents weigh before acting.

**Custom widgets**

```ts
{ selector: '.tabs > .tab', role: 'tab' },
{ selector: '.tabs', role: 'tablist', label: 'Account sections' },
{ selector: '.modal', role: 'dialog', label: 'Sign in' },
```

A role alone does not add behaviour: a `div` given `role="tab"` still needs the page's own click handler, which it already has.

## Selector advice

- Prefer stable hooks: ids, `data-*` attributes, `href` values. Avoid long `nth-child` chains that break on a copy change.
- One rule may match many elements; that is the point for repeated rows. Scope with a parent so it does not over-match.
- An invalid selector is skipped silently. Check `report().changes` for `kind: 'rule'` entries to confirm each rule applied.

## Keeping rules in one place

For a site you own, keep rules in one module exported to both the bundle and any harness, so the agent and the site agree. For a harness over many third-party sites, key rule sets by host and pass the matching set to `waoInit` per context.
