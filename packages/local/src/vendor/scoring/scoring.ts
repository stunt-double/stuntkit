// Vendored verbatim from the Stunt Double monorepo, packages/platform/src/checklists/scoring.ts
// at ee0ccb43c, so a local run is scored by exactly the code that scores a cloud run. Do not
// edit it here: change the source and copy it again. ponytail: a copy until the scoring is
// published as @stunt-double/checklist, which both sides can then import.

/**
 * Check types, weights, and the verdict a checklist run reaches.
 *
 * Every check used to be the same kind of thing: a binary assertion, with a run
 * judged good when none of them failed. Three kinds are now distinguished,
 * because that single shape was quietly wrong for two of them:
 *
 *   - `pass_fail`      the original. Binary, and **blocking**: one failure
 *                      fails the run whatever else scored.
 *   - `weighted`       contributes `weight` to a score, so "checkout completes"
 *                      can outweigh "the footer year is current". The run's
 *                      verdict comes from the weighted pass rate against the
 *                      checklist's `pass_threshold`. A **negative** weight makes
 *                      the check a penalty: it adds nothing when it passes and
 *                      deducts its size from the points earned when it fails,
 *                      without ever raising the maximum (see below).
 *   - `informational`  has no verdict at all. The actor records what it observed
 *                      ("the headline price is $29/month") and that text goes in
 *                      the report. Counting it as a pass or a failure would be a
 *                      lie in either direction, so it is scored as neither.
 *
 * The blocking/scored split is the load-bearing decision here. The obvious
 * alternative, folding pass/fail checks into the score with an implicit weight,
 * makes "the user cannot check out" survivable as long as enough cosmetic checks
 * pass, which is precisely the report nobody should be able to produce. So a
 * mixed checklist has two independent hurdles: no blocking check may fail, and
 * the weighted score must reach the threshold.
 *
 * Penalties exist because a scoring rubric is often written as "award points
 * for each of these, and deduct points for that". Modelling the deduction as a
 * positive check ("no generic bank icon is used") would put its weight into
 * the maximum, so a product that merely avoided the mistake would score higher
 * than one that did everything right, and the "out of 80" the rubric's author
 * wrote would silently become "out of 110". A penalty check is still phrased
 * as something that should be true (the actor passes it when the product
 * avoids the problem), so pass and fail keep meaning good and bad everywhere.
 *
 * A checklist can also name **score bands** (`score_bands`): labelled ranges
 * of the score, so a run reads as "Optimal" or "Partial adoption" rather than
 * only as passed or failed. The bands are a reading of the score and do not
 * move the verdict: `pass_threshold` alone decides passed or failed, which is
 * what every alert and every list filters on.
 *
 * The score itself comes in one of two **score types** (`score_type`): a
 * percentage of the points available (the default, which keeps its meaning as
 * weights change), or the points earned as they are, for a rubric written in
 * its own units ("pass at 60 marks"). The threshold and band mins are in the
 * same unit as the score, and a run records the unit it was scored in so its
 * number never reads in the wrong one after the checklist is switched.
 *
 * Errors are the third state and are treated as **inconclusive**, not as
 * failures: a check the run never reached says nothing about the product. They
 * stay out of the score's denominator and do not fail the run on their own,
 * which is the behaviour that already existed when `error_count` was reported
 * beside the pass count rather than folded into it. `inconclusiveCount` is
 * carried on the result so a caller can say so rather than implying the score
 * covered everything.
 *
 * A check also carries what the run does when it fails (`failure.ts`). That is
 * an execution rule rather than a scoring one, but it lands here in one place:
 * a check set to stop the run is blocking whatever its type, because a halted
 * run must never report a passing score off the few checks it reached before
 * stopping.
 *
 * Pure module: its one import is a sibling pure module, so `node --test` (which
 * resolves exact paths only) can load it directly.
 */

import { RUN_FAILURE_CAUSE_LABELS, resolveRunFailureCause } from './failure-cause.ts';
import { resolveFailureAction } from './failure.ts';

// ---------------------------------------------------------------------------
// Check types
// ---------------------------------------------------------------------------

export const CHECKLIST_CHECK_TYPES = ['pass_fail', 'weighted', 'informational'] as const;
export type ChecklistCheckType = (typeof CHECKLIST_CHECK_TYPES)[number];

export function isChecklistCheckType(value: unknown): value is ChecklistCheckType {
  return typeof value === 'string' && (CHECKLIST_CHECK_TYPES as readonly string[]).includes(value);
}

/**
 * Falls back to 'pass_fail' for null, unknown values, or a lagging schema
 * cache, which is what every check was before types existed. A row that cannot
 * be read must keep behaving the way it always has.
 */
export function resolveCheckType(value: unknown): ChecklistCheckType {
  return isChecklistCheckType(value) ? value : 'pass_fail';
}

