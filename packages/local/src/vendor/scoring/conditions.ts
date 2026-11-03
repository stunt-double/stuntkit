// Vendored verbatim from the Stunt Double monorepo, packages/platform/src/checklists/conditions.ts
// at ee0ccb43c, so a local run is scored by exactly the code that scores a cloud run. Do not
// edit it here: change the source and copy it again. ponytail: a copy until the scoring is
// published as @stunt-double/checklist, which both sides can then import.

/**
 * Whether a check runs at all, given how the check before it turned out.
 *
 * Every check in a checklist used to run, always. That is the wrong shape for
 * the two things people actually write down:
 *
 *   - "the order confirmation shows the right total" only means anything once
 *     "the payment completes" passed. Running it regardless files a second
 *     failure that is really the first one reported twice, and a report full of
 *     knock-on failures buries the one that matters.
 *   - "the error message explains what to fix" is only reachable when the step
 *     before it failed. Running it on a healthy product fails a check for the
 *     crime of the product working.
 *
 * So a check carries a `run_condition`, judged against the result of the check
 * immediately before it in `sort_order`. A check whose condition is unmet is
 * recorded as `skipped`: not passed, not failed, and deliberately not an error,
 * because nothing went wrong and nothing was learned.
 *
 * **The decisive rule is what counts as unmet.** Only a verdict that
 * contradicts the condition skips a check. An antecedent that errored, or that
 * is informational and therefore has no verdict at all, leaves the condition
 * undecidable, and an undecidable condition **runs** the check. Skipping there
 * would silently drop coverage on the strength of an authoring mistake or an
 * infrastructure blip, and silently testing less is the one outcome a testing
 * product must never produce. A skipped antecedent is different: it is a
 * definite "did not pass", so the chain propagates and a dead branch stays dead.
 *
 * Pure module: no runtime imports, so `node --test` (which resolves exact paths
 * only) can load it directly.
 */

import type { CheckResultStatus } from './scoring.ts';

export const CHECKLIST_RUN_CONDITIONS = [
  'always',
  'if_previous_passed',
  'if_previous_failed',
] as const;

export type ChecklistRunCondition = (typeof CHECKLIST_RUN_CONDITIONS)[number];

export function isChecklistRunCondition(value: unknown): value is ChecklistRunCondition {
  return (
    typeof value === 'string' && (CHECKLIST_RUN_CONDITIONS as readonly string[]).includes(value)
  );
}

/**
 * Falls back to `always` for null, an unknown value, or a lagging schema cache,
 * which is what every check did before conditions existed. A row that cannot be
 * read must keep behaving the way it always has, and "always" is the reading
 * that never drops a check.
 */
export function resolveRunCondition(value: unknown): ChecklistRunCondition {
  return isChecklistRunCondition(value) ? value : 'always';
}

/** Short labels, so the editor, the report and the run agree on the words. */
export const RUN_CONDITION_LABELS: Record<ChecklistRunCondition, string> = {
  always: 'Always',
  if_previous_passed: 'If previous passed',
  if_previous_failed: 'If previous failed',
};

export const RUN_CONDITION_DESCRIPTIONS: Record<ChecklistRunCondition, string> = {
  always: 'Runs every time, whatever the check before it found.',
  if_previous_passed: 'Runs only when the check before it passed. Otherwise it is skipped.',
  if_previous_failed: 'Runs only when the check before it failed. Otherwise it is skipped.',
};

/** A check as this module needs to see it, in `sort_order`. */
export type ConditionalCheck = {
  id: string;
  description: string;
  runCondition: ChecklistRunCondition;
};

export type SkippedCheck = {
  checkId: string;
  /** Stored as the result's evidence, so the report says why nothing ran. */
  reason: string;
};

/** Quotes a check so the reason reads as a sentence rather than a log line. */
function quote(description: string): string {
  const trimmed = description.trim();
  return trimmed ? `"${trimmed}"` : 'the check before it';
}

/**
 * Whether one check is skipped, given the effective status of the check before
 * it. `previousStatus` is undefined when the previous check has no result yet,
 * which is undecided rather than unmet.
 */
export function checkRunIsSkipped(
  check: ConditionalCheck,
  previous: { description: string; status: CheckResultStatus | undefined } | null
): SkippedCheck | null {
  if (check.runCondition === 'always') return null;
  // The first check has nothing before it to depend on. A condition here is an
  // authoring leftover (usually from a reorder), and running the check is the
  // reading that tests more rather than less.
  if (!previous) return null;

  const status = previous.status;
  if (status === undefined || status === 'error' || status === 'informational') return null;

  if (check.runCondition === 'if_previous_passed') {
    if (status === 'passed') return null;
    return {
      checkId: check.id,
      reason:
        status === 'skipped'
          ? `Skipped: this check runs only when ${quote(previous.description)} passes, and that check was skipped too.`
          : `Skipped: this check runs only when ${quote(previous.description)} passes, and it failed.`,
    };
  }

  if (status === 'failed') return null;
  return {
    checkId: check.id,
    reason:
      status === 'skipped'
        ? `Skipped: this check runs only when ${quote(previous.description)} fails, and that check was skipped.`
        : `Skipped: this check runs only when ${quote(previous.description)} fails, and it passed.`,
  };
}

/**
 * Every check that should be skipped given the results recorded so far.
 *
 * Walks the checks in run order and treats a check this pass has just skipped
 * as skipped for the check after it, so one unmet condition takes its whole
 * dependent chain with it. Checks that already have a result are left alone:
 * this only ever decides about checks nothing has judged yet.
 *
 * It is called twice by a run, on purpose. Once after each verdict, so a check
 * that can no longer run is settled immediately and never handed to the agent;
 * and once at the end over whatever is left, so the same rule decides the
 * checks a run never reached rather than a second copy of it.
 */
export function resolveSkippedChecks(input: {
  /** The checklist's checks in `sort_order`. */
  checks: ConditionalCheck[];
  /** Status per check id, for the checks that have a result. */
  statuses: ReadonlyMap<string, CheckResultStatus>;
}): SkippedCheck[] {
  const effective = new Map(input.statuses);
  const skipped: SkippedCheck[] = [];

  input.checks.forEach((check, index) => {
    if (effective.has(check.id)) return;
    const previousCheck = index > 0 ? input.checks[index - 1] : null;
    const decision = checkRunIsSkipped(
      check,
      previousCheck
        ? { description: previousCheck.description, status: effective.get(previousCheck.id) }
        : null
    );
    if (!decision) return;
    skipped.push(decision);
    effective.set(check.id, 'skipped');
  });

  return skipped;
}

/**
 * Whether a checklist has any check whose condition can never be judged.
 *
 * A condition on the first check, or one pointing at an informational check
 * (which has no verdict by definition), is an authoring mistake rather than a
 * rule: at run time it resolves to "run the check", so nothing breaks, but the
 * author has written something that does not do what it says. The editor says
 * so instead of leaving them to find out from a report.
 */
export function unjudgeableConditions(
  checks: Array<{ id: string; runCondition: ChecklistRunCondition; checkType: string }>
): string[] {
  const ids: string[] = [];
  checks.forEach((check, index) => {
    if (check.runCondition === 'always') return;
    const previous = index > 0 ? checks[index - 1] : null;
    if (!previous || previous.checkType === 'informational') ids.push(check.id);
  });
  return ids;
}
