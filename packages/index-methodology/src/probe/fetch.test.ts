import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  buildUrl,
  fetchHomepage,
  homepageCandidates,
  siteOrigin,
  type FetchResult,
} from './fetch.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Answers by URL: a string is a redirect target, a number a status, `null` a
// connection failure. Records every URL requested, in order.
function stubFetch(routes: Record<string, string | number | null>): string[] {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    let url = String(input);
    requested.push(url);
    for (let hops = 0; hops < 20; hops++) {
      const route = routes[url];
      if (route === null || route === undefined) throw new TypeError('fetch failed');
      if (typeof route === 'number') {
        const res = new Response('<html><body>ok</body></html>', { status: route });
        Object.defineProperty(res, 'url', { value: url });
        return res;
      }
      url = route;
    }
    throw new TypeError('redirect count exceeded');
  }) as typeof fetch;
  return requested;
}

test('buildUrl keeps an origin scheme and defaults a bare host to https', () => {
  assert.equal(buildUrl('example.com', '/robots.txt'), 'https://example.com/robots.txt');
  assert.equal(buildUrl('https://www.example.com', 'llms.txt'), 'https://www.example.com/llms.txt');
  assert.equal(buildUrl('http://example.com/', '/'), 'http://example.com/');
});

test('homepageCandidates tries the apex, then www, then plain http', () => {
  assert.deepEqual(homepageCandidates('example.com'), [
    'https://example.com/',
    'https://www.example.com/',
    'http://example.com/',
  ]);
  assert.deepEqual(homepageCandidates('www.example.com'), [
    'https://www.example.com/',
    'http://www.example.com/',
  ]);
});

test('follows an apex to www redirect and reports the www origin', async () => {
  stubFetch({
    'https://example.com/': 'https://www.example.com/',
    'https://www.example.com/': 200,
  });
  const home = await fetchHomepage('example.com');
  assert.equal(home.status, 200);
  assert.equal(home.finalUrl, 'https://www.example.com/');
  assert.equal(siteOrigin(home), 'https://www.example.com');
});

test('falls back to www when the apex does not answer at all', async () => {
  const requested = stubFetch({ 'https://www.example.com/': 200 });
  const home = await fetchHomepage('example.com');
  assert.equal(home.status, 200);
  assert.equal(siteOrigin(home), 'https://www.example.com');
  assert.deepEqual(requested, ['https://example.com/', 'https://www.example.com/']);
});

test('falls back to http, following it on to https', async () => {
  stubFetch({
    'http://example.com/': 'https://secure.example.com/en/',
    'https://secure.example.com/en/': 200,
  });
  const home = await fetchHomepage('example.com');
  assert.equal(home.finalUrl, 'https://secure.example.com/en/');
  assert.equal(siteOrigin(home), 'https://secure.example.com');
});

test('keeps an error status rather than trying another host', async () => {
  const requested = stubFetch({ 'https://example.com/': 503 });
  const home = await fetchHomepage('example.com');
  assert.equal(home.status, 503);
  assert.deepEqual(requested, ['https://example.com/']);
});

test('reports the apex when nothing answers', async () => {
  stubFetch({});
  const home: FetchResult = await fetchHomepage('example.com');
  assert.equal(home.status, 0);
  assert.equal(siteOrigin(home), 'https://example.com');
});
