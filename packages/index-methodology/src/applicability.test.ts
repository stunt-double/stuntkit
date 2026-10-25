import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATEGORIES,
  curveScore,
  getApplicableTasks,
  getTasksForSector,
  isCategoryApplicable,
  taskCategories,
  uncurveScore,
  weightedOverallScore,
} from './index.ts';

const all = (score: number) => CATEGORIES.map((c) => ({ category: c.id, score }));

test('weightedOverallScore is unchanged when every category applies', () => {
  assert.equal(weightedOverallScore(all(80)), 80);
  // Missing categories count as 0 raw points: brand awareness alone is its
  // weight's share of the raw points, curved.
  const brand = CATEGORIES.find((c) => c.id === 'brand-awareness')!;
  assert.equal(
    weightedOverallScore(all(80).slice(0, 1)),
    curveScore(uncurveScore(80) * brand.weight)
  );
});

test('a non-applicable category drops out and the rest are scaled back up', () => {
  const scores = all(80).map((s) =>
    s.category === 'delegated-access' ? { ...s, score: 0, applicable: false } : s
  );
  // Without renormalisation this would be 72 (80 * 0.9).
  assert.equal(weightedOverallScore(scores), 80);
});

test('the non-applicable score is ignored, whatever it holds', () => {
  const scores = all(60).map((s) =>
    s.category === 'delegated-access' ? { ...s, score: 100, applicable: false } : s
  );
  assert.equal(weightedOverallScore(scores), 60);
});

test('isCategoryApplicable defaults to true', () => {
  assert.equal(isCategoryApplicable(null, 'delegated-access'), true);
  assert.equal(isCategoryApplicable([{ category: 'delegated-access' }], 'delegated-access'), true);
  assert.equal(
    isCategoryApplicable([{ category: 'delegated-access', applicable: false }], 'delegated-access'),
    false
  );
});

test('getApplicableTasks skips tasks in non-applicable categories only', () => {
  const every = getTasksForSector('saas');
  assert.deepEqual(getApplicableTasks('saas', null), every);
  const triaged = getApplicableTasks('saas', [{ category: 'delegated-access', applicable: false }]);
  assert.equal(triaged.length, every.length - 1);
  assert.ok(triaged.every((t) => !taskCategories(t).includes('delegated-access')));
});

test('getApplicableTasks keeps a shared task while any of its categories applies', () => {
  const research = getTasksForSector('saas').find((t) => t.grades.length === 3)!;
  const triaged = getApplicableTasks('saas', [{ category: 'accuracy', applicable: false }]);
  const kept = triaged.find((t) => t.id === research.id);
  assert.ok(kept, 'the research task still runs');
  assert.deepEqual(taskCategories(kept), ['brand-awareness', 'information-retrieval']);
  // The shared definition is not mutated by the filter.
  assert.equal(research.grades.length, 3);
});

test('getApplicableTasks drops a shared task once none of its categories applies', () => {
  const triaged = getApplicableTasks('saas', [
    { category: 'discovery', applicable: false },
    { category: 'checkout', applicable: false },
  ]);
  assert.ok(triaged.every((t) => !t.id.startsWith('journey-')));
});
