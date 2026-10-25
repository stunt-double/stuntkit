// The grader's reply: a 0 to 100 score with its evidence, per-criterion
// findings and the frictions it saw, plus repairs for the two malformed shapes
// models are known to return. Needs `zod` (an optional peer dependency), so it
// is its own entry point and the rest of the package stays dependency-free.

import { z } from 'zod';

export const rubricSchema = z.object({
  score: z.number().min(0).max(100).describe('Overall score from 0 to 100'),
  evidence: z.string().describe('Concise (2-4 sentence) justification for the score'),
  findings: z
    .array(
      z.object({
        id: z.string().describe('Short stable identifier for the criterion, e.g. "task-completed"'),
        label: z.string().describe('Human-readable name of the criterion'),
        passed: z.boolean().describe('Whether the criterion was met'),
        weight: z.number().describe('Relative weight of this criterion'),
        detail: z.string().optional().describe('Optional one-sentence note about this finding'),
      })
    )
    .describe('Per-criterion grading results'),
  frictions: z
    .array(
      z.object({
        severity: z
          .enum(['low', 'medium', 'high'])
          .describe('Severity: exactly one of low, medium, or high'),
        summary: z.string().describe('One-sentence description of the friction'),
        evidence: z.string().optional().describe('Optional supporting evidence'),
      })
    )
    .describe('Notable friction points observed during the session'),
});

export type RubricResult = z.infer<typeof rubricSchema>;

/**
 * Repairs the first malformed shape the grader produces. Sonnet 5.5 under
 * `jsonTool` mode sometimes nests the whole rubric inside a single wrapper key
 * (`{"parameter name": {...}}`, sometimes `input` or `parameters`) instead of
 * emitting it as the tool arguments. The rubric inside is complete and valid:
 * in production this was about one grade in six, each thrown away after the
 * session had already paid for its browser and every agent step. Returns the
 * unwrapped object when that is the shape, and null (no repair) otherwise.
 */
export function unwrapSingleKeyRubric(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 1) return null;
  const inner = (parsed as Record<string, unknown>)[keys[0]];
  if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) return null;
  return rubricSchema.safeParse(inner).success ? JSON.stringify(inner) : null;
}

const ARRAY_FIELDS = ['findings', 'frictions'] as const;

/**
 * Tool-call markup the model sometimes writes inside an argument: the end of
 * one parameter and the start of the next (`]</findings>\n<parameter
 * name="frictions">[`), which splices a later array into an earlier string.
 */
// Quantifiers are bounded so the pattern stays linear on hostile input.
const LEAKED_PARAMETER = /<\/[\w-]{1,64}>\s{0,32}<parameter name="([\w-]{1,64})">/g;

/** Drop closing tags (`</findings>`) left after the array, without a backtracking regex. */
function stripTrailingClosingTags(text: string): string {
  let out = text.trimEnd();
  while (out.endsWith('>')) {
    const open = out.lastIndexOf('</');
    if (open < 0 || !/^[\w-]+$/.test(out.slice(open + 2, -1))) break;
    out = out.slice(0, open).trimEnd();
  }
  return out;
}

function parseArray(text: string): unknown[] | null {
  const trimmed = stripTrailingClosingTags(text.trim()).trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Repairs the second malformed shape: an array argument sent as a string,
 * sometimes with the next parameter's tool-call markup spliced into it, so
 * `findings` holds the findings JSON plus `</findings><parameter
 * name="frictions">` and the frictions, and `frictions` itself is missing
 * (production, a Sonnet 5 grade that scored 100 and was thrown away). Each
 * piece is parsed back into its own array. Returns null when the result still
 * is not a valid rubric.
 */
export function repairLeakedArrays(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const obj: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };

  let changed = false;
  for (const field of ARRAY_FIELDS) {
    const value = obj[field];
    if (typeof value !== 'string') continue;
    const pieces = value.split(LEAKED_PARAMETER);
    // `split` with a capture group: [first, name1, piece1, name2, piece2, ...]
    const first = parseArray(pieces[0]);
    if (!first) return null;
    obj[field] = first;
    for (let i = 1; i + 1 < pieces.length; i += 2) {
      const name = pieces[i];
      const array = parseArray(pieces[i + 1]);
      if (!array || !(ARRAY_FIELDS as readonly string[]).includes(name)) return null;
      obj[name] = array;
    }
    changed = true;
  }
  if (!changed) return null;
  return rubricSchema.safeParse(obj).success ? JSON.stringify(obj) : null;
}

/** Every known repair, in turn: the text to parse instead, or null when none applies. */
export function repairRubricText(text: string): string | null {
  return unwrapSingleKeyRubric(text) ?? repairLeakedArrays(text);
}
