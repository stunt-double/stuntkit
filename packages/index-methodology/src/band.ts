/**
 * The five score bands the Index grades a domain into. Every surface that
 * draws a score (the scorecard, the badge, reports) uses these thresholds.
 */
export type ScoreBand = 'excellent' | 'good' | 'ok' | 'poor' | 'critical';

export const scoreBand = (score: number): ScoreBand => {
  if (score >= 85) return 'excellent';
  if (score >= 72) return 'good';
  if (score >= 58) return 'ok';
  if (score >= 40) return 'poor';
  return 'critical';
};

export const BAND_LABEL: Record<ScoreBand, string> = {
  excellent: 'Excellent',
  good: 'Good',
  ok: 'OK',
  poor: 'Poor',
  critical: 'Critical',
};

/** Each band's stretch of the 0 to 100 scale, lowest first, on the thresholds above. */
export const BAND_RANGES: readonly { band: ScoreBand; from: number; to: number }[] = [
  { band: 'critical', from: 0, to: 40 },
  { band: 'poor', from: 40, to: 58 },
  { band: 'ok', from: 58, to: 72 },
  { band: 'good', from: 72, to: 85 },
  { band: 'excellent', from: 85, to: 100 },
];
