import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  indexCrawlDelayMs,
  indexMayFetch,
  indexOptOut,
  isPathAllowed,
  parseRobots,
  policyFor,
  providerAllowedByRobots,
  robotsBodyToObey,
  xRobotsTagOptOut,
} from './robots.ts';

test('consecutive user-agent lines share a group; a rule closes it', () => {
  const groups = parseRobots(
    [
      'Disallow: /ignored-before-any-agent',
      'User-agent: GPTBot/1.1',
      'User-agent: ClaudeBot # trailing comment',
      'Disallow: /private',
      'User-agent: *',
      'Allow: /',
      'Sitemap: https://example.com/sitemap.xml',
      'Crawl-delay: 2',
    ].join('\n')
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].agents, ['gptbot', 'claudebot']);
  assert.deepEqual(groups[0].rules, [{ allow: false, pattern: '/private' }]);
  assert.deepEqual(groups[1].agents, ['*']);
  assert.equal(groups[1].crawlDelay, 2);
});

test('a group naming the agent beats *, and several naming it are merged', () => {
  const robots = [
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: StuntDoubleIndex',
    'Disallow: /admin',
    '',
    'User-agent: stuntdoubleindex',
    'Disallow: /cart',
  ].join('\n');
  const policy = policyFor(robots, 'StuntDoubleIndex');
  assert.equal(policy.matched, 'agent');
  assert.equal(policy.rules.length, 2);
  assert.equal(indexMayFetch(robots, '/'), true);
  assert.equal(indexMayFetch(robots, '/admin/users'), false);
  assert.equal(indexMayFetch(robots, '/cart'), false);
  // Another agent falls back to `*`.
  assert.equal(policyFor(robots, 'GPTBot').matched, 'wildcard');
});

test('the longest matching pattern wins, and Allow wins a tie', () => {
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /docs', 'Allow: /docs/public', 'Disallow: /x', 'Allow: /x'].join(
      '\n'
    )
  )[0].rules;
  assert.equal(isPathAllowed(rules, '/docs/private'), false);
  assert.equal(isPathAllowed(rules, '/docs/public/page'), true);
  assert.equal(isPathAllowed(rules, '/x'), true);
  assert.equal(isPathAllowed(rules, '/elsewhere'), true);
});

test('wildcards and end anchors match as RFC 9309 describes', () => {
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /*.json$', 'Disallow: /search*q=', 'Disallow: /*'].join('\n')
  )[0].rules;
  assert.equal(isPathAllowed(rules, '/'), false, '`/*` covers the root');
  const narrow = parseRobots(['User-agent: *', 'Disallow: /*.json$'].join('\n'))[0].rules;
  assert.equal(isPathAllowed(narrow, '/openapi.json'), false);
  assert.equal(isPathAllowed(narrow, '/openapi.json?v=2'), true);
  assert.equal(isPathAllowed(narrow, '/robots.txt'), true);
});

test('an empty Disallow allows everything', () => {
  assert.equal(indexMayFetch('User-agent: *\nDisallow:\n', '/'), true);
});

test('Crawl-delay comes from our group and is capped', () => {
  assert.equal(indexCrawlDelayMs('User-agent: *\nCrawl-delay: 1.5\n'), 1500);
  assert.equal(indexCrawlDelayMs('User-agent: *\nCrawl-delay: 120\n'), 10_000);
  assert.equal(
    indexCrawlDelayMs('User-agent: *\nCrawl-delay: 5\nUser-agent: StuntDoubleIndex\nAllow: /\n'),
    0,
    'a group naming us without a delay replaces the `*` one'
  );
  assert.equal(indexCrawlDelayMs('User-agent: *\nCrawl-delay: soon\n'), 0);
});

test('a provider is allowed when any token the file names is allowed', () => {
  const robots = [
    'User-agent: GPTBot',
    'Disallow: /',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'User-agent: ClaudeBot',
    'Disallow: /',
    'User-agent: *',
    'Allow: /',
  ].join('\n');
  assert.equal(providerAllowedByRobots(robots, ['gptbot', 'chatgpt-user']), true);
  assert.equal(providerAllowedByRobots(robots, ['claudebot', 'anthropic-ai']), false);
  assert.equal(providerAllowedByRobots(robots, ['perplexitybot']), true);
  assert.equal(providerAllowedByRobots('User-agent: *\nDisallow: /\n', ['bingbot']), false);
  assert.equal(providerAllowedByRobots('User-agent: *\nDisallow: /\n', []), true);
});

test('robots.txt bodies only count when they are rules', () => {
  assert.equal(robotsBodyToObey({ status: 200, body: 'User-agent: *' }), 'User-agent: *');
  assert.equal(robotsBodyToObey({ status: 404, body: 'User-agent: *\nDisallow: /' }), '');
  assert.equal(robotsBodyToObey({ status: 503, body: 'User-agent: *\nDisallow: /' }), '');
  assert.equal(
    robotsBodyToObey({ status: 200, body: '<!doctype html><p>Disallow: /</p>' }),
    '',
    'a catch-all HTML page has no rules'
  );
  assert.equal(
    robotsBodyToObey({ status: 200, body: 'Disallow: /', contentType: 'text/html' }),
    ''
  );
});

test('X-Robots-Tag: noai and none opt us out, unscoped or scoped to us', () => {
  assert.equal(xRobotsTagOptOut('noai, noimageai'), 'noai');
  assert.equal(xRobotsTagOptOut('NONE'), 'NONE');
  assert.equal(xRobotsTagOptOut('StuntDoubleIndex: noai'), 'StuntDoubleIndex: noai');
  assert.equal(xRobotsTagOptOut('googlebot: none'), null, 'scoped to someone else');
  assert.equal(
    xRobotsTagOptOut('googlebot: noindex, stuntdoubleindex: none'),
    'stuntdoubleindex: none'
  );
  assert.equal(xRobotsTagOptOut('noindex, nofollow'), null);
  assert.equal(xRobotsTagOptOut('max-snippet: 20, unavailable_after: 2030-01-01'), null);
  assert.equal(xRobotsTagOptOut(null), null);
});

test('indexOptOut reads robots.txt first, then X-Robots-Tag', () => {
  assert.deepEqual(indexOptOut({ robotsBody: 'User-agent: StuntDoubleIndex\nDisallow: /' }), {
    source: 'robots-txt',
    detail: 'robots.txt disallows StuntDoubleIndex',
  });
  assert.deepEqual(indexOptOut({ robotsBody: 'User-agent: *\nDisallow: /' }), {
    source: 'robots-txt',
    detail: 'robots.txt disallows all agents',
  });
  assert.equal(
    indexOptOut({
      robotsBody: 'User-agent: *\nDisallow: /\nUser-agent: StuntDoubleIndex\nAllow: /',
    }),
    null,
    'a group allowing us overrides a blanket disallow'
  );
  assert.equal(
    indexOptOut({ robotsBody: 'User-agent: *\nDisallow: /admin' }),
    null,
    'a partial disallow is not an opt-out'
  );
  assert.deepEqual(indexOptOut({ robotsBody: '', xRobotsTag: 'noai' }), {
    source: 'x-robots-tag',
    detail: 'X-Robots-Tag: noai',
  });
});
