# Agent loops

Complete loops for each surface. The two first are the type-checked examples in `packages/browser-toolset/examples/src/` of the stuntkit repository; prefer copying from there when you have the repository.

## Claude on the browser use toolset (Anthropic SDK)

```ts
import Anthropic from '@anthropic-ai/sdk';
import {
  BROWSER_TOOLSET,
  BrowserToolsetExecutor,
  INDEX_SESSION_SAFETY,
  isBrowserToolsetCall,
} from '@stunt-double/browser-toolset';
import { pruneAnthropicImages } from '@stunt-double/browser-toolset/prune';
import { chromium } from 'playwright';

import { PlaywrightDriver } from './playwright-driver.ts';

const MAX_TURNS = 30;
const KEEP_SCREENSHOTS = 3;

export async function runAgent(task: string): Promise<string> {
  const client = new Anthropic();
  const driver = await PlaywrightDriver.launch(await chromium.launch());
  const executor = new BrowserToolsetExecutor(driver, { safety: INDEX_SESSION_SAFETY });
  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: task }];
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        tools: [BROWSER_TOOLSET],
        messages: pruneAnthropicImages(messages, KEEP_SCREENSHOTS),
      });
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'refusal') return 'The model declined the task.';
      const calls = response.content.filter((b): b is Anthropic.Messages.ToolUseBlock =>
        isBrowserToolsetCall(b)
      );
      if (calls.length === 0) {
        return response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
      }
      const { results, records } = await executor.runTurn(calls);
      for (const r of records) console.log(`${r.isError ? 'x' : '>'} ${r.name}: ${r.text}`);
      messages.push({ role: 'user', content: results });
    }
    return `Stopped after ${MAX_TURNS} turns.`;
  } finally {
    await driver.close();
  }
}
```

Notes:

- `BROWSER_TOOLSET` is the `browser_toolset_20260801` tool definition. Every result the executor builds echoes `toolset_name: 'browser'`.
- Other tools can sit beside it in `tools`. Filter with `isBrowserToolsetCall` and handle the rest yourself, but put every `tool_result` for the turn in the same user message.
- `executor.execute(name, input)` runs a single member and throws on failure. Use it for scripted steps outside a model turn (a warm-up `navigate`), never inside one.

## Any model on the Vercel AI SDK

```ts
import { anthropic } from '@ai-sdk/anthropic';
import {
  DIRECT_TOOL_SPECS,
  DirectBrowserTools,
  type DirectToolResult,
  INDEX_SESSION_SAFETY,
} from '@stunt-double/browser-toolset';
import { pruneAiSdkImages } from '@stunt-double/browser-toolset/prune';
import { generateText, jsonSchema, type JSONSchema7, stepCountIs, tool, type ToolSet } from 'ai';

const VIEWPORT = { width: 1280, height: 800 };
const browser = new DirectBrowserTools(driver, {
  viewport: VIEWPORT,
  safety: INDEX_SESSION_SAFETY,
});

const tools: ToolSet = {};
for (const spec of DIRECT_TOOL_SPECS) {
  const inputSchema = jsonSchema<Record<string, unknown>>(spec.parameters as JSONSchema7);
  tools[spec.name] =
    spec.name === 'done'
      ? tool({ description: spec.description, inputSchema }) // no execute: ends the run
      : tool({
          description: spec.description,
          inputSchema,
          execute: (input): Promise<DirectToolResult> => browser.run(spec.name, input),
          toModelOutput: ({ output }) => ({
            type: 'content',
            value: [
              { type: 'text', text: output.text },
              ...(output.screenshotBase64
                ? [
                    {
                      type: 'file' as const,
                      data: { type: 'data' as const, data: output.screenshotBase64 },
                      mediaType: 'image/png',
                    },
                  ]
                : []),
            ],
          }),
        });
}

const result = await generateText({
  model: anthropic('claude-opus-5-5'), // swap the provider to compare models
  tools,
  prompt: `${task}\n\nUse the browser tools, then call done with your answer.`,
  stopWhen: stepCountIs(30),
  prepareStep: ({ messages }) => ({ messages: pruneAiSdkImages(messages, 3) }),
});
const done = result.toolCalls.find((c) => c.toolName === 'done');
const answer = done ? (done.input as { message?: string }).message : result.text;
```

## OpenAI-style function calling (any SDK without the AI SDK)

`DIRECT_TOOL_SPECS` entries are `{ name, description, parameters }` with a plain JSON Schema object, so they map one to one onto most function-calling formats:

```ts
import { DIRECT_TOOL_SPECS, DirectBrowserTools } from '@stunt-double/browser-toolset/direct-tools';

const functions = DIRECT_TOOL_SPECS.map((s) => ({
  type: 'function' as const,
  function: { name: s.name, description: s.description, parameters: s.parameters },
}));

// For each tool call the model makes:
const args = JSON.parse(call.function.arguments || '{}');
if (call.function.name === 'done') return args.message;
const result = await browser.run(call.function.name, args);
messages.push({ role: 'tool', tool_call_id: call.id, content: result.text });
if (result.screenshotBase64) {
  // Most chat APIs accept images only in user messages: attach it there.
  messages.push({
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${result.screenshotBase64}` } },
    ],
  });
}
```

Gemini takes the same specs as `functionDeclarations`. The parameters are flat scalars with no unions or nested objects on purpose: that is where providers disagree.

## Ending on a step budget

```ts
import {
  STEP_BUDGET_FALLBACK_OUTPUT,
  STEP_BUDGET_FINAL_NOTE,
} from '@stunt-double/browser-toolset/direct-tools';

// After the last allowed step, one more call that can only answer:
const final = await generateText({
  model,
  messages: [...history, { role: 'user', content: STEP_BUDGET_FINAL_NOTE }],
  tools: { done: tools.done },
  toolChoice: { type: 'tool', toolName: 'done' },
});
const answer =
  (final.toolCalls[0]?.input as { message?: string } | undefined)?.message ??
  STEP_BUDGET_FALLBACK_OUTPUT;
```

The budget is unchanged: this call can only answer, never act. Using the shared note keeps loops on different models comparable.

## System prompt pointers

Keep it short; the tools describe themselves. Worth saying:

- What "done" means for this task and what the answer should contain.
- Prefer `read_page` or `find` refs over screenshot coordinates; use `get_page_text` for long prose.
- That refused actions are expected: report what was seen and what the next step would be.
