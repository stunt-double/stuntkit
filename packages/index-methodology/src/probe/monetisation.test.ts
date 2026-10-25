import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectMonetisation, pricingApplies, type MonetisationSignals } from './monetisation.ts';

const prose = 'Our reporting covers local news, science and culture. '.repeat(20);

const base: MonetisationSignals = {
  anchors: ['/about', '/news', '/newsletter'],
  text: `${prose} Subscribe to our newsletter.`,
  raw: '<html></html>',
  pageUrl: 'https://example.org/',
  pricingPage: false,
  offerSchema: false,
  ucp: false,
};

test('a publication with a newsletter is not monetised', () => {
  assert.equal(detectMonetisation(base).monetised, false);
});

test('a thin app shell stays scored', () => {
  assert.equal(detectMonetisation({ ...base, text: 'Loading' }).monetised, true);
});

test('a visible price counts', () => {
  assert.equal(detectMonetisation({ ...base, text: `${prose} From $19` }).monetised, true);
});

test('a pricing page, offer schema or UCP counts on its own', () => {
  assert.equal(detectMonetisation({ ...base, pricingPage: true }).monetised, true);
  assert.equal(detectMonetisation({ ...base, offerSchema: true }).monetised, true);
  assert.equal(detectMonetisation({ ...base, ucp: true }).monetised, true);
});

test('a payment rail in the HTML counts', () => {
  const raw = '<script src="https://js.stripe.com/v3"></script>';
  assert.equal(detectMonetisation({ ...base, raw }).monetised, true);
});

test('a link to a shop, cart or plans counts, off-site ones do not', () => {
  assert.equal(detectMonetisation({ ...base, anchors: ['/shop/'] }).monetised, true);
  assert.equal(detectMonetisation({ ...base, anchors: ['/plans'] }).monetised, true);
  assert.equal(
    detectMonetisation({ ...base, anchors: ['https://store.example.org/'] }).monetised,
    false
  );
  assert.equal(
    detectMonetisation({ ...base, anchors: ['https://other.com/pricing'] }).monetised,
    false
  );
});

test('commerce copy counts', () => {
  assert.equal(
    detectMonetisation({ ...base, text: `${prose} Start your free trial` }).monetised,
    true
  );
});

test('a stored verdict decides the pricing checks over detection', () => {
  const detect = () => {
    throw new Error('detection should not run');
  };
  assert.equal(pricingApplies('free', detect), false);
  assert.equal(pricingApplies('monetised', detect), true);
});

test('with no stored verdict, detection decides', () => {
  assert.equal(
    pricingApplies(null, () => true),
    true
  );
  assert.equal(
    pricingApplies(null, () => false),
    false
  );
});
