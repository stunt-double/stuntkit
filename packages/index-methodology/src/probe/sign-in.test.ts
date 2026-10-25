import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectSignIn, type SignInSignals } from './sign-in.ts';

const base: SignInSignals = {
  anchors: [],
  text: 'Welcome to our bakery. Visit us on Main Street.',
  pageUrl: 'https://example.com/',
  authMetadata: false,
  accountPages: false,
};

test('a brochure site with no account surface has no sign-in', () => {
  const r = detectSignIn({ ...base, anchors: ['/about', '/menu', 'mailto:hi@example.com'] });
  assert.equal(r.hasSignIn, false);
});

test('a login link counts', () => {
  assert.equal(detectSignIn({ ...base, anchors: ['/login'] }).hasSignIn, true);
  assert.equal(detectSignIn({ ...base, anchors: ['/users/sign_in'] }).hasSignIn, true);
  assert.equal(detectSignIn({ ...base, anchors: ['/account/orders'] }).hasSignIn, true);
});

test('a link to the signed-in product subdomain counts', () => {
  const r = detectSignIn({ ...base, anchors: ['https://app.example.com/'] });
  assert.equal(r.hasSignIn, true);
});

test('paths that merely contain an account word do not count', () => {
  const r = detectSignIn({ ...base, anchors: ['/blog/accounting-tips', '/authors/jane'] });
  assert.equal(r.hasSignIn, false);
});

test('sign-in copy on the homepage counts', () => {
  assert.equal(detectSignIn({ ...base, text: 'Pricing  Log in  Get started' }).hasSignIn, true);
});

test('auth metadata or an account page counts on its own', () => {
  assert.equal(detectSignIn({ ...base, authMetadata: true }).hasSignIn, true);
  assert.equal(detectSignIn({ ...base, accountPages: true }).hasSignIn, true);
});
