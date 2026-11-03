/**
 * The policy line, enforced.
 *
 * Inside Claude Code (`stuntdouble mcp`) this package is a tool provider and
 * nothing more: the person's own session does every bit of reasoning, so the
 * MCP server and everything it imports make no model calls and never start a
 * process. The standalone Studio may call a model, but only on a connection
 * the person configures (their own Anthropic API key or an OpenAI-compatible
 * endpoint), through one module, model.ts, which only the standalone runner
 * imports. Nothing anywhere uses a Claude subscription: no model SDK, no
 * claude.ai login, no `claude` process, no reading `~/.claude` or Claude
 * Code's credentials. These scans fail the build if any of that changes.
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { test } from 'node:test';

const SRC = new URL('../src/', import.meta.url);

/** The code without its comments: the policy comments name what they forbid. */
function code(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

async function sources(): Promise<Array<{ file: string; text: string }>> {
  const files = await readdir(SRC, { recursive: true });
  return Promise.all(
    files
      .filter((f) => f.endsWith('.ts') || f.endsWith('.html') || f.endsWith('.js'))
      .map(async (file) => ({ file, text: code(await readFile(new URL(file, SRC), 'utf8')) }))
  );
}

/** Every module specifier a file imports or requires. */
function specifiers(text: string): string[] {
  return [...text.matchAll(/(?:\bfrom|\bimport\(|\brequire\()\s*['"]([^'"]+)['"]/g)].map(
    (m) => m[1]!
  );
}

/** The package's own modules a file imports, statically or dynamically, type imports included. */
function localImports(text: string, from: string): string[] {
  return specifiers(text)
    .filter((s) => s.startsWith('./') || s.startsWith('../'))
    .map((s) => posix.join(posix.dirname(from), s));
}

async function graphOf(entry: string): Promise<Map<string, string>> {
  const all = new Map((await sources()).map((s) => [s.file, s.text]));
  const seen = new Map<string, string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    const text = all.get(file);
    if (text === undefined) return; // package.json and the like
    seen.set(file, text);
    for (const next of localImports(text, file)) visit(next);
  };
  visit(entry);
  return seen;
}

/** The standalone modules: a model call, a key or a process is possible here, and only here. */
const STANDALONE = [
  'model.ts',
  'runner.ts',
  'credentials.ts',
  'cloud.ts',
  'studio.ts',
  'open-browser.ts',
];

test('the MCP server never reaches the model client, the keys, the Studio or a process', async () => {
  const graph = await graphOf('mcp.ts');
  assert.ok(graph.has('run.ts') && graph.has('ui-server.ts'), 'the graph is followed');
  assert.ok(graph.has('vendor/scoring/scoring.ts'), 'into folders too');
  for (const file of STANDALONE) assert.ok(!graph.has(file), `mcp.ts reaches ${file}`);
  for (const [file, text] of graph) {
    assert.doesNotMatch(text, /\bfetch\(/, `${file} calls fetch`);
    assert.doesNotMatch(
      text,
      /api\.anthropic\.com|chat\/completions|\/v1\/messages/,
      `${file} names a model API`
    );
    assert.doesNotMatch(text, /child_process/, `${file} uses child_process`);
  }
});

test('only the standalone runner imports the model client', async () => {
  for (const { file, text } of await sources()) {
    const imports = localImports(text, file);
    if (imports.includes('model.ts')) assert.equal(file, 'runner.ts', `${file} imports model.ts`);
    // And the runner is reached only from the Studio and the CLI's `run`.
    if (imports.includes('runner.ts')) assert.ok(['studio.ts', 'cli.ts'].includes(file), file);
  }
});

const MODEL_SDKS = [
  /^@anthropic-ai\//,
  /^@ai-sdk\//,
  /^ai$/,
  /^openai$/,
  /^@google\/genai$/,
  /^@google-cloud\/vertexai$/,
  /^@mistralai\//,
  /^ollama$/,
  /claude-agent-sdk|claude-code/,
];

test('no source file imports a model SDK, the Agent SDK included', async () => {
  for (const { file, text } of await sources()) {
    for (const spec of specifiers(text)) {
      for (const pattern of MODEL_SDKS) assert.doesNotMatch(spec, pattern, `${file}: ${spec}`);
    }
  }
});

test('nothing starts claude, and the one process started is the browser opener', async () => {
  for (const { file, text } of await sources()) {
    assert.doesNotMatch(text, /['"`]claude['"`\s]/, `${file} names the claude binary`);
    if (/child_process/.test(text))
      assert.equal(file, 'open-browser.ts', `${file} starts a process`);
  }
  const opener = (await sources()).find((s) => s.file === 'open-browser.ts')!.text;
  const spawned = [...opener.matchAll(/\['([\w.-]+)',\s*\[/g)].map((m) => m[1]);
  assert.deepEqual(spawned.sort(), ['open', 'rundll32', 'xdg-open']);
  assert.doesNotMatch(opener, /\bexec\(|execSync|execFile|shell:\s*true/);
});

test('no Claude credentials, config or login are read, and keys come from one module', async () => {
  for (const { file, text } of await sources()) {
    assert.doesNotMatch(text, /CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_AUTH_TOKEN/, file);
    assert.doesNotMatch(text, /['"`/\\]\.claude\b/, `${file} touches ~/.claude`);
    assert.doesNotMatch(text, /keychain|find-generic-password/i, file);
    assert.doesNotMatch(text, /claude\.ai/, `${file} names claude.ai`);
    // doctor may say whether ANTHROPIC_API_KEY is set; only credentials.ts reads it.
    if (file !== 'credentials.ts') {
      assert.doesNotMatch(
        text,
        /process\.env\.ANTHROPIC_API_KEY|process\.env\[['"]ANTHROPIC_API_KEY/,
        file
      );
    }
  }
});

test('the published dependencies carry no model SDK either', async () => {
  const pkg = JSON.parse(await readFile(join(SRC.pathname, '..', 'package.json'), 'utf8'));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    for (const pattern of MODEL_SDKS) assert.doesNotMatch(name, pattern, name);
  }
});
