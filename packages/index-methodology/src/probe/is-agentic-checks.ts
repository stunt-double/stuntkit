// Folds an Is Agentic report into the deterministic probe run.
//
// Is Agentic (https://is-agentic.com) runs a deeper protocol audit than our own
// probes (OpenAPI, MCP, markdown negotiation, 404 behaviour, scoped auth), so
// each of its checks is mapped onto the category it evidences and added as a
// weighted finding. Two rules keep this fair across the leaderboard:
//
// - **A capped share, not a takeover.** Within a category, the Is Agentic
//   checks share a pool worth `IS_AGENTIC_SHARE` of that category's own probe
//   weight, split 2:1 between Essential and Recommended checks. Delegated
//   access maps seventeen checks; without the pool they would drown the six
//   probes that already measure it.
// - **Only with a report.** The public API only lists failing and partial
//   checks, so a check that is absent from a report counts as passed. A domain
//   with no stored report gets no Is Agentic findings at all rather than
//   seventeen assumed passes.
//
// Checks we already probe ourselves (`sitemap`, `json-ld`) are left out so
// one signal is not counted twice. Bonus-tier signals never affect a score.
//
// Type-only imports, so `node --test` can load this file directly.

import type { CategoryId } from '../index.ts';
import type { IsAgenticIssue, IsAgenticReport } from './is-agentic-types.ts';
import type { Friction } from './shapes.ts';
import type { CategoryCheckResult, CheckFinding } from './types.ts';

export const IS_AGENTIC_SHARE = 0.5;

type CatalogueEntry = {
  category: CategoryId;
  tier: 'essential' | 'recommended';
  label: string;
};

// Check ids observed across the seed cohort's reports (September 2026). A
// check Is Agentic adds later is ignored here until it is mapped, which is the
// safe default: an unmapped id can only ever be missing, never mis-scored.
export const IS_AGENTIC_CATALOGUE: Record<string, CatalogueEntry> = {
  // Can an agent reach the site at all?
  'agent-crawler-reachability': {
    category: 'discovery',
    tier: 'essential',
    label: 'Agent crawler reachability',
  },
  'agentic-search-specific': {
    category: 'discovery',
    tier: 'recommended',
    label: 'Developer resource discoverability',
  },

  // Can it read what it reached?
  'content-no-js': {
    category: 'information-retrieval',
    tier: 'essential',
    label: 'Content without JavaScript',
  },
  'markdown-negotiation-vary': {
    category: 'information-retrieval',
    tier: 'essential',
    label: 'Markdown content negotiation',
  },
  'agent-friendly-404': {
    category: 'information-retrieval',
    tier: 'essential',
    label: 'Agent-friendly 404s',
  },
  'redirect-hygiene': {
    category: 'information-retrieval',
    tier: 'essential',
    label: 'Redirect hygiene',
  },
  'metadata-completeness': {
    category: 'information-retrieval',
    tier: 'recommended',
    label: 'Metadata completeness',
  },
  'content-efficiency': {
    category: 'information-retrieval',
    tier: 'recommended',
    label: 'Content efficiency',
  },
  'page-token-budget': {
    category: 'information-retrieval',
    tier: 'recommended',
    label: 'Page token budget',
  },

  // Does it know who you are?
  'org-schema-completeness': {
    category: 'brand-awareness',
    tier: 'recommended',
    label: 'Organization schema completeness',
  },
  'brand-search-accuracy': {
    category: 'brand-awareness',
    tier: 'recommended',
    label: 'Brand name discoverability',
  },
  'trust-anchors': {
    category: 'brand-awareness',
    tier: 'recommended',
    label: 'Trust anchor pages',
  },

  // Can it finish a task?
  'bot-detection': {
    category: 'checkout',
    tier: 'essential',
    label: 'Not blocked by bot detection',
  },
  'onboarding-friction': {
    category: 'checkout',
    tier: 'recommended',
    label: 'Agent onboarding friction',
  },

  // Can it act with delegated, scoped access?
  'openapi-spec': {
    category: 'delegated-access',
    tier: 'essential',
    label: 'OpenAPI spec published',
  },
  'json-error-responses': {
    category: 'delegated-access',
    tier: 'essential',
    label: 'JSON error responses',
  },
  'scoped-permissions': {
    category: 'delegated-access',
    tier: 'essential',
    label: 'Scoped permissions',
  },
  'oauth-support': { category: 'delegated-access', tier: 'essential', label: 'OAuth 2.0 support' },
  'mcp-resource-listing': {
    category: 'delegated-access',
    tier: 'essential',
    label: 'MCP resources exposed',
  },
  'mcp-server': {
    category: 'delegated-access',
    tier: 'recommended',
    label: 'MCP server / manifest',
  },
  'mcp-resource-quality': {
    category: 'delegated-access',
    tier: 'recommended',
    label: 'MCP resource quality',
  },
  'public-api': {
    category: 'delegated-access',
    tier: 'recommended',
    label: 'Public API with reachable endpoints',
  },
  'public-api-docs': {
    category: 'delegated-access',
    tier: 'recommended',
    label: 'Public API/docs linked from homepage',
  },
  'rate-limit-headers': {
    category: 'delegated-access',
    tier: 'recommended',
    label: 'Rate limit response headers',
  },
  'function-calling-compat': {
    category: 'delegated-access',
    tier: 'recommended',
    label: 'Function calling compatibility',
  },
  'agent-instruction': {
    category: 'delegated-access',
    tier: 'recommended',
    label: 'Agent instruction / when-to-use',
  },
};

