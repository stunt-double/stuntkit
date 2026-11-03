// The stdio MCP server: the browser toolset's direct tools plus the run tools,
// over one `LocalSession`. The person's own agent session is the only model:
// this process drives a browser and writes files, and calls no model at all.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DIRECT_TOOL_SPECS } from '@stunt-double/browser-toolset/direct-tools';
import { z } from 'zod';

import { projectDir } from './files.ts';
import { LocalSession, PACKAGE, type ToolOutput } from './run.ts';

const reply = ({ text, image, isError }: ToolOutput): CallToolResult => ({
  content: [
    { type: 'text', text },
    ...(image ? [{ type: 'image' as const, data: image, mimeType: 'image/png' }] : []),
  ],
  ...(isError ? { isError: true } : {}),
});

let queue: Promise<unknown> = Promise.resolve();

/**
 * Run a tool, turning a thrown error into a result the model reads and acts on.
 * Calls can arrive at once (two verdicts in one turn) but share one page and
 * one run.json, so they take turns.
 */
function attempt(work: () => Promise<string | ToolOutput>): Promise<CallToolResult> {
  const run = queue.then(async () => {
    try {
      const out = await work();
      return reply(typeof out === 'string' ? { text: out } : out);
    } catch (err) {
      return reply({ text: (err as Error).message, isError: true });
    }
  });
  queue = run;
  return run;
}

type PropertySpec = { type: string; enum?: string[]; description?: string };

/** A direct tool's flat JSON Schema as the zod shape the SDK registers. */
function shapeOf(spec: (typeof DIRECT_TOOL_SPECS)[number]): z.ZodRawShape {
  const required = new Set(spec.parameters.required ?? []);
  return Object.fromEntries(
    Object.entries(spec.parameters.properties).map(([key, raw]) => {
      const prop = raw as PropertySpec;
      let schema: z.ZodType = prop.enum
        ? z.enum(prop.enum as [string, ...string[]])
        : prop.type === 'number'
          ? z.number()
          : z.string();
      if (prop.description) schema = schema.describe(prop.description);
      return [key, required.has(key) ? schema : schema.optional()];
    })
  );
}

export function createServer(session: LocalSession): McpServer {
  const server = new McpServer({ name: 'stuntdouble', version: PACKAGE.split('@')[1]! });

  // `done` is the toolset's end signal; here a run ends with finish_run.
  for (const spec of DIRECT_TOOL_SPECS.filter((s) => s.name !== 'done')) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: shapeOf(spec) },
      (input) => attempt(() => session.browserTool(spec.name, input))
    );
  }

  server.registerTool(
    'start_run',
    {
      description:
        "Start a local run of a checklist from .stuntdouble/checklists/<checklist>.json: opens a fresh Chrome at the checklist's URL, and returns the viewer link, the actor's brief and the checks to judge. If a file is invalid, returns each field to fix. With resume, continues the run still open in this session, or else the newest interrupted or stopped run of that checklist, judging only the checks without a verdict.",
      inputSchema: {
        checklist: z.string().describe('The checklist slug, e.g. "checkout".'),
        resume: z.boolean().optional().describe('Continue the last unfinished run instead.'),
      },
    },
    (input) => attempt(() => session.startRun(input))
  );

  server.registerTool(
    'evaluate_check',
    {
      description:
        'Record the verdict on one check, as soon as you have observed it. A passed verdict needs a locator for evidence visible on the page now; a failure may describe something missing. Use "informational" only for informational checks, and "blocked" when you could not reach what the check is about. Saves a screenshot of the evidence and returns the next check.',
      inputSchema: {
        check: z.string().describe('The check key, e.g. "guest-checkout".'),
        status: z.enum(['passed', 'failed', 'informational', 'blocked']),
        evidence: z
          .string()
          .min(1)
          .describe('What you observed, in a sentence or two, quoting the page where you can.'),
        locator: z
          .object({
            text: z.string().optional().describe('Distinctive text visible on the page.'),
            selector: z.string().optional().describe('A CSS selector for the element.'),
          })
          .optional()
          .describe('Where the evidence is on the page. Required for passed.'),
      },
    },
    (input) => attempt(() => session.evaluateCheck(input))
  );

  server.registerTool(
    'finish_run',
    {
      description:
        'End the run: settles the checks left, scores it the way the cloud does, writes run.json, closes the browser and returns the outcome. Always call it, even when blocked or stopped.',
      inputSchema: {
        summary: z.string().min(1).describe('One or two sentences on what you found.'),
      },
    },
    (input) => attempt(() => session.finishRun(input))
  );

  server.registerTool(
    'open_ui',
    {
      description:
        'The local viewer for this project: every run with its verdicts, screenshots and activity, and the checklists and actors. Returns a link to open in a browser.',
    },
    () => attempt(() => session.openUi())
  );

  return server;
}

export async function serveMcp(): Promise<void> {
  const session = new LocalSession({ project: projectDir() });
  const server = createServer(session);
  // stdin closing and the SIGTERM that follows both land here; close once.
  let closing: Promise<void> | undefined;
  const shutdown = () => (closing ??= session.close().finally(() => process.exit(0)));
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await server.connect(new StdioServerTransport());
}
