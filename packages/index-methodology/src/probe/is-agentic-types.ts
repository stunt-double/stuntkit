// The shape of an Is Agentic report, as the probe's fold-in reads it. The
// lookup itself is not part of this package: a caller fetches the report and
// passes it in (see `ProbeLookups`).

export type IsAgenticBucket = {
  earned: number;
  available: number;
  passing: number;
  total: number;
};

export type IsAgenticIssue = {
  id: string;
  name: string;
  tier: 'essential' | 'recommended' | 'bonus';
  result: 'failed' | 'partial';
  details: string | null;
  recommendation: string | null;
};

export type IsAgenticReport = {
  target: string;
  displayTarget: string;
  reportUrl: string;
  score: number | null;
  scoreLabel: string;
  scannedAt: string;
  eligibleChecks: number;
  breakdown: {
    essential: IsAgenticBucket;
    recommended: IsAgenticBucket;
    bonus: { points: number; positiveSignals: number };
  };
  issues: IsAgenticIssue[];
};

/** What a lookup returns. Anything but `ok` leaves the categories on the probe alone. */
export type IsAgenticResult =
  | { status: 'ok'; report: IsAgenticReport }
  | { status: 'missing'; scanUrl: string }
  | { status: 'unavailable' };
