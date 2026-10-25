// Which methodology a score was computed with. A change to how a score is
// computed (a probe check, a task or rubric, a weight, the blend or the curve)
// ships as a new version, newest first, and every score records the version it
// was computed with, so scores either side of a change are never compared as
// if they were the same experiment. A wording or layout change is not a bump.

export type ScoringVersion = {
  version: string;
  /** The day it shipped, as an ISO date. */
  since: string;
  summary: string;
};

/** Newest first. The first entry is the version every new run is stamped with. */
export const SCORING_VERSIONS: readonly ScoringVersion[] = [
  {
    version: '2026.10.1',
    since: '2026-10-26',
    summary:
      'Text read off a site is fenced as data for the grader and the agents, so a page cannot instruct either; a page that tries to change its own grade is recorded as a friction.',
  },
  {
    version: '2026.10',
    since: '2026-10-01',
    summary:
      'Agent search visibility (Exa or Tavily): the site found by its name, found for what it does, and readable pages in the index, folded into brand awareness, discovery and information retrieval.',
  },
  {
    version: '2026.09',
    since: '2026-09-30',
    summary:
      'First versioned methodology: probe checks blended with agent-session rubric scores, monetised-only pricing checks, opt-outs honoured.',
  },
];

export const INDEX_SCORING_VERSION: string = SCORING_VERSIONS[0]!.version;

/** True when a score was computed with an older methodology, or before versions were recorded. */
export function isOutdatedScoringVersion(version: string | null | undefined): boolean {
  return version !== INDEX_SCORING_VERSION;
}
