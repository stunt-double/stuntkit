// Who the Index says it is. The methodology page promises that every request
// the Index makes carries one identifying user agent, so a site owner can find
// us in their logs and name us in robots.txt. Every probe request takes its
// identity from here, so the probes cannot drift apart.
//
// Kept free of runtime imports so `node --test` can load it by path.

/** The robots.txt product token the Index answers to (`User-agent: StuntDoubleIndex`). */
export const INDEX_AGENT_TOKEN = 'StuntDoubleIndex';

/** Where a site owner who finds us in their logs can read what we do. */
export const INDEX_INFO_URL = 'https://index.stuntdouble.io/methodology';

/** The product and comment appended to every identity below. */
const INDEX_PRODUCT = `${INDEX_AGENT_TOKEN}/1.0 (+${INDEX_INFO_URL})`;

/** The user agent every quick-check probe request carries. */
export const INDEX_USER_AGENT = INDEX_PRODUCT;

/**
 * A real browser's user agent with ours appended. Agent sessions drive a real
 * Chrome, so the site still sees a browser it can render for, and the
 * `StuntDoubleIndex` product token says whose browser it is. Idempotent, so an
 * override applied twice (a reconnect, say) does not stack the suffix.
 */
export function browserUserAgent(chromeUa: string): string {
  const base = chromeUa.trim();
  if (!base) return INDEX_PRODUCT;
  if (base.includes(`${INDEX_AGENT_TOKEN}/`)) return base;
  return `${base} ${INDEX_PRODUCT}`;
}
