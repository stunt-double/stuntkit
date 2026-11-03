#!/usr/bin/env node
// stuntdouble mcp | view [dir] | doctor

import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

import { ConfigSchema, projectDir, readJson, sdDir } from './files.ts';

const USAGE = `Usage: stuntdouble <command>

  mcp          Serve the local browser and run tools over stdio (your agent starts this)
  view [dir]   Open the viewer over a project's .stuntdouble/ folder (default: this folder)
  doctor       Check Node, Chrome, the viewer port and how local runs are billed`;

async function view(dir: string | undefined): Promise<void> {
  const { startUi } = await import('./ui-server.ts');
  const base = resolve(dir ?? projectDir());
  const root = existsSync(join(base, '.stuntdouble')) ? join(base, '.stuntdouble') : base;
  const ui = await startUi({ root });
  console.log(`Stunt Double viewer for ${root}\n\n  ${ui.link()}\n\nCtrl+C to stop.`);
  process.on('SIGINT', () => ui.close().then(() => process.exit(0)));
}

function portFree(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const probe = createServer()
      .once('error', () => ok(false))
      .listen(port, '127.0.0.1', () => probe.close(() => ok(true)));
  });
}

async function doctor(): Promise<boolean> {
  const { chromium } = await import('playwright-core');
  const { FIRST_PORT } = await import('./ui-server.ts');
  const lines: string[] = [];
  let ok = true;
  const say = (pass: boolean, text: string) => {
    lines.push(`${pass ? 'ok  ' : 'FAIL'} ${text}`);
    if (!pass) ok = false;
  };

  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  say(
    major > 22 || (major === 22 && minor >= 18),
    `Node ${process.versions.node} (needs 22.18 or later)`
  );

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

  const free = await portFree(FIRST_PORT);
  lines.push(
    `ok   Viewer port ${FIRST_PORT} ${free ? 'is free' : 'is taken: the viewer will use the next free port'}`
  );

  const project = projectDir();
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

  // Whether it is set, never what it is.
  lines.push(
    'ANTHROPIC_API_KEY' in process.env
      ? 'note ANTHROPIC_API_KEY is set, so Claude Code bills local runs to that API key, not your Claude plan'
      : 'ok   Local runs count against your Claude plan (no ANTHROPIC_API_KEY is set)'
  );
  console.log(lines.join('\n'));
  return ok;
}

const [command, arg] = process.argv.slice(2);
if (command === 'mcp') {
  const { serveMcp } = await import('./mcp.ts');
  await serveMcp();
} else if (command === 'view') {
  await view(arg);
} else if (command === 'doctor') {
  process.exitCode = (await doctor()) ? 0 : 1;
} else {
  console.log(USAGE);
  process.exitCode = command && command !== 'help' && command !== '--help' ? 1 : 0;
}