/** Short labels, so the dashboard, the MCP tools and the report agree. */
export const CHECK_TYPE_LABELS: Record<ChecklistCheckType, string> = {
  pass_fail: 'Pass / fail',
  weighted: 'Weighted',
  informational: 'Informational',
};

export const CHECK_TYPE_DESCRIPTIONS: Record<ChecklistCheckType, string> = {
  pass_fail: 'Must pass. One failure fails the whole run.',
  weighted:
    'Contributes its weight to the run score. A negative weight is a penalty, deducted when the check fails.',
  informational: 'Reported as an observation. Never passes or fails.',
};

/** What a penalty check does, for the surfaces that badge one. */
export const PENALTY_CHECK_DESCRIPTION =
  'Penalty. Adds nothing when it passes and deducts its weight from the score when it fails, without raising the maximum.';

// ---------------------------------------------------------------------------
// Score types
// ---------------------------------------------------------------------------

/**
 * What a weighted score is measured in. `percent` is the points earned over
 * the points available; `points` is the points earned, as they are, named by
 * the checklist's `score_unit`.
 */
export const CHECKLIST_SCORE_TYPES = ['percent', 'points'] as const;
export type ChecklistScoreType = (typeof CHECKLIST_SCORE_TYPES)[number];

export function isChecklistScoreType(value: unknown): value is ChecklistScoreType {
  return typeof value === 'string' && (CHECKLIST_SCORE_TYPES as readonly string[]).includes(value);
}

/** Falls back to 'percent', which is what every score was before types existed. */
export function resolveScoreType(value: unknown): ChecklistScoreType {
  return isChecklistScoreType(value) ? value : 'percent';
}

export const SCORE_TYPE_LABELS: Record<ChecklistScoreType, string> = {
  percent: 'Percentage',
  points: 'Points',
};

export const SCORE_TYPE_DESCRIPTIONS: Record<ChecklistScoreType, string> = {
  percent: 'The share of the available points earned, 0 to 100%.',
  points: 'The points earned, as they are. The threshold and bands are in points.',
};

export const DEFAULT_SCORE_UNIT = 'points';
/** Matches the column's CHECK constraint. */
export const MAX_SCORE_UNIT_LENGTH = 24;

/** A points label as stored: trimmed and capped, or null for the default. */
export function resolveScoreUnit(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_SCORE_UNIT_LENGTH);
  return trimmed || null;
}

/**
 * The unit a run's score is recorded in (`checklist_runs.score_unit`): null for
 * a percentage, otherwise the points label. One nullable value rather than a
 * type and a label, because a run only ever needs to know how to print its
 * number, and null is exactly how every run before score types reads.
 */
export function runScoreUnit(scoreType: unknown, scoreUnit: unknown): string | null {
  return resolveScoreType(scoreType) === 'points'
    ? (resolveScoreUnit(scoreUnit) ?? DEFAULT_SCORE_UNIT)
    : null;
}

/**
 * A score, threshold or band min in its unit: "75%" for a percentage (a null
 * unit), "62 marks" for points. Every surface that prints a score goes through
 * here so none of them assumes a percentage.
 */
export function formatScoreValue(value: number, unit: string | null | undefined): string {
  if (unit == null) return `${formatScore(value)}%`;
  // "1 points" reads as a typo; a unit ending in a single s drops it for one.
  const label = Math.abs(value) === 1 && /[^s]s$/i.test(unit) ? unit.slice(0, -1) : unit;
  return `${formatScore(value)} ${label}`;
}

// ---------------------------------------------------------------------------
// Weights and thresholds
// ---------------------------------------------------------------------------

export const DEFAULT_CHECK_WEIGHT = 1;
/**
 * Matches the column's CHECK constraint, so the UI rejects what the database
 * would. The floor is negative because a weight below zero is a penalty.
 */
export const MIN_CHECK_WEIGHT = -100;
export const MAX_CHECK_WEIGHT = 100;

/**
 * A usable weight for a check. A weight of zero is legal (it parks a check
 * without deleting it), so the fallback only applies to values that are not
 * finite numbers at all; anything out of range is clamped rather than rejected,
 * because a weight is an editor's judgement and not a correctness boundary.
 */
export function resolveCheckWeight(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_CHECK_WEIGHT;
  return Math.min(MAX_CHECK_WEIGHT, Math.max(MIN_CHECK_WEIGHT, parsed));
}

/** A weighted check whose weight is below zero is a penalty. */
export function isPenaltyWeight(weight: unknown): boolean {
  return resolveCheckWeight(weight) < 0;
}

/**
 * The most points a checklist can earn: the weights of its positively weighted
 * checks. Penalties are left out because they only ever take points away, and
 * the other two types are not scored. What an editor needs when it converts a
 * percentage threshold into the points its author was thinking in.
 */
