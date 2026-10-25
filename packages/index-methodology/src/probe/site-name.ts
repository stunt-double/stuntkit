// Works out what a site is called. Kept free of runtime imports so
// `node --test` can load it directly.
//
// A page's title is not its name: `og:title` on bing.com is the caption of
// the day's photo ("Rock on, Milky Way!"), and a homepage `<title>` is often
// a tagline. So every candidate is checked against the domain, and only a
// name the site declares for itself (`og:site_name`, `application-name`,
// JSON-LD `WebSite` / `Organization`) is trusted without that check.

// Spaced dashes, slashes and tildes (`Linear – Plan`), bars, bullets and
// guillemets with or without spaces (`Stripe»Payments`), and a colon followed
// by a space (`Figma: The design tool`, not `https://`).
const SEPARATORS_RE = /\s+[|\-–\u2014·:•/~]\s+|\s*[|·•»«]\s*|:\s+/;
// The clauses of a run-on title: `Amazon.com. Spend less. Smile more.`
const CLAUSE_RE = /(?<=[.!?;,])\s+/;
// Punctuation followed by a space (`Rock on, Milky Way!`), not inside a word
// (`Booking.com`).
const SENTENCE_RE = /[!?,.;:]\s+\S|[!?]$/;
const NAME_MAX_WORDS = 4;
const NAME_MAX_CHARS = 40;

// Second-level labels that are part of the suffix, not the brand
// (`bbc.co.uk`, `anu.edu.au`).
const SUFFIX_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'ne', 'or', 'go']);

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The labels of a domain that can carry the brand: `maps.google.co.uk` -> `maps`, `google`. */
function brandLabels(domain: string): string[] {
  const labels = domain
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.');
  labels.pop();
  return labels.filter((l) => l && !SUFFIX_LABELS.has(l));
}

/** `my-shop.com` -> `My Shop`. */
export function nameFromDomain(domain: string): string {
  const root = brandLabels(domain).at(-1) ?? domain.split('.')[0] ?? domain;
  return root
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Whether a name plausibly belongs to the domain: it contains a brand label
 * (`Bing` / `bing.com`), a brand label contains it (`Stripe` / `stripe-payments.com`),
 * or its initials spell one (`British Broadcasting Corporation` / `bbc.co.uk`).
 */
export function nameMatchesDomain(name: string, domain: string): boolean {
  const c = compact(name);
  if (!c) return false;
  const initials = compact(
    name
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
  );
  return brandLabels(domain).some((label) => {
    const l = label.replace(/-/g, '');
    if (l.length < 2) return c === l;
    return (
      c.includes(l) || (c.length >= 3 && l.includes(c)) || (initials.length >= 2 && initials === l)
    );
  });
}

/** A caption or tagline rather than a name: a sentence, or too long to be a brand. */
export function looksLikeSentence(name: string): boolean {
  const n = clean(name);
  return SENTENCE_RE.test(n) || n.split(' ').length > NAME_MAX_WORDS || n.length > NAME_MAX_CHARS;
}

/** A title split at its separators: `Stripe | Financial infrastructure` -> both halves. */
function segments(title: string): string[] {
  return (
    clean(title)
      .split(SEPARATORS_RE)
      .map(clean)
      // A bare URL is where the site is, not what it is called.
      .filter((s) => s.length >= 1 && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s))
  );
}

/** Too many words or characters to be a brand, whatever its punctuation. */
const tooLong = (n: string) => n.split(' ').length > NAME_MAX_WORDS || n.length > NAME_MAX_CHARS;

/** Trailing clause punctuation, keeping the `!` and `?` some brands carry (`Yahoo!`). */
const trimClause = (s: string) => clean(s).replace(/[.,;:]+$/, '');

/** The domain's suffix with the brand label, compacted: `amazon.com` -> `amazoncom`. */
function compactHosts(domain: string): string[] {
  const host = domain.toLowerCase().replace(/^www\./, '');
  const labels = host.split('.');
  return labels.map((_, i) => compact(labels.slice(i).join('.'))).filter((h) => h.length >= 2);
}

