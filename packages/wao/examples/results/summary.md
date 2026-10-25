# WAO with/without comparison

Chromium, Playwright `ariaSnapshot()`. Tokens are characters / 4.

## Snapshots

| Page | Variant | Chars | Tokens | Interactive in tree | Named | Unnamed | Interactive in DOM | Landmarks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| shop.html | without | 205 | 51 | 2 | 0 | 2 | 6 | none |
| shop.html | with | 459 | 115 | 9 | 9 | 0 | 6 | main |
| basket.html | without | 317 | 79 | 2 | 0 | 2 | 4 | none |
| basket.html | with | 419 | 105 | 4 | 4 | 0 | 4 | main |
| done.html | without | 133 | 33 | 1 | 0 | 1 | 1 | none |
| done.html | with | 152 | 38 | 1 | 1 | 0 | 1 | main |

## Visual identity (full-page screenshot, pixel diff)

| Page | Same size | Differing pixels | Total pixels |
| --- | --- | --- | --- |
| shop.html | yes | 0 | 700000 |
| basket.html | yes | 0 | 700000 |
| done.html | yes | 0 | 700000 |

## Role-only agent

Locators are `getByRole(role, { name })` only. A step that cannot be reached by role is run by CSS so the rest can be measured, and counts as a failure.

| Step | Without WAO | With WAO |
| --- | --- | --- |
| Accept the cookie banner | MISSING | reachable |
| Fill the search box | MISSING | reachable |
| Press search | MISSING | reachable |
| Add the kettle | MISSING | reachable |
| Close the added modal | MISSING | reachable |
| Open the basket | MISSING | reachable |
| Fill the email | MISSING | reachable |
| Open the delivery dropdown | MISSING | reachable |
| Choose express | MISSING | reachable |
| Check out | MISSING | reachable |
| **Steps reachable** | 0/10 | 10/10 |
| **Task success (role locators only)** | false | true |
| Task completed with CSS assists | true | true |

## LLM loop (claude-sonnet-5-5, max 15 steps)

Skipped: ANTHROPIC_API_KEY is not set.

## WAO report on the fixture shop

```json
{
  "changes": [
    {
      "kind": "dialog",
      "target": "div#ov > div.modal",
      "attribute": "role",
      "value": "dialog"
    },
    {
      "kind": "role",
      "target": "div#hdr > span.tog",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#hdr > span.tog",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "role",
      "target": "div#hdr > div.go",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#hdr > div.go",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "role",
      "target": "div#hdr > span",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#hdr > span",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "role",
      "target": "div#list > div.prod > div.add",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#list > div.prod > div.add",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "role",
      "target": "div#list > div.prod > div.add",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#list > div.prod > div.add",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "role",
      "target": "div#list > div.prod > div.add",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#list > div.prod > div.add",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "role",
      "target": "div#ov > div.modal > div.x",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#ov > div.modal > div.x",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "role",
      "target": "div#cookie > div.ok",
      "attribute": "role",
      "value": "button"
    },
    {
      "kind": "focus",
      "target": "div#cookie > div.ok",
      "attribute": "tabindex",
      "value": "0"
    },
    {
      "kind": "name",
      "target": "div#hdr > span.tog",
      "attribute": "aria-label",
      "value": "Menu",
      "source": "icon"
    },
    {
      "kind": "name",
      "target": "input#q",
      "attribute": "aria-label",
      "value": "Search",
      "source": "field-name"
    },
    {
      "kind": "name",
      "target": "div#hdr > div.go",
      "attribute": "aria-label",
      "value": "Search",
      "source": "icon"
    },
    {
      "kind": "name",
      "target": "div#hdr > a",
      "attribute": "aria-label",
      "value": "Shopping cart",
      "source": "icon"
    },
    {
      "kind": "name",
      "target": "div#list > div.prod > div.add",
      "attribute": "aria-label",
      "value": "Add Steel Kettle to basket",
      "source": "tooltip"
    },
    {
      "kind": "name",
      "target": "div#list > div.prod > div.add",
      "attribute": "aria-label",
      "value": "Add Retro Toaster to basket",
      "source": "tooltip"
    },
    {
      "kind": "name",
      "target": "div#list > div.prod > div.add",
      "attribute": "aria-label",
      "value": "Add Enamel Mug to basket",
      "source": "tooltip"
    },
    {
      "kind": "name",
      "target": "div#ov > div.modal > div.x",
      "attribute": "aria-label",
      "value": "Close",
      "source": "icon"
    },
    {
      "kind": "landmark",
      "target": "div#content",
      "attribute": "role",
      "value": "main"
    }
  ],
  "issues": []
}
```

## Real sites (load and snapshot only)

| Site | Variant | Chars | Tokens | Interactive | Named | Unnamed | DOM interactive | WAO changes | WAO issues | Differing pixels (viewport) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| https://www.berkshirehathaway.com/ | without | 5380 | 1345 | 18 | 18 | 0 | 18 |  |  |  |
| https://www.berkshirehathaway.com/ | with | 5380 | 1345 | 18 | 18 | 0 | 18 | 0 | 1 | 0 |
| https://news.ycombinator.com/ | without | 40735 | 10184 | 224 | 222 | 2 | 231 |  |  |  |
| https://news.ycombinator.com/ | with | 40559 | 10140 | 224 | 223 | 1 | 231 | 31 | 4 | 0 |

Live sites change and animate, so a few differing pixels there are not WAO.
