import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isRetiredFriction,
  MCP_FRICTION,
  PUBLIC_API_FRICTION,
  withCurrentFrictionCopy,
  withoutRetiredFindings,
  withoutRetiredFrictions,
} from './retired.ts';

test('drops the retired task-entry friction and keeps the rest', () => {
  const frictions = [
    {
      severity: 'high',
      summary:
        'No reachable entry point for delegated tasks: nothing at `/pricing`, `/signup`, `/cart`, `/book`, or similar responds without auth.',
    },
    {
      severity: 'medium',
      summary: 'The homepage has no link an agent can follow to start a task.',
    },
  ];
  const kept = withoutRetiredFrictions(frictions);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].severity, 'medium');
  assert.equal(isRetiredFriction({ summary: null }), false);
});

test('drops the retired task-entry finding from every category', () => {
  const kept = withoutRetiredFindings({
    checkout: [{ id: 'primary-cta' }, { id: 'task-entry-reachable' }],
    support: [{ id: 'contact' }],
    discovery: undefined,
  });
  assert.deepEqual(kept, {
    checkout: [{ id: 'primary-cta' }],
    support: [{ id: 'contact' }],
    discovery: [],
  });
});

test('rewrites every legacy delegated-access summary to the current wording', () => {
  const legacy = [
    'No discoverable MCP server. ChatGPT apps and Claude connectors cannot find one to connect to, so agents drive a browser instead.',
    'No discoverable MCP server. ChatGPT apps and Claude connectors have no scoped way to call your product; agents must drive a browser instead.',
    'No discoverable public API docs. Agents cannot find a scoped way in, so they drive a browser instead.',
    'No public API docs detected. Agents have no scoped way in; they must drive a browser.',
  ];
  const rewritten = withCurrentFrictionCopy(
    legacy.map((summary) => ({ severity: 'high', summary }))
  );
  assert.deepEqual(
    rewritten.map((f) => f.summary),
    [MCP_FRICTION, MCP_FRICTION, PUBLIC_API_FRICTION, PUBLIC_API_FRICTION]
  );
  for (const f of rewritten) assert.doesNotMatch(f.summary, /browser/i);
});

test('leaves current and unrelated summaries untouched', () => {
  const frictions = [
    { severity: 'high', summary: MCP_FRICTION },
    { severity: 'low', summary: 'Something else entirely.' },
    { severity: 'low', summary: null },
  ];
  assert.deepEqual(withCurrentFrictionCopy(frictions), frictions);
});
