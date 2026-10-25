import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IS_AGENTIC_CATALOGUE,
  IS_AGENTIC_SHARE,
  applyIsAgenticReport,
  scoreFindings,
} from './is-agentic-checks.ts';
import type { IsAgenticIssue, IsAgenticReport } from './is-agentic-types.ts';
import type { CategoryCheckResult } from './types.ts';

function report(issues: IsAgenticIssue[]): IsAgenticReport {
  return {
    target: 'https://example.com',
    displayTarget: 'example.com',
    reportUrl: 'https://is-agentic.com/scan/example.com',
    score: 60,
    scoreLabel: 'Important blockers remain',
    scannedAt: '2026-09-24T00:00:00.000Z',
    eligibleChecks: 30,
    breakdown: {
      essential: { earned: 50, available: 80, passing: 6, total: 10 },
      recommended: { earned: 10, available: 20, passing: 10, total: 20 },
      bonus: { points: 0, positiveSignals: 0 },
    },
    issues,
  };
}

function issue(id: string, result: 'failed' | 'partial', tier: IsAgenticIssue['tier']) {
  return { id, name: id, tier, result, details: `${id} details`, recommendation: `fix ${id}` };
}

// A category fully passing its own probes, 100 weight in total.
function allPassing(category: CategoryCheckResult['category']): CategoryCheckResult {
  return {
    category,
    score: 100,
    findings: [{ id: 'own', label: 'Own probe', weight: 100, passed: true }],
    frictions: [],
  };
}

test('no report leaves every category untouched', () => {
  const input = [allPassing('delegated-access')];
  assert.equal(applyIsAgenticReport(input, null), input);
});

test('a clean report adds passing findings without moving the score', () => {
  const [out] = applyIsAgenticReport([allPassing('delegated-access')], report([]));
  assert.equal(out.score, 100);
  assert.ok(out.findings.some((f) => f.id === 'is-agentic:openapi-spec' && f.passed));
  assert.equal(out.frictions.length, 0);
});

test('the Is Agentic pool is capped at a share of the category own weight', () => {
  const [out] = applyIsAgenticReport([allPassing('delegated-access')], report([]));
  const added = out.findings
    .filter((f) => f.id.startsWith('is-agentic:'))
    .reduce((a, f) => a + f.weight, 0);
  assert.ok(Math.abs(added - 100 * IS_AGENTIC_SHARE) < 0.1, `pool was ${added}`);
});

test('failing every mapped check costs at most the pool share', () => {
  const failures = Object.entries(IS_AGENTIC_CATALOGUE)
    .filter(([, e]) => e.category === 'delegated-access')
    .map(([id, e]) => issue(id, 'failed', e.tier));
  const [out] = applyIsAgenticReport([allPassing('delegated-access')], report(failures));
  // 100 own weight passed out of 150 total.
  assert.equal(out.score, 67);
});

test('partials earn half credit and essential failures raise high friction', () => {
  const [out] = applyIsAgenticReport(
    [allPassing('information-retrieval')],
    report([
      issue('content-no-js', 'partial', 'essential'),
      issue('agent-friendly-404', 'failed', 'essential'),
      issue('page-token-budget', 'partial', 'recommended'),
    ])
  );
  const partial = out.findings.find((f) => f.id === 'is-agentic:content-no-js');
  assert.equal(partial?.credit, 0.5);
  assert.equal(partial?.passed, false);
  assert.equal(partial?.detail, 'content-no-js details');
  assert.deepEqual(
    out.frictions.map((f) => f.severity),
    ['low', 'high']
  );
  assert.ok(out.score < 100 && out.score > 67);
});

test('categories with no mapped checks, and unmapped issue ids, are ignored', () => {
  const input = allPassing('accuracy');
  const [out] = applyIsAgenticReport(
    [input],
    report([issue('brand-new-check', 'failed', 'essential')])
  );
  assert.equal(out, input);
});

test('scoreFindings matches the boolean formula when no credit is set', () => {
  assert.equal(
    scoreFindings([
      { id: 'a', label: 'a', weight: 30, passed: true },
      { id: 'b', label: 'b', weight: 10, passed: false },
    ]),
    75
  );
});
