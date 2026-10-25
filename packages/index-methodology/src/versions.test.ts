import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INDEX_SCORING_VERSION, isOutdatedScoringVersion, SCORING_VERSIONS } from './versions.ts';

test('the current version is the newest entry', () => {
  assert.equal(INDEX_SCORING_VERSION, SCORING_VERSIONS[0]!.version);
});

test('versions are unique and newest first', () => {
  const versions = SCORING_VERSIONS.map((v) => v.version);
  assert.equal(new Set(versions).size, versions.length);
  const dates = SCORING_VERSIONS.map((v) => Date.parse(v.since));
  assert.deepEqual(
    dates,
    [...dates].sort((a, b) => b - a)
  );
});

test('a missing or older version is outdated', () => {
  assert.equal(isOutdatedScoringVersion(INDEX_SCORING_VERSION), false);
  assert.equal(isOutdatedScoringVersion(null), true);
  assert.equal(isOutdatedScoringVersion(undefined), true);
  assert.equal(isOutdatedScoringVersion('2000.01'), true);
});