export function checklistPossibleWeight(
  // A bare string is a check submitted as a description alone: pass/fail.
  checks: Array<string | { checkType?: unknown; weight?: unknown }>
): number {
  let total = 0;
  for (const check of checks) {
    if (typeof check === 'string' || resolveCheckType(check.checkType) !== 'weighted') continue;
    const weight = resolveCheckWeight(check.weight);
    if (weight > 0) total += weight;
  }
  return total;
}

/**
 * The weighted score a run must reach to pass, in the checklist's score type.
 *
 * 100 is the default and is what keeps every checklist that predates weighting
 * behaving exactly as it did: at 100%, one failed weighted check fails the run,
 * which is the old rule. It only becomes interesting once an author lowers it.
 * A points checklist's equivalent is full marks: see `defaultPassThreshold`.
 */
export const DEFAULT_PASS_THRESHOLD = 100;

/** The ceiling for a points threshold or band min. Matches the CHECK constraint. */
export const MAX_POINTS_SCORE = 100000;

function scoreCeiling(scoreType: unknown): number {
  return resolveScoreType(scoreType) === 'points' ? MAX_POINTS_SCORE : 100;
}

export function resolvePassThreshold(value: unknown, scoreType?: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_PASS_THRESHOLD;
  return Math.min(scoreCeiling(scoreType), Math.max(0, parsed));
}

/**
 * The threshold a checklist starts with when its author has not set one: every
 * point. 100% for a percentage, and the points available for points, so either
 * type begins with the all-or-nothing rule.
 */
export function defaultPassThreshold(scoreType: unknown, possibleWeight: number): number {
  return resolveScoreType(scoreType) === 'points' ? possibleWeight : DEFAULT_PASS_THRESHOLD;
}

/** A checklist's scoring settings as submitted by any surface that writes one. */
export type ChecklistScoringInput = {
  scoreType?: unknown;
  scoreUnit?: unknown;
  passThreshold?: unknown;
  scoreBands?: unknown;
};

/** The scoring columns of `checklists`, resolved for a write. */
export type ChecklistScoringColumns = {
  score_type: ChecklistScoreType;
  score_unit: string | null;
  pass_threshold: number;
  score_bands: ScoreBand[] | null;
};

/**
 * The scoring columns for a new checklist. Shared by the four surfaces that
 * create one (the server action, MCP, the assistant), so a points checklist
 * created without a threshold starts at full marks everywhere rather than at
 * an arbitrary 100 points.
 */
export function newChecklistScoring(
  input: ChecklistScoringInput & {
    checks: Array<string | { checkType?: unknown; weight?: unknown }>;
  }
): ChecklistScoringColumns {
  const scoreType = resolveScoreType(input.scoreType);
  return {
    score_type: scoreType,
    score_unit: resolveScoreUnit(input.scoreUnit),
    pass_threshold:
      input.passThreshold == null
        ? resolvePassThreshold(
            defaultPassThreshold(scoreType, checklistPossibleWeight(input.checks)),
            scoreType
          )
        : resolvePassThreshold(input.passThreshold, scoreType),
    score_bands: resolveScoreBands(input.scoreBands, scoreType),
  };
}

/**
 * The scoring columns an edit changes, given what is stored. Undefined fields
 * leave their column alone, except that a change of score type re-reads the
 * stored threshold and bands in the new unit, since a 300-point threshold is
 * not a legal percentage and the column's CHECK would refuse the write. An
 * editor converts them itself (`convertScoreValue`) and sends them with the
 * type; this is the backstop for a caller that sends the type alone.
 */
export function updatedChecklistScoring(
  stored: { score_type?: unknown; pass_threshold?: unknown; score_bands?: unknown },
  patch: ChecklistScoringInput
): Partial<ChecklistScoringColumns> {
  const storedType = resolveScoreType(stored.score_type);
  const scoreType = patch.scoreType === undefined ? storedType : resolveScoreType(patch.scoreType);
  const typeChanged = scoreType !== storedType;
  const updates: Partial<ChecklistScoringColumns> = {};
  if (patch.scoreType !== undefined) updates.score_type = scoreType;
  if (patch.scoreUnit !== undefined) updates.score_unit = resolveScoreUnit(patch.scoreUnit);
  if (patch.passThreshold !== undefined || typeChanged) {
    updates.pass_threshold = resolvePassThreshold(
      patch.passThreshold ?? stored.pass_threshold,
      scoreType
    );
  }
  if (patch.scoreBands !== undefined || typeChanged) {
    updates.score_bands = resolveScoreBands(
      patch.scoreBands === undefined ? stored.score_bands : patch.scoreBands,
      scoreType
    );
  }
  return updates;
}

