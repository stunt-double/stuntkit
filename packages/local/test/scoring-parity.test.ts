/**
 * A local run must reach the verdict a cloud run would on the same results.
 * The fixtures are the cloud's own scoring cases (the monorepo's
 * `packages/platform/src/checklists/scoring.test.ts`), written as local
 * checklist files, so this pins both the vendored scoring and the mapping from
 * `.stuntdouble/checklists/*.json` and run results onto it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type Checklist, ChecklistSchema, type Result } from '../src/files.ts';
import { scoreLocalRun } from '../src/run.ts';
import { describeRunScore } from '../src/vendor/scoring/scoring.ts';

type CheckInput = { key: string; type?: string; weight?: number; on_failure?: string };

function checklist(checks: CheckInput[], extra: Record<string, unknown> = {}): Checklist {
  return ChecklistSchema.parse({
    name: 'Fixture',
    actor: 'tester',
    url: 'https://example.com/',
    instructions: 'Exercise the product.',
    checks: checks.map((c) => ({ description: `Check ${c.key}`, ...c })),
    ...extra,
  });
}

const results = (pairs: Array<[string, Result['status']]>): Result[] =>
  pairs.map(([check, status]) => ({ check, status, evidence: '' }));

test('an unweighted checklist fails on any failure and has nothing to score', () => {
  const list = checklist([{ key: 'a' }, { key: 'b' }]);
  const clean = scoreLocalRun(
    list,
    results([
      ['a', 'passed'],
      ['b', 'passed'],
    ])
  );
  assert.equal(clean.outcome, 'passed');
  assert.equal(clean.score, null);
  const broken = scoreLocalRun(
    list,
    results([
      ['a', 'passed'],
      ['b', 'failed'],
    ])
  );
  assert.equal(broken.outcome, 'failed');
  assert.equal(broken.blockingFailures, 1);
});

test('a weighted run scores by weight against its threshold', () => {
  const run = scoreLocalRun(
    checklist(
      [
        { key: 'checkout', type: 'weighted', weight: 8 },
        { key: 'footer-year', type: 'weighted', weight: 1 },
        { key: 'social-icon', type: 'weighted', weight: 1 },
      ],
      { pass_threshold: 70 }
    ),
    results([
      ['checkout', 'passed'],
      ['footer-year', 'failed'],
      ['social-icon', 'failed'],
    ])
  );
  assert.equal(run.score, 80);
  assert.equal(run.possibleWeight, 10);
  assert.equal(run.outcome, 'passed');
});

test('with no threshold set, the default is every point', () => {
  const checks = [
    { key: 'a', type: 'weighted', weight: 1 },
    { key: 'b', type: 'weighted', weight: 1 },
    { key: 'c', type: 'weighted', weight: 2 },
  ];
  const verdicts = results([
    ['a', 'passed'],
    ['b', 'passed'],
    ['c', 'failed'],
  ]);
  assert.equal(
    scoreLocalRun(checklist(checks, { pass_threshold: 50 }), verdicts).outcome,
    'passed'
  );
  assert.equal(
    scoreLocalRun(checklist(checks, { pass_threshold: 60 }), verdicts).outcome,
    'failed'
  );
  const byDefault = scoreLocalRun(checklist(checks), verdicts);
  assert.equal(byDefault.score, 50);
  assert.equal(byDefault.passThreshold, 100);
  assert.equal(byDefault.outcome, 'failed');
});

test('a failing pass/fail check fails the run whatever the score', () => {
  const run = scoreLocalRun(
    checklist(
      [
        { key: 'signup', type: 'pass_fail' },
        { key: 'polish', type: 'weighted', weight: 10 },
      ],
      { pass_threshold: 50 }
    ),
    results([
      ['signup', 'failed'],
      ['polish', 'passed'],
    ])
  );
  assert.equal(run.score, 100);
  assert.equal(run.outcome, 'failed');
});

test('observations and blocked checks stay out of the score', () => {
  const run = scoreLocalRun(
    checklist(
      [
        { key: 'a', type: 'weighted', weight: 1 },
        { key: 'b', type: 'weighted', weight: 3 },
        { key: 'c' },
        { key: 'price', type: 'informational' },
      ],
      { pass_threshold: 100 }
    ),
    // A blocked verdict is stored as error, as in the cloud.
    results([
      ['a', 'passed'],
      ['b', 'error'],
      ['c', 'error'],
      ['price', 'informational'],
    ])
  );
  assert.equal(run.possibleWeight, 1);
  assert.equal(run.score, 100);
  assert.equal(run.inconclusiveCount, 2);
  assert.equal(run.informationalCount, 1);
  assert.equal(run.outcome, 'passed');
});

test('a weighted checklist that reached none of its weighted checks is inconclusive', () => {
  const run = scoreLocalRun(
    checklist([{ key: 'a' }, { key: 'never-reached', type: 'weighted', weight: 5 }]),
    results([
      ['a', 'passed'],
      ['never-reached', 'error'],
    ])
  );
  assert.equal(run.score, null);
  assert.equal(run.outcome, 'inconclusive');
});

test('a failed stop check fails the run and the skipped checks are out of the score', () => {
  const run = scoreLocalRun(
    checklist(
      [
        { key: 'a', type: 'weighted', weight: 1, on_failure: 'stop' },
        { key: 'b', type: 'weighted', weight: 1 },
        { key: 'c', type: 'weighted', weight: 1 },
      ],
      { pass_threshold: 0 }
    ),
    results([
      ['a', 'failed'],
      ['b', 'skipped'],
      ['c', 'skipped'],
    ])
  );
  assert.equal(run.stoppedByCheckId, 'a');
  assert.equal(run.skippedCount, 2);
  assert.equal(run.outcome, 'failed');
});

test('a penalty deducts without raising the maximum, with bands', () => {
  const list = checklist(
    [
      { key: 'naming', type: 'weighted', weight: 30 },
      { key: 'logos', type: 'weighted', weight: 30 },
      { key: 'icon', type: 'weighted', weight: 10 },
      { key: 'colour', type: 'weighted', weight: 10 },
      { key: 'no-building-icon', type: 'weighted', weight: -30 },
    ],
    {
      pass_threshold: 75,
      score_bands: [
        { label: 'Optimal', min: 75 },
        { label: 'Partial adoption', min: 37.5 },
        { label: 'Pushed back', min: 0 },
      ],
    }
  );
  const run = scoreLocalRun(
    list,
    results([
      ['naming', 'passed'],
      ['logos', 'passed'],
      ['icon', 'passed'],
      ['colour', 'passed'],
      ['no-building-icon', 'failed'],
    ])
  );
  assert.equal(run.possibleWeight, 80);
  assert.equal(run.penaltyWeight, 30);
  assert.equal(run.score, 62.5);
  assert.equal(run.grade, 'Partial adoption');
  assert.equal(run.outcome, 'failed');
});

test('a points checklist scores and describes itself in its own unit', () => {
  const run = scoreLocalRun(
    checklist(
      [
        { key: 'a', type: 'weighted', weight: 50 },
        { key: 'b', type: 'weighted', weight: 30 },
        { key: 'p', type: 'weighted', weight: -20 },
      ],
      {
        pass_threshold: 40,
        score_type: 'points',
        score_unit: 'marks',
        score_bands: [
          { label: 'Optimal', min: 60 },
          { label: 'Pushed back', min: 0 },
        ],
      }
    ),
    results([
      ['a', 'passed'],
      ['b', 'failed'],
      ['p', 'failed'],
    ])
  );
  assert.equal(run.score, 30);
  assert.equal(run.scoreUnit, 'marks');
  assert.equal(
    describeRunScore(run, { passedCount: 1, totalCount: 3 }),
    'Scored 30 of 80 marks (Pushed back) against a threshold of 40, 20 marks deducted'
  );
});

test('a points checklist with no threshold must earn every point', () => {
  const run = scoreLocalRun(
    checklist(
      [
        { key: 'a', type: 'weighted', weight: 50 },
        { key: 'p', type: 'weighted', weight: -10 },
      ],
      { score_type: 'points' }
    ),
    results([
      ['a', 'passed'],
      ['p', 'passed'],
    ])
  );
  assert.equal(run.passThreshold, 50);
  assert.equal(run.outcome, 'passed');
});
