/**
 * This package is a tool provider and nothing more: the person's own agent
 * session does every bit of reasoning, on their own plan. So it must never
 * import a model SDK, start an agent CLI, or go looking for anyone's agent
 * credentials. These scans fail the build if any of that appears.
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

const SRC = new URL('../src/', import.meta.url);

async function sources(): Promise<Array<{ file: string; text: string }>> {
  const files = await readdir(SRC, { recursive: true });
  return Promise.all(
    files
      .filter((f) => f.endsWith('.ts') || f.endsWith('.html'))
      .map(async (file) => ({ file, text: await readFile(new URL(file, SRC), 'utf8') }))
  );
}

const MODEL_SDKS = [
  /['"]@anthropic-ai\//,
  /['"]@ai-sdk\//,
  /['"]ai['"]/,
  /['"]openai['"]/,
  /['"]@google\/genai['"]/,
  /['"]@google-cloud\/vertexai['"]/,
  /['"]@mistralai\//,
  /['"]ollama['"]/,
];

test('no source file imports a model SDK', async () => {
  for (const { file, text } of await sources()) {
    for (const pattern of MODEL_SDKS)
      assert.doesNotMatch(text, pattern, `${file} matches ${pattern}`);
  }
});

test('nothing starts a process, so nothing can start claude', async () => {
  for (const { file, text } of await sources()) {
    assert.doesNotMatch(text, /child_process/, `${file} uses child_process`);
    assert.doesNotMatch(text, /['"`]claude['"`]/, `${file} names the claude binary`);
  }
});

test('no agent credentials or config are read', async () => {
  for (const { file, text } of await sources()) {
    assert.doesNotMatch(text, /CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_AUTH_TOKEN/, file);
    assert.doesNotMatch(text, /['"`/\\]\.claude\b/, `${file} touches ~/.claude`);
    assert.doesNotMatch(text, /keychain|find-generic-password/i, file);
    // doctor may say whether ANTHROPIC_API_KEY is set, never read what it is.
    assert.doesNotMatch(
      text,
      /process\.env\.ANTHROPIC_API_KEY|process\.env\[['"]ANTHROPIC_API_KEY/,
      file
    );
  }
});

test('the published dependencies carry no model SDK either', async () => {
  const pkg = JSON.parse(await readFile(join(SRC.pathname, '..', 'package.json'), 'utf8'));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    for (const pattern of MODEL_SDKS) assert.doesNotMatch(`'${name}'`, pattern, name);
  }
});
