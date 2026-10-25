import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpolatePrompt } from '../index.ts';
import { homepageCandidates, resolveSiteOrigin } from './origin.ts';

// Answers by URL: a string is a redirect target, a number a status, anything
// else a connection failure.
function stubFetch(routes: Record<string, string | number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    let url = String(input);
    for (let hops = 0; hops < 20; hops++) {
      const route = routes[url];
      if (typeof route === 'number') {
        const res = new Response('ok', { status: route });
        Object.defineProperty(res, 'url', { value: url });
        return res;
      }
      if (typeof route !== 'string') throw new TypeError('fetch failed');
      url = route;
    }
    throw new TypeError('redirect count exceeded');
  }) as typeof fetch;
}

test('candidates run apex, www, then http', () => {
  assert.deepEqual(homepageCandidates('https://Example.com/path'), [
    'https://example.com/',
    'https://www.example.com/',
    'http://example.com/',
  ]);
});

test('follows an apex redirect to www, keeping the page it settled on', async () => {
  const resolved = await resolveSiteOrigin('example.com', {
    fetchImpl: stubFetch({
      'https://example.com/': 'https://www.example.com/en/',
      'https://www.example.com/en/': 200,
    }),
  });
  assert.deepEqual(resolved, {
    origin: 'https://www.example.com',
    homepageUrl: 'https://www.example.com/en/',
    reachable: true,
    xRobotsTag: null,
  });
});

test('falls back to www, then http, when the apex does not answer', async () => {
  const www = await resolveSiteOrigin('example.com', {
    fetchImpl: stubFetch({ 'https://www.example.com/': 403 }),
  });
  assert.equal(www.origin, 'https://www.example.com');
  const http = await resolveSiteOrigin('example.com', {
    fetchImpl: stubFetch({ 'http://example.com/': 200 }),
  });
  assert.equal(http.origin, 'http://example.com');
});

test('reports the https apex, unreachable, when nothing answers', async () => {
  const resolved = await resolveSiteOrigin('example.com', { fetchImpl: stubFetch({}) });
  assert.equal(resolved.origin, 'https://example.com');
  assert.equal(resolved.reachable, false);
});

test('interpolatePrompt starts from the origin but names the bare domain', () => {
  const template = 'Go to https://{domain}/pricing. Is {domain} cheaper than its rivals?';
  assert.equal(
    interpolatePrompt(template, 'example.com', 'https://www.example.com'),
    'Go to https://www.example.com/pricing. Is example.com cheaper than its rivals?'
  );
  assert.equal(
    interpolatePrompt(template, 'example.com'),
    'Go to https://example.com/pricing. Is example.com cheaper than its rivals?'
  );
});
