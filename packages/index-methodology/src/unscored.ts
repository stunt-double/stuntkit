// Whether the Index can put a number on a domain at all.
//
// The deterministic probe fetches the homepage over plain HTTP. When a site
// turns that fetch away (401, 403, 429) or never answers, the probe's points
// measure our fetcher, not the site, so the domain is marked unscored and left
// out of ranks and aggregates. Agent-session evidence overrides that: if a real
// browser got through, the probe's failure is not the whole story.
//
// `opted_out` is the third reason: the site asked not to be scored
// (robots.txt or X-Robots-Tag). The scoring paths set it directly when they
// see the opt-out, and it wins over session evidence, since we stop visiting
// the site. `unscoredReasonFor` never returns it, so the first normal probe
// after the opt-out is lifted writes a fresh reason and clears it.
//
// `pending` means the domain's scores were cleared and it is waiting for a
// fresh one; the next probe or agent session clears it like any other reason.

export type UnscoredReason = 'blocked' | 'unreachable' | 'opted_out' | 'pending';

/** Homepage statuses that mean the site refused our fetcher, rather than failed. */
export const BLOCKED_HOMEPAGE_STATUSES: readonly number[] = [401, 403, 429];

export type ProbeReachability = { reachable: boolean; homepageStatus: number };

/** Why the probe alone could not score the domain, or null when it reached the site. */
export function probeUnscoredReason(
  probe: ProbeReachability
): Exclude<UnscoredReason, 'opted_out' | 'pending'> | null {
  if (probe.reachable) return null;
  return BLOCKED_HOMEPAGE_STATUSES.includes(probe.homepageStatus) ? 'blocked' : 'unreachable';
}

/** True when any category carries a numeric agent-session score. */
export function hasSessionEvidence(categoryScores: unknown): boolean {
  if (!Array.isArray(categoryScores)) return false;
  return categoryScores.some(
    (c) =>
      c !== null &&
      typeof c === 'object' &&
      typeof (c as { sessionScore?: unknown }).sessionScore === 'number' &&
      !Number.isNaN((c as { sessionScore: number }).sessionScore)
  );
}

/**
 * The `unscored_reason` to store after a probe: null when the probe reached
 * the site or the domain has session evidence, otherwise the probe's reason.
 */
export function unscoredReasonFor(
  probe: ProbeReachability,
  categoryScores: unknown
): Exclude<UnscoredReason, 'opted_out' | 'pending'> | null {
  if (hasSessionEvidence(categoryScores)) return null;
  return probeUnscoredReason(probe);
}

/** Narrow a stored value to a known reason (anything else reads as scored). */
export function parseUnscoredReason(value: unknown): UnscoredReason | null {
  return value === 'blocked' ||
    value === 'unreachable' ||
    value === 'opted_out' ||
    value === 'pending'
    ? value
    : null;
}