/**
 * A score in the other unit, so either reading is to hand: "75%" means nothing
 * to somebody who wrote a rubric out of 80, and "60 marks" alone hides how
 * much of the checklist that is. Empty when the checklist has nothing positive
 * to earn yet.
 */
export function scoreEquivalent(
  value: number,
  scoreType: ChecklistScoreType,
  possibleWeight: number,
  scoreUnit?: string | null
): string {
  if (!(possibleWeight > 0)) return '';
  const unit = scoreUnit || DEFAULT_SCORE_UNIT;
  return scoreType === 'points'
    ? `${formatScore(convertScoreValue(value, 'percent', possibleWeight))}% of ${formatScoreValue(possibleWeight, unit)}`
    : `${formatScore(convertScoreValue(value, 'points', possibleWeight))} of ${formatScoreValue(possibleWeight, unit)}`;
}

/**
 * The scoring fields of a run payload, from a checklist row as selected. One
 * helper for the six places that queue a run, so none of them can send the
 * threshold without the unit it is in.
 */
export function runPayloadScoring(checklist: {
  pass_threshold?: unknown;
  score_bands?: unknown;
  score_type?: unknown;
  score_unit?: unknown;
}): {
  passThreshold: number;
  scoreBands: ScoreBand[] | null;
  scoreType: ChecklistScoreType;
  scoreUnit: string | null;
} {
  return {
    passThreshold: resolvePassThreshold(checklist.pass_threshold, checklist.score_type),
    scoreBands: resolveScoreBands(checklist.score_bands, checklist.score_type),
    scoreType: resolveScoreType(checklist.score_type),
    scoreUnit: resolveScoreUnit(checklist.score_unit),
  };
}

/**
 * The same bar in the other unit, at the given points available, for an editor
 * switching a checklist's score type: 75% of 80 points is 60 points, and back.
 * Rounded to one decimal place. With no points available there is nothing to
 * convert against, so the value is returned clamped to its new unit.
 */
export function convertScoreValue(
  value: number,
  to: ChecklistScoreType,
  possibleWeight: number
): number {
  if (possibleWeight <= 0) return resolvePassThreshold(value, to);
  const converted =
    to === 'points' ? (value / 100) * possibleWeight : (value / possibleWeight) * 100;
  return resolvePassThreshold(Math.round(converted * 10) / 10, to);
}

// ---------------------------------------------------------------------------
// Score bands
// ---------------------------------------------------------------------------

/**
 * One labelled range of the score. `min` is the lowest score (in the
 * checklist's score type) that earns the label; the range runs up to the next
 * band's `min`.
 */
export type ScoreBand = {
  label: string;
  min: number;
};

/** The grade a run reached: its band, and where that band sits among them. */
export type ScoreGrade = {
  label: string;
  /** 0 is the best band. */
  rank: number;
  /** How many bands there are, so a caller can tell the worst from the middle. */
  count: number;
};

export const MAX_SCORE_BANDS = 6;
export const MAX_SCORE_BAND_LABEL_LENGTH = 40;

/**
 * The bands as stored on `checklists.score_bands`, or null when the checklist
 * has none. Tolerant on purpose: the column is JSON written by four surfaces,
 * so an entry that is not a `{ label, min }` pair is dropped rather than
 * failing the read, a label is trimmed and capped, a `min` is clamped to the
 * score type's range, and the result is ordered best band first with one band
 * per `min`. Anything that leaves no usable band at all resolves to null, which
 * is exactly what a checklist without bands looks like.
 */
export function resolveScoreBands(value: unknown, scoreType?: unknown): ScoreBand[] | null {
  if (!Array.isArray(value)) return null;
  const bands: ScoreBand[] = [];
  const seen = new Set<number>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { label, min } = entry as { label?: unknown; min?: unknown };
    if (typeof label !== 'string') continue;
    const trimmed = label.trim().slice(0, MAX_SCORE_BAND_LABEL_LENGTH);
    if (!trimmed) continue;
    const parsed = typeof min === 'string' ? Number(min) : min;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) continue;
    const clamped = Math.min(scoreCeiling(scoreType), Math.max(0, parsed));
    if (seen.has(clamped)) continue;
    seen.add(clamped);
    bands.push({ label: trimmed, min: clamped });
    if (bands.length === MAX_SCORE_BANDS) break;
  }
  if (bands.length === 0) return null;
  bands.sort((a, b) => b.min - a.min);
  return bands;
}

/**
 * Which band a score falls in: the best band whose `min` the score reaches.
 * The last band is a catch-all, so a score below every `min` still reads as
 * the worst grade rather than as ungraded; an author who writes "Pushed back:
 * below 30" means everything below 30, including a score the penalties drove
 * to zero. Null when there is no score or no bands.
 */
