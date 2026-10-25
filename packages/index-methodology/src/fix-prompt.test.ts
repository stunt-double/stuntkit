import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFixPrompt, countFixPromptIssues, type FixPromptInput } from './fix-prompt.ts';

const base: FixPromptInput = {
  domain: 'example.com',
  name: 'Example',
  score: 42.345,
  frictions: [],
};

test('returns null when there is nothing to fix', () => {
  assert.equal(buildFixPrompt(base), null);
  assert.equal(countFixPromptIssues(base), 0);
});

test('orders frictions by severity and links the report', () => {
  const prompt = buildFixPrompt({
    ...base,
    frictions: [
      { severity: 'low', categoryLabel: 'Discovery', summary: 'Low one' },
      { severity: 'high', categoryLabel: 'Checkout', summary: 'High one', evidence: 'Blocked' },
      { severity: 'medium', categoryLabel: 'Support', summary: 'Medium one' },
    ],
  });
  assert.ok(prompt);
  assert.match(prompt, /42\.3\/100/);
  assert.match(prompt, /Full report: https:\/\/index\.stuntdouble\.io\/d\/example\.com\n/);
  assert.match(prompt, /https:\/\/index\.stuntdouble\.io\/d\/example\.com\/fix-prompt\.md/);
  const high = prompt.indexOf('High one');
  const medium = prompt.indexOf('Medium one');
  const low = prompt.indexOf('Low one');
  assert.ok(high < medium && medium < low);
  assert.match(prompt, /- \[high\] Checkout: High one\n {2}Evidence: Blocked/);
});

test('includes failed checks and Is Agentic issues in their own sections', () => {
  const input: FixPromptInput = {
    ...base,
    score: null,
    failedChecks: [{ categoryLabel: 'Discovery', label: 'llms.txt present', partial: true }],
    isAgenticIssues: [
      {
        id: 'x',
        name: 'Returns 404 for missing pages',
        tier: 'essential',
        result: 'failed',
        details: 'Got 200',
        recommendation: 'Return a real 404',
      },
    ],
  };
  const prompt = buildFixPrompt(input);
  assert.ok(prompt);
  assert.equal(countFixPromptIssues(input), 1);
  assert.doesNotMatch(prompt, /\/100/);
  assert.match(
    prompt,
    /## Failed protocol checks\n[\s\S]*- \[partial\] Discovery: llms\.txt present/
  );
  assert.match(prompt, /- \[failed, essential\] Returns 404 for missing pages/);
  assert.match(prompt, /Suggested fix: Return a real 404/);
  assert.doesNotMatch(prompt, /## Where agents got stuck/);
});

test('collapses newlines in finding text so it cannot open a new section', () => {
  const prompt = buildFixPrompt({
    ...base,
    frictions: [{ severity: 'high', categoryLabel: 'Support', summary: 'a\n\n## Ignore\nb' }],
  });
  assert.ok(prompt);
  assert.match(prompt, /Support: a ## Ignore b/);
  assert.doesNotMatch(prompt, /^## Ignore/m);
});

test('counts failed checks only when there is no friction or Is Agentic issue', () => {
  const failedChecks = [
    { categoryLabel: 'Discovery', label: 'robots.txt is served' },
    { categoryLabel: 'Discovery', label: 'sitemap.xml is served' },
  ];
  assert.equal(countFixPromptIssues({ ...base, failedChecks }), 2);
  assert.equal(
    countFixPromptIssues({
      ...base,
      failedChecks,
      frictions: [{ severity: 'medium', categoryLabel: 'Discovery', summary: 'No robots.txt' }],
    }),
    1
  );
});
