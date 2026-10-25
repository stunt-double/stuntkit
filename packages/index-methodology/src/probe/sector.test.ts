import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectSector, sectorFromDomainSuffix, type SectorSignals } from './sector.ts';

const blank = (domain: string): SectorSignals => ({
  domain,
  jsonLdTypes: [],
  ogType: null,
  text: '',
  anchors: [],
});

test('a news homepage with a shop link, app badges and item lists is media', () => {
  assert.equal(
    detectSector({
      ...blank('latimes.com'),
      jsonLdTypes: ['NewsMediaOrganization', 'ItemList', 'WebSite'],
      text: 'Breaking news. Politics. Shop the L.A. Times Store. Join our workshop series. Subscribe for $1.',
      anchors: [
        '/politics',
        '/opinion',
        '/sports',
        'https://store.latimes.com/',
        'https://apps.apple.com/us/app/la-times/id373238146?store=1',
        'https://play.google.com/store/apps/details?id=com.latimes',
      ],
    }),
    'media'
  );
});

test('a payment provider that talks about checkout is not e-commerce', () => {
  assert.equal(
    detectSector({
      ...blank('klarna.com'),
      jsonLdTypes: ['Organization'],
      text: 'Pay later with Klarna. Buy now and pay in 4 interest-free payments at checkout. Shop at your favourite stores.',
      anchors: ['/checkout', '/shop', '/business'],
    }),
    'finance'
  );
});

test('a SaaS pricing page with offers stays SaaS', () => {
  assert.equal(
    detectSector({
      ...blank('calendly.com'),
      jsonLdTypes: ['SoftwareApplication', 'Offer', 'AggregateOffer'],
      text: 'Start free. Buy now. Integrations with everything. Free trial.',
      anchors: ['/pricing', '/integrations', '/product'],
    }),
    'saas'
  );
});

test('a retailer with products and a cart is e-commerce', () => {
  assert.equal(
    detectSector({
      ...blank('petsmart.com'),
      jsonLdTypes: ['Product', 'Offer'],
      text: 'Free shipping on orders over $49. Add to cart. Shop all dog food.',
      anchors: ['/cart', '/products/dog-food', 'https://www.petsmart.com/checkout'],
    }),
    'ecommerce'
  );
});

test('an add-to-bag button alone is enough to open e-commerce', () => {
  assert.equal(
    detectSector({
      ...blank('zalando.co.uk'),
      text: 'New arrivals. Add to bag. Free delivery and free returns.',
    }),
    'ecommerce'
  );
});

test('loose shopping words without a product or cart do not make e-commerce', () => {
  assert.equal(
    detectSector({
      ...blank('example.com'),
      text: 'Shop now. Best sellers. Free shipping.',
      anchors: ['/shop', '/store'],
    }),
    'saas'
  );
});

test('keywords match whole words only', () => {
  // "april" is not "apr", "workshop" is not "shop".
  assert.equal(detectSector({ ...blank('example.org'), text: 'Our April workshop.' }), 'saas');
});

test('path hints match whole segments on this site only', () => {
  assert.equal(
    detectSector({
      ...blank('example.com'),
      anchors: ['https://other.com/politics', 'https://www.example.com/news/today'],
    }),
    'media'
  );
  // `/cartoons` is not a cart, so the product links alone do not open e-commerce.
  assert.equal(
    detectSector({ ...blank('example.com'), anchors: ['/cartoons', '/products/a', '/products/b'] }),
    'saas'
  );
});

test('reserved suffixes still decide on their own', () => {
  assert.equal(sectorFromDomainSuffix('nasa.gov'), 'government');
  assert.equal(sectorFromDomainSuffix('ox.ac.uk'), 'education');
  assert.equal(sectorFromDomainSuffix('example.com'), null);
});
