import {
  buildUrl,
  fetchHomepage,
  fetchPage,
  homepageCandidates,
  notFetched,
  siteOrigin,
  type FetchResult,
} from './fetch.ts';
import { INDEX_AGENT_TOKEN } from './identity.ts';
import { pacedMap } from './pace.ts';
import { parseHtml, type ParsedHtml } from './parse.ts';
import {
  indexCrawlDelayMs,
  indexMayFetch,
  indexOptOut,
  parseRobots,
  robotsBodyToObey,
  type IndexOptOut,
  type RobotsGroup,
} from './robots.ts';

/**
 * What the probe learns before it sends anything else: robots.txt and the
 * homepage, and from them whether the site has asked the Index to stay out.
 */
export type ProbeGate = {
  domain: string;
  /** See `DomainProbe.origin`. */
  origin: string;
  homepage: FetchResult;
  robotsTxt: FetchResult;
  /** The robots.txt rules we obey (none when it was missing or unreadable). */
  robotsRules: RobotsGroup[];
  /** Set when the site opted out: nothing more is fetched and no agent starts. */
  optOut: IndexOptOut | null;
  /** Epoch ms the probe started, for its time budget. */
  startedAt: number;
};

export type DomainProbe = Omit<ProbeGate, 'optOut' | 'startedAt'> & {
  html: ParsedHtml | null;
  sitemap: FetchResult | null;
  llmsTxt: FetchResult;
  llmsFullTxt: FetchResult;
  /** Markdown content negotiation: homepage fetched with `Accept: text/markdown`. */
  markdownVariant: FetchResult;
  /** Legacy single-file MCP manifest (`/.well-known/mcp.json`). */
  wellKnownMcp: FetchResult;
  /** MCP server card (SEP-1649, `/.well-known/mcp/server-card.json`). */
  mcpServerCard: FetchResult;
  wellKnownAiPlugin: FetchResult;
  wellKnownOidc: FetchResult;
  /** OAuth authorization server metadata (RFC 8414). */
  oauthAuthServer: FetchResult;
  /** OAuth protected resource metadata (RFC 9728, required by the MCP auth spec). */
  oauthProtectedResource: FetchResult;
  /** A2A agent card (`/.well-known/agent-card.json`). */
  agentCard: FetchResult;
  /** AGENTS.md served over HTTP (Vercel agent-readability convention). */
  agentsMd: FetchResult;
  /** Universal Commerce Protocol discovery (`/.well-known/ucp`). */
  ucp: FetchResult;
  openapi: FetchResult;
  favicon: FetchResult;
  extraPages: Record<string, FetchResult>;
};

const EXTRA_PAGE_PATHS: Record<string, string> = {
  pricing: '/pricing',
  cart: '/cart',
  checkout: '/checkout',
  signup: '/signup',
  register: '/register',
  book: '/book',
  demo: '/demo',
  getStarted: '/get-started',
  subscribe: '/subscribe',
  contactSales: '/contact-sales',
  support: '/support',
  help: '/help',
  contact: '/contact',
  faq: '/faq',
  developers: '/developers',
  apiDocs: '/api-docs',
  docs: '/docs',
};

/**
 * Whether a fetched page genuinely exists. Guards against the two most
 * common false positives: catch-all routers that 200 every path, and
 * redirects that bounce unknown paths back to the homepage.
 */
export function pageExists(res: FetchResult | null | undefined): boolean {
  if (!res || !res.ok) return false;
  try {
    const requested = new URL(res.url);
    const final = new URL(res.finalUrl);
    // Redirected back to the homepage (or to a different host's root):
    // the path doesn't exist, the site just swallowed it.
    if (requested.pathname !== '/' && (final.pathname === '/' || final.pathname === '')) {
      return false;
    }
  } catch {
    // Unparseable URLs: fall through to the status check.
  }
  return true;
}