/**
 * The run of words in a title that spells the domain, with its own casing:
 * `JB Hi-Fi` in `JB Hi-Fi Australia's largest retailer` on jbhifi.com.au,
 * `Amazon.com` in `Amazon.com. Spend less.` on amazon.com.
 */
function brandSpan(text: string, domain: string): string | null {
  const targets = new Set([...brandLabels(domain).map(compact), ...compactHosts(domain)]);
  const words = clean(text).split(' ');
  for (let i = 0; i < words.length; i++) {
    let joined = '';
    for (let j = i; j < Math.min(words.length, i + NAME_MAX_WORDS); j++) {
      joined += compact(words[j]!);
      if (joined.length >= 2 && targets.has(joined)) {
        const span = trimClause(words.slice(i, j + 1).join(' '));
        if (span.length <= NAME_MAX_CHARS) return span;
      }
    }
  }
  return null;
}

/**
 * The site's name from what its homepage says. In order: a declared name that
 * matches the domain, any title segment that matches it, a declared name that
 * at least reads as a name (a rebrand, `Meta` on facebook.com), and finally
 * the domain itself.
 */
export function resolveSiteName({
  domain,
  declared = [],
  titles = [],
}: {
  domain: string;
  /** Names the site states for itself: `og:site_name`, `application-name`, JSON-LD. */
  declared?: Array<string | null | undefined>;
  /** Page titles, which may be taglines or captions: `<title>`, `og:title`. */
  titles?: Array<string | null | undefined>;
}): string {
  const own = declared.flatMap((d) => (d ? segments(d) : []));
  const fromTitles = titles.flatMap((t) => (t ? segments(t) : []));
  const all = [...own, ...fromTitles];
  const matching = all.filter((n) => nameMatchesDomain(n, domain));

  // A name, never a tagline cut short: a matching segment that reads as a
  // name, then one that is only punctuated like a sentence (`Mr. Porter`).
  const named = matching.find((n) => !looksLikeSentence(n)) ?? matching.find((n) => !tooLong(n));
  if (named) return named;
  // A run-on title with the name as one clause: `Amazon.com. Spend less.`
  const clause = matching
    .flatMap((n) => n.split(CLAUSE_RE).map(trimClause))
    .find((n) => n && nameMatchesDomain(n, domain) && !looksLikeSentence(n));
  if (clause) return clause;
  const declaredName = own.find((n) => !looksLikeSentence(n));
  if (declaredName) return declaredName;
  // A long title that still spells the domain gives the name its casing
  // (`GitHub`, not `Github`).
  for (const n of all) {
    const span = brandSpan(n, domain);
    if (span) return span;
  }
  return nameFromDomain(domain);
}

/**
 * A stored name checked on the way out, for rows scored before names were
 * checked: kept when it matches the domain or reads as a name, otherwise
 * rebuilt from the stored title, or the domain.
 */
export function repairStoredName(
  name: string | null | undefined,
  domain: string,
  title?: string | null
): string {
  const stored = clean(name ?? '');
  if (stored && nameMatchesDomain(stored, domain)) {
    // Rows scored before names were cut at their separators may hold a
    // tagline truncated with an ellipsis: `Shopify: The All-in-One Commerce Platfo…`.
    return resolveSiteName({ domain, titles: [stored.replace(/…$/, ''), title] });
  }
  const first = segments(stored)[0];
  if (first && !looksLikeSentence(first)) return first;
  return resolveSiteName({ domain, titles: [title] });
}

export type NameRepair = { domain: string; from: string; to: string };

/**
 * The stored names a backfill would rewrite: every row whose `name` reads
 * differently once checked by `repairStoredName`. Rows already clean are left
 * out, so re-running the backfill is a no-op.
 */
export function planNameRepairs(
  rows: Array<{ domain: string; name: string | null; title?: string | null }>
): NameRepair[] {
  return rows.flatMap((row) => {
    const from = row.name ?? '';
    const to = repairStoredName(row.name, row.domain, row.title);
    return to && to !== from ? [{ domain: row.domain, from, to }] : [];
  });
}
