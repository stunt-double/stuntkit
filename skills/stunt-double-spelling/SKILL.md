---
name: stunt-double-spelling
description: Use when localising English spelling between American, British and Canadian with @stunt-double/spelling, for example serving one site in en-US and en-GB, normalising user-facing copy or generated text to a house spelling, or flagging off-style spellings in CI. Also use when a word is not being converted and needs adding to the dictionary.
---

# Spelling localisation (`@stunt-double/spelling`)

Whole-word, dictionary-based rewriting between `'american'`, `'british'` and `'canadian'`, from source in either American or British. No dependencies; runs in browsers, Node 20+ and workers.

Install: `pnpm add @stunt-double/spelling`. Until the scope is on npm it is on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

```ts
import { localiseSpelling } from '@stunt-double/spelling';

localiseSpelling('Organize the color of the center.', 'british'); // 'Organise the colour of the centre.'
```

## Rules of use

- **Map locales, do not invent systems.** `en-US` to `'american'`, `en-CA` to `'canadian'`, and `en-GB`, `en-AU`, `en-NZ`, `en-IE`, `en-IN`, `en-SG`, `en-ZA` to `'british'`.
- **Compare by identity.** It returns the same string when nothing changed, so `if (next !== text) node.nodeValue = next` skips needless DOM writes.
- **Prose only.** Skip `code`, `pre`, `kbd`, `script`, `style`, inputs, and anything marked as exact wording (product names, quotes, legal text). Give such elements an attribute your walker checks, for example `data-no-localise`.
- **Server render when you can.** Localising on the server avoids a flash of the source spelling; in the browser, run the pass after hydration so React does not see a mismatch.
- **Trust the ambiguity rules.** It deliberately leaves words that are correct in both systems with different meanings ("practice", "license", "program", "check", "meter"), and keeps identifiers (`color.com`, `/center`, `color_scheme`). Do not "fix" these with a regex afterwards.

## Browser pass

```ts
function localisePage(root: Node, system: SpellingSystem): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('code, pre, script, style, [data-no-localise]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    const next = localiseSpelling(text, system);
    if (next !== text) node.nodeValue = next;
  }
}
```

## Checking copy in CI

`spellingDictionary(system)` returns the lowercase source-to-target map. To flag American spellings in British copy, tokenise into words and report any whose lowercase form is a key of `spellingDictionary('british')`.

## A word is not converted

That is by design: nothing is rewritten by pattern, because "promise", "expertise" and "tour" would break. Add the word's stem to the matching list in `packages/spelling/src/spelling.ts` in the stuntkit repository (the "-ise", "-our", "-re" and doubled "l" lists, or the one-off words), with a test, and open a pull request.
