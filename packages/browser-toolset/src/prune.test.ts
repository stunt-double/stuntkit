/**
 * The one screenshot pruner every browsing loop uses.
 *
 * A pruning bug fails silently: keeping the first screenshots instead of the
 * last blinds the agent, and keeping them all is a token bill nobody notices.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PRUNED_SCREENSHOT,
  isAiSdkImagePart,
  pruneAiSdkImages,
  pruneAnthropicImages,
} from './prune.ts';

const png = (n: number) => ({ type: 'file-data', data: `img${n}`, mediaType: 'image/png' });
const placeholder = { type: 'text', text: PRUNED_SCREENSHOT };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fixtures
const toolMsg = (id: string, value: any[]): any => ({
  role: 'tool',
  content: [
    { type: 'tool-result', toolCallId: id, toolName: 'act', output: { type: 'content', value } },
  ],
});

test('isAiSdkImagePart recognises every image shape and nothing else', () => {
  assert.equal(isAiSdkImagePart({ type: 'image' }), true);
  assert.equal(isAiSdkImagePart({ type: 'image-data' }), true);
  assert.equal(isAiSdkImagePart({ type: 'file-data', mediaType: 'image/png' }), true);
  assert.equal(isAiSdkImagePart({ type: 'file', mediaType: 'image/jpeg' }), true);
  assert.equal(isAiSdkImagePart({ type: 'file-data', mediaType: 'application/pdf' }), false);
  assert.equal(isAiSdkImagePart({ type: 'text' }), false);
  assert.equal(isAiSdkImagePart(undefined), false);
});

test('AI SDK: keeps the newest N screenshots and replaces the rest', () => {
  const messages = [1, 2, 3, 4, 5].map((n) =>
    toolMsg(`c${n}`, [{ type: 'text', text: `step ${n}` }, png(n)])
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fixtures
  const out = pruneAiSdkImages(messages, 3) as any[];
  const images = out.map((m) => m.content[0].output.value[1]);
  assert.deepEqual(images, [placeholder, placeholder, png(3), png(4), png(5)]);
  // Text beside a pruned image survives.
  assert.deepEqual(out[0].content[0].output.value[0], { type: 'text', text: 'step 1' });
});

test('AI SDK: user message images and tool images share one newest-first count', () => {
  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'task' }, { type: 'image', image: 'seed' }] },
    toolMsg('c1', [png(1)]),
    toolMsg('c2', [png(2)]),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fixtures
  const out = pruneAiSdkImages(messages as any, 2) as any[];
  assert.deepEqual(out[0].content[1], placeholder);
  assert.deepEqual(out[1].content[0].output.value[0], png(1));
  assert.deepEqual(out[2].content[0].output.value[0], png(2));
});

test('AI SDK: a PDF in a tool result is never pruned', () => {
  const pdf = { type: 'file-data', data: 'pdf', mediaType: 'application/pdf' };
  const messages = [toolMsg('c1', [pdf]), toolMsg('c2', [png(2)])];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fixtures
  const out = pruneAiSdkImages(messages, 0) as any[];
  assert.deepEqual(out[0].content[0].output.value[0], pdf);
  assert.deepEqual(out[1].content[0].output.value[0], placeholder);
});

test('AI SDK: does not mutate its input', () => {
  const messages = [toolMsg('c1', [png(1)]), toolMsg('c2', [png(2)])];
  const before = JSON.stringify(messages);
  pruneAiSdkImages(messages, 1);
  assert.equal(JSON.stringify(messages), before);
});

test('AI SDK: pruning twice is the same as pruning once', () => {
  const messages = [1, 2, 3, 4].map((n) => toolMsg(`c${n}`, [png(n)]));
  const once = pruneAiSdkImages(messages, 2);
  assert.deepEqual(pruneAiSdkImages(once, 2), once);
});

const anthropicImage = (n: number) => ({
  type: 'image' as const,
  source: { type: 'base64' as const, media_type: 'image/png' as const, data: `img${n}` },
});
const anthropicPlaceholder = { type: 'text', text: PRUNED_SCREENSHOT };

test('Anthropic: counts per image inside a multi-image toolset batch', () => {
  // The browser toolset returns one tool_result per turn holding a screenshot
  // per action, so counting per tool_result would keep 3 batches of images.
  const messages = [
    {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: 't1',
          content: [anthropicImage(1), anthropicImage(2), anthropicImage(3)],
        },
      ],
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: 't2',
          content: [anthropicImage(4), anthropicImage(5)],
        },
      ],
    },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fixtures
  const out = pruneAnthropicImages(messages, 3) as any[];
  assert.deepEqual(out[0].content[0].content, [
    anthropicPlaceholder,
    anthropicPlaceholder,
    anthropicImage(3),
  ]);
  assert.deepEqual(out[1].content[0].content, [anthropicImage(4), anthropicImage(5)]);
});

test('Anthropic: top-level image blocks count too, and assistant turns are untouched', () => {
  const messages = [
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'go' }, anthropicImage(1)] },
    { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'ok' }] },
    { role: 'user' as const, content: [anthropicImage(2)] },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fixtures
  const out = pruneAnthropicImages(messages, 1) as any[];
  assert.deepEqual(out[0].content[1], anthropicPlaceholder);
  assert.deepEqual(out[1], messages[1]);
  assert.deepEqual(out[2].content[0], anthropicImage(2));
});

test('Anthropic: does not mutate its input', () => {
  const messages = [
    { role: 'user' as const, content: [anthropicImage(1)] },
    { role: 'user' as const, content: [anthropicImage(2)] },
  ];
  const before = JSON.stringify(messages);
  pruneAnthropicImages(messages, 1);
  assert.equal(JSON.stringify(messages), before);
});
