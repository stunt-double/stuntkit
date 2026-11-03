// doctor: what a local run needs, one line per check. Shared by the CLI
// (`stuntdouble doctor`) and the MCP server's read-only `doctor` tool, so a
// headless agent session can run it without a shell.

import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { ConfigSchema, projectDir, readJson, sdDir } from './files.ts';
import { FIRST_PORT } from './ui-server.ts';

/** The oldest Node that runs this package: `URL.parse` and type stripping. */
export const MIN_NODE = [22, 18] as const;

export function nodeSupported(version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

function portFree(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const probe = createServer()
      .once('error', () => ok(false))
      .listen(port, '127.0.0.1', () => probe.close(() => ok(true)));
  });
}

/**
 * Every check, as `ok  `, `FAIL`, `note` or `--  ` lines. `viewerPort` is the
 * viewer this process already runs, if any: probing its port would say taken.
 */
export async function doctor(
  options: { project?: string; viewerPort?: number | null } = {}
): Promise<{ ok: boolean; lines: string[] }> {
  const { chromium } = await import('playwright-core');
  const lines: string[] = [];
  let ok = true;
  const say = (pass: boolean, text: string) => {
    lines.push(`${pass ? 'ok  ' : 'FAIL'} ${text}`);
    if (!pass) ok = false;
  };

  say(nodeSupported(), `Node ${process.versions.node} (needs ${MIN_NODE.join('.')} or later)`);

  let browser = '';
  for (const channel of ['chrome', undefined]) {
    try {
      const b = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
      browser = `${channel ? 'Google Chrome' : "Playwright's Chromium"} ${b.version()}`;
      await b.close();
      break;
    } catch {
      // Try the next one.
    }
  }
  say(
    Boolean(browser),
    browser || 'No Chrome found: install Google Chrome, or run `npx playwright install chromium`'
  );

  if (options.viewerPort) {
    lines.push(`ok   Viewer running on port ${options.viewerPort}`);
  } else {
    const free = await portFree(FIRST_PORT);
    lines.push(
      `ok   Viewer port ${FIRST_PORT} ${free ? 'is free' : 'is taken: the viewer will use the next free port'}`
    );
  }

  const project = options.project ?? projectDir();
  const configPath = join(sdDir(project), 'stuntdouble.json');
  if (existsSync(configPath)) {
    try {
      await readJson(configPath, ConfigSchema, '.stuntdouble/stuntdouble.json');
      lines.push(`ok   Project ${project}`);
    } catch (err) {
      say(false, (err as Error).message);
    }
  } else {
    lines.push(`--   No .stuntdouble/stuntdouble.json in ${project} yet`);
  }

  // Whether it is set, never what it is. Claude Code may still not be using it
  // (it asks first, and Bedrock, Vertex or an apiKeyHelper bill elsewhere).
  lines.push(
    'ANTHROPIC_API_KEY' in process.env
      ? 'note ANTHROPIC_API_KEY is set: if Claude Code is using it (see /status), local runs are billed to that key rather than your Claude plan'
      : 'ok   Stunt Double makes no model calls: local runs use whatever account Claude Code is signed in with (see /status)'
  );
  return { ok, lines };
}
