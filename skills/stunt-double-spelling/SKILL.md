---
name: stunt-double-spelling
description: Use when localising English spelling between American, British and Canadian with @stunt-double/spelling, for example serving one site in en-US and en-GB, picking the spelling from Accept-Language or a locale route, normalising user-facing copy, emails or LLM output to a house spelling, rewriting a page in the browser without hydration mismatches, or flagging off-style spellings in CI. Also use when a word is not being converted and needs adding to the dictionary.
---

# Spelling localisation (`@stunt-double/spelling`)

Whole-word, dictionary-based rewriting into `'american'`, `'british'` or `'canadian'`, from source in either American or British. No dependencies; browsers, Node 20+, workers and edge runtimes.

```sh
pnpm add @stunt-double/spelling
```

Releases are on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

```ts
import { localiseSpelling, spellingDictionary, type SpellingSystem } from '@stunt-double/spelling';

localiseSpelling('Organize the color of the center.', 'british'); // 'Organise the colour of the centre.'
localiseSpelling('Analyse the cancelled catalogue.', 'american'); // 'Analyze the canceled catalog.'
localiseSpelling('Organise the colour of the centre.', 'canadian'); // 'Organize the colour of the centre.'
```

That is the whole API: `localiseSpelling(text, system)`, `spellingDictionary(system)` (a cached lowercase source-to-target `ReadonlyMap`), and the `SpellingSystem` type.

## Rules of use

- **Map locales, do not invent systems.** `en-US` to `'american'`, `en-CA` to `'canadian'`, and `en-GB`, `en-AU`, `en-NZ`, `en-IE`, `en-IN`, `en-SG`, `en-ZA` (most of the Commonwealth) to `'british'`. Anything unknown falls back to your source spelling.
- **Compare by identity.** It returns the same string when nothing changed: `if (next !== text) node.nodeValue = next` skips needless DOM writes.
- **Prose only.** Skip `code`, `pre`, `kbd`, `samp`, `script`, `style`, `textarea`, form values, and anything marked as exact wording (product names, quotes, legal text) with an attribute your walker checks, such as `data-no-localise`.
- **Server render when you can.** Localising on the server avoids a flash of the source spelling. In the browser, run the pass after hydration so React, Vue or Svelte never see a mismatch.
- **Trust the ambiguity rules.** It leaves words that are correct in both systems with different meanings ("practice", "license", "program", "check", "meter", "story") and keeps identifiers (`color.com`, `/center`, `center@`, `color_scheme`). Do not "fix" these with a regex afterwards.
- **Case is carried** (`Color` to `Colour`, `COLOR` to `COLOUR`); mixed case (`iOrganize`) is treated as a name and kept.

## Where to put it

| Rendering                                  | Do this                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Static or server-rendered strings          | Localise the copy before render (message catalogues, MDX, CMS output)                      |
| Next.js, Remix, SvelteKit server rendering | Pick the system from the route or `Accept-Language`, localise strings in the server render |
| A client-only app or a third-party page    | One text-node pass after hydration, plus a `MutationObserver` for later content            |
| Emails, notifications, LLM output          | Localise the final string before sending                                                   |
| Copy review                                | A CI check over `spellingDictionary(system)`                                               |

Recipes for each, including a locale picker, a React hook, a DOM pass with an observer, and a CI checker: [references/integrations.md](references/integrations.md).

## Canadian

Canadian takes "-our", "-re" and the doubled "l" from British, and "-ize", "-yze" and words such as "program", "check" and "skeptical" from American. Do not approximate it with either.

## A word is not converted

By design: nothing is rewritten by pattern, because "promise", "expertise", "four" and "tour" would break. The dictionary is stem lists in `packages/spelling/src/spelling.ts` of the stuntkit repository: "-ise"/"-ize" (`IZE_STEMS`), "-yse"/"-yze" (`YZE_STEMS`), "-our"/"-or" (`OUR_STEMS`), "-re"/"-er" (`RE_STEMS`), doubled "l" (`DOUBLE_L_STEMS`), each combined with its suffixes and the prefixes `un`, `re`, `de`, `dis`, `mis`, `non`, `pre`, `over`, `under`, `auto`; plus one-off pairs in `AMERICAN_WORDS` (British to American) and Canadian exceptions in `CANADIAN_AMERICAN_WORDS`. Add the stem to the list it belongs to, with a test in `spelling.test.ts`, and open a pull request. Until it lands, post-process only that exact word, never a pattern.
