// Whether an Index domain is a monetised site or service. The report page only
// shows its opportunity cost card (modelled revenue at risk) for a monetised
// domain, because for a free one the figure is invented.
//
// A classifier's verdict is stored beside an optional manual override. Both
// are null until known, and the override always wins.
//
// Kept free of runtime imports so `node --test` can exercise it.

export const MONETISATION_VALUES = ['monetised', 'free'] as const;

export type Monetisation = (typeof MONETISATION_VALUES)[number];

/** Narrows a stored column value; anything unrecognised reads as unknown. */
export function parseMonetisation(value: unknown): Monetisation | null {
  return MONETISATION_VALUES.includes(value as Monetisation) ? (value as Monetisation) : null;
}

/** The value to act on: a manual override, else the classifier's verdict. */
export function effectiveMonetisation(classified: unknown, override: unknown): Monetisation | null {
  return parseMonetisation(override) ?? parseMonetisation(classified);
}

// Government hosts: generic `.gov` / `.mil` / `.int`, and the second-level
// government zones countries use under their ccTLD (gov.uk, gouv.fr, gob.mx,
// govt.nz, gc.ca, go.jp, and so on). `europa.eu` is the EU institutions.
const GOVERNMENT_TLD_RE = /\.(gov|mil|int)$/;
const GOVERNMENT_SECOND_LEVEL_RE = /(^|\.)(gov|gouv|gob|govt|gc|go|mil)\.[a-z]{2}$/;
const GOVERNMENT_HOSTS = new Set(['europa.eu']);

/**
 * The verdict a domain name alone settles, without a model call: government
 * services are free to use, whatever their sector tag says. Null means the
 * name does not decide it.
 */
export function monetisationFromDomain(domain: string): Monetisation | null {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  if (!host) return null;
  if (GOVERNMENT_TLD_RE.test(host)) return 'free';
  if (GOVERNMENT_SECOND_LEVEL_RE.test(host)) return 'free';
  for (const apex of GOVERNMENT_HOSTS) {
    if (host === apex || host.endsWith(`.${apex}`)) return 'free';
  }
  return null;
}
