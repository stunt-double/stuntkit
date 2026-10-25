/**
 * Where a site's points are: which one category, lifted a band, moves the
 * overall most. Each estimate recomputes with `weightedOverallScore`, and
 * refuses to estimate at all when the stored overall does not reproduce from
 * the stored categories, so a figure is never shown that the methodology
 * would not agree with.
 *
 * Imports carry explicit extensions so `node --test` can load the file.
 */
import { BAND_RANGES } from './band.ts';
import { CATEGORIES, weightedOverallScore } from './index.ts';

/** A stored category score, with the raw provenance written since the blend landed. */
export type Cat = {
  category: string;
  score: number;
  applicable?: boolean;
  probeScore?: number | null;
  sessionScore?: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** How far the recomputed overall may sit from the stored one before no estimate shows. */
const REPRODUCE_TOLERANCE = 0.3;

/** The floor of every band above Critical, lowest first. */
const BAND_FLOORS = BAND_RANGES.slice(1).map((b) => b.from);

/** Floor of the next band above `score`; null in Excellent. */
export function nextBandFloor(score: number): number | null {
  return BAND_FLOORS.find((floor) => floor > score) ?? null;
}

/** The weight left out by categories that do not apply to this site. */
function excludedWeightOf(scores: readonly Cat[]): number {
  let excluded = 0;
  for (const c of CATEGORIES) {
    if (scores.find((s) => s.category === c.id)?.applicable === false) excluded += c.weight;
  }
  return excluded;
}

export type LeverageRow = {
  id: string;
  label: string;
  /** The category's published weight. */
  weight: number;
  /** Its share of the overall once non-applicable weight is scaled out. */
  share: number;
  /** Its published score now. */
  score: number;
  /** The floor of its next band. */
  target: number;
  /** What lifting it alone to `target` adds to the overall, rounded to 0.1. */
  gain: number;
};

/**
 * Lifts each applicable category alone to its next band floor, holding the
 * rest, and recomputes with `weightedOverallScore`. `gain` is
 * `round1(recompute(lifted) - recompute(current))`. Keeps gains of at least
 * 0.1, largest first, then the lower score first. Returns null when
 * `recompute(current)` differs from `storedOverall` by more than 0.3 (a
 * legacy or mid-write row), so no estimate shows on numbers that do not
 * reproduce. A category missing from `scores` counts as 0, as the platform
 * counts it.
 */
export function scoreLeverage(
  scores: readonly Cat[],
  storedOverall: number
): { rows: LeverageRow[]; allExcellent: boolean } | null {
  const current = weightedOverallScore(scores);
  if (Math.abs(current - storedOverall) > REPRODUCE_TOLERANCE) return null;
  const remaining = 1 - excludedWeightOf(scores);
  if (remaining <= 0) return null;

  const rows: LeverageRow[] = [];
  let anyBelowExcellent = false;
  for (const c of CATEGORIES) {
    const stored = scores.find((s) => s.category === c.id);
    if (stored?.applicable === false) continue;
    const score = stored?.score ?? 0;
    const target = nextBandFloor(score);
    if (target === null) continue;
    anyBelowExcellent = true;
    const lifted: Cat[] = [
      ...scores.filter((s) => s.category !== c.id),
      { category: c.id, score: target, applicable: true },
    ];
    const gain = round1(weightedOverallScore(lifted) - current);
    if (gain < 0.1) continue;
    rows.push({
      id: c.id,
      label: c.label,
      weight: c.weight,
      share: c.weight / remaining,
      score,
      target,
      gain,
    });
  }
  rows.sort((a, b) => b.gain - a.gain || a.score - b.score);
  return { rows, allExcellent: !anyBelowExcellent };
}
