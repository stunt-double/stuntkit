#!/usr/bin/env node
// stuntdouble mcp | view [dir] | doctor

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { MIN_NODE, nodeSupported } from './doctor.ts';
import { projectDir } from './files.ts';

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

const [command, arg] = process.argv.slice(2);
// npx does not enforce `engines`, and on an older Node the tools fail later and
// stranger. stderr lands in the MCP client's log.
if (!nodeSupported() && command !== 'doctor') {
  process.stderr.write(
    `Stunt Double Local needs Node ${MIN_NODE.join('.')} or later (this is ${process.versions.node}). Update Node, then restart Claude Code.\n`
  );
  process.exit(1);
}
if (command === 'mcp') {
  const { serveMcp } = await import('./mcp.ts');
  await serveMcp();
} else if (command === 'view') {
  await view(arg);
} else if (command === 'doctor') {
  const { doctor } = await import('./doctor.ts');
  const { ok, lines } = await doctor();
  console.log(lines.join('\n'));
  process.exitCode = ok ? 0 : 1;
} else {
  console.log(USAGE);
  process.exitCode = command && command !== 'help' && command !== '--help' ? 1 : 0;
}
