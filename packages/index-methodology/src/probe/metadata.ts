import { normaliseCategoryTags } from './category-tags.ts';
import { buildUrl } from './fetch.ts';
import { flattenJsonLd, type ParsedHtml } from './parse.ts';
import type { DomainProbe } from './probe.ts';

export type DomainMetadata = {
  faviconUrl: string | null;
  iconUrl: string | null;
  themeColor: string | null;
  title: string | null;
  description: string | null;
  locale: string | null;
  locales: string[];
  markets: string[];
  audience: string | null;
  keywords: string[];
  categoryTags: string[];
};

const COUNTRY_TLD_MARKETS: Record<string, string> = {
  au: 'AU',
  nz: 'NZ',
  uk: 'GB',
  gb: 'GB',
  ie: 'IE',
  de: 'DE',
  fr: 'FR',
  it: 'IT',
  es: 'ES',
  nl: 'NL',
  se: 'SE',
  no: 'NO',
  dk: 'DK',
  fi: 'FI',
  jp: 'JP',
  kr: 'KR',
  cn: 'CN',
  hk: 'HK',
  sg: 'SG',
  in: 'IN',
  br: 'BR',
  mx: 'MX',
  ca: 'CA',
  us: 'US',
  za: 'ZA',
  ae: 'AE',
};

const CURRENCY_MARKETS: Record<string, string> = {
  AUD: 'AU',
  NZD: 'NZ',
  GBP: 'GB',
  EUR: 'EU',
  USD: 'US',
  CAD: 'CA',
  JPY: 'JP',
  KRW: 'KR',
  CNY: 'CN',
  HKD: 'HK',
  SGD: 'SG',
  INR: 'IN',
  BRL: 'BR',
  MXN: 'MX',
  ZAR: 'ZA',
};

const AUDIENCE_KEYWORDS: Array<{ audience: string; terms: RegExp[] }> = [
  {
    audience: 'developer',
    terms: [/\bapi\b/i, /\bsdk\b/i, /\bdeveloper(?:s)?\b/i, /\bdocumentation\b/i, /\bcli\b/i],
  },
  {
    audience: 'enterprise',
    terms: [/\benterprise\b/i, /\bsso\b/i, /\bsoc\s?2\b/i, /\bslas?\b/i, /\bdedicated tenant\b/i],
  },
  {
    audience: 'b2b',
    terms: [
      /\bfor teams\b/i,
      /\bfor business(?:es)?\b/i,
      /\bb2b\b/i,
      /\bprocurement\b/i,
      /\bvendor\b/i,
    ],
  },
  {
    audience: 'consumer',
    terms: [
      /\bshop (?:now|the)\b/i,
      /\bfree shipping\b/i,
      /\bmy account\b/i,
      /\bsign up free\b/i,
      /\bgift cards?\b/i,
    ],
  },
];

// `pageUrl` is where the homepage landed after redirects, so a relative href
// resolves the way a browser on that page would resolve it.
function absoluteUrl(href: string, pageUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

function pickFavicon(
  html: ParsedHtml,
  pageUrl: string,
  origin: string
): { favicon: string | null; icon: string | null } {
  type Candidate = { href: string; rel: string; size: number; type?: string };
  const candidates: Candidate[] = [];
  for (const link of html.linkRels) {
    const rel = link.rel.toLowerCase();
    if (!rel.includes('icon')) continue;
    const sizes = /(\d+)x(\d+)/.exec(rel + ' ' + (link.type ?? '') + ' ' + link.href);
    const size = sizes ? parseInt(sizes[1], 10) : 0;
    candidates.push({ href: link.href, rel, size, type: link.type });
  }

  const apple = candidates.find((c) => c.rel.includes('apple-touch-icon'));
  const high = candidates.filter((c) => c.size >= 96).sort((a, b) => b.size - a.size)[0];
  const anyIcon = candidates[0];

  const iconLink = apple ?? high ?? null;
  const faviconLink = high ?? anyIcon ?? apple ?? null;

  const fallback = buildUrl(origin, '/favicon.ico');

  return {
    favicon: faviconLink ? absoluteUrl(faviconLink.href, pageUrl) : fallback,
    icon: iconLink ? absoluteUrl(iconLink.href, pageUrl) : null,
  };
}

/**
 * Names the site states for itself, as opposed to page titles: `og:site_name`,
 * the installable app's name, and a JSON-LD `WebSite` or `Organization` name.
 */
export function pickDeclaredNames(html: ParsedHtml): string[] {
  const meta = html.meta;
  const fromJsonLd = flattenJsonLd(html.jsonLd).flatMap((node) => {
    const t = node['@type'];
    const types = (Array.isArray(t) ? t : [t]).map((x) => String(x).toLowerCase());
    const named = types.some((x) => x === 'website' || x === 'organization' || x === 'corporation');
    return named && typeof node.name === 'string' ? [node.name] : [];
  });
  return [
    meta['og:site_name'],
    meta['application-name'],
    meta['apple-mobile-web-app-title'],
    ...fromJsonLd,
  ].filter((n): n is string => !!n && !!n.trim());
}

function pickTitle(html: ParsedHtml): string | null {
  const meta = html.meta;
  return (
    meta['og:title'] ||
    meta['twitter:title'] ||
    meta['application-name'] ||
    meta['apple-mobile-web-app-title'] ||
    html.title ||
    null
  );
}

function pickDescription(html: ParsedHtml): string | null {
  const meta = html.meta;
  const raw = meta['og:description'] || meta['twitter:description'] || meta['description'] || null;
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > 320 ? cleaned.slice(0, 317) + '…' : cleaned;
}

function pickOgImage(html: ParsedHtml, pageUrl: string): string | null {
  const src =
    html.meta['og:image'] || html.meta['og:image:secure_url'] || html.meta['twitter:image'] || null;
  return src ? absoluteUrl(src, pageUrl) : null;
}

function pickLocale(html: ParsedHtml): string | null {
  const htmlLang = /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html.raw);
  if (htmlLang) return htmlLang[1].toLowerCase();
  if (html.meta['og:locale']) return html.meta['og:locale'].toLowerCase().replace('_', '-');
  if (html.meta['content-language']) return html.meta['content-language'].toLowerCase();
  return null;
}

