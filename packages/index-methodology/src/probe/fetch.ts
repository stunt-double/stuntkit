import { homepageCandidates } from './origin.ts';
import { requestHeaders } from './request-headers.ts';

// Re-exported so a caller starts its agent sessions from the same origin.
export { homepageCandidates };

export type FetchResult = {
  url: string;
  status: number;
  ok: boolean;
  body: string;
  headers: Record<string, string>;
  durationMs: number;
  finalUrl: string;
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 1_500_000;

/**
 * Every probe request goes out as the Index and nothing else: our user agent
 * (see `setRequestHeaders`), never a provider's crawler.
 */
export async function fetchPage(
  url: string,
  opts: {
    timeoutMs?: number;
    method?: 'GET' | 'HEAD';
    accept?: string;
    /** Aborts this fetch early, e.g. when a caller-wide deadline expires. */
    signal?: AbortSignal;
  } = {}
): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  else opts.signal?.addEventListener('abort', onExternalAbort);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        ...requestHeaders(url),
        accept:
          opts.accept ??
          'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    let body = '';
    if (opts.method !== 'HEAD' && res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BODY_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
      }
      reader.cancel().catch(() => {});
      body = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks, total));
    }
    return {
      url,
      status: res.status,
      ok: res.ok,
      body,
      headers,
      durationMs: Date.now() - started,
      finalUrl: res.url || url,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      ok: false,
      body: '',
      headers: {},
      durationMs: Date.now() - started,
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * A request the probe chose not to send: the path is disallowed for us in
 * robots.txt, or pacing left no time for it. Shaped like a failed fetch so
 * every check reads it as "not found" without special cases.
 */
export function notFetched(url: string, reason: string): FetchResult {
  return {
    url,
    status: 0,
    ok: false,
    body: '',
    headers: {},
    durationMs: 0,
    finalUrl: url,
    error: reason,
  };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, total - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= total) break;
  }
  return out;
}

/**
 * Joins a path onto a site. `site` is a bare host (`example.com`, served over
 * https) or an origin (`http://www.example.com`), whose scheme is kept.
 */
export function buildUrl(site: string, path: string): string {
  const scheme = /^http:\/\//i.test(site) ? 'http' : 'https';
  const base = `${scheme}://${site.replace(/^https?:\/\//i, '').replace(/\/$/, '')}`;
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

const FALLBACK_TIMEOUT_MS = 6_000;

/**
 * Fetches the homepage, following redirects (apex to `www`, http to https,
 * onto another host), and falls back through `homepageCandidates` while the
 * previous candidate could not be reached at all. Any HTTP response, even an
 * error status, means the site answered there, so it is kept.
 */
export async function fetchHomepage(
  domain: string,
  opts: { timeoutMs?: number; accept?: string; signal?: AbortSignal } = {}
): Promise<FetchResult> {
  const [first, ...fallbacks] = homepageCandidates(domain);
  const primary = await fetchPage(first, opts);
  if (primary.status !== 0) return primary;
  for (const url of fallbacks) {
    const res = await fetchPage(url, {
      ...opts,
      timeoutMs: Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, FALLBACK_TIMEOUT_MS),
    });
    if (res.status !== 0) return res;
  }
  return primary;
}

/**
 * The origin a homepage fetch actually landed on, after redirects. Every other
 * probe is built from this, so a site that redirects its apex to `www` (often
 * dropping the path) is probed where it really serves, not bounced back to its
 * homepage once per request.
 */
export function siteOrigin(homepage: FetchResult): string {
  try {
    return new URL(homepage.status === 0 ? homepage.url : homepage.finalUrl).origin;
  } catch {
    return new URL(homepage.url).origin;
  }
}
