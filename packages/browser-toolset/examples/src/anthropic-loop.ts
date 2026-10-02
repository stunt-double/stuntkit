// A Claude agent loop on Anthropic's browser use toolset, executed locally by
// `BrowserToolsetExecutor` over Playwright.
//
//   pnpm exec playwright install chromium
//   ANTHROPIC_API_KEY=... pnpm anthropic "Find the price of the cheapest plan on example.com"

import Anthropic from '@anthropic-ai/sdk';
import {
  BROWSER_TOOLSET,
  BrowserToolsetExecutor,
  INDEX_SESSION_SAFETY,
  isBrowserToolsetCall,
} from '@stdbl/browser-toolset';
import { pruneAnthropicImages } from '@stdbl/browser-toolset/prune';
import { chromium } from 'playwright';

import { PlaywrightDriver } from './playwright-driver.ts';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 30;
/** Only the newest few screenshots are worth re-sending on each turn. */
const KEEP_SCREENSHOTS = 3;

async function main(task: string): Promise<void> {
  const client = new Anthropic();
  const driver = await PlaywrightDriver.launch(await chromium.launch());
  const executor = new BrowserToolsetExecutor(driver, {
    // Refuse paying, signing up and typing passwords or card numbers: the
    // right default for an agent let loose on sites that are not yours.
    safety: INDEX_SESSION_SAFETY,
  });

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: task }];
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        tools: [BROWSER_TOOLSET],
        messages: pruneAnthropicImages(messages, KEEP_SCREENSHOTS),
      });
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'refusal') {
        console.error('The model declined:', response.stop_details?.explanation ?? '');
        return;
      }
      const calls = response.content.filter((b): b is Anthropic.Messages.ToolUseBlock =>
        isBrowserToolsetCall(b)
      );
      if (calls.length === 0) {
        for (const block of response.content) if (block.type === 'text') console.log(block.text);
        return;
      }

      // Every browser call in the turn, in order; results go back together.
      const { results, records } = await executor.runTurn(calls);
      for (const r of records) console.log(`${r.isError ? 'x' : '>'} ${r.name}: ${r.text}`);
      messages.push({ role: 'user', content: results });
    }
    console.error(`Stopped after ${MAX_TURNS} turns.`);
  } finally {
    await driver.close();
  }
}

await main(process.argv.slice(2).join(' ') || 'What is the heading on https://example.com?');
