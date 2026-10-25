import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_CATEGORY_TAG_LENGTH,
  MAX_CATEGORY_TAGS,
  normaliseCategoryTags,
} from './category-tags.ts';

test('splits a comma-joined list stored as one tag', () => {
  assert.deepEqual(
    normaliseCategoryTags([
      'ai agents, ai agent platform, durable execution, ai agent framework, llm observability, background jobs',
    ]),
    [
      'ai agents',
      'ai agent platform',
      'durable execution',
      'ai agent framework',
      'llm observability',
      'background jobs',
    ]
  );
});

test('trims, lowercases, collapses whitespace and dedupes across separators', () => {
  assert.deepEqual(normaliseCategoryTags(['  Background   Jobs ;AI|ai ', 'ai,', '']), [
    'background jobs',
    'ai',
  ]);
});

test('drops non-strings and tags past the length limit', () => {
  const long = 'x'.repeat(MAX_CATEGORY_TAG_LENGTH + 1);
  assert.deepEqual(normaliseCategoryTags([null, 3, `${long}, kept`]), ['kept']);
});

test('caps the number of tags', () => {
  const many = Array.from({ length: MAX_CATEGORY_TAGS + 5 }, (_, i) => `tag ${i}`).join(',');
  assert.equal(normaliseCategoryTags([many]).length, MAX_CATEGORY_TAGS);
});
