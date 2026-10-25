// Whether a site sells something, from what the probe already fetched (no
// extra requests). Pricing checks only apply to a site with a price to
// disclose: a publication, docs site, charity or government service is not
// marked down for "pricing not disclosed".
//
// Kept free of runtime imports so `node --test` can exercise it.

import type { Monetisation } from './monetisation-model.ts';

export type MonetisationSignals = {
  /** Every `href` on the homepage, as written. */
  anchors: ReadonlyArray<string>;
  /** The homepage's visible text. */
  text: string;
  /** The homepage's raw HTML, for payment scripts. */
  raw: string;
  /** Where the homepage landed, to resolve relative hrefs against. */
  pageUrl: string;
  /** `/pricing` answers. */
  pricingPage: boolean;
  /** Product / Offer JSON-LD is present. */
  offerSchema: boolean;
  /** A Universal Commerce Protocol discovery endpoint answers. */
  ucp: boolean;
};

export type MonetisationDetection = { monetised: boolean; evidence: string };

export const PRICE_RE = /(?:\$|€|£|¥|₹|A\$|USD|AUD|EUR|GBP)\s*\d[\d.,]*/;

// Payment/commerce rails that ship agentic checkout support upstream:
// Stripe merchants inherit Shared Payment Tokens (ACP), Shopify merchants
// inherit UCP/Instant Checkout plumbing, PayPal runs an ACP server.
export const COMMERCE_RAILS: Array<{ id: string; re: RegExp }> = [
  { id: 'Stripe', re: /js\.stripe\.com|checkout\.stripe\.com/i },
  { id: 'Shopify', re: /cdn\.shopify\.com|myshopify\.com|shopify\.com\/checkouts/i },
  { id: 'PayPal', re: /paypal\.com\/sdk|paypalobjects\.com/i },
];

// A path segment that is somewhere to see a price or pay one.
const COMMERCE_PATH_RE =
  /(?:^|\/)(?:pricing|prices|plans?|cart|basket|bag|checkout|shop|store|buy|order|upgrade|subscriptions?|products?)(?:\/|$|\.)/i;

// Copy that only a site selling something carries. Bare "subscribe" is left
// out: every newsletter says it.
const COMMERCE_COPY_RE =
  /\b(pricing|add to (?:cart|bag|basket)|buy now|shop now|free trial|start (?:a |your )?(?:free )?trial|per month|per year|per user|billed (?:monthly|annually|yearly)|contact sales|book now)\b/i;

/** Below this much server-rendered text the homepage is probably an app shell. */
const MIN_TEXT_FOR_EVIDENCE = 500;

function commerceLink(anchors: ReadonlyArray<string>, pageUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }
  const apex = base.hostname.replace(/^www\./, '');
  for (const href of anchors) {
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    const host = url.hostname.replace(/^www\./, '');
    if (host !== apex && !host.endsWith(`.${apex}`)) continue;
    if (COMMERCE_PATH_RE.test(url.pathname)) return url.pathname;
  }
  return null;
}

export function detectMonetisation(s: MonetisationSignals): MonetisationDetection {
  // A client-rendered shell gives no evidence either way, so it stays scored.
  if (s.text.length < MIN_TEXT_FOR_EVIDENCE)
    return { monetised: true, evidence: 'too little server-rendered text to tell' };
  if (PRICE_RE.test(s.text)) return { monetised: true, evidence: 'price on the homepage' };
  if (s.pricingPage) return { monetised: true, evidence: '/pricing page' };
  if (s.offerSchema) return { monetised: true, evidence: 'Product/Offer JSON-LD' };
  if (s.ucp) return { monetised: true, evidence: 'UCP discovery endpoint' };
  const rail = COMMERCE_RAILS.find((r) => r.re.test(s.raw));
  if (rail) return { monetised: true, evidence: `${rail.id} on the homepage` };
  const link = commerceLink(s.anchors, s.pageUrl);
  if (link) return { monetised: true, evidence: `links to ${link}` };
  const copy = COMMERCE_COPY_RE.exec(s.text);
  if (copy) return { monetised: true, evidence: `"${copy[1]}" on the homepage` };
  return { monetised: false, evidence: 'no price, pricing page, shop or payment signal' };
}

/**
 * Whether the pricing checks apply. The stored verdict (a caller's override,
 * else `index-classify-monetisation`) is the same one the report page shows,
 * so score and page agree. The probe's own detection only decides for a
 * domain with no verdict yet: its first score, since classification is
 * enqueued after that write, or one the classifier was unsure of.
 */
export function pricingApplies(stored: Monetisation | null, detect: () => boolean): boolean {
  if (stored) return stored === 'monetised';
  return detect();
}
