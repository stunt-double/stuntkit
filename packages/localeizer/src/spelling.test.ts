import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localiseSpelling, spellingDictionary } from './index.ts';

test('British spelling rewrites the American source copy', () => {
  assert.equal(
    localiseSpelling(
      'Organize the color of the center, then analyze the canceled catalog.',
      'british'
    ),
    'Organise the colour of the centre, then analyse the cancelled catalogue.'
  );
  assert.equal(localiseSpelling('Synthesized findings', 'british'), 'Synthesised findings');
  assert.equal(
    localiseSpelling('unrecognized, mislabeled', 'british'),
    'unrecognised, mislabelled'
  );
  assert.equal(localiseSpelling('behavioral optimization', 'british'), 'behavioural optimisation');
  assert.equal(localiseSpelling('a favorite judgment', 'british'), 'a favourite judgement');
});

test('American spelling normalises any British word left in the source', () => {
  assert.equal(
    localiseSpelling(
      'Organise the colour of the centre, then analyse the cancelled catalogue.',
      'american'
    ),
    'Organize the color of the center, then analyze the canceled catalog.'
  );
  assert.equal(localiseSpelling('a favourite judgement', 'american'), 'a favorite judgment');
});

test('American words that are also British are never made British', () => {
  const text =
    'Check the story, then practice: a program with a license, a usage meter, metered billing, a build artifact, focused and oriented.';
  assert.equal(localiseSpelling(text, 'british'), text);
  assert.equal(localiseSpelling('Rechecks and reprograms', 'british'), 'Rechecks and reprograms');
  assert.equal(localiseSpelling('a respecter of analyses', 'british'), 'a respecter of analyses');
  assert.equal(localiseSpelling('two analyses', 'american'), 'two analyses');
});

test('words that only look British or American are left alone', () => {
  const text =
    'Our promise: four hours of expertise, otherwise we advertise the enterprise tour. Synthesis, contour, dialogue, precise, size, prize, error, major, motor.';
  assert.equal(localiseSpelling(text, 'american'), text);
  assert.equal(localiseSpelling(text, 'british'), text);
});

test('case is carried and mixed case is untouched', () => {
  assert.equal(localiseSpelling('COLOR Color color', 'british'), 'COLOUR Colour colour');
  assert.equal(localiseSpelling('COLOUR Colour colour', 'american'), 'COLOR Color color');
  assert.equal(localiseSpelling('ColOr', 'british'), 'ColOr');
});

test('proper nouns and identifiers keep their spelling', () => {
  assert.equal(localiseSpelling('Parlour', 'american'), 'Parlour');
  assert.equal(localiseSpelling('color.com and /center', 'british'), 'color.com and /center');
  assert.equal(localiseSpelling('the color. Next', 'british'), 'the colour. Next');
  assert.equal(
    localiseSpelling('user-centered, well-organized', 'british'),
    'user-centred, well-organised'
  );
});

test('Canadian takes -our and -re but keeps -ize, from either source', () => {
  assert.equal(
    localiseSpelling('Organize the color of the center and analyze it.', 'canadian'),
    'Organize the colour of the centre and analyze it.'
  );
  assert.equal(
    localiseSpelling('Organise the colour of the centre and analyse it.', 'canadian'),
    'Organize the colour of the centre and analyze it.'
  );
  assert.equal(localiseSpelling('a skeptical program', 'canadian'), 'a skeptical program');
});

test('every rewrite is idempotent', () => {
  for (const system of ['british', 'american', 'canadian'] as const) {
    const once = localiseSpelling(
      'Organized colors, centered and canceled, gray catalogs.',
      system
    );
    assert.equal(localiseSpelling(once, system), once);
  }
});

test('an unchanged string is returned by identity', () => {
  const text = 'Nothing to change here.';
  assert.equal(localiseSpelling(text, 'british'), text);
  assert.equal(localiseSpelling(text, 'american'), text);
});

test('the dictionary maps whole lowercase words, source to target', () => {
  assert.equal(spellingDictionary('british').get('color'), 'colour');
  assert.equal(spellingDictionary('american').get('colour'), 'color');
  assert.equal(spellingDictionary('canadian').get('organise'), 'organize');
  assert.equal(spellingDictionary('british').get('promise'), undefined);
  assert.equal(spellingDictionary('british'), spellingDictionary('british'));
});
