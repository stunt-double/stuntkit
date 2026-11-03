#!/usr/bin/env node
// stuntdouble studio [dir] | run <checklist> | login | logout | mcp | view [dir] | doctor
//
// `mcp` is what Claude Code starts: the person's session is the model and the
// tools make no model calls. Everything else here is the standalone Studio,
// which runs on a connection the person configures, never a Claude plan.

import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { MIN_NODE, nodeSupported } from './doctor.ts';
import { projectDir } from './files.ts';

const USAGE = `Usage: stuntdouble [command]

  studio [dir]          Open Stunt Double Studio for a project (the default in a terminal)
  run <checklist>       Run a checklist on your own model connection (--cloud: in Stunt Double)
  login                 Sign in to Stunt Double for cloud runs (--workspace <slug>)
  logout                Sign out of Stunt Double
  mcp                   Serve the local browser and run tools over stdio (your agent starts this)
  view [dir]            Open the read-only viewer over a project's .stuntdouble/ folder
  doctor                Check Node, Chrome, the viewer port and how local runs are billed

Studio runs use your own Anthropic API key or OpenAI-compatible endpoint, never a Claude plan.`;

async function view(dir: string | undefined): Promise<void> {
  const { startUi } = await import('./ui-server.ts');
  const base = resolve(dir ?? projectDir());
  const root = existsSync(join(base, '.stuntdouble')) ? join(base, '.stuntdouble') : base;
  const ui = await startUi({ root });
  console.log(`Stunt Double viewer for ${root}\n\n  ${ui.link()}\n\nCtrl+C to stop.`);
  process.on('SIGINT', () => ui.close().then(() => process.exit(0)));
}

