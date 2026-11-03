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

import type { DriverPage } from '@stunt-double/browser-toolset/driver';

import type { Locator } from './files.ts';

/** Matching is a case-insensitive substring test, so a long quote adds nothing. */
export const MAX_LOCATOR_TEXT = 120;
const MAX_LOCATOR_SELECTOR = 400;
/** Lets lazy images and sticky headers settle after the scroll. */
const SETTLE_MS = 350;

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
export async function focusEvidence(page: DriverPage, query: Query): Promise<FoundVia> {
  if (!query.selector && !query.text) return null;
  const via = await page.evaluate(findAndScroll, query).catch(() => null);
  if (via) await page.waitForTimeout(SETTLE_MS).catch(() => {});
  return via;
}

/**
 * Runs in the page, serialised with `toString()`, so it closes over nothing but
 * its argument. Text is matched against what a person reads on screen: element
 * text, plus the labels a control shows without text content (placeholder,
 * aria-label, alt, title, an input's value).
 */
function findAndScroll(query: Query): FoundVia {
  const centre: ScrollIntoViewOptions = { block: 'center', inline: 'center' };
  const shown = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && el.checkVisibility();
  };
  if (query.selector) {
    let el: Element | null;
    try {
      el = document.querySelector(query.selector);
    } catch {
      el = null; // A selector the page cannot parse is a miss.
    }
    if (el && shown(el)) {
      el.scrollIntoView(centre);
      return 'selector';
    }
  }
  if (!query.text) return null;
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').toLowerCase();
  const wanted = norm(query.text);
  let best: Element | null = null;
  let bestLength = Number.POSITIVE_INFINITY;
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
    const labels = ['placeholder', 'aria-label', 'alt', 'title'].map((a) => el.getAttribute(a));
    if ('value' in el && typeof el.value === 'string') labels.push(el.value);
    // The smallest element containing the fragment is the one that shows it:
    // every ancestor contains it too. A label belongs to the element itself.
    const text = norm(el.textContent);
    const length = labels.some((l) => norm(l).includes(wanted))
      ? 0
      : text.includes(wanted)
        ? text.length
        : Number.POSITIVE_INFINITY;
    if (length >= bestLength || !shown(el)) continue;
    best = el;
    bestLength = length;
  }
  if (!best) return null;
  best.scrollIntoView(centre);
  return 'text';
}
