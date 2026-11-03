// The files a project keeps under `.stuntdouble/`: their schemas, where they
// live, and writes that never leave a half-written file behind.
//
// Actors and checklists are the hosted MCP's `create_actor` and
// `create_checklist` inputs with slugs in place of ids, so the same files push
// to the cloud unchanged. They are strict: a misspelt key is an error naming
// the field rather than a setting silently ignored.

import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';

import { CHECKLIST_RUN_CONDITIONS } from './vendor/scoring/conditions.ts';
import { CHECKLIST_FAILURE_ACTIONS } from './vendor/scoring/failure.ts';
import {
  CHECKLIST_CHECK_TYPES,
  CHECKLIST_SCORE_TYPES,
  MAX_CHECK_WEIGHT,
  MAX_POINTS_SCORE,
  MAX_SCORE_BAND_LABEL_LENGTH,
  MAX_SCORE_BANDS,
  MAX_SCORE_UNIT_LENGTH,
  MIN_CHECK_WEIGHT,
} from './vendor/scoring/scoring.ts';

export const projectDir = (): string => process.env.STUNTDOUBLE_PROJECT_DIR || process.cwd();
export const sdDir = (project: string): string => join(project, '.stuntdouble');

const slug = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'Use lowercase letters, digits and hyphens, e.g. "guest-checkout"'
  );
/** Ids written back after a push to the cloud. Never read locally. */
const cloud = z.record(z.string(), z.unknown()).nullable().optional();

export const ConfigSchema = z.strictObject({
  format: z.literal('stuntdouble/1'),
  /** Local runs swap the checklist URL's origin for this one. */
  local_base_url: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .optional(),
  headless: z.boolean().default(false),
  /** Whether screenshots go to the model on every action or only from `screenshot`. */
  model_screenshots: z.enum(['on_request', 'every_action']).default('on_request'),
  /** `third_party`: no paying, signing up or secrets on hosts other than the app under test. */
  safety: z.enum(['third_party', 'off']).default('third_party'),
  cloud,
});
export type Config = z.infer<typeof ConfigSchema>;

export const ActorSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  system_prompt: z.string().optional(),
  knowledge: z
    .array(
      z.strictObject({
        kind: z.enum(['expertise', 'process', 'reference', 'account']).default('reference'),
        title: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .default([]),
  /** Keep this actor's cookies between runs, in ~/.stuntdouble/profiles/<actor>. */
  persist_login: z.boolean().default(false),
  cloud,
});
export type Actor = z.infer<typeof ActorSchema>;

const CheckSchema = z.strictObject({
  key: slug,
  description: z.string().min(1),
  type: z.enum(CHECKLIST_CHECK_TYPES).default('pass_fail'),
  weight: z.number().min(MIN_CHECK_WEIGHT).max(MAX_CHECK_WEIGHT).optional(),
  run_condition: z.enum(CHECKLIST_RUN_CONDITIONS).default('always'),
  on_failure: z.enum(CHECKLIST_FAILURE_ACTIONS).default('continue'),
});
export type Check = z.infer<typeof CheckSchema>;

export const ChecklistSchema = z.strictObject({
  name: z.string().min(1).max(200),
  actor: slug,
  url: z.url({ protocol: /^https?$/ }),
  instructions: z.string().min(1),
  checks: z
    .array(CheckSchema)
    .min(1)
    .refine((checks) => new Set(checks.map((c) => c.key)).size === checks.length, {
      message: 'Every check needs its own key',
    }),
  pass_threshold: z.number().min(0).max(MAX_POINTS_SCORE).optional(),
  score_type: z.enum(CHECKLIST_SCORE_TYPES).default('percent'),
  score_unit: z.string().max(MAX_SCORE_UNIT_LENGTH).nullable().optional(),
  score_bands: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(MAX_SCORE_BAND_LABEL_LENGTH),
        min: z.number().min(0).max(MAX_POINTS_SCORE),
      })
    )
    .max(MAX_SCORE_BANDS)
    .optional(),
  browser_config: z
    .strictObject({
      preset: z.enum(['desktop', 'tablet', 'mobile']).optional(),
      viewport: z
        .strictObject({
          width: z.int().min(320).max(2560),
          height: z.int().min(320).max(2560),
        })
        .optional(),
      touch: z.boolean().optional(),
      locale: z.string().optional(),
    })
    .optional(),
  // Cloud run settings, accepted so the file stays a valid hosted input. Unused locally.
  record_session: z.boolean().optional(),
  run_mode: z.enum(['code', 'agentic']).optional(),
  cloud,
});
export type Checklist = z.infer<typeof ChecklistSchema>;

