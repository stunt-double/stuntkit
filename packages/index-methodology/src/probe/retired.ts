// Checks the probe no longer runs, withheld from stored reports.
//
// A domain's frictions and its latest probe findings are stored with the score
// and only replaced when it is scored again, so a check that has been retired
// keeps showing on every report until the next run. These are filtered out at
// read time instead of waiting on a rescore of every tracked domain.
//
// Kept free of runtime imports so `node --test` can load it by path.

/**
 * `checkout` / `task-entry-reachable`: guessed `/pricing`, `/cart`, `/book`
 * and asked whether they answered without auth, which measured URL
 * conventions rather than the site. Replaced by `task-entry-linked`.
 */
const RETIRED_FINDING_IDS: ReadonlySet<string> = new Set(['task-entry-reachable']);

/** The frictions those checks raised, matched on the start of the summary. */
const RETIRED_FRICTION_PREFIXES: readonly string[] = [
  'No reachable entry point for delegated tasks',
];

export function isRetiredFriction(friction: { summary?: string | null }): boolean {
  const summary = friction.summary ?? '';
  return RETIRED_FRICTION_PREFIXES.some((prefix) => summary.startsWith(prefix));
}

export function withoutRetiredFrictions<T extends { summary?: string | null }>(
  frictions: readonly T[]
): T[] {
  return frictions.filter((f) => !isRetiredFriction(f));
}

/** Drops retired checks from a probe run's findings, keyed by category. */
export function withoutRetiredFindings<T extends { id: string }>(
  findings: Record<string, readonly T[] | undefined>
): Record<string, T[]> {
  const kept: Record<string, T[]> = {};
  for (const [category, list] of Object.entries(findings)) {
    kept[category] = (list ?? []).filter((f) => !RETIRED_FINDING_IDS.has(f.id));
  }
  return kept;
}

// Friction copy the probe has since reworded, rewritten when it is read, for
// the same reason: the stored summary stays until the next rescore. Match on
// the exact legacy string only, so nothing a newer run wrote is ever touched.

/**
 * `delegated-access`, no MCP server card. The finding is that nothing
 * advertises one where agents and AI clients look for it automatically; it
 * says nothing about how an agent then gets the task done.
 */
export const MCP_FRICTION =
  'No discoverable MCP server. Agents and AI clients have no way to discover one automatically.';

/** `delegated-access`, no API docs: the same, for a public API. */
export const PUBLIC_API_FRICTION =
  'No discoverable public API docs. Agents and AI clients have no way to discover them automatically.';

/**
 * Earlier wordings, kept only as match keys for rows scored before the
 * rewording. Never rendered: each claimed the missing server or docs forced
 * agents into a browser, which the check cannot know.
 */
const REWORDED_FRICTIONS: ReadonlyMap<string, string> = new Map([
  [
    'No discoverable MCP server. ChatGPT apps and Claude connectors cannot find one to connect to, so agents drive a browser instead.',
    MCP_FRICTION,
  ],
  [
    'No discoverable MCP server. ChatGPT apps and Claude connectors have no scoped way to call your product; agents must drive a browser instead.',
    MCP_FRICTION,
  ],
  [
    'No discoverable public API docs. Agents cannot find a scoped way in, so they drive a browser instead.',
    PUBLIC_API_FRICTION,
  ],
  [
    'No public API docs detected. Agents have no scoped way in; they must drive a browser.',
    PUBLIC_API_FRICTION,
  ],
]);

/** The stored frictions with any legacy summary swapped for its current wording. */
export function withCurrentFrictionCopy<T extends { summary?: string | null }>(
  frictions: readonly T[]
): T[] {
  return frictions.map((f) => {
    const current = f.summary ? REWORDED_FRICTIONS.get(f.summary) : undefined;
    return current ? { ...f, summary: current } : f;
  });
}
