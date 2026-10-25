import type { DomainSector } from '../index.ts';

// Kept free of runtime imports so `node --test` can exercise it.

/** What the homepage says about itself, already lowercased where it matters. */
export type SectorSignals = {
  domain: string;
  /** Every JSON-LD `@type` on the page, lowercased. */
  jsonLdTypes: string[];
  /** `og:type`, lowercased, or null. */
  ogType: string | null;
  /** Visible text, lowercased. */
  text: string;
  /** Raw `href` values, as written. */
  anchors: string[];
};

type SectorHints = {
  sector: DomainSector;
  jsonLdTypes?: string[];
  ogTypes?: string[];
  keywords?: string[];
  /**
   * Same-site path prefixes, matched on whole segments: `/cart` matches
   * `/cart` and `/cart/items`, never `/cartoons` or an app-store link.
   */
  pathHints?: string[];
  /** Domain suffixes reserved for the sector (`.gov`, `.edu`); a match is near-conclusive. */
  domainSuffixes?: RegExp;
  /**
   * A sector that only counts when this holds. E-commerce uses it: news sites,
   * payment providers and SaaS pricing pages all say "shop" or "checkout", so a
   * site has to show a product or a cart before any of its looser hints count.
   */
  requires?: (s: ParsedSignals) => boolean;
};

type ParsedSignals = {
  domain: string;
  ldTypes: Set<string>;
  ogType: string | null;
  text: string;
  paths: string[];
};

const hasCommerceEvidence = (s: ParsedSignals): boolean =>
  s.ldTypes.has('product') ||
  s.ldTypes.has('productgroup') ||
  s.ldTypes.has('onlinestore') ||
  s.ogType === 'product' ||
  /\badd to (cart|basket|bag|trolley)\b/.test(s.text) ||
  s.paths.some((p) => matchesPath(p, '/cart') || matchesPath(p, '/basket'));

export const SECTOR_HINTS: SectorHints[] = [
  {
    sector: 'ecommerce',
    // `offer`, `aggregateoffer` and `itemlist` are left out on purpose: SaaS
    // pricing pages carry offers and news homepages are built from item lists.
    jsonLdTypes: ['product', 'productgroup', 'onlinestore'],
    ogTypes: ['product'],
    keywords: [
      'add to cart',
      'add to basket',
      'add to bag',
      'free shipping',
      'free delivery',
      'free returns',
      'shop now',
      'shop all',
      'new arrivals',
      'best sellers',
      'size guide',
    ],
    pathHints: ['/cart', '/basket', '/checkout', '/product', '/products', '/collections'],
    requires: hasCommerceEvidence,
  },
  {
    sector: 'travel',
    jsonLdTypes: ['lodgingbusiness', 'hotel', 'flight', 'tourismbusiness', 'travelaction'],
    keywords: ['book now', 'check-in', 'guests', 'destinations', 'itinerary'],
    pathHints: ['/stays', '/flights', '/rooms', '/hotels'],
  },
  {
    sector: 'finance',
    jsonLdTypes: ['financialservice', 'bankorcreditunion', 'insuranceagency', 'paymentservice'],
    keywords: [
      'interest rate',
      'apr',
      'deposit',
      'loans',
      'transfer money',
      'exchange rate',
      'pay later',
      'pay in 4',
      'send money',
      'credit score',
    ],
    pathHints: ['/loans', '/invest', '/transfers'],
  },
  {
    sector: 'marketplace',
    keywords: ['delivery fee', 'shop multiple stores', 'compare sellers', 'vendors'],
    pathHints: ['/restaurants', '/sellers', '/stores', '/browse'],
  },
  {
    sector: 'media',
    jsonLdTypes: [
      'newsmediaorganization',
      'newsarticle',
      'reportagenewsarticle',
      'liveblogposting',
      'videoobject',
      'article',
      'musicgroup',
      'movie',
      'tvseries',
      'podcastseries',
    ],
    ogTypes: ['article', 'video.movie', 'video.tv_show', 'music.song'],
    keywords: [
      'subscribe',
      'latest episode',
      'watch now',
      'livestream',
      'breaking news',
      'latest news',
      'top stories',
      'most read',
      'live updates',
    ],
    pathHints: [
      '/articles',
      '/watch',
      '/live',
      '/news',
      '/world',
      '/politics',
      '/opinion',
      '/sport',
      '/sports',
      '/entertainment',
      '/culture',
    ],
  },
  {
    sector: 'saas',
    jsonLdTypes: ['softwareapplication', 'webapplication'],
    keywords: ['free trial', 'start free', 'sdk', 'integrations'],
    pathHints: ['/docs', '/pricing', '/integrations', '/changelog'],
  },
  {
    sector: 'professional-services',
    jsonLdTypes: ['professionalservice', 'consultingservice', 'legalservice', 'accountingservice'],
    keywords: [
      'case studies',
      'our work',
      'our clients',
      'consultancy',
      'consulting',
      'agency',
      'work with us',
      'partner with us',
      'capabilities',
      'engagements',
      'bespoke',
      'tailored solutions',
    ],
    pathHints: ['/case-studies', '/work', '/clients', '/services', '/capabilities', '/engagements'],
  },
  // Listed after `saas` so a tie stays SaaS: a developer tool has to show
  // developer-specific signals (install commands, API reference, repos) to move.
  {
    sector: 'developer-tools',
    jsonLdTypes: ['softwaresourcecode'],
    keywords: [
      'npm install',
      'pip install',
      'brew install',
      'command line',
      'api reference',
      'open source',
      'for developers',
      'pull request',
      'self-host',
    ],
    pathHints: ['/docs/api', '/reference', '/quickstart', '/getting-started', '/cli', '/sdk'],
  },
  {
    sector: 'utilities',
    keywords: [
      'converter',
      'calculator',
      'free online tool',
      'no sign-up',
      'no signup',
      'drag and drop your file',
      'weather forecast',
      'generator',
      'translate',
    ],
    pathHints: ['/tools', '/convert', '/converter', '/calculator', '/forecast'],
  },
  {
    sector: 'social',
    jsonLdTypes: ['profilepage', 'socialmediaposting', 'discussionforumposting', 'qapage'],
    keywords: [
      'followers',
      'join the conversation',
      'community guidelines',
      'sign up to see',
      'join the community',
      'upvote',
    ],
    pathHints: ['/explore', '/communities', '/groups', '/r', '/trending'],
  },
  {
    sector: 'education',
    jsonLdTypes: ['course', 'educationalorganization', 'collegeoruniversity', 'school'],
    keywords: ['enrol', 'enroll', 'admissions', 'curriculum', 'students', 'learn at your own pace'],
    pathHints: ['/courses', '/admissions', '/programmes', '/programs', '/students'],
    domainSuffixes: /\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$/,
  },
  {
    sector: 'health',
    jsonLdTypes: ['medicalorganization', 'hospital', 'physician', 'medicalclinic', 'pharmacy'],
    keywords: [
      'book an appointment',
      'symptoms',
      'patients',
      'prescription',
      'telehealth',
      'medical advice',
    ],
    pathHints: ['/conditions', '/patients', '/appointments', '/find-a-doctor', '/symptoms'],
  },
  {
    sector: 'government',
    jsonLdTypes: ['governmentorganization', 'governmentservice', 'governmentoffice'],
    keywords: [
      'official website of',
      'department of',
      'ministry of',
      'eligibility',
      'your council',
    ],
    pathHints: ['/benefits', '/licences', '/licenses', '/permits', '/forms'],
    domainSuffixes: /\.(gov|mil|gov\.[a-z]{2}|gc\.ca|gouv\.fr)$/,
  },
];

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whole words only. A substring test counted "workshop" as "shop" and
 * "apr" inside "april", which is how news sites drifted into e-commerce.
 */
