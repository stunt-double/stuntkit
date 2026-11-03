// The files a project keeps under `.stuntdouble/`: their schemas, where they
// live, and writes that never leave a half-written file behind.
//
// Actors and checklists are the hosted MCP's `create_actor` and
// `create_checklist` inputs with slugs in place of ids, so the same files push
// to the cloud unchanged, except `browser_config`, which the hosted inputs do
// not take yet. They are strict: a misspelt key is an error naming the field
// rather than a setting silently ignored.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendFile, lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
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

// The hosted update_actor and add_actor_knowledge limits, so a push is never
// refused for a file that runs locally.
const ACTOR_INSTRUCTIONS_MAX_LENGTH = 1000;
const ACTOR_KNOWLEDGE_TITLE_MAX_LENGTH = 120;
const ACTOR_KNOWLEDGE_CONTENT_MAX_LENGTH = 8000;

export const ActorSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  system_prompt: z.string().max(ACTOR_INSTRUCTIONS_MAX_LENGTH).optional(),
  knowledge: z
    .array(
      z.strictObject({
        kind: z.enum(['expertise', 'process', 'reference', 'account']).default('reference'),
        title: z.string().min(1).max(ACTOR_KNOWLEDGE_TITLE_MAX_LENGTH),
        content: z.string().min(1).max(ACTOR_KNOWLEDGE_CONTENT_MAX_LENGTH),
      })
    )
    .default([]),
  /** Keep this actor's cookies between runs, in ~/.stuntdouble/profiles/<project>/<actor>. */
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
    /** A standalone Studio run: the model on the person's own connection. */
    model: z.object({ provider: z.string(), id: z.string() }).optional(),
    /** What a standalone run used, when the provider reports it. */
    usage: z
      .object({
        steps: z.number(),
        input_tokens: z.number(),
        output_tokens: z.number(),
        cache_read_tokens: z.number().optional(),
        cost_usd: z.number().nullish(),
      })
      .optional(),
  }),
  status: z.enum(RUN_STATUSES),
  pid: z.number().optional(),
  url: z.string(),
  // A run pulled back from the cloud may not have started.
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  checklist: z.string(),
  actor: z.string(),
  checklist_snapshot: z.object({ checks: z.array(CheckSchema) }).loose(),
  results: z.array(ResultSchema),
  score: z
    .object({
      score: z.number().nullable(),
      outcome: z.enum(['passed', 'failed', 'inconclusive']),
      // A local run writes all three; a cloud run written by hand may leave them out.
      unit: z.string().nullish(),
      pass_threshold: z.number().nullish(),
      grade: z.string().nullish(),
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
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(
      `${label}: ${code === 'ENOENT' ? 'file not found' : `could not read (${code})`}`,
      {
        cause: err,
      }
    );
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
  await refuseLinks(path);
  // Unique per write: two writes to one path at once must not share a temp file.
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, path);
}

export async function appendJsonl(path: string, line: unknown): Promise<void> {
  await refuseLinks(path);
  await appendFile(path, `${JSON.stringify(line)}\n`);
}

/**
 * Refuse a write through a symlink inside `.stuntdouble/`. Run folders are
 * committed and cloned, so a repo could ship `activity.jsonl -> ~/.ssh/...`.
 */
// ponytail: checks the segments after the last `.stuntdouble`; a path without one is not checked.
async function refuseLinks(path: string): Promise<void> {
  const parts = path.split(sep);
  const from = parts.lastIndexOf('.stuntdouble');
  if (from < 0) return;
  for (let i = from + 1; i <= parts.length; i++) {
    const info = await lstat(parts.slice(0, i).join(sep)).catch(() => null);
    if (info?.isSymbolicLink())
      throw new Error(`Refusing to write through a symlink: ${parts.slice(0, i).join(sep)}`);
  }
}

/**
 * Whether a process is still running. EPERM counts as gone: a run is always the
 * person's own process, so a pid owned by another user is a reused one.
 */
export function isAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * While a run is going, `.live/running/<id>` holds its pid. `.live/` is never
 * committed, so a run.json cloned or left by a crash has no marker, and a pid
 * that happens to be reused does not make it look live.
 */
export const runningMarker = (root: string, id: string): string =>
  join(root, '.live', 'running', id);

export function isLive(root: string, run: Run): boolean {
  let marker: string;
  try {
    marker = readFileSync(runningMarker(root, run.id), 'utf8').trim();
  } catch {
    return false;
  }
  return marker === String(run.pid) && isAlive(run.pid);
}

/** A run left `running` by a process that has gone is an interrupted run. */
export const effectiveStatus = (root: string, run: Run): Run['status'] =>
  run.status === 'running' && !isLive(root, run) ? 'interrupted' : run.status;

/** Passed over scored checks, as the scorer counts them: informational and skipped left out. */
export function tallyRun(run: Pick<Run, 'checklist_snapshot' | 'results'>): {
  passed: number;
  total: number;
} {
  const status = new Map(run.results.map((r) => [r.check, r.status]));
  const scored = run.checklist_snapshot.checks.filter(
    (c) => c.type !== 'informational' && status.get(c.key) !== 'skipped'
  );
  return {
    passed: scored.filter((c) => status.get(c.key) === 'passed').length,
    total: scored.length,
  };
}

/** One run, by the folder name it was given. A name that is not one is a miss. */
export async function readRun(root: string, id: string): Promise<RunEntry | null> {
  if (!/^[\w.-]+$/.test(id) || id.startsWith('.')) return null;
  const path = join(root, 'runs', id, 'run.json');
  if (!(await lstat(join(root, 'runs', id)).catch(() => null))) return null;
  try {
    return { id, run: await readJson(path, RunSchema) };
  } catch (err) {
    return { id, error: (err as Error).message };
  }
}

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
