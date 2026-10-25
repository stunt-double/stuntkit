// Where an Index domain actually serves. Domains are stored bare (no scheme,
// no `www.`), but plenty of sites redirect the apex to `www`, only answer on
// `www` (no apex record, or a certificate that only covers `www`), or only
// answer over plain http. The probe and any agent session started on the same
// site should both start from the origin resolved here.
//
// Every request here carries the Index's identifying headers
// (`request-headers.ts`). Only relative imports, so `node --test` can
// exercise it.

import { requestHeaders } from './request-headers.ts';

/** Homepage URLs to try for a bare domain, in order. */
export function homepageCandidates(domain: string): string[] {
  const host = domain
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  const urls = [`https://${host}/`];
  if (!host.startsWith('www.')) urls.push(`https://www.${host}/`);
  urls.push(`http://${host}/`);
  return urls;
}

export type ResolvedOrigin = {
  /** e.g. `https://www.example.com`. The https apex when nothing answered. */
  origin: string;
  /** The page the homepage settled on after redirects (a locale path, say). */
  homepageUrl: string;
  /** False when no candidate answered at all. */
  reachable: boolean;
  /** The homepage's `X-Robots-Tag` header, when it sent one (see `xRobotsTagOptOut`). */
  xRobotsTag: string | null;
};

/**
 * Follows the homepage's redirects (apex to `www`, http to https, onto another
 * host) and falls back through `homepageCandidates` while a candidate cannot be
 * reached at all. Any HTTP response, even an error status, means the site
 * answered there. Reads no body, so it is cheap enough to run once per run.
 */
export async function resolveSiteOrigin(
  domain: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<ResolvedOrigin> {
  const doFetch = opts.fetchImpl ?? fetch;
  const candidates = homepageCandidates(domain);
  for (const [i, url] of candidates.entries()) {
    const timeoutMs =
      i === 0 ? (opts.timeoutMs ?? 10_000) : Math.min(opts.timeoutMs ?? 6_000, 6_000);
    try {
      const res = await doFetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: requestHeaders(url),
      });
      res.body?.cancel().catch(() => {});
      const homepageUrl = res.url || url;
      return {
        origin: new URL(homepageUrl).origin,
        homepageUrl,
        reachable: true,
        xRobotsTag: res.headers.get('x-robots-tag'),
      };
    } catch {
      // Unreachable here (DNS, TLS, refused, timed out): try the next candidate.
    }
  }
  const [first] = candidates;
  return { origin: new URL(first).origin, homepageUrl: first, reachable: false, xRobotsTag: null };
}