/** Whether a well-known endpoint returned parseable JSON (not an HTML catch-all). */
export function jsonEndpointExists(res: FetchResult | null | undefined): boolean {
  if (!pageExists(res) || !res) return false;
  const body = res.body.trim();
  if (!body || body.startsWith('<')) return false;
  try {
    const parsed = JSON.parse(body) as unknown;
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/** Whether a plain-text endpoint (llms.txt, AGENTS.md) returned real text, not an HTML fallback. */
export function textEndpointExists(res: FetchResult | null | undefined): boolean {
  if (!pageExists(res) || !res) return false;
  const body = res.body.trim();
  if (!body) return false;
  const contentType = (res.headers['content-type'] ?? '').toLowerCase();
  if (contentType.includes('text/html')) return false;
  return !body.startsWith('<!doctype html') && !body.startsWith('<html');
}

// HEAD first (cheap); some origins reject HEAD outright, so retry those as GET.
async function fetchHead(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<FetchResult> {
  const head = await fetchPage(url, { timeoutMs, method: 'HEAD', signal });
  if (head.status === 405 || head.status === 501) {
    return fetchPage(url, { timeoutMs, signal });
  }
  return head;
}

// How long the probe may keep starting requests, from when it began. A caller
// with a whole-run deadline should leave this much headroom under it, since a
// request started at the cut-off can still take its own timeout to finish.
const PROBE_BUDGET_MS = 28_000;
/** Requests in flight to one site at once, when robots.txt sets no `Crawl-delay`. */
const PROBE_CONCURRENCY = 4;

const ROBOTS_ACCEPT = 'text/plain,*/*;q=0.5';

function robotsFrom(res: FetchResult): { body: string; rules: RobotsGroup[] } {
  const body = robotsBodyToObey({
    status: res.status,
    body: res.body,
    contentType: res.headers['content-type'],
  });
  return { body, rules: parseRobots(body) };
}

/**
 * The first requests the probe makes, and the only ones it makes to a site
 * that has opted out: robots.txt on the domain as given, then (if that allows
 * us) the homepage, then robots.txt again when the homepage redirected to
 * another origin, since that origin's file is the one that governs it. The
 * site has opted out when robots.txt disallows `/` for `StuntDoubleIndex` or
 * the homepage's `X-Robots-Tag` says `noai` or `none` to us.
 */
export async function gateDomain(domain: string, signal?: AbortSignal): Promise<ProbeGate> {
  const startedAt = Date.now();
  const firstOrigin = new URL(homepageCandidates(domain)[0]).origin;
  const firstRobots = await fetchPage(buildUrl(firstOrigin, '/robots.txt'), {
    timeoutMs: 5_000,
    accept: ROBOTS_ACCEPT,
    signal,
  });
  const first = robotsFrom(firstRobots);
  const firstOptOut = indexOptOut({ robotsBody: first.body });
  if (firstOptOut) {
    return {
      domain,
      origin: firstOrigin,
      homepage: notFetched(buildUrl(firstOrigin, '/'), firstOptOut.detail),
      robotsTxt: firstRobots,
      robotsRules: first.rules,
      optOut: firstOptOut,
      startedAt,
    };
  }

  const homepage = await fetchHomepage(domain, { timeoutMs: 10_000, signal });
  const origin = siteOrigin(homepage);
  const robotsTxt =
    origin === firstOrigin
      ? firstRobots
      : await fetchPage(buildUrl(origin, '/robots.txt'), {
          timeoutMs: 5_000,
          accept: ROBOTS_ACCEPT,
          signal,
        });
  const robots = origin === firstOrigin ? first : robotsFrom(robotsTxt);
  return {
    domain,
    origin,
    homepage,
    robotsTxt,
    robotsRules: robots.rules,
    optOut: indexOptOut({
      robotsBody: robots.body,
      xRobotsTag: homepage.headers['x-robots-tag'],
    }),
    startedAt,
  };
}

type ProbeTarget = { url: string; fetch: () => Promise<FetchResult> };

/**
 * Every other probe request, for a site `gateDomain` let through. Paths
 * robots.txt disallows for us are not requested. The rest go out at most
 * `PROBE_CONCURRENCY` at a time, or one at a time `Crawl-delay` apart when
 * robots.txt sets one (capped at 10s), in priority order; what the time
 * budget leaves no room for is recorded as not fetched rather than holding
 * the caller past its deadline.
 *
 * `signal`, when given, aborts every outstanding fetch below it: pass the
 * signal from a caller-wide deadline so abandoning this probe also stops the network calls
 * it started, rather than leaving them to run to their own per-request
 * timeout after the caller has already moved on.
 */
export async function probeDomain(gate: ProbeGate, signal?: AbortSignal): Promise<DomainProbe> {
  const { domain, origin, homepage, robotsTxt, robotsRules } = gate;
  const html = homepage.ok ? parseHtml(homepage.body) : null;
  // The page the homepage settled on (a locale path such as `/en/`, say), for
  // the markdown variant of that same page.
  const homepageUrl = homepage.status === 0 ? buildUrl(origin, '/') : homepage.finalUrl;

  const wk = (path: string, timeoutMs = 5_000): ProbeTarget => {
    const url = buildUrl(origin, path);
    return { url, fetch: () => fetchPage(url, { timeoutMs, signal }) };
  };
  const head = (url: string, timeoutMs: number): ProbeTarget => ({
    url,
    fetch: () => fetchHead(url, timeoutMs, signal),
  });

  const sitemapUrl =
    extractSitemapFromRobots(robotsTxt.body, origin) ?? buildUrl(origin, '/sitemap.xml');

  // In priority order: when a crawl delay leaves time for only some of these,
  // the agent-facing endpoints come first and the guessed task pages last.
  const named = {
    llmsTxt: wk('/llms.txt'),
    llmsFullTxt: wk('/llms-full.txt'),
    markdownVariant: {
      url: homepageUrl,
      fetch: () =>
        fetchPage(homepageUrl, {
          timeoutMs: 6_000,
          accept: 'text/markdown',
          signal,
        }),
    },
    sitemap: head(sitemapUrl, 6_000),
    wellKnownMcp: wk('/.well-known/mcp.json'),
    mcpServerCard: wk('/.well-known/mcp/server-card.json'),
    wellKnownAiPlugin: wk('/.well-known/ai-plugin.json'),
    wellKnownOidc: wk('/.well-known/openid-configuration'),
    oauthAuthServer: wk('/.well-known/oauth-authorization-server'),
    oauthProtectedResource: wk('/.well-known/oauth-protected-resource'),
    agentCard: wk('/.well-known/agent-card.json'),
    agentsMd: wk('/.well-known/agents.md'),
    ucp: wk('/.well-known/ucp'),
    openapi: wk('/openapi.json'),
    favicon: head(buildUrl(origin, '/favicon.ico'), 5_000),
  } satisfies Record<string, ProbeTarget>;
  const extraTargets = Object.entries(EXTRA_PAGE_PATHS).map(
    ([key, path]) => [key, head(buildUrl(origin, path), 6_000)] as const
  );
  const targets: Array<readonly [string, ProbeTarget]> = [
    ...Object.entries(named),
    ...extraTargets.map(([key, target]) => [`extra:${key}`, target] as const),
  ];

  const results = new Map<string, FetchResult>();
  const allowed: Array<readonly [string, ProbeTarget]> = [];
  for (const entry of targets) {
    const [key, target] = entry;
    const url = new URL(target.url);
    if (indexMayFetch(robotsRules, `${url.pathname}${url.search}`)) allowed.push(entry);
    else {
      results.set(key, notFetched(target.url, `Disallowed for ${INDEX_AGENT_TOKEN} in robots.txt`));
    }
  }

  const spacingMs = indexCrawlDelayMs(robotsRules);
  const fetched = await pacedMap(allowed, ([, target]) => target.fetch(), {
    concurrency: PROBE_CONCURRENCY,
    spacingMs,
    deadline: gate.startedAt + PROBE_BUDGET_MS,
    signal,
    // The homepage was the last request; the delay runs from it.
    lastStart: spacingMs > 0 ? Date.now() : undefined,
  });
  allowed.forEach(([key, target], i) => {
    results.set(
      key,
      fetched[i] ?? notFetched(target.url, 'Not fetched: out of time under Crawl-delay')
    );
  });

  const pick = (key: keyof typeof named) => results.get(key)!;
  const extraPages: Record<string, FetchResult> = {};
  for (const [key] of extraTargets) extraPages[key] = results.get(`extra:${key}`)!;

  return {
    domain,
    origin,
    homepage,
    html,
    robotsTxt,
    robotsRules,
    sitemap: pick('sitemap'),
    llmsTxt: pick('llmsTxt'),
    llmsFullTxt: pick('llmsFullTxt'),
    markdownVariant: pick('markdownVariant'),
    wellKnownMcp: pick('wellKnownMcp'),
    mcpServerCard: pick('mcpServerCard'),
    wellKnownAiPlugin: pick('wellKnownAiPlugin'),
    wellKnownOidc: pick('wellKnownOidc'),
    oauthAuthServer: pick('oauthAuthServer'),
    oauthProtectedResource: pick('oauthProtectedResource'),
    agentCard: pick('agentCard'),
    agentsMd: pick('agentsMd'),
    ucp: pick('ucp'),
    openapi: pick('openapi'),
    favicon: pick('favicon'),
    extraPages,
  };
}

// robots.txt is the target site's own content, so a `Sitemap:` line is not
// trusted input: without a same-origin check here, a crafted robots.txt could
// redirect our server-side fetch to an arbitrary host (cloud metadata
// endpoints, internal services) rather than the sitemap it claims to be.
// Restrict to http(s) URLs on the domain's own origin; anything else is
// dropped, and the caller falls back to the default `/sitemap.xml` path.
function extractSitemapFromRobots(body: string, origin: string): string | null {
  if (!body) return null;
  const m = /sitemap\s*:\s*(\S+)/i.exec(body);
  if (!m) return null;
  const candidate = m[1].trim();
  try {
    const url = new URL(candidate, origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Compare the full origin (scheme + host + port), not just hostname: a
    // same-hostname check alone would still let a crafted robots.txt point
    // at a different port on this host (e.g. an internal service or admin
    // API listening beside the public site).
    if (url.origin !== new URL(origin).origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}
