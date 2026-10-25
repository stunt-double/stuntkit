import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentSearchReport } from './agent-search-types.ts';
import {
  SEARCH_VISIBILITY_SHARE,
  applyAgentSearchReport,
  indexedCredit,
  rankCredit,
  topicQueryFor,
} from './search-visibility-checks.ts';
import type { CategoryCheckResult } from './types.ts';

function result(category: CategoryCheckResult['category'], passed: boolean): CategoryCheckResult {
  return {
    category,
    score: passed ? 100 : 0,
    findings: [{ id: 'probe', label: 'Probe', weight: 100, passed }],
    frictions: [],
  };
}

const base = (): CategoryCheckResult[] => [
  result('brand-awareness', true),
  result('discovery', true),
  result('information-retrieval', true),
  result('checkout', true),
];

test('rank and index credit tiers', () => {
  assert.equal(rankCredit(1), 1);
  assert.equal(rankCredit(3), 1);
  assert.equal(rankCredit(4), 0.5);
  assert.equal(rankCredit(10), 0.5);
  assert.equal(rankCredit(11), 0);
  assert.equal(rankCredit(null), 0);
  assert.equal(indexedCredit({ pages: 5, withText: 3 }), 1);
  assert.equal(indexedCredit({ pages: 2, withText: 0 }), 0.5);
  assert.equal(indexedCredit({ pages: 0, withText: 0 }), 0);
});

test('no report leaves every category untouched', () => {
  const input = base();
  assert.equal(applyAgentSearchReport(input, null, 'stripe.com'), input);
});

test('each answer lands in its own category at the capped share', () => {
  const report: AgentSearchReport = {
    provider: 'exa',
    brand: { query: 'Stripe', rank: null },
    topic: { query: 'payments infrastructure for the internet', rank: 6 },
    indexed: { pages: 8, withText: 8 },
  };
  const out = applyAgentSearchReport(base(), report, 'stripe.com');
  const byCat = Object.fromEntries(out.map((r) => [r.category, r]));

  const brand = byCat['brand-awareness']!;
  const added = brand.findings.find((f) => f.id === 'agent-search:brand')!;
  assert.equal(added.weight, 100 * SEARCH_VISIBILITY_SHARE);
  assert.equal(added.passed, false);
  assert.equal(brand.score, Math.round((100 / 125) * 100));
  assert.equal(brand.frictions.length, 1);
  assert.match(brand.frictions[0]!.summary, /Exa/);

  const discovery = byCat['discovery']!;
  assert.equal(discovery.findings.find((f) => f.id === 'agent-search:topic')!.credit, 0.5);
  assert.equal(discovery.score, Math.round((112.5 / 125) * 100));
  assert.equal(discovery.frictions.length, 0);

  assert.equal(byCat['information-retrieval']!.score, 100);
  assert.equal(byCat['checkout']!.findings.length, 1);
});

test('a failed lookup adds no finding rather than a miss', () => {
  const out = applyAgentSearchReport(
    base(),
    { provider: 'tavily', brand: null, topic: null, indexed: { pages: 0, withText: 0 } },
    'stripe.com'
  );
  assert.equal(out[0]!.findings.length, 1);
  assert.equal(out[1]!.findings.length, 1);
  assert.equal(out[2]!.score, 80);
  assert.match(out[2]!.frictions[0]!.summary, /Tavily holds no pages/);
});

test('the pool is sized from the probes, not other fold-ins', () => {
  const discovery: CategoryCheckResult = {
    category: 'discovery',
    score: 100,
    findings: [
      { id: 'probe', label: 'Probe', weight: 100, passed: true },
      { id: 'is-agentic:x', label: 'X', weight: 50, passed: true },
    ],
    frictions: [],
  };
  const [out] = applyAgentSearchReport(
    [discovery],
    { provider: 'exa', brand: null, topic: { query: 'q', rank: 1 }, indexed: null },
    'a.com'
  );
  assert.equal(out!.findings.at(-1)!.weight, 25);
});

test('a non-applicable category is never scored', () => {
  const na: CategoryCheckResult = { ...result('brand-awareness', true), applicable: false };
  const [out] = applyAgentSearchReport(
    [na],
    { provider: 'exa', brand: { query: 'A', rank: 1 }, topic: null, indexed: null },
    'a.com'
  );
  assert.equal(out, na);
});

test('topic queries drop the brand and prefer the title', () => {
  assert.equal(
    topicQueryFor({
      domain: 'stripe.com',
      name: 'Stripe',
      title: 'Stripe | Financial Infrastructure to Grow Your Revenue',
      description: null,
    }),
    'Financial Infrastructure to Grow Your Revenue'
  );
  assert.equal(
    topicQueryFor({
      domain: 'linear.app',
      name: 'Linear',
      title: 'Linear',
      description:
        'Linear is a purpose-built tool for planning and building products. Meet the system.',
    }),
    'is a purpose-built tool for planning and building products'
  );
  assert.equal(
    topicQueryFor({ domain: 'acme.com', name: 'Acme', title: 'Acme - Home', description: null }),
    null
  );
});
