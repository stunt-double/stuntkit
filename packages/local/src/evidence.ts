// A verdict's evidence on the page: found, scrolled into view and captured.
//
// Ported from the cloud runner's evidence focus: one `page.evaluate` that finds
// the region a check was judged on (a selector first, then the smallest
// rendered element whose text contains the cited fragment) and scrolls it to
// the middle of the viewport, so a check about the footer is illustrated by the
// footer rather than by wherever the actor stopped.
//
// Locally it also does the cloud's judge's least job without a model: a passed
// verdict has to cite something that is on the page right now. A failure may
// cite an absence, so for a failure the search is only for the screenshot.

import type { DriverPage } from '@stuntkit/browser-toolset/driver';

import type { Locator } from './files.ts';

/** Matching is a case-insensitive substring test, so a long quote adds nothing. */
export const MAX_LOCATOR_TEXT = 120;
const MAX_LOCATOR_SELECTOR = 400;
/** Lets lazy images and sticky headers settle after the scroll. */
const SETTLE_MS = 350;
/** A hung page must not hold the run: every tool call waits on this one. */
const FIND_TIMEOUT_MS = 5_000;

type Query = { selector: string | null; text: string | null };
export type FoundVia = 'selector' | 'text' | null;

export function cleanLocator(locator: Locator | undefined): Query {
  const clean = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim() || null;
  const selector = clean(locator?.selector);
  return {
    selector: selector && selector.length <= MAX_LOCATOR_SELECTOR ? selector : null,
    text: clean(locator?.text)?.slice(0, MAX_LOCATOR_TEXT) ?? null,
  };
}

/**
 * Find the evidence and scroll it to the centre. Never throws: a page that is
 * navigating or a selector the page rejects is a miss, not a lost verdict.
 */
export async function focusEvidence(
  page: DriverPage,
  query: Query,
  timeoutMs = FIND_TIMEOUT_MS
): Promise<FoundVia> {
  if (!query.selector && !query.text) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const via = await Promise.race([
    page.evaluate(findAndScroll, query),
    new Promise<null>((ok) => (timer = setTimeout(() => ok(null), timeoutMs))),
  ])
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  if (via) await page.waitForTimeout(SETTLE_MS).catch(() => {});
  return via;
}

/**
 * Runs in the page, serialised with `toString()`, so it closes over nothing but
 * its argument. Text is matched against what a person reads on screen: rendered
 * text (`innerText`, which leaves out hidden elements and breaks lines at `<br>`
 * and blocks), open shadow roots included, plus the labels a control shows
 * without text content (placeholder, aria-label, alt, title, an input's value).
 * ponytail: frames are not searched, and text faded to opacity 0 inside a
 * visible parent still counts; search each frame through Playwright if a
 * check's evidence lives in one.
 */
function findAndScroll(query: Query): FoundVia {
  const centre: ScrollIntoViewOptions = { block: 'center', inline: 'center' };
  const shown = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
    );
  };
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').toLowerCase();
  const wanted = query.text ? norm(query.text) : null;
  const labelled = (el: Element, fragment: string) => {
    const labels = ['placeholder', 'aria-label', 'alt', 'title'].map((a) => el.getAttribute(a));
    if ('value' in el && typeof el.value === 'string') labels.push(el.value);
    return labels.some((l) => norm(l).includes(fragment));
  };
  const rendered = (el: Element) => norm(el instanceof HTMLElement ? el.innerText : '');

  if (query.selector) {
    let matches: Element[] = [];
    try {
      matches = Array.from(document.querySelectorAll(query.selector));
    } catch {
      // A selector the page cannot parse is a miss.
    }
    // The page itself is not evidence of anything, and with text given the
    // element has to show it.
    const el = matches.find(
      (m) =>
        m !== document.documentElement &&
        m !== document.body &&
        m.tagName !== 'MAIN' &&
        shown(m) &&
        (!wanted || labelled(m, wanted) || rendered(m).includes(wanted))
    );
    if (el) {
      el.scrollIntoView(centre);
      return 'selector';
    }
  }
  if (!wanted) return null;

  const elements: Element[] = [];
  const collect = (root: ParentNode) => {
    for (const el of Array.from(root.querySelectorAll('*'))) {
      elements.push(el);
      if (el.shadowRoot) collect(el.shadowRoot);
    }
  };
  collect(document.body);
  let best: Element | null = null;
  let bestLength = Number.POSITIVE_INFINITY;
  for (const el of elements) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
    // The smallest element containing the fragment is the one that shows it:
    // every ancestor contains it too. A label belongs to the element itself.
    let length = 0;
    if (!labelled(el, wanted)) {
      const text = rendered(el);
      length = text.includes(wanted) ? text.length : Number.POSITIVE_INFINITY;
    }
    if (length >= bestLength || !shown(el)) continue;
    best = el;
    bestLength = length;
  }
  if (!best) return null;
  best.scrollIntoView(centre);
  return 'text';
}
