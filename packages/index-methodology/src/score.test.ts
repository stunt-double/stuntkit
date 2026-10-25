import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blendRawScore,
  blendScore,
  CATEGORIES,
  curveScore,
  uncurveScore,
  weightedOverallScore,
} from './index.ts';

// Band edges the Index publishes (`./band.ts`).
const GOOD = { min: 72, max: 85 };
const EXCELLENT_MIN = 85;

test('the curve keeps both ends of the scale fixed', () => {
  assert.equal(curveScore(0), 0);
  assert.equal(curveScore(100), 100);
  assert.equal(curveScore(-5), 0);
  assert.equal(curveScore(120), 100);
});

test('the median site publishes in Good', () => {
  // Medians of the raw overall when the curve was calibrated: every domain
  // (52.6) and the domains the probe could reach (57.8).
  for (const median of [52.6, 57.8]) {
    const published = curveScore(median);
    assert.ok(published >= GOOD.min && published < GOOD.max, `${median} publishes as ${published}`);
  }
});

test('the top decile publishes in Excellent', () => {
  // The raw 90th percentile at calibration.
  assert.ok(curveScore(69.7) >= EXCELLENT_MIN);
});

test('the curve never reorders sites', () => {
  let previous = -1;
  for (let raw = 0; raw <= 100; raw += 0.5) {
    const published = curveScore(raw);
    assert.ok(published >= previous, `${raw} publishes below ${raw - 0.5}`);
    previous = published;
  }
});

test('uncurveScore inverts curveScore to within rounding', () => {
  for (const raw of [1, 12.5, 40, 52.6, 77, 99]) {
    assert.ok(Math.abs(uncurveScore(curveScore(raw)) - raw) < 0.5, `${raw}`);
  }
});

test('blendScore is the curved blend of the raw evidence', () => {
  assert.equal(blendRawScore(50, 70), 62);
  assert.equal(blendScore(50, 70), curveScore(62));
  assert.equal(blendScore(null, 40), curveScore(40));
  assert.equal(blendScore(null, null), 0);
});

test('the overall curves the weighted raw points once', () => {
  // Uneven categories: the overall is the curve of their raw weighted mean,
  // which sits above the plain weighted mean of the curved categories.
  const raw = CATEGORIES.map((c, i) => ({ category: c.id, raw: i % 2 === 0 ? 30 : 80 }));
  const published = raw.map((r) => ({ category: r.category, score: curveScore(r.raw) }));
  const rawMean = raw.reduce(
    (sum, r) => sum + r.raw * CATEGORIES.find((c) => c.id === r.category)!.weight,
    0
  );
  const overall = weightedOverallScore(published);
  assert.ok(Math.abs(overall - curveScore(rawMean)) <= 0.2, `${overall} vs ${curveScore(rawMean)}`);
});

test('weights still sum to 1', () => {
  const total = CATEGORIES.reduce((sum, c) => sum + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});
