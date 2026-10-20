# Integrations

## Picking the system

```ts
import type { SpellingSystem } from '@stunt-double/localeizer';

const BRITISH_REGIONS = new Set([
  'GB',
  'UK',
  'AU',
  'NZ',
  'IE',
  'IN',
  'SG',
  'ZA',
  'HK',
  'MY',
  'PK',
  'NG',
  'KE',
]);

export function spellingFor(
  locale: string | undefined,
  fallback: SpellingSystem = 'american'
): SpellingSystem {
  const [lang, region] = (locale ?? '').replace('_', '-').split('-');
  if (lang?.toLowerCase() !== 'en') return fallback;
  const r = region?.toUpperCase();
  if (r === 'US') return 'american';
  if (r === 'CA') return 'canadian';
  if (r && BRITISH_REGIONS.has(r)) return 'british';
  return fallback;
}

/** From an Accept-Language header: the first English entry wins. */
export function spellingFromHeader(
  header: string | null,
  fallback?: SpellingSystem
): SpellingSystem {
  const first = (header ?? '')
    .split(',')
    .map((part) => part.split(';')[0]!.trim())
    .find((tag) => tag.toLowerCase().startsWith('en'));
  return spellingFor(first, fallback);
}
```

Let a user's explicit choice (a locale route, a setting) beat the header.

## Server rendering

Localise strings before they are rendered, so the HTML is already right.

**Message catalogues.** Write one English catalogue in your source spelling and derive the others at build time:

```ts
import { localiseSpelling, type SpellingSystem } from '@stunt-double/localeizer';

export function localiseMessages<T extends Record<string, string>>(
  messages: T,
  system: SpellingSystem
): T {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [key, localiseSpelling(value, system)])
  ) as T;
}
```

Placeholders such as `{count}` and ICU syntax are untouched, since only dictionary words change.

**Next.js App Router.** Read the system in a server component (`headers().get('accept-language')` or the `[locale]` segment) and pass localised strings down; do not localise inside client components on the server and again in the browser.

**Markdown or MDX.** Localise text nodes in a remark plugin, skipping `code` and `inlineCode` nodes, rather than the raw source (which would touch URLs in link syntax less safely).

## In the browser

For a client-only app or a page you do not render:

```ts
import { localiseSpelling, type SpellingSystem } from '@stunt-double/localeizer';

const SKIP = 'code, pre, kbd, samp, script, style, textarea, [contenteditable], [data-no-localise]';

function localiseNode(node: Text, system: SpellingSystem): void {
  if (node.parentElement?.closest(SKIP)) return;
  const text = node.nodeValue ?? '';
  const next = localiseSpelling(text, system);
  if (next !== text) node.nodeValue = next;
}

export function localisePage(root: Node, system: SpellingSystem): () => void {
  const walk = (start: Node) => {
    if (start.nodeType === Node.TEXT_NODE) return localiseNode(start as Text, system);
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) localiseNode(n as Text, system);
  };
  walk(root);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') localiseNode(r.target as Text, system);
      r.addedNodes.forEach(walk);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  return () => observer.disconnect();
}
```

The identity check stops the observer looping on its own writes. Attributes users read (`title`, `alt`, `placeholder`, `aria-label`) are not text nodes: localise them too if they hold prose.

**React.** Run the pass in a root `useEffect`, after hydration:

```tsx
useEffect(() => localisePage(document.body, system), [system]);
```

If React re-renders a localised node it writes its own string back, and the observer localises it again. For components you own, prefer a hook over the DOM pass:

```ts
import { localiseSpelling, type SpellingSystem } from '@stunt-double/localeizer';
import { createContext, useCallback, useContext } from 'react';

export const SpellingContext = createContext<SpellingSystem>('american');

export function useSpelling(): (text: string) => string {
  const system = useContext(SpellingContext);
  return useCallback((text: string) => localiseSpelling(text, system), [system]);
}
```

## LLM and generated text

Models drift between spellings. Normalise the final text before it reaches the user or a store:

```ts
const reply = localiseSpelling(completion.text, houseSpelling);
```

For streaming, localise per completed word or sentence, not per token: a token boundary can split "colo" from "ur".

## Checking copy in CI

```ts
import { readFileSync } from 'node:fs';
import { spellingDictionary, type SpellingSystem } from '@stunt-double/localeizer';

export function offStyle(text: string, system: SpellingSystem): string[] {
  const dictionary = spellingDictionary(system);
  const found = new Set<string>();
  for (const match of text.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)) {
    const word = match[0].toLowerCase();
    const target = dictionary.get(word);
    if (target && target !== word) found.add(`${match[0]} -> ${target}`);
  }
  return [...found];
}

let failed = false;
for (const file of process.argv.slice(2)) {
  const hits = offStyle(readFileSync(file, 'utf8'), 'british');
  if (hits.length) {
    failed = true;
    console.error(`${file}: ${hits.join(', ')}`);
  }
}
process.exit(failed ? 1 : 0);
```

Run it over content files (Markdown, JSON message catalogues), not source code, where identifiers such as `color` are correct. To fix rather than flag, write `localiseSpelling(text, system)` back to the file and review the diff.