function pickAlternateLocales(html: ParsedHtml): string[] {
  const set = new Set<string>();
  const ALT_RE = /<link\b[^>]*\brel\s*=\s*["']alternate["'][^>]*>/gi;
  const HREFLANG_RE = /hreflang\s*=\s*["']([^"']+)["']/i;
  let m: RegExpExecArray | null;
  while ((m = ALT_RE.exec(html.raw))) {
    const hl = HREFLANG_RE.exec(m[0]);
    // `x-default` is hreflang's fallback marker, not a locale.
    if (hl && hl[1] && hl[1].toLowerCase() !== 'x-default') set.add(hl[1].toLowerCase());
  }
  const alt = html.meta['og:locale:alternate'];
  if (alt) set.add(alt.toLowerCase().replace('_', '-'));
  return Array.from(set);
}

function pickKeywords(html: ParsedHtml): string[] {
  const out = new Set<string>();
  const raw = html.meta['keywords'] || html.meta['news_keywords'] || '';
  for (const k of raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    out.add(k.toLowerCase());
  }
  for (const [key, value] of Object.entries(html.meta)) {
    if (key === 'article:tag' || key.startsWith('article:tag')) {
      value
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((t) => out.add(t.toLowerCase()));
    }
  }
  return Array.from(out).slice(0, 24);
}

function pickCategoryTags(html: ParsedHtml): string[] {
  const values: unknown[] = [html.meta['article:section']];
  for (const obj of flattenJsonLd(html.jsonLd)) {
    for (const field of [obj['category'], obj['articleSection'], obj['genre'], obj['keywords']]) {
      if (Array.isArray(field)) values.push(...field);
      else values.push(field);
    }
  }
  return normaliseCategoryTags(values);
}

function detectMarkets(
  html: ParsedHtml,
  domain: string,
  locale: string | null,
  locales: string[]
): string[] {
  const markets = new Set<string>();

  const tld = domain.split('.').pop()?.toLowerCase() ?? '';
  const secondTld = domain.split('.').slice(-2, -1)[0]?.toLowerCase() ?? '';
  const maybeTldMarket = COUNTRY_TLD_MARKETS[tld];
  if (maybeTldMarket) markets.add(maybeTldMarket);
  // e.g. example.co.uk → 'uk' is the SLD
  if (secondTld === 'co' || secondTld === 'com' || secondTld === 'ac' || secondTld === 'org') {
    const cctld = domain.split('.').slice(-1)[0]?.toLowerCase();
    if (cctld && COUNTRY_TLD_MARKETS[cctld]) markets.add(COUNTRY_TLD_MARKETS[cctld]);
  }

  const addLocaleMarket = (code: string | null) => {
    if (!code) return;
    const region = code.split('-')[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) markets.add(region);
  };
  addLocaleMarket(locale);
  locales.forEach(addLocaleMarket);

  const geoRegion = html.meta['geo.region'];
  if (geoRegion) {
    for (const part of geoRegion.split(/[,;]/)) {
      const m = /^([A-Z]{2})(?:[-.][A-Z0-9]+)?$/i.exec(part.trim());
      if (m) markets.add(m[1].toUpperCase());
    }
  }
  const geoCountry = html.meta['geo.country'];
  if (geoCountry && /^[A-Z]{2}$/i.test(geoCountry.trim())) {
    markets.add(geoCountry.trim().toUpperCase());
  }

  const currencies = new Set<string>();
  for (const obj of flattenJsonLd(html.jsonLd)) {
    const ac = obj['availableCountry'];
    if (typeof ac === 'string') markets.add(ac.toUpperCase());
    else if (Array.isArray(ac))
      ac.forEach((c) => typeof c === 'string' && markets.add(c.toUpperCase()));
    const cc = obj['priceCurrency'];
    if (typeof cc === 'string') currencies.add(cc.toUpperCase());
    const offers = obj['offers'];
    if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
      const c = (offers as Record<string, unknown>)['priceCurrency'];
      if (typeof c === 'string') currencies.add(c.toUpperCase());
    }
  }
  const ogCurrency = html.meta['product:price:currency'] ?? html.meta['og:price:currency'];
  if (ogCurrency) currencies.add(ogCurrency.toUpperCase());

  for (const c of currencies) {
    const m = CURRENCY_MARKETS[c];
    if (m) markets.add(m);
  }

  return Array.from(markets).slice(0, 16);
}

