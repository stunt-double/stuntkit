// The opt-out check a run makes before it starts any browser. The quick-check
// probe already refuses to score a site that has opted out, but agent sessions
// can start without a probe, and a site can opt out between the two. So a
// session checks again here, with two requests: the homepage (which it needed
// anyway, to find the origin) and robots.txt.
//
// Only relative imports, so `node --test` can exercise it.

import { resolveSiteOrigin, type ResolvedOrigin } from './origin.ts';
import { requestHeaders } from './request-headers.ts';
import { indexOptOut, robotsBodyToObey, type IndexOptOut } from './robots.ts';

export type OptOutCheck = ResolvedOrigin & { optOut: IndexOptOut | null };

const ROBOTS_TIMEOUT_MS = 6_000;
const MAX_ROBOTS_BYTES = 512_000;

export async function checkIndexOptOut(
  domain: string,
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<OptOutCheck> {
  const doFetch = opts.fetchImpl ?? fetch;
  const resolved = await resolveSiteOrigin(domain, { fetchImpl: doFetch });
  if (!resolved.reachable) return { ...resolved, optOut: null };

  const robotsUrl = `${resolved.origin}/robots.txt`;
  let robotsBody = '';
  try {
    const res = await doFetch(robotsUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      headers: requestHeaders(robotsUrl),
    });
    const text = (await res.text()).slice(0, MAX_ROBOTS_BYTES);
    robotsBody = robotsBodyToObey({
      status: res.status,
      body: text,
      contentType: res.headers.get('content-type'),
    });
  } catch {
    // No answer from robots.txt is no rules for this visit (see `robotsBodyToObey`).
  }
  return { ...resolved, optOut: indexOptOut({ robotsBody, xRobotsTag: resolved.xRobotsTag }) };
}
