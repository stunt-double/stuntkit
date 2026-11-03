// Vendored verbatim from the Stunt Double monorepo, packages/platform/src/checklists/failure.ts
// at ee0ccb43c, so a local run is scored by exactly the code that scores a cloud run. Do not
// edit it here: change the source and copy it again. ponytail: a copy until the scoring is
// published as @stunt-double/checklist, which both sides can then import.

/**
 * What a run does when a check fails.
 *
 * A failure never stopped anything: the actor recorded the verdict and carried
 * on through every remaining check. That is the right behaviour for a checklist
 * of independent observations, and the wrong one for a flow. If "the payment
 * completes" fails, everything after it is being judged against a page nobody
 * can reach, so the report fills with knock-on failures that are all the first
 * one wearing different words, and the check that actually broke is buried in
 * them.
 *
 * `run_condition` (see `conditions.ts`) already covers the narrow version of
 * this: one check that only applies when the one before it passed. It cannot
 * express "and nothing after this is worth attempting", which is the common
 * case for a flow, because it would have to be repeated on every remaining
 * check and rewired every time the list is reordered.
 *
 * So a check carries an action for its own failure:
 *
 *   - `continue`  record the failure and carry on. The default, and what every
 *                 check has always done.
 *   - `stop`      record the failure and end the run there. Every check that
 *                 has not been evaluated is recorded as skipped, naming the
 *                 check that stopped the run.
 *
 * Two decisions are worth stating, because both go the other way at first
 * glance:
 *
 *  1. **The remaining checks are skipped, not errored.** A stop is the
 *     checklist working as its author wrote it, exactly like an unmet run
 *     condition, so the same status carries it: out of the score's denominator,
 *     out of the blocking count, and reported as a deliberate omission rather
 *     than as a run that went wrong.
 *  2. **A `stop` failure always fails the run**, whatever the check's type. A
 *     weighted check set to stop is an author saying the run cannot meaningfully
 *     continue past it; a halted run that reported a passing score off the
 *     handful of checks it reached before stopping would be the most misleading
 *     report this product can produce. So `scoreChecklistRun` treats it as
 *     blocking regardless of how it is scored.
 *
 * Pure module: no runtime imports (the `CheckResultStatus` import is types
 * only, so nothing is loaded at runtime and there is no cycle with
 * `scoring.ts`), so `node --test`, which resolves exact paths only, can load it
 * directly.
 */

import type { CheckResultStatus } from './scoring.ts';

export const CHECKLIST_FAILURE_ACTIONS = ['continue', 'stop'] as const;

export type ChecklistFailureAction = (typeof CHECKLIST_FAILURE_ACTIONS)[number];

export function isChecklistFailureAction(value: unknown): value is ChecklistFailureAction {
  return (
    typeof value === 'string' && (CHECKLIST_FAILURE_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Falls back to `continue` for null, an unknown value, or a lagging schema
 * cache. That is what every check did before this column existed, and it is the
 * reading that evaluates more rather than less: a row that cannot be read must
 * not be able to cut a run short.
 */
export function resolveFailureAction(value: unknown): ChecklistFailureAction {
  return isChecklistFailureAction(value) ? value : 'continue';
}

/** Short labels, so the editor, the report and the run agree on the words. */
export const FAILURE_ACTION_LABELS: Record<ChecklistFailureAction, string> = {
  continue: 'Fail and continue',
  stop: 'Fail and stop',
};

export const FAILURE_ACTION_DESCRIPTIONS: Record<ChecklistFailureAction, string> = {
  continue: 'The failure is recorded and the run carries on with the remaining checks.',
  stop: 'The failure is recorded and the run ends. Every check it had not reached is skipped.',
};

/** A check as this module needs to see it, in `sort_order`. */
export type HaltingCheck = {
  id: string;
  description: string;
  onFailure: ChecklistFailureAction;
};

/**
 * The check that stopped the run, if one did.
 *
 * The first `stop` check with a failed verdict, in run order. First rather than
 * last because a run only ever gets one: everything after it is skipped, so a
 * second one can only appear if a caller passes results a run could not have
 * produced.
 */
export function findHaltingCheck<T extends HaltingCheck>(input: {
  checks: T[];
  statuses: ReadonlyMap<string, CheckResultStatus>;
}): T | null {
  return (
    input.checks.find(
      (check) => check.onFailure === 'stop' && input.statuses.get(check.id) === 'failed'
    ) ?? null
  );
}

/** Quotes a check so the reason reads as a sentence rather than a log line. */
function quote(description: string): string {
  const trimmed = description.trim();
  return trimmed ? `"${trimmed}"` : 'a required check';
}

/** The evidence a skipped check carries when a stop is what skipped it. */
export function haltedReason(halting: { description: string }): string {
  return `Skipped: the run stopped when ${quote(halting.description)} failed.`;
}

/**
 * Every check a halt leaves unevaluated, with the reason to record against it.
 *
 * Everything without a result is skipped, not only the checks after the halting
 * one: an agent does not always work through a checklist in order, so a check it
 * had passed over is just as unreachable once the run stops. Checks that already
 * have a result are left exactly as they are, halt or no halt.
 *
 * Shaped like `resolveSkippedChecks` in `conditions.ts` on purpose: the run task
 * writes both through one path, so a check skipped by a stop and a check skipped
 * by a condition produce the same kind of row.
 */
export function resolveHaltedChecks(input: {
  /** The checklist's checks in `sort_order`. */
  checks: HaltingCheck[];
  /** Status per check id, for the checks that have a result. */
  statuses: ReadonlyMap<string, CheckResultStatus>;
}): Array<{ checkId: string; reason: string }> {
  const halting = findHaltingCheck(input);
  if (!halting) return [];

  const reason = haltedReason(halting);
  return input.checks
    .filter((check) => !input.statuses.has(check.id))
    .map((check) => ({ checkId: check.id, reason }));
}