const TIER_WEIGHT: Record<CatalogueEntry['tier'], number> = { essential: 2, recommended: 1 };

/** Credit for one check: absent from the report = passed, partial = half. */
function creditFor(issue: IsAgenticIssue | undefined): number {
  if (!issue) return 1;
  return issue.result === 'partial' ? 0.5 : 0;
}

/**
 * Same formula as `CheckBuilder.build()`, with partial credit. Kept in step
 * with it so a category's score means the same thing whichever path built it.
 */
export function scoreFindings(findings: CheckFinding[]): number {
  const totalWeight = findings.reduce((a, f) => a + f.weight, 0) || 1;
  const achieved = findings.reduce((a, f) => a + f.weight * (f.credit ?? (f.passed ? 1 : 0)), 0);
  return Math.round((achieved / totalWeight) * 100);
}

const IS_AGENTIC_FRICTION_SUFFIX = '(Is Agentic).';

/** True for a friction this module derived from an Is Agentic issue. */
export function isIsAgenticFriction(friction: Pick<Friction, 'summary'>): boolean {
  return friction.summary.endsWith(IS_AGENTIC_FRICTION_SUFFIX);
}

function frictionSeverity(issue: IsAgenticIssue): Friction['severity'] | null {
  if (issue.result === 'failed') return issue.tier === 'essential' ? 'high' : 'medium';
  // Partial recommended checks are too noisy to raise; the finding carries them.
  return issue.tier === 'essential' ? 'low' : null;
}

/**
 * Returns new category results with the report's mapped checks appended and
 * each score recomputed. Pure: the input results are not mutated.
 */
export function applyIsAgenticReport(
  results: CategoryCheckResult[],
  report: IsAgenticReport | null
): CategoryCheckResult[] {
  if (!report) return results;
  const issuesById = new Map(report.issues.map((i) => [i.id, i]));

  return results.map((result) => {
    // A category that does not apply to the site is not scored at all.
    if (result.applicable === false) return result;
    const entries = Object.entries(IS_AGENTIC_CATALOGUE).filter(
      ([, entry]) => entry.category === result.category
    );
    if (entries.length === 0) return result;

    const ownWeight = result.findings.reduce((a, f) => a + f.weight, 0);
    const pool = ownWeight * IS_AGENTIC_SHARE;
    const tierTotal = entries.reduce((a, [, e]) => a + TIER_WEIGHT[e.tier], 0);

    const added: CheckFinding[] = entries.map(([id, entry]) => {
      const issue = issuesById.get(id);
      const credit = creditFor(issue);
      return {
        id: `is-agentic:${id}`,
        label: `${entry.label} (Is Agentic)`,
        weight: Math.round(((pool * TIER_WEIGHT[entry.tier]) / tierTotal) * 100) / 100,
        passed: credit === 1,
        ...(credit > 0 && credit < 1 ? { credit } : {}),
        ...(issue?.details ? { detail: issue.details } : {}),
      };
    });

    const frictions: Friction[] = [];
    for (const [id, entry] of entries) {
      const issue = issuesById.get(id);
      if (!issue) continue;
      const severity = frictionSeverity(issue);
      if (!severity) continue;
      frictions.push({
        severity,
        category: result.category,
        summary: `${entry.label}: ${issue.result === 'failed' ? 'failing' : 'partial'} ${IS_AGENTIC_FRICTION_SUFFIX}`,
        ...(issue.recommendation ? { evidence: issue.recommendation } : {}),
      });
    }

    const findings = [...result.findings, ...added];
    return {
      ...result,
      score: scoreFindings(findings),
      findings,
      frictions: [...result.frictions, ...frictions],
    };
  });
}
