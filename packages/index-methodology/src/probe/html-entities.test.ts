import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeHtmlEntities } from './html-entities.ts';

test('decodes numeric references, hex and decimal', () => {
  assert.equal(decodeHtmlEntities('Stunt Double&#x27;s actors'), "Stunt Double's actors");
  assert.equal(decodeHtmlEntities('Stunt Double&#39;s actors'), "Stunt Double's actors");
});

test('decodes the common named references', () => {
  assert.equal(decodeHtmlEntities('Tom &amp; Jerry &rsquo;s'), 'Tom & Jerry ’s');
  assert.equal(decodeHtmlEntities('&quot;quoted&quot;'), '"quoted"');
});

test('turns dashes into hyphens', () => {
  assert.equal(decodeHtmlEntities('a &mdash; b &#8212; c'), 'a - b - c');
});

test('leaves unknown and malformed references alone', () => {
  assert.equal(decodeHtmlEntities('&bogus; & &#xZZ;'), '&bogus; & &#xZZ;');
  assert.equal(decodeHtmlEntities('plain text'), 'plain text');
});

test('leaves lone surrogates and out-of-range code points as written', () => {
  assert.equal(decodeHtmlEntities('&#xD800;'), '&#xD800;');
  assert.equal(decodeHtmlEntities('&#57343;'), '&#57343;');
  assert.equal(decodeHtmlEntities('&#x110000;'), '&#x110000;');
  assert.equal(decodeHtmlEntities('&#x1F600;'), '\u{1F600}');
});
