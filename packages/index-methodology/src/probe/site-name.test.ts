import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  looksLikeSentence,
  nameFromDomain,
  nameMatchesDomain,
  planNameRepairs,
  repairStoredName,
  resolveSiteName,
} from './site-name.ts';

test('a photo caption in og:title never becomes the name', () => {
  assert.equal(
    resolveSiteName({
      domain: 'bing.com',
      titles: ['Rock on, Milky Way!', 'Search - Microsoft Bing'],
    }),
    'Microsoft Bing'
  );
  assert.equal(resolveSiteName({ domain: 'bing.com', titles: ['Rock on, Milky Way!'] }), 'Bing');
});

test('a declared site name wins when it matches the domain', () => {
  assert.equal(
    resolveSiteName({
      domain: 'stripe.com',
      declared: ['Stripe'],
      titles: ['Financial Infrastructure to Grow Your Revenue'],
    }),
    'Stripe'
  );
});

test('a tagline title is cut to the segment that names the brand', () => {
  assert.equal(
    resolveSiteName({ domain: 'shopify.com', titles: ['Start your business - Shopify'] }),
    'Shopify'
  );
});

test('a declared name that does not match is still trusted if it reads as a name', () => {
  assert.equal(
    resolveSiteName({ domain: 'facebook.com', declared: ['Meta'], titles: ['Log in or sign up'] }),
    'Meta'
  );
});

test('initials and multi-part suffixes match', () => {
  assert.equal(nameMatchesDomain('British Broadcasting Corporation', 'bbc.co.uk'), true);
  assert.equal(nameMatchesDomain('Booking.com', 'booking.com'), true);
  assert.equal(nameMatchesDomain('Rock on, Milky Way!', 'bing.com'), false);
  assert.equal(nameFromDomain('my-shop.co.uk'), 'My Shop');
});

test('sentences are told apart from names', () => {
  assert.equal(looksLikeSentence('Rock on, Milky Way!'), true);
  assert.equal(looksLikeSentence('Booking.com'), false);
  assert.equal(looksLikeSentence('Best Western'), false);
});

test('stored names are repaired on the way out', () => {
  assert.equal(repairStoredName('Rock on, Milky Way!', 'bing.com', 'Rock on, Milky Way!'), 'Bing');
  assert.equal(repairStoredName('Stripe | Payments', 'stripe.com', null), 'Stripe');
  assert.equal(repairStoredName('Meta', 'facebook.com', null), 'Meta');
});

test('a colon or guillemet separates the name from its tagline', () => {
  assert.equal(
    resolveSiteName({
      domain: 'shopify.com',
      titles: ['Shopify: The All-in-One Commerce Platform for Businesses'],
    }),
    'Shopify'
  );
  assert.equal(
    resolveSiteName({ domain: 'stripe.com', titles: ['Stripe » Financial Infrastructure'] }),
    'Stripe'
  );
  assert.equal(
    resolveSiteName({ domain: 'example.com', titles: ['https://example.com'] }),
    'Example'
  );
});

test('a run-on title gives up its first clause', () => {
  assert.equal(
    resolveSiteName({ domain: 'amazon.com', titles: ['Amazon.com. Spend less. Smile more.'] }),
    'Amazon.com'
  );
});

test('a short punctuated name is kept whole', () => {
  assert.equal(resolveSiteName({ domain: 'mrporter.com', titles: ['Mr. Porter'] }), 'Mr. Porter');
  assert.equal(resolveSiteName({ domain: 'yahoo.com', titles: ['Yahoo!'] }), 'Yahoo!');
});

test('a long title with no separator yields the words that spell the domain', () => {
  assert.equal(
    resolveSiteName({
      domain: 'woolworths.com.au',
      titles: ['Woolworths Online Shopping For Groceries Delivered To Your Door'],
    }),
    'Woolworths'
  );
  assert.equal(
    resolveSiteName({
      domain: 'jbhifi.com.au',
      titles: ["JB Hi-Fi Australia's Largest Home Entertainment Retailer"],
    }),
    'JB Hi-Fi'
  );
});

test('a name is never cut with an ellipsis', () => {
  const name = resolveSiteName({
    domain: 'example.com',
    declared: ['Welcome to the best online store for all of your everyday needs'],
  });
  assert.equal(name, 'Example');
  assert.equal(
    repairStoredName('Shopify: The All-in-One Commerce Platfo…', 'shopify.com', null),
    'Shopify'
  );
  assert.equal(
    repairStoredName('Figma: The Collaborative Interface Desi…', 'figma.com', null),
    'Figma'
  );
});

test('a backfill plan lists only the names that change', () => {
  assert.deepEqual(
    planNameRepairs([
      { domain: 'stripe.com', name: 'Stripe', title: 'Stripe | Payments' },
      { domain: 'shopify.com', name: 'Shopify: The All-in-One Commerce Platfo…', title: null },
      { domain: 'bing.com', name: 'Rock on, Milky Way!', title: 'Rock on, Milky Way!' },
    ]),
    [
      { domain: 'shopify.com', from: 'Shopify: The All-in-One Commerce Platfo…', to: 'Shopify' },
      { domain: 'bing.com', from: 'Rock on, Milky Way!', to: 'Bing' },
    ]
  );
});
