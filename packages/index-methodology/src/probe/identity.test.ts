import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserUserAgent, INDEX_AGENT_TOKEN, INDEX_USER_AGENT } from './identity.ts';

const CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

test('the probe user agent names our token and where to read about it', () => {
  assert.equal(
    INDEX_USER_AGENT,
    'StuntDoubleIndex/1.0 (+https://index.stuntdouble.io/methodology)'
  );
  assert.ok(INDEX_USER_AGENT.startsWith(`${INDEX_AGENT_TOKEN}/`));
});

test('browserUserAgent appends our product to a real Chrome user agent, once', () => {
  const ua = browserUserAgent(CHROME);
  assert.equal(ua, `${CHROME} ${INDEX_USER_AGENT}`);
  assert.equal(browserUserAgent(ua), ua);
  assert.equal(browserUserAgent('  '), INDEX_USER_AGENT);
});
