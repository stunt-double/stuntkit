import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  effectiveMonetisation,
  monetisationFromDomain,
  parseMonetisation,
} from './monetisation-model.ts';

test('parses only the two stored values', () => {
  assert.equal(parseMonetisation('monetised'), 'monetised');
  assert.equal(parseMonetisation('free'), 'free');
  assert.equal(parseMonetisation('paid'), null);
  assert.equal(parseMonetisation(null), null);
  assert.equal(parseMonetisation(undefined), null);
});

test('an admin override wins over the classifier', () => {
  assert.equal(effectiveMonetisation('monetised', 'free'), 'free');
  assert.equal(effectiveMonetisation('free', 'monetised'), 'monetised');
  assert.equal(effectiveMonetisation('monetised', null), 'monetised');
  assert.equal(effectiveMonetisation(null, null), null);
  assert.equal(effectiveMonetisation('monetised', 'bogus'), 'monetised');
});

test('government domains are free', () => {
  for (const domain of [
    'ssa.gov',
    'dmv.ca.gov',
    'healthcare.gov',
    'who.int',
    'gov.uk',
    'hmrc.gov.uk',
    'service.gov.au',
    'ato.gov.au',
    'impots.gouv.fr',
    'sat.gob.mx',
    'ird.govt.nz',
    'canada.gc.ca',
    'digital.go.jp',
    'www.gov.uk',
    'europa.eu',
    'ec.europa.eu',
  ]) {
    assert.equal(monetisationFromDomain(domain), 'free', domain);
  }
});

test('other domains are left to the classifier', () => {
  for (const domain of [
    'amazon.com',
    'wikipedia.org',
    'harvard.edu',
    'govee.com',
    'gov.example.com',
    'goodreads.com',
    'notgov.uk',
    'mint.com',
    'europa.com',
    '',
  ]) {
    assert.equal(monetisationFromDomain(domain), null, domain);
  }
});