async function studio(dir: string | undefined, flags: { port?: string; open: boolean }) {
  const { startStudio } = await import('./studio.ts');
  const project = resolve(dir ?? projectDir());
  const app = await startStudio({ project, port: flags.port ? Number(flags.port) : undefined });
  const link = app.link();
  console.log(`Stunt Double Studio for ${project}\n\n  ${link}\n\nCtrl+C to stop.`);
  if (flags.open) (await import('./open-browser.ts')).openBrowser(link);
  let closing: Promise<void> | undefined;
  const shutdown = () => (closing ??= app.close().finally(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function login(workspace: string | undefined): Promise<void> {
  const cloud = await import('./cloud.ts');
  // A loopback listener for the one callback, on a port of the system's choosing.
  let port = 0;
  let finish: (err?: Error) => void = () => {};
  const finished = new Promise<void>((ok, fail) => {
    finish = (err) => (err ? fail(err) : ok());
  });
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (req.headers.host !== `127.0.0.1:${port}` || url.pathname !== '/oauth/callback') {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get('code');
    const done = code
      ? cloud.completeLogin(url.searchParams.get('state') ?? '', code)
      : Promise.reject(
          new Error(url.searchParams.get('error_description') ?? 'Sign-in was cancelled.')
        );
    done.then(
      () => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Signed in to Stunt Double. You can close this tab.');
        finish();
      },
      (err: Error) => {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(err.message);
        finish(err);
      }
    );
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as AddressInfo).port;
  try {
    const url = await cloud.beginLogin(`http://127.0.0.1:${port}/oauth/callback`);
    console.log(`Sign in to Stunt Double in your browser:\n\n  ${url}\n`);
    (await import('./open-browser.ts')).openBrowser(url);
    await finished;
  } finally {
    server.closeAllConnections();
    server.close();
  }
  const workspaces = await cloud.listWorkspaces();
  const chosen = workspace
    ? await cloud.chooseWorkspace(workspace)
    : workspaces.length === 1
      ? workspaces[0]!
      : null;
  console.log(
    chosen
      ? `Signed in. Cloud runs go to ${chosen.name} (${chosen.slug}).`
      : `Signed in. Choose a workspace with \`stuntdouble login --workspace <slug>\`, or in the Studio's Settings: ${workspaces.map((w) => w.slug).join(', ')}.`
  );
}

async function run(
  checklist: string | undefined,
  flags: { cloud: boolean; resume: boolean; 'max-steps'?: string }
): Promise<void> {
  if (!checklist) throw new Error('Name a checklist: stuntdouble run <checklist>.');
  const project = resolve(projectDir());
  const { readRun, sdDir } = await import('./files.ts');
  let runId: string;
  let report: string;
  if (flags.cloud) {
    const { startCloudRun } = await import('./cloud.ts');
    const started = await startCloudRun({ project, checklist });
    console.error(`Run ${started.runId} started in the cloud. Checking every 30 seconds.`);
    runId = started.runId;
    report = (await started.done).report;
  } else {
    const { resolveConnection } = await import('./credentials.ts');
    const connection = await resolveConnection();
    if (!connection || (!connection.apiKey && connection.provider === 'anthropic')) {
      throw new Error(
        'No model connection: set ANTHROPIC_API_KEY, or set one up in `stuntdouble studio` (Settings).'
      );
    }
    const { LocalSession } = await import('./run.ts');
    const { startStandaloneRun } = await import('./runner.ts');
    const session = new LocalSession({
      project,
      runner: { model: { provider: connection.provider, id: connection.model } },
    });
    process.on('SIGINT', () => void session.close().finally(() => process.exit(130)));
    const started = await startStandaloneRun({
      session,
      connection,
      checklist,
      resume: flags.resume,
      limits: flags['max-steps'] ? { maxSteps: Number(flags['max-steps']) } : undefined,
      onProgress: (p) => console.error(`  ${p.last.split('\n')[0]!.slice(0, 120)}`),
    });
    console.error(
      `Run ${started.runId} started on ${connection.model}. Watch it or stop it at ${await session.openUi(`/runs/${started.runId}`)}`
    );
    runId = started.runId;
    const done = await started.done;
    await session.close();
    const cost = done.usage.cost_usd != null ? `, about $${done.usage.cost_usd.toFixed(2)}` : '';
    console.error(
      `${done.usage.steps} model calls, ${(done.usage.input_tokens + done.usage.output_tokens).toLocaleString('en-GB')} tokens${cost}.`
    );
    // The viewer link closes with this process: point at the Studio instead.
    report = done.report.replace(
      /http:\/\/127\.0\.0\.1:\d+\/\S*\?t=\S+/g,
      `.stuntdouble/runs/${runId}/ (open it with \`npx stuntdouble studio\`)`
    );
  }
  console.log(report);
  const entry = await readRun(sdDir(project), runId);
  process.exitCode = entry && 'run' in entry && entry.run.score?.outcome === 'passed' ? 0 : 1;
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    cloud: { type: 'boolean', default: false },
    resume: { type: 'boolean', default: false },
    'max-steps': { type: 'string' },
    port: { type: 'string' },
    'no-open': { type: 'boolean', default: false },
    workspace: { type: 'string' },
  },
});
const [given, arg] = positionals;
// No command in a terminal opens the Studio; an MCP client always says `mcp`.
const command = given ?? (process.stdin.isTTY && process.stdout.isTTY ? 'studio' : undefined);
// npx does not enforce `engines`, and on an older Node the tools fail later and
// stranger. stderr lands in the MCP client's log.
if (!nodeSupported() && command !== 'doctor') {
  process.stderr.write(
    `Stunt Double Local needs Node ${MIN_NODE.join('.')} or later (this is ${process.versions.node}). Update Node, then try again.\n`
  );
  process.exit(1);
}
try {
  if (command === 'mcp') {
    const { serveMcp } = await import('./mcp.ts');
    await serveMcp();
  } else if (command === 'view') {
    await view(arg);
  } else if (command === 'studio') {
    await studio(arg, { port: values.port as string | undefined, open: !values['no-open'] });
  } else if (command === 'run') {
    await run(arg, values as { cloud: boolean; resume: boolean; 'max-steps'?: string });
  } else if (command === 'login') {
    await login(values.workspace as string | undefined);
  } else if (command === 'logout') {
    await (await import('./cloud.ts')).logout();
    console.log('Signed out of Stunt Double.');
  } else if (command === 'doctor') {
    const { doctor } = await import('./doctor.ts');
    const { ok, lines } = await doctor();
    console.log(lines.join('\n'));
    process.exitCode = ok ? 0 : 1;
  } else {
    console.log(USAGE);
    process.exitCode = command && command !== 'help' && command !== '--help' ? 1 : 0;
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
