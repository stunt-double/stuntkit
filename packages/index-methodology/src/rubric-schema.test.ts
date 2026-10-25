import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  repairLeakedArrays,
  repairRubricText,
  rubricSchema,
  unwrapSingleKeyRubric,
} from './rubric-schema.ts';

const rubric = {
  score: 15,
  evidence: 'The agent pushed back on a false premise.',
  findings: [{ id: 'ranking-produced', label: 'Produces a ranked list', passed: true, weight: 2 }],
  frictions: [{ summary: 'Mortgage page returned a 404.', severity: 'low' }],
};

test('unwraps the "parameter name" wrapper seen in production', () => {
  const repaired = unwrapSingleKeyRubric(JSON.stringify({ 'parameter name': rubric }));
  assert.ok(repaired);
  assert.deepEqual(rubricSchema.parse(JSON.parse(repaired)), rubric);
});

test('unwraps other single-key wrappers', () => {
  for (const key of ['input', 'parameters']) {
    assert.ok(unwrapSingleKeyRubric(JSON.stringify({ [key]: rubric })));
  }
});

test('declines to repair when the inner object is not a valid rubric', () => {
  assert.equal(unwrapSingleKeyRubric(JSON.stringify({ input: { score: 'high' } })), null);
});

test('declines to repair multi-key objects, arrays and non-JSON', () => {
  assert.equal(unwrapSingleKeyRubric(JSON.stringify({ a: rubric, b: rubric })), null);
  assert.equal(unwrapSingleKeyRubric(JSON.stringify([rubric])), null);
  assert.equal(unwrapSingleKeyRubric('not json'), null);
});

// A grader answer from production (session 1e729f18, 29 Sep 2026), verbatim:
// `findings` arrived as a string with the frictions parameter spliced into it.
const LEAKED =
  '{"score":100,"evidence":"The agent navigated to the site, located the API documentation page at docs.stuntdouble.io/api, correctly identified the OAuth 2.1 auth model with discovery details, and listed three specific scopes (mcp:read, mcp:write, mcp:run) with descriptions. All rubric criteria are satisfied and an API is indeed available, so no deduction applies.","findings":"[{\\"id\\":\\"found-api-reference\\",\\"label\\":\\"Found the API reference\\",\\"passed\\":true,\\"weight\\":40,\\"detail\\":\\"Agent found and navigated to https://www.stuntdouble.io/support/docs/api\\"},{\\"id\\":\\"auth-model\\",\\"label\\":\\"Correctly identified the auth model\\",\\"passed\\":true,\\"weight\\":40,\\"detail\\":\\"Correctly described OAuth 2.1 with discovery, token scoping, and RFC 8414 metadata\\"},{\\"id\\":\\"scopes-listed\\",\\"label\\":\\"Listed at least two specific scopes/permissions\\",\\"passed\\":true,\\"weight\\":20,\\"detail\\":\\"Listed mcp:read, mcp:write, and mcp:run with clear descriptions\\"},{\\"id\\":\\"no-api-deduction\\",\\"label\\":\\"Deduction for no API available when that\'s correct answer\\",\\"passed\\":false,\\"weight\\":0,\\"detail\\":\\"Not applicable since an API is available and was found\\"}]</findings>\\n<parameter name=\\"frictions\\">[{\\"severity\\":\\"low\\",\\"summary\\":\\"Agent encountered two stale reference errors when trying to click elements, requiring re-navigation via find and coordinate clicks.\\",\\"evidence\\":\\"Error: ref_e_resources_or_similar is stale or not found on the current page.\\"}]"}';

test('splits a leaked parameter out of a stringified array', () => {
  const repaired = repairLeakedArrays(LEAKED);
  assert.ok(repaired);
  const rubric = rubricSchema.parse(JSON.parse(repaired));
  assert.equal(rubric.score, 100);
  assert.equal(rubric.findings.length, 4);
  assert.equal(rubric.findings[0].id, 'found-api-reference');
  assert.equal(rubric.frictions.length, 1);
  assert.equal(rubric.frictions[0].severity, 'low');
});

test('parses arrays sent as plain JSON strings', () => {
  const text = JSON.stringify({
    ...rubric,
    findings: JSON.stringify(rubric.findings),
    frictions: JSON.stringify(rubric.frictions),
  });
  const repaired = repairLeakedArrays(text);
  assert.ok(repaired);
  assert.deepEqual(rubricSchema.parse(JSON.parse(repaired)), rubric);
});

test('declines when a stringified array does not parse, or nothing needed repair', () => {
  assert.equal(repairLeakedArrays(JSON.stringify({ ...rubric, findings: '[{oops' })), null);
  assert.equal(repairLeakedArrays(JSON.stringify(rubric)), null);
  assert.equal(repairLeakedArrays('not json'), null);
});

test('repairRubricText tries every repair', () => {
  assert.ok(repairRubricText(JSON.stringify({ 'parameter name': rubric })));
  assert.ok(repairRubricText(LEAKED));
  assert.equal(repairRubricText('{}'), null);
});