export function gradeForScore(
  bands: ScoreBand[] | null | undefined,
  score: number | null | undefined
): ScoreGrade | null {
  if (score == null || !bands || bands.length === 0) return null;
  const rank = bands.findIndex((band) => score >= band.min);
  const index = rank === -1 ? bands.length - 1 : rank;
  return { label: bands[index]!.label, rank: index, count: bands.length };
}

/**
 * A stored run's grade under its checklist's current bands. Null when the run
 * was scored in the other score type from the one the bands are now written
 * in: a 75% run read against bands in points would grade by accident.
 */
export function gradeForRun(
  checklist: { score_bands?: unknown; score_type?: unknown },
  run: { score?: unknown; score_unit?: unknown }
): ScoreGrade | null {
  if (typeof run.score !== 'number') return null;
  const scoreType = resolveScoreType(checklist.score_type);
  if ((run.score_unit == null) !== (scoreType === 'percent')) return null;
  return gradeForScore(resolveScoreBands(checklist.score_bands, scoreType), run.score);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * A result status as stored on `checklist_run_results.status`.
 *
 * `skipped` is a check the run deliberately did not evaluate because its
 * `run_condition` was unmet (see `conditions.ts`). It is neither a verdict nor
 * an error: nothing went wrong, and nothing was learned about the product.
 */
export type CheckResultStatus = 'passed' | 'failed' | 'error' | 'informational' | 'skipped';

export type ScoreableCheck = {
  id: string;
  checkType: ChecklistCheckType;
  weight: number;
  /**
   * What the run does when this check fails. Optional because a caller built
   * before the column existed does not carry it, and absent resolves to
   * `continue`, which is what every check did. A `stop` check that failed is
   * blocking whatever its type: see `failure.ts`.
   */
  onFailure?: unknown;
};

export type ScoreableResult = {
  checkId: string;
  status: CheckResultStatus;
};

/**
 * A run's verdict, as stored in `checklist_runs.outcome`.
 *
 * Two of these judge the product; the third judges the run. `inconclusive`
 * means every check errored, or a weighted checklist reached none of its
 * weighted checks, so the run produced no score to judge. It
 * exists because the alternative was reporting such a run as `passed`: an
 * errored check is deliberately left out of the weighted denominator, so a run
 * where all of them errored scored null against no blocking failures and
 * cleared both hurdles by default.
 */
export type ChecklistRunOutcome = 'passed' | 'failed' | 'inconclusive';

export type ChecklistRunScore = {
  /**
   * The weighted score in `scoreUnit`, rounded to one decimal place, or null
   * when the checklist has no weighted check with a verdict. Null is not zero:
   * "nothing to score" and "scored nothing" are different reports.
   */
  score: number | null;
  /**
   * What `score` is measured in, as `checklist_runs.score_unit` stores it: null
   * for a percentage, otherwise the points label.
   */
  scoreUnit: string | null;
  /**
   * Points earned: the weights of the weighted checks that passed, less every
   * penalty that applied. Can be negative, which the percentage never is.
   */
  earnedWeight: number;
  /**
   * Points available: the weights of the positively weighted checks that
   * reached a verdict either way. Penalties are not in it, so a rubric written
   * as "out of 80" stays out of 80 however many deductions it lists.
   */
  possibleWeight: number;
  /** The total deducted by penalty checks that failed. */
  penaltyWeight: number;
  /** The label of the score band the run landed in, or null when ungraded. */
  grade: string | null;
  /**
   * The verdict on the experience, as opposed to whether the run finished.
   *
   * `passed` and `failed` are statements about the product. `inconclusive` is
   * not: it means the run decided nothing, or reached none of a weighted
   * checklist's weighted checks, so there is no statement to make. Readers must not fold it into either verdict, and in particular must
   * not render it as a failure, which would send someone hunting a regression
   * that was never observed.
   */
  outcome: ChecklistRunOutcome;
  /**
   * Checks that failed and are blocking: every failed `pass_fail` check, plus
   * any check of any type that was set to stop the run on failure. Any one of
   * these fails the run.
   */
  blockingFailures: number;
  /** Blocking checks that passed. */
  blockingPasses: number;
  /** Checks of any scored type that errored, so nothing was learned from them. */
  inconclusiveCount: number;
  /** Informational checks that recorded an observation. */
  informationalCount: number;
  /**
   * Checks whose run condition was unmet, so the run never evaluated them.
   * Counted separately from `inconclusiveCount` because a skip is the
   * checklist working as written, not something that went wrong.
   */
  skippedCount: number;
  /** True when the checklist has at least one weighted check. */
  weighted: boolean;
  /** The threshold the score was judged against. */
  passThreshold: number;
  /**
   * The check that ended the run, when one was set to stop on failure and did.
   * Null on every other run. Carried so a caller can say the run stopped early
   * rather than leaving its skipped checks to be read as an unfinished run.
   */
  stoppedByCheckId: string | null;
};

/**
 * Judge a run from its checks and the results it recorded.
 *
 * The single source of truth for "did this run pass?": the run task writes its
 * answer to `checklist_runs.outcome` and `score`, and every read surface (the
 * report, the runs list, the shared page, the email) renders that same answer
 * rather than re-deriving one from the counts. Two surfaces disagreeing about
 * whether a run passed is the failure this exists to prevent.
 *
 * A check with no result at all is treated as an error, which is what the run
 * task itself records for a check it never reached.
 */
export function scoreChecklistRun(input: {
  checks: ScoreableCheck[];
  results: ScoreableResult[];
  passThreshold?: number | null;
  /** The checklist's score bands, as stored. Resolved here, so pass the raw column. */
  scoreBands?: unknown;
  /** The checklist's `score_type` and `score_unit`, as stored. Absent is a percentage. */
  scoreType?: unknown;
  scoreUnit?: unknown;
}): ChecklistRunScore {
  const scoreType = resolveScoreType(input.scoreType);
  const passThreshold = resolvePassThreshold(
    input.passThreshold ?? DEFAULT_PASS_THRESHOLD,
    scoreType
  );
  const scoreBands = resolveScoreBands(input.scoreBands, scoreType);
  const byCheckId = new Map<string, CheckResultStatus>();
  for (const result of input.results) {
    // First verdict wins. A run records one result per check, but a caller
    // handing us a duplicated join should not silently double-count a weight.
    if (!byCheckId.has(result.checkId)) byCheckId.set(result.checkId, result.status);
  }

  let earnedWeight = 0;
  let possibleWeight = 0;
  let penaltyWeight = 0;
  let blockingFailures = 0;
  let blockingPasses = 0;
  let inconclusiveCount = 0;
  let informationalCount = 0;
  let skippedCount = 0;
  let weighted = false;
  let weightedErrored = 0;
  let stoppedByCheckId: string | null = null;

  for (const check of input.checks) {
    const status = byCheckId.get(check.id) ?? 'error';

    // A skipped check is out of the reckoning entirely, whatever its type: it
    // did not fail, and it is not inconclusive either. Counting a skip as an
    // error would let a condition the author wrote on purpose read as a run
    // that went wrong, and counting it in the weighted denominator would push
    // the score down for a check nobody asked to have evaluated.
    if (status === 'skipped') {
      skippedCount++;
      continue;
    }

    if (check.checkType === 'informational') {
      // An informational check is never scored, whatever status was stored
      // against it (an older run may have recorded a verdict before the check
      // was reclassified). It counts as reported when it produced anything.
      if (status !== 'error') informationalCount++;
      continue;
    }

    // A check set to stop the run is blocking by definition, whatever else it
    // is. Its weight still counts (an author who weighted it meant the number),
    // but the run cannot come out passed on the strength of the few checks it
    // reached before stopping, which is what leaving this to the threshold
    // would allow: the checks that would have dragged the score down are
    // exactly the ones the halt skipped.
    const halted = status === 'failed' && resolveFailureAction(check.onFailure) === 'stop';
    if (halted && !stoppedByCheckId) stoppedByCheckId = check.id;

    if (check.checkType === 'weighted') {
      weighted = true;
      if (status === 'error' || status === 'informational') {
        inconclusiveCount++;
        weightedErrored++;
        continue;
      }
      const weight = resolveCheckWeight(check.weight);
      if (weight < 0) {
        // A penalty: nothing to earn, only something to lose. It stays out of
        // the maximum so that avoiding a mistake is not rewarded over and
        // above doing the rest right.
        if (status === 'failed') {
          penaltyWeight += -weight;
          earnedWeight += weight;
        }
      } else {
        possibleWeight += weight;
        if (status === 'passed') earnedWeight += weight;
      }
      if (halted) blockingFailures++;
      continue;
    }

    // pass_fail, the blocking kind.
    if (status === 'passed') blockingPasses++;
    else if (status === 'failed') blockingFailures++;
    else inconclusiveCount++;
  }

  // The percentage is floored at zero: a penalty can take the points below
  // nothing, and the points say so, but "minus 37%" is not a pass rate anyone
  // can read. A run with nothing to earn and a penalty applied scores zero
  // rather than null, because something was judged and it was judged badly.
  // A points score is the points, negative included: that is the number its
  // author asked for.
  const nothingToScore = possibleWeight === 0 && penaltyWeight === 0;
  const score = nothingToScore
    ? null
    : scoreType === 'points'
      ? Math.round(earnedWeight * 10) / 10
      : possibleWeight > 0
        ? Math.max(0, Math.round((earnedWeight / possibleWeight) * 1000) / 10)
        : 0;

  // Nothing was decided: every scored check errored, so there is no score to
  // judge and no blocking check to have failed. Both hurdles below are cleared
  // by default in that state, which is how a run that evaluated none of its
  // checks used to be stored as `passed`.
  //
  // Deliberately narrow. Observations and skips are excluded by construction
  // (neither increments `inconclusiveCount`), so a checklist made entirely of
  // observations is a normal pass rather than a fault. One verdict of any kind
  // is enough to take the run out of this state: a single failing blocking
  // check among five errors is a failure, because we did observe something and
  // it was bad, and a failed penalty already scores zero rather than null.
  // A weighted checklist has a second way in: see `scoreUnreached` below.
  //
  // `blockingFailures` is listed even though the ternary below tests it first,
  // so this reads as a standalone claim about the run rather than one that is
  // only correct in its current position.
  const nothingJudged =
    possibleWeight === 0 &&
    penaltyWeight === 0 &&
    blockingPasses === 0 &&
    blockingFailures === 0 &&
    inconclusiveCount > 0;

  // The score is the verdict a weighted checklist exists to give, so a run that
  // reached none of its weighted checks has not answered the question it was
  // asked, however many blocking checks passed on the way in. A page-load check
  // passing before a bot wall errors every scored check is the case this
  // catches: without it the null score clears the threshold by default and the
  // one blocking pass reads as a clean run. A blocking failure still wins (that
  // was observed, and it was bad), and so does any score at all, a failed
  // penalty included. Keyed on the score rather than on "some weighted check
  // reached a verdict", because a passing penalty earns nothing and so leaves
  // the score null: counting it would let the bot-walled run through again.
  const scoreUnreached = weighted && score === null && weightedErrored > 0;

  // Two independent hurdles, so a weighted score can never buy off a blocking
  // failure and a clean set of blocking checks can never rescue a bad score.
  // The third answer sits between them: not a verdict on the product at all.
  const outcome: ChecklistRunOutcome =
    blockingFailures > 0 || (score !== null && score < passThreshold)
      ? 'failed'
      : nothingJudged || scoreUnreached
        ? 'inconclusive'
        : 'passed';

  return {
    score,
    scoreUnit: runScoreUnit(scoreType, input.scoreUnit),
    earnedWeight,
    possibleWeight,
    penaltyWeight,
    grade: gradeForScore(scoreBands, score)?.label ?? null,
    outcome,
    blockingFailures,
    blockingPasses,
    inconclusiveCount,
    informationalCount,
    skippedCount,
    weighted,
    passThreshold,
    stoppedByCheckId,
  };
}

/**
 * One line describing what a run concluded, used as `checklist_runs.summary`
 * and as the first line of every notification about the run.
 *
 * `passedCount` / `totalCount` stay in the sentence for an unweighted checklist
 * because that is the number people already read runs by; a weighted checklist
 * leads with the score, since its pass count no longer means what it looks
 * like it means.
 */
/**
 * How a finished run should be labelled, for every surface that badges one.
 *
 * Shared rather than repeated because the four surfaces that show a verdict
 * (the report page, its OG card, the runs list and the report email) each used
 * to spell the same ternary themselves, and the ternary had a hole: written as
 * `outcome === 'failed' ? red : green`, an outcome that is neither renders as a
 * pass. Adding a third value to a chain like that is silent, so the chain lives
 * in one place now.
 *
 * `tone` is presentation-agnostic on purpose: the email speaks in its own
 * `danger`/`success` vocabulary and the OG card in hex, so each maps the tone
 * to its own palette rather than inheriting Tailwind class names from here.
 */
export function describeRunOutcome(input: {
  /** Whether the run itself finished, which outranks any verdict it recorded. */
  status?: string | null;
  outcome?: string | null;
  /**
   * Failed-check count, used only for runs recorded before `outcome` existed.
   * Both spellings are accepted because the callers are split: the web surfaces
   * hand over a database row (`failed_count`) and the email its own props
   * (`failedCount`), and a helper that silently ignored one of them would fall
   * through to the wrong label on exactly the legacy runs it exists to cover.
   */
  failedCount?: number | null;
  failed_count?: number | null;
  /**
   * Why a failed run failed (`checklist_runs.failure_cause`). Both spellings,
   * for the same reason as the failed count.
   */
  failureCause?: string | null;
  failure_cause?: string | null;
}): { label: string; tone: 'positive' | 'negative' | 'neutral' } {
  if (input.status === 'failed') {
    const cause = resolveRunFailureCause(input.failureCause ?? input.failure_cause);
    // Neutral, never negative, for the same reason as an inconclusive run: a
    // site that could not be loaded, or answered with a server error, made no
    // claim about the checklist, and red would send someone hunting a
    // regression (or a bug of ours) that nobody observed.
    if (cause === 'site_unreachable' || cause === 'site_error') {
      return { label: RUN_FAILURE_CAUSE_LABELS[cause], tone: 'neutral' };
    }
    if (cause === 'service') return { label: RUN_FAILURE_CAUSE_LABELS[cause], tone: 'negative' };
    // Predates `failure_cause`: the cause was never recorded.
    return { label: 'Run failed', tone: 'negative' };
  }
  if (input.outcome === 'failed') return { label: 'Failed', tone: 'negative' };
  if (input.outcome === 'passed') return { label: 'Passed', tone: 'positive' };
  // Neutral, never negative. The run made no claim about the product, and
  // colouring it red sends someone looking for a regression nobody observed.
  if (input.outcome === 'inconclusive') return { label: 'Inconclusive', tone: 'neutral' };
  // Predates scoring: fall back to the rule the dashboard used before
  // `outcome` was stored.
  const failedCount = input.failedCount ?? input.failed_count;
  if (failedCount != null) {
    return failedCount === 0
      ? { label: 'Passed', tone: 'positive' }
      : { label: 'Failed', tone: 'negative' };
  }
  return { label: 'Run completed', tone: 'neutral' };
}

export function describeRunScore(
  score: ChecklistRunScore,
  counts: { passedCount: number; totalCount: number }
): string {
  // Neither an observation nor a skipped check is something that could have
  // passed, so neither belongs in the denominator people read the run by.
  const scored = counts.totalCount - score.informationalCount - score.skippedCount;

  if (score.weighted && score.score !== null) {
    // The grade sits with the number it reads, and a deduction is said in the
    // points the rubric's author wrote it in, since "30 points deducted" is
    // what they will look for and a percentage of the maximum is not.
    const graded = score.grade ? ` (${score.grade})` : '';
    const unit = score.scoreUnit;
    const parts = [
      unit == null
        ? `Scored ${formatScore(score.score)}%${graded} against a ${formatScore(score.passThreshold)}% threshold`
        : `Scored ${formatScore(score.score)} of ${formatScoreValue(score.possibleWeight, unit)}${graded} against a threshold of ${formatScore(score.passThreshold)}`,
    ];
    if (score.penaltyWeight > 0) {
      parts.push(`${formatScoreValue(score.penaltyWeight, unit ?? DEFAULT_SCORE_UNIT)} deducted`);
    }
    if (score.blockingFailures > 0) {
      parts.push(
        `${score.blockingFailures} required ${score.blockingFailures === 1 ? 'check' : 'checks'} failed`
      );
    }
    if (score.informationalCount > 0) {
      parts.push(`${score.informationalCount} informational`);
    }
    if (score.skippedCount > 0) {
      parts.push(`${score.skippedCount} skipped`);
    }
    return parts.join(', ');
  }

  // A ratio is the wrong sentence for a run that reached no verdict: "0/6
  // checks passed" is what the incident report actually said, and it reads as
  // six failures rather than as six checks nobody got to. The notes still
  // follow, so the sentence accounts for every check.
  //
  // A weighted checklist whose blocking checks passed but whose scored checks
  // all errored is inconclusive too, and "No checks could be evaluated" would
  // deny the checks that did pass, so it names both halves.
  const base =
    score.outcome !== 'inconclusive'
      ? `${counts.passedCount}/${scored} checks passed`
      : score.weighted && score.blockingPasses > 0
        ? `No weighted checks could be evaluated, ${score.blockingPasses} required ${score.blockingPasses === 1 ? 'check' : 'checks'} passed`
        : 'No checks could be evaluated';
  const notes: string[] = [];
  if (score.informationalCount > 0) notes.push(`${score.informationalCount} informational`);
  if (score.skippedCount > 0) notes.push(`${score.skippedCount} skipped`);
  return notes.length > 0 ? `${base}, ${notes.join(', ')}` : base;
}

/** Trims the trailing `.0` a whole-number score would otherwise carry. */
export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Whether a checklist has to be driven by the agent rather than replayed from
 * its recorded script.
 *
 * An informational check produces prose about what the page currently says, and
 * prose is exactly what a recorded script cannot produce: a replay evaluates
 * fixed assertions with no model in the loop. A code-mode checklist containing
 * one would therefore replay its scored checks and file "the recorded script
 * does not cover this check" against every observation, which is both useless
 * and the opposite of the point (the observation is the thing that is supposed
 * to be re-read every run so drift shows up).
 *
 * So one informational check sends the whole run down the agent path. That is a
 * real cost, and it is the honest one: there is no cheaper way to get a fresh
 * reading of what the page says.
 */
export function checklistNeedsAgent(checks: Array<{ checkType: ChecklistCheckType }>): boolean {
  return checks.some((check) => check.checkType === 'informational');
}
