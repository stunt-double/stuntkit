import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { INDEX_USER_AGENT } from './identity.ts';
import { checkIndexOptOut } from './opt-out.ts';

const realKey = process.env.WEB_BOT_AUTH_PRIVATE_KEY;
afterEach(() => {
  if (realKey === undefined) delete process.env.WEB_BOT_AUTH_PRIVATE_KEY;
  else process.env.WEB_BOT_AUTH_PRIVATE_KEY = realKey;
});

// Answers by URL with a status, body and headers; records each request's user agent.
function stubFetch(
  routes: Record<string, { status: number; body?: string; headers?: Record<string, string> }>,
  seen: Array<{ url: string; ua: string | null }>
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, ua: new Headers(init?.headers).get('user-agent') });
    const route = routes[url];
    if (!route) throw new TypeError('fetch failed');
    const res = new Response(route.body ?? '', { status: route.status, headers: route.headers });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  }) as typeof fetch;
}

test('checkIndexOptOut identifies itself and honours robots.txt', async () => {
  const seen: Array<{ url: string; ua: string | null }> = [];
  const result = await checkIndexOptOut('example.com', {
    fetchImpl: stubFetch(
      {
        'https://example.com/': { status: 200 },
        'https://example.com/robots.txt': {
          status: 200,
          body: 'User-agent: StuntDoubleIndex\nDisallow: /\n',
        },
      },
      seen
    ),
  });
  assert.equal(result.optOut?.source, 'robots-txt');
  assert.deepEqual(
    seen.map((s) => s.ua),
    [INDEX_USER_AGENT, INDEX_USER_AGENT]
  );
});

test('checkIndexOptOut reads the homepage X-Robots-Tag', async () => {
  const result = await checkIndexOptOut('example.com', {
    fetchImpl: stubFetch(
      {
        'https://example.com/': { status: 200, headers: { 'x-robots-tag': 'noai' } },
        'https://example.com/robots.txt': { status: 404 },
      },
      []
    ),
  });
  assert.deepEqual(result.optOut, { source: 'x-robots-tag', detail: 'X-Robots-Tag: noai' });
});

test('checkIndexOptOut lets a site with no rules through', async () => {
  const result = await checkIndexOptOut('example.com', {
    fetchImpl: stubFetch({ 'https://example.com/': { status: 200 } }, []),
  });
  assert.equal(result.optOut, null);
  assert.equal(result.reachable, true);
});