function detectAudience(html: ParsedHtml): string | null {
  const haystack = `${html.title ?? ''} ${html.meta['description'] ?? ''} ${html.text}`.slice(
    0,
    8000
  );
  let best: { audience: string; hits: number } | null = null;
  for (const group of AUDIENCE_KEYWORDS) {
    let hits = 0;
    for (const re of group.terms) if (re.test(haystack)) hits++;
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { audience: group.audience, hits };
    }
  }
  return best?.audience ?? null;
}

function pickThemeColor(html: ParsedHtml): string | null {
  const raw = html.meta['theme-color'] ?? html.meta['msapplication-tilecolor'];
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed) || /^(rgb|hsl|oklch)\(/i.test(trimmed)) return trimmed;
  return null;
}

export function extractDomainMetadata(probe: DomainProbe): DomainMetadata {
  const { html, domain, origin } = probe;
  if (!html) {
    return {
      faviconUrl: probe.favicon.ok ? buildUrl(origin, '/favicon.ico') : null,
      iconUrl: null,
      themeColor: null,
      title: null,
      description: null,
      locale: null,
      locales: [],
      markets: [],
      audience: null,
      keywords: [],
      categoryTags: [],
    };
  }

  // `html` exists only when the homepage answered, so `finalUrl` is real here.
  const pageUrl = probe.homepage.finalUrl;
  const { favicon, icon } = pickFavicon(html, pageUrl, origin);
  const ogImage = pickOgImage(html, pageUrl);
  const locale = pickLocale(html);
  const locales = pickAlternateLocales(html);
  const markets = detectMarkets(html, domain, locale, locales);

  return {
    faviconUrl: favicon,
    iconUrl: icon ?? ogImage,
    themeColor: pickThemeColor(html),
    title: pickTitle(html),
    description: pickDescription(html),
    locale,
    locales,
    markets,
    audience: detectAudience(html),
    keywords: pickKeywords(html),
    categoryTags: pickCategoryTags(html),
  };
}

// =====================================================
// Parent/child domain resolution
// =====================================================

// Common two-level public suffixes so we don't treat `bbc.co.uk`
// as `co.uk`. Not exhaustive: kept to the top SLDs that actually
// show up in our cohort. Anything not listed falls through to the
// standard `label.tld` heuristic.
const MULTI_PART_SLDS = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.za',
  'co.in',
  'com.au',
  'com.br',
  'com.sg',
  'com.mx',
  'com.ar',
  'com.tr',
  'com.tw',
]);

/**
 * Returns the apex (registrable) domain for a given hostname.
 * `app.stuntdouble.io` → `stuntdouble.io`
 * `stuntdouble.io`     → `stuntdouble.io`
 * `www.bbc.co.uk`      → `bbc.co.uk`
 */
export function apexDomain(domain: string): string {
  const normalised = domain.toLowerCase().replace(/^www\./, '');
  const parts = normalised.split('.');
  if (parts.length <= 2) return normalised;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_SLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Returns the parent domain when `domain` is a subdomain of a
 * distinct apex, otherwise `null`. Used to link e.g.
 * `app.stuntdouble.io` → `stuntdouble.io` in the index UI.
 */
export function parentDomainOf(domain: string): string | null {
  const apex = apexDomain(domain);
  return apex === domain ? null : apex;
}
