// A Vercel AI SDK agent loop on the provider-neutral direct tools, so the same
// loop runs on any model with function calling. Swap the provider to compare.
//
//   pnpm exec playwright install chromium
//   ANTHROPIC_API_KEY=... pnpm ai-sdk "Find the price of the cheapest plan on example.com"

import { anthropic } from '@ai-sdk/anthropic';
import {
  DIRECT_TOOL_SPECS,
  DirectBrowserTools,
  type DirectToolResult,
  INDEX_SESSION_SAFETY,
} from '@stunt-double/browser-toolset';
import { pruneAiSdkImages } from '@stunt-double/browser-toolset/prune';
import { generateText, jsonSchema, type JSONSchema7, stepCountIs, tool, type ToolSet } from 'ai';
import { chromium } from 'playwright';

import { PlaywrightDriver } from './playwright-driver.ts';

const VIEWPORT = { width: 1280, height: 800 };
const MAX_STEPS = 30;
const KEEP_SCREENSHOTS = 3;

async function main(task: string): Promise<void> {
  const driver = await PlaywrightDriver.launch(await chromium.launch(), VIEWPORT);
  const browser = new DirectBrowserTools(driver, {
    viewport: VIEWPORT,
    safety: INDEX_SESSION_SAFETY,
  });

  // One AI SDK tool per spec. `done` has no execute, so calling it ends the loop.
  const tools: ToolSet = {};
  for (const spec of DIRECT_TOOL_SPECS) {
    const inputSchema = jsonSchema<Record<string, unknown>>(spec.parameters as JSONSchema7);
    tools[spec.name] =
      spec.name === 'done'
        ? tool({ description: spec.description, inputSchema })
        : tool({
            description: spec.description,
            inputSchema,
            execute: (input): Promise<DirectToolResult> => browser.run(spec.name, input),
            // Text plus the screenshot as an image the model can see.
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

  try {
    const result = await generateText({
      model: anthropic('claude-opus-5-5'),
      tools,
      prompt: `${task}\n\nUse the browser tools, then call done with your answer.`,
      stopWhen: stepCountIs(MAX_STEPS),
      // Re-send only the newest screenshots; older ones become a placeholder.
      prepareStep: ({ messages }) => ({ messages: pruneAiSdkImages(messages, KEEP_SCREENSHOTS) }),
    });
    const done = result.toolCalls.find((c) => c.toolName === 'done');
    console.log(done ? (done.input as { message?: string }).message : result.text);
  } finally {
    await driver.close();
  }
}

await main(process.argv.slice(2).join(' ') || 'What is the heading on https://example.com?');
