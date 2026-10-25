import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasSessionEvidence,
  parseUnscoredReason,
  probeUnscoredReason,
  unscoredReasonFor,
} from './unscored.ts';

test('a reachable probe is scored', () => {
  assert.equal(probeUnscoredReason({ reachable: true, homepageStatus: 200 }), null);
});

test('401, 403 and 429 read as blocked', () => {
  for (const status of [401, 403, 429]) {
    assert.equal(probeUnscoredReason({ reachable: false, homepageStatus: status }), 'blocked');
  }
});

test('no answer or any other failure reads as unreachable', () => {
  for (const status of [0, 404, 500, 503]) {
    assert.equal(probeUnscoredReason({ reachable: false, homepageStatus: status }), 'unreachable');
  }
});

test('session evidence needs a numeric sessionScore', () => {
  assert.equal(hasSessionEvidence(null), false);
  assert.equal(hasSessionEvidence([]), false);
  assert.equal(hasSessionEvidence([{ category: 'checkout', sessionScore: null }]), false);
  assert.equal(hasSessionEvidence([{ category: 'checkout', score: 40 }]), false);
  assert.equal(hasSessionEvidence([{ category: 'checkout', sessionScore: Number.NaN }]), false);
  assert.equal(hasSessionEvidence([{ category: 'checkout', sessionScore: 0 }]), true);
  assert.equal(
    hasSessionEvidence([{ category: 'discovery' }, { category: 'checkout', sessionScore: 62 }]),
    true
  );
});

test('session evidence keeps a blocked domain scored', () => {
  const blocked = { reachable: false, homepageStatus: 403 };
  assert.equal(unscoredReasonFor(blocked, [{ category: 'checkout', sessionScore: 70 }]), null);
  assert.equal(
    unscoredReasonFor(blocked, [{ category: 'checkout', sessionScore: null }]),
    'blocked'
  );
  assert.equal(unscoredReasonFor({ reachable: false, homepageStatus: 0 }, []), 'unreachable');
  assert.equal(unscoredReasonFor({ reachable: true, homepageStatus: 200 }, []), null);
});

test('stored values parse to a known reason or null', () => {
  assert.equal(parseUnscoredReason('blocked'), 'blocked');
  assert.equal(parseUnscoredReason('unreachable'), 'unreachable');
  assert.equal(parseUnscoredReason('opted_out'), 'opted_out');
  assert.equal(parseUnscoredReason(null), null);
  assert.equal(parseUnscoredReason('other'), null);
});

test('a probe never produces opted_out, so re-scoring after an opt-out clears it', () => {
  // The writers set `opted_out` themselves when they see the opt-out; once it
  // is lifted, the next probe's reason replaces it.
  assert.equal(unscoredReasonFor({ reachable: true, homepageStatus: 200 }, []), null);
  assert.equal(unscoredReasonFor({ reachable: false, homepageStatus: 403 }, []), 'blocked');
  assert.equal(unscoredReasonFor({ reachable: false, homepageStatus: 0 }, []), 'unreachable');
  assert.equal(
    unscoredReasonFor({ reachable: false, homepageStatus: 403 }, [{ sessionScore: 55 }]),
    null
  );
});

test('pending parses as a reason but no probe produces it', () => {
  assert.equal(parseUnscoredReason('pending'), 'pending');
  assert.equal(parseUnscoredReason('something-else'), null);
  assert.equal(unscoredReasonFor({ reachable: true, homepageStatus: 200 }, []), null);
});