const KEYWORD_RES = new Map<string, RegExp>();
function hasKeyword(text: string, keyword: string): boolean {
  let re = KEYWORD_RES.get(keyword);
  if (!re) {
    re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(keyword)}(?:$|[^a-z0-9])`);
    KEYWORD_RES.set(keyword, re);
  }
  return re.test(text);
}

function matchesPath(path: string, hint: string): boolean {
  return path === hint || path.startsWith(`${hint}/`);
}

const sameSite = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);

/**
 * Lowercased paths of the links that stay on this site. Off-site links are
 * dropped: every publisher's app badge points at `apps.apple.com/.../store`.
 */
function sameSitePaths(anchors: string[], domain: string): string[] {
  const base = `https://${domain}/`;
  const out: string[] = [];
  for (const href of anchors) {
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (!sameSite(url.hostname.toLowerCase().replace(/^www\./, ''), domain)) continue;
    const path = url.pathname.toLowerCase().replace(/\/+$/, '');
    out.push(path || '/');
  }
  return out;
}

/** The sector a reserved suffix (`.gov`, `.edu`) settles on its own, if any. */
export function sectorFromDomainSuffix(domain: string): DomainSector | null {
  return SECTOR_HINTS.find((h) => h.domainSuffixes?.test(domain))?.sector ?? null;
}

/**
 * Scores the homepage against each sector's hints and returns the best match,
 * or `saas` when nothing matches. A tie keeps the earlier sector in
 * `SECTOR_HINTS`. This only seeds a new domain: a tracked domain keeps its
 * stored sector (see `upsertDomainReport`), so a wrong guess sticks until an
 * a caller can correct it.
 */
export function detectSector(signals: SectorSignals): DomainSector {
  const domain = signals.domain.toLowerCase().replace(/^www\./, '');
  const s: ParsedSignals = {
    domain,
    ldTypes: new Set(signals.jsonLdTypes.map((t) => t.toLowerCase())),
    ogType: signals.ogType?.toLowerCase() ?? null,
    text: signals.text.toLowerCase(),
    paths: sameSitePaths(signals.anchors, domain),
  };

  let best: { sector: DomainSector; score: number } = { sector: 'saas', score: 0 };
  for (const h of SECTOR_HINTS) {
    if (h.requires && !h.requires(s)) continue;
    let score = 0;
    if (h.domainSuffixes?.test(domain)) score += 10;
    for (const t of h.jsonLdTypes ?? []) if (s.ldTypes.has(t)) score += 3;
    if (s.ogType && h.ogTypes?.includes(s.ogType)) score += 2;
    for (const k of h.keywords ?? []) if (hasKeyword(s.text, k)) score += 1;
    for (const p of h.pathHints ?? []) if (s.paths.some((path) => matchesPath(path, p))) score += 1;
    if (score > best.score) best = { sector: h.sector, score };
  }
  return best.sector;
}
