/**
 * The model client on a mocked fetch: the requests each provider gets, the
 * transcript it keeps, usage and cost, retries, and errors that never carry
 * the key.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Connection } from '../src/credentials.ts';
import { ModelError, startConversation } from '../src/model.ts';

type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function mockFetch(
  replies: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>
) {
  const sent: Sent[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    sent.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    const reply = replies.shift()!;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  }) as unknown as typeof fetch;
  return { fn, sent };
}

const anthropic: Connection = {
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test-key',
  keySource: 'stored',
};
const openai: Connection = {
  provider: 'openai',
  model: 'qwen3.5:9b',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: null,
  keySource: 'none',
};
const tools = [
  { name: 'read_page', description: 'Read', parameters: { type: 'object', properties: {} } },
];

test('anthropic: one cached, append-only transcript with thinking blocks sent back as they came', async () => {
  const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
  const { fn, sent } = mockFetch([
    {
      body: {
        model: 'claude-opus-5-5',
        stop_reason: 'tool_use',
        content: [thinking, { type: 'tool_use', id: 'tu_1', name: 'read_page', input: {} }],
        usage: {
          input_tokens: 1000,
          cache_creation_input_tokens: 2000,
          cache_read_input_tokens: 0,
          output_tokens: 100,
        },
      },
    },
    {
      body: {
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done' }],
        usage: { input_tokens: 10, cache_read_input_tokens: 3000, output_tokens: 5 },
      },
    },
  ]);
  const c = startConversation(anthropic, { system: 'You are an actor.', tools, fetch: fn });
  c.addUser('Brief');
  const first = await c.turn();
  assert.deepEqual(first.calls, [{ id: 'tu_1', name: 'read_page', input: {} }]);
  // (1000 * 4 + 2000 * 4 * 1.25 + 100 * 20) / 1e6
  assert.equal(first.usage.cost_usd, 0.016);
  assert.equal(first.usage.input_tokens, 3000);
  c.addResults([{ id: 'tu_1', text: 'heading "Shop"', image: 'aW1n' }], 'Note after the results');
  const second = await c.turn();
  assert.equal(second.text, 'Done');
  assert.equal(second.usage.cache_read_tokens, 3000);

  const [a, b] = sent;
  assert.equal(a!.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a!.headers['x-api-key'], 'sk-ant-test-key');
  assert.equal(a!.headers['anthropic-version'], '2023-06-01');
  assert.match(a!.headers['anthropic-beta']!, /context-management-2025-06-27/);
  assert.deepEqual(a!.body.cache_control, { type: 'ephemeral' });
  assert.equal(a!.body.model, 'claude-opus-5-5');
  assert.equal(a!.body.fallbacks, 'default');
  assert.equal(
    a!.body.thinking,
    undefined,
    'Opus 5.5 thinks adaptively: no thinking setting is sent'
  );
  assert.deepEqual(
    (a!.body.tools as Array<{ input_schema: unknown }>)[0]!.input_schema,
    tools[0]!.parameters
  );
  const messages = b!.body.messages as Array<{
    role: string;
    content: Array<Record<string, unknown>>;
  }>;
  // The first request's messages are a prefix of the second's, byte for byte.
  assert.deepEqual(messages.slice(0, 1), a!.body.messages);
  assert.deepEqual(messages[1]!.content[0], thinking);
  const results = messages[2]!.content;
  assert.equal(results[0]!.type, 'tool_result');
  assert.equal((results[0]!.content as Array<{ type: string }>)[1]!.type, 'image');
  assert.deepEqual(results[1], { type: 'text', text: 'Note after the results' });
});

test('openai-compatible: function tools, tool messages, screenshots as user images, old reads trimmed', async () => {
  const call = (i: number) => ({
    body: {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: `c${i}`, type: 'function', function: { name: 'read_page', arguments: '{}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    },
  });
  const { fn, sent } = mockFetch(Array.from({ length: 9 }, (_, i) => call(i)));
  const c = startConversation(openai, { system: 'Sys', tools, fetch: fn });
  c.addUser('Brief');
  for (let i = 0; i < 9; i++) {
    const turn = await c.turn();
    assert.equal(turn.usage.cost_usd, null);
    c.addResults([
      {
        id: turn.calls[0]!.id,
        text: 'x'.repeat(5000),
        image: i === 7 || i === 8 ? 'aW1n' : undefined,
      },
    ]);
  }
  const last = sent.at(-1)!;
  assert.equal(last.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(last.headers.authorization, undefined, 'no key, no header');
  assert.deepEqual((last.body.tools as Array<{ type: string }>)[0]!.type, 'function');
  const messages = last.body.messages as Array<{ role: string; content: unknown }>;
  const reads = messages.filter((m) => m.role === 'tool').map((m) => String(m.content).length);
  assert.ok(reads[0]! < 1000, 'an old read is trimmed');
  assert.equal(reads.at(-1), 5000, 'a recent read is whole');
  const images = messages.filter((m) => Array.isArray(m.content));
  assert.equal(images.length, 1, 'only the newest screenshot is re-sent');
});

test('openai-compatible: a key goes in a Bearer header, invalid arguments are flagged', async () => {
  const { fn, sent } = mockFetch([
    {
      body: {
        choices: [
          {
            message: {
              tool_calls: [
                { id: 'c', type: 'function', function: { name: 'find', arguments: '{oops' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0012 },
      },
    },
  ]);
  const c = startConversation(
    { ...openai, baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test' },
    { system: 'Sys', tools, fetch: fn }
  );
  c.addUser('Brief');
  const turn = await c.turn();
  assert.equal(sent[0]!.headers.authorization, 'Bearer sk-or-test');
  assert.deepEqual(sent[0]!.body.usage, { include: true });
  assert.deepEqual(turn.calls[0]!.input, { __invalid: '{oops' });
  assert.equal(turn.usage.cost_usd, 0.0012);
});

test('a 429 is retried; a 401 is an error naming the host and never the key', async () => {
  const { fn } = mockFetch([
    { status: 429, body: { error: { message: 'slow down' } }, headers: { 'retry-after': '0' } },
    {
      status: 401,
      body: { error: { type: 'authentication_error', message: 'invalid x-api-key' } },
    },
  ]);
  const c = startConversation(anthropic, { system: 'S', tools, fetch: fn });
  c.addUser('Hi');
  await assert.rejects(c.turn(), (err: unknown) => {
    assert.ok(err instanceof ModelError);
    assert.equal(err.status, 401);
    assert.match(err.message, /api\.anthropic\.com answered 401: invalid x-api-key/);
    assert.doesNotMatch(err.message, /sk-ant-test-key/);
    return true;
  });
});

test('a refusal is reported, not treated as a finished turn', async () => {
  const { fn } = mockFetch([
    { body: { stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
  ]);
  const c = startConversation(anthropic, { system: 'S', tools, fetch: fn });
  c.addUser('Hi');
  assert.equal((await c.turn()).refused, true);
});
