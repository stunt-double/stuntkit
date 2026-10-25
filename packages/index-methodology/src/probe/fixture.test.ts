// One fixture site through the whole probe, with fetch stubbed. A contributed
// check should ship with a page that passes it and one that fails it; this is
// the harness for that, and it pins the shape a report comes back in.

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { runProbe } from './run.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const HOME = `<!doctype html><html lang="en"><head>
<title>Acme Widgets</title>
<meta name="description" content="Widgets for every workshop, shipped in a day.">
<link rel="icon" href="/favicon.ico">
<meta property="og:site_name" content="Acme">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
</head><body>
<nav><a href="/pricing">Pricing</a> <a href="/contact">Contact</a> <a href="/docs">Docs</a></nav>
<main><h1>Widgets for every workshop</h1>
<p>${'Acme sells widgets, with clear prices and a documented API for teams that automate their ordering. '.repeat(12)}</p>
</main></body></html>`;

/** Serves `routes`; anything else is a 404 with an HTML body, like most sites. */
function stubSite(routes: Record<string, { status?: number; body: string; type?: string }>) {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    requested.push(url.pathname);
    const route = routes[url.pathname] ?? {
      status: 404,
      body: '<!doctype html><html><body>Not found</body></html>',
      type: 'text/html',
    };
    return new Response(init?.method === 'HEAD' ? null : route.body, {
      status: route.status ?? 200,
      headers: { 'content-type': route.type ?? 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;
  return requested;
}

test('a fixture site yields a report with every category and the probe evidence', async () => {
  stubSite({
    '/': { body: HOME },
    '/robots.txt': {
      body: 'User-agent: *\nAllow: /\nSitemap: https://acme.test/sitemap.xml\n',
      type: 'text/plain',
    },
    '/sitemap.xml': {
      body: '<urlset><url><loc>https://acme.test/</loc></url></urlset>',
      type: 'application/xml',
    },
    '/llms.txt': { body: '# Acme\n\n> Widgets for workshops.\n', type: 'text/plain' },
  });

  const report = await runProbe('acme.test');

  assert.equal(report.domain, 'acme.test');
  assert.equal(report.reachable, true);
  assert.equal(report.homepageStatus, 200);
  assert.equal(report.categoryScores.length, 8);
  for (const c of report.categoryScores) {
    assert.ok(c.score >= 0 && c.score <= 100, `${c.category} is on the published scale`);
    assert.ok(report.findings[c.category]?.length > 0, `${c.category} has findings`);
  }
  const discovery = report.findings.discovery.find((f) => f.id === 'robots-txt');
  assert.equal(discovery?.passed, true, 'a robots.txt that allows us passes');
  const llms = report.findings.discovery.find((f) => f.id === 'llms-txt');
  assert.equal(llms?.passed, true, 'a real llms.txt passes');
});

test('a site that turns the probe away is reported as unreachable', async () => {
  stubSite({ '/': { status: 403, body: 'Forbidden' } });
  const report = await runProbe('blocked.test');
  assert.equal(report.reachable, false);
  assert.equal(report.homepageStatus, 403);
});

test('an opt-out in robots.txt stops the probe before any other request', async () => {
  const requested = stubSite({
    '/robots.txt': { body: 'User-agent: StuntDoubleIndex\nDisallow: /\n', type: 'text/plain' },
    '/': { body: HOME },
  });
  const report = await runProbe('optout.test');
  assert.ok(report.optOut, 'the report says the site opted out');
  assert.equal(report.categoryScores.length, 0, 'an opted-out site is not scored');
  assert.ok(!requested.includes('/llms.txt'), 'nothing past the gate is fetched');
});