export const RUN_STATUSES = ['running', 'completed', 'stopped', 'interrupted', 'failed'] as const;
export const RESULT_STATUSES = ['passed', 'failed', 'informational', 'error', 'skipped'] as const;

const LocatorSchema = z.strictObject({
  text: z.string().optional(),
  selector: z.string().optional(),
});
export type Locator = z.infer<typeof LocatorSchema>;

const ResultSchema = z.object({
  check: z.string(),
  status: z.enum(RESULT_STATUSES),
  evidence: z.string(),
  locator: LocatorSchema.optional(),
  screenshot: z.string().optional(),
  at: z.string().optional(),
});
export type Result = z.infer<typeof ResultSchema>;

export const RunSchema = z.object({
  format: z.literal('stuntdouble.run/1'),
  id: z.string(),
  runner: z.object({
    kind: z.enum(['local', 'cloud']),
    package: z.string().optional(),
    /** False for a local run: the actor judged its own verdicts. */
    judged: z.boolean(),
    run_id: z.string().optional(),
    url: z.string().optional(),
  }),
  status: z.enum(RUN_STATUSES),
  pid: z.number().optional(),
  url: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  checklist: z.string(),
  actor: z.string(),
  checklist_snapshot: z.object({ checks: z.array(CheckSchema) }).loose(),
  results: z.array(ResultSchema),
  score: z
    .object({
      score: z.number().nullable(),
      unit: z.string().nullable(),
      outcome: z.enum(['passed', 'failed', 'inconclusive']),
      pass_threshold: z.number(),
      grade: z.string().nullable(),
    })
    .nullable(),
  summary: z.string().nullable(),
  cloud: z.unknown().nullable(),
});
export type Run = z.infer<typeof RunSchema>;

/** Every problem in a file, one per line, as `file: field.path: message`. */
export function describeIssues(file: string, error: z.ZodError): string {
  return error.issues
    .map((issue) => `${file}: ${issue.path.join('.') || '(top level)'}: ${issue.message}`)
    .join('\n');
}

/** Read and validate a JSON file, or throw an error that says exactly what to fix. */
export async function readJson<S extends z.ZodType>(
  path: string,
  schema: S,
  label = path
): Promise<z.infer<S>> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`${label}: file not found`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: not valid JSON (${(err as Error).message})`, { cause: err });
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(describeIssues(label, parsed.error));
  return parsed.data;
}

/** Write to a temporary file, then rename over the target, so a reader never sees half a file. */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, path);
}

export async function appendJsonl(path: string, line: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(line)}\n`);
}

/** Whether a process is still running. EPERM means it is, under another user. */
export function isAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** A run left `running` by a process that has gone is an interrupted run. */
export const effectiveStatus = (run: Run): Run['status'] =>
  run.status === 'running' && !isAlive(run.pid) ? 'interrupted' : run.status;

export type RunEntry = { id: string; run: Run } | { id: string; error: string };

/** Every run folder under `runs/`, newest first. A run.json that does not parse says why. */
export async function readRuns(root: string): Promise<RunEntry[]> {
  const ids = await readdir(join(root, 'runs')).catch(() => [] as string[]);
  const entries = await Promise.all(
    ids
      .filter((id) => !id.startsWith('.'))
      .map(async (id): Promise<RunEntry> => {
        try {
          return { id, run: await readJson(join(root, 'runs', id, 'run.json'), RunSchema) };
        } catch (err) {
          return { id, error: (err as Error).message };
        }
      })
  );
  return entries.sort((a, b) => (a.id < b.id ? 1 : -1));
}
