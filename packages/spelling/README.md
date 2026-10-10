# @stunt-double/spelling

Whole-word English spelling localisation. Rewrites text into British, American or Canadian spelling, from source written in either American or British English.

```ts
import { localiseSpelling } from '@stunt-double/spelling';

localiseSpelling('Organize the color of the center.', 'british');
// 'Organise the colour of the centre.'

localiseSpelling('Analyse the cancelled catalogue.', 'american');
// 'Analyze the canceled catalog.'

localiseSpelling('Organise the colour of the centre.', 'canadian');
// 'Organize the colour of the centre.'
```

Extracted from [Stunt Double](https://stuntdouble.io), whose public sites are written in American English and rewritten in the browser for visitors who read British or Canadian spelling.

## Install

```sh
pnpm add @stunt-double/spelling
# or: npm install @stunt-double/spelling
```

Until the `@stunt-double` scope is available on npm, packages are published to [GitHub Packages](https://github.com/orgs/stunt-double/packages): add `@stunt-double:registry=https://npm.pkg.github.com` and a GitHub token with `read:packages` to your `.npmrc`.

No dependencies. Runs anywhere JavaScript does (browsers, Node 20 or later, workers).

## How it works

Every rewrite is a whole word, looked up exactly in a dictionary generated from stems and the suffixes they take (`organ` + `ise`, `ised`, `isation`, ... and the prefixed forms `re`, `un`, `dis`, ...). Nothing is rewritten by pattern alone, because no pattern is safe: "promise", "enterprise", "expertise" and "otherwise" keep their "-ise" in American English, and "four", "hour" and "tour" keep their "-our". A word that is not in the dictionary stays as written.

- **Both directions.** Each system normalises from either source spelling, so a British word left in American copy still comes out American.
- **Ambiguous words are left alone.** Words that are correct in both systems with different meanings ("practice" the British noun, "license" the British verb, "check", "story", "program", "meter") are never rewritten towards British, and "analyses" is never rewritten towards American.
- **Case is carried.** `Color` becomes `Colour` and `COLOR` becomes `COLOUR`. Mixed case (`iOrganize`) is treated as a name and kept.
- **Identifiers are kept.** A word that is part of a domain, path, address or snake_case name (`color.com`, `/center`, `center@`, `color_scheme`) keeps its spelling.
- **Identity on no change.** When nothing matches, the same string is returned, so a caller can compare by identity to skip a DOM write.

Canadian spelling takes "-our", "-re" and the doubled "l" from British, and "-ize", "-yze" and words such as "program", "check" and "skeptical" from American.

## API

### `localiseSpelling(text, system)`

Rewrites `text` into `system` (`'british' | 'american' | 'canadian'`). Returns the input string itself when nothing changed.

### `spellingDictionary(system)`

The lowercase word map for a system, source spelling to target, built on first use and cached. Useful for checks and tooling, for example flagging words a style guide should catch.

### `SpellingSystem`

`'british' | 'american' | 'canadian'`. Australia, New Zealand, Ireland and most of the Commonwealth use `'british'`.

## Rewriting a page in the browser

The package works on strings, so it fits any rendering approach. A minimal pass over a page's text nodes:

```ts
import { localiseSpelling, type SpellingSystem } from '@stunt-double/spelling';

function localisePage(root: Node, system: SpellingSystem): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    const next = localiseSpelling(text, system);
    if (next !== text) node.nodeValue = next;
  }
}
```

Skip `code`, `pre` and anything else where text is not prose.

## Adding words

The dictionary is a set of stem lists in `src/spelling.ts`, one per rule ("-ise" to "-ize", "-our" to "-or", "-re" to "-er", doubled "l"), plus a list of one-off words. To cover a new word, add its stem to the list it belongs to, with a test.

## Licence

[Apache-2.0](./LICENSE)
