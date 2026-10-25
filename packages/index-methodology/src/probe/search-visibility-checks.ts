// Folds an agent search report (Exa or Tavily, see `../agent-search.ts`) into
// the deterministic probe run.
//
// Each of the report's three answers evidences a different category:
//
// - **Brand** (brand awareness): searching the site's own name returns it.
// - **Topic** (discovery): searching what the site does, without its name,
//   returns it. This is the moment of recommendation: an agent asked to find
//   "a payments API" only visits what its search index hands back.
// - **Indexed** (information retrieval): the index holds pages from the site
//   with readable text, which is what an agent reads before it ever visits.
//
// Same rules as the Is Agentic fold-in (`is-agentic-checks.ts`):
//
// - **A capped share.** Each check is worth `SEARCH_VISIBILITY_SHARE` of its
//   category's own probe weight (the fold-ins excluded), so search sits beside
//   the probes rather than over them.
// - **Only with an answer.** No configured provider, or a lookup that failed,
//   adds no finding at all rather than an assumed miss.
//
// Its runtime imports carry the `.ts` extension, so `node --test` can load
// this file directly.

import type { CategoryId } from '../index.ts';
import {
  AGENT_SEARCH_PROVIDER_LABELS,
  type AgentSearchReport,
  type SearchRank,
} from './agent-search-types.ts';
import { scoreFindings } from './is-agentic-checks.ts';
import type { Friction } from './shapes.ts';
import type { CategoryCheckResult, CheckFinding } from './types.ts';

export const SEARCH_VISIBILITY_SHARE = 0.25;

/** Finding ids from this fold-in carry this prefix. */
export const SEARCH_FINDING_PREFIX = 'agent-search:';
const FOLD_IN_PREFIXES = ['is-agentic:', SEARCH_FINDING_PREFIX];

/** Ranks 1 to 3 earn full credit, 4 to 10 half, anything else none. */
export function rankCredit(rank: number | null): number {
  if (rank === null) return 0;
  if (rank <= 3) return 1;
  if (rank <= 10) return 0.5;
  return 0;
}

/** Three readable pages earn full credit, any page at all half. */
export function indexedCredit(indexed: { pages: number; withText: number }): number {
  if (indexed.withText >= 3) return 1;
  if (indexed.pages >= 1) return 0.5;
  return 0;
}

const SEPARATORS = /\s+[|\u2013\u2014:\u00b7\u2022-]\s+/u;
const MAX_TOPIC_WORDS = 12;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A non-branded query for what the site does, from its own title or meta
 * description: "Stripe | Financial Infrastructure to Grow Your Revenue" asks
 * "Financial Infrastructure to Grow Your Revenue". The brand (its name and
 * the domain's first label) is taken out, since asking for it by name is the
 * brand check. Null when nothing of three words or more is left.
 */
export function topicQueryFor(input: {
  domain: string;
  name: string;
  title: string | null;
  description: string | null;
}): string | null {
  const label = input.domain.split('.')[0] ?? '';
  const brands = [input.name, label]
    .map((b) => b.trim())
    .filter((b) => b.length >= 2)
    .map((b) => new RegExp(`\\b${escapeRegExp(b)}(?:'s)?\\b`, 'gi'));

  const strip = (text: string): string =>
    brands
      .reduce((t, re) => t.replace(re, ' '), text)
      .replace(/[^\p{L}\p{N}\s&'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const words = (text: string): string[] => text.split(' ').filter(Boolean);

  // The title's longest segment that is not just the brand.
  const titleSegments = (input.title ?? '')
    .split(SEPARATORS)
    .map(strip)
    .filter((s) => words(s).length >= 3)
    .sort((a, b) => words(b).length - words(a).length);
  // The description's first sentence.
  const firstSentence = strip((input.description ?? '').split(/(?<=[.!?])\s/)[0] ?? '');

  const pick = titleSegments[0] ?? (words(firstSentence).length >= 3 ? firstSentence : null);
  return pick ? words(pick).slice(0, MAX_TOPIC_WORDS).join(' ') : null;
}

type Check = {
  category: CategoryId;
  finding: Omit<CheckFinding, 'weight'>;
  friction: { severity: Friction['severity']; summary: string; evidence?: string } | null;
};

function rankDetail(provider: string, result: SearchRank): string {
  return result.rank === null
    ? `Not in ${provider}'s top 10 for "${result.query}"`
    : `#${result.rank} on ${provider} for "${result.query}"`;
}

function checksFor(report: AgentSearchReport, domain: string): Check[] {
  const provider = AGENT_SEARCH_PROVIDER_LABELS[report.provider];
  const checks: Check[] = [];

  if (report.brand) {
    const credit = rankCredit(report.brand.rank);
    checks.push({
      category: 'brand-awareness',
      finding: {
        id: `${SEARCH_FINDING_PREFIX}brand`,
        label: 'Agent search finds the site by name',
        passed: credit === 1,
        ...(credit > 0 && credit < 1 ? { credit } : {}),
        detail: rankDetail(provider, report.brand),
      },
      friction:
        credit === 0
          ? {
              severity: 'medium',
              summary: `Agents searching for "${report.brand.query}" do not find ${domain} (${provider}).`,
            }
          : null,
    });
  }

  if (report.topic) {
    const credit = rankCredit(report.topic.rank);
    checks.push({
      category: 'discovery',
      finding: {
        id: `${SEARCH_FINDING_PREFIX}topic`,
        label: 'Agent search finds the site for what it does',
        passed: credit === 1,
        ...(credit > 0 && credit < 1 ? { credit } : {}),
        detail: rankDetail(provider, report.topic),
      },
      friction:
        credit === 0
          ? {
              severity: 'low',
              summary: `Agents searching for what ${domain} does do not find it (${provider}).`,
              evidence: `Query: "${report.topic.query}"`,
            }
          : null,
    });
  }

  if (report.indexed) {
    const credit = indexedCredit(report.indexed);
    const { pages, withText } = report.indexed;
    checks.push({
      category: 'information-retrieval',
      finding: {
        id: `${SEARCH_FINDING_PREFIX}indexed`,
        label: 'Agent search holds readable pages from the site',
        passed: credit === 1,
        ...(credit > 0 && credit < 1 ? { credit } : {}),
        detail: `${pages} page${pages === 1 ? '' : 's'} on ${provider}, ${withText} with readable text`,
      },
      friction:
        pages === 0
          ? {
              severity: 'medium',
              summary: `${provider} holds no pages from ${domain}, so agents that search first never see it.`,
            }
          : null,
    });
  }

  return checks;
}

/**
 * Returns new category results with the report's checks appended and each
 * score recomputed. Pure: the input results are not mutated. Apply it after
 * `applyIsAgenticReport`: its pool is sized from the probes alone either way.
 */
export function applyAgentSearchReport(
  results: CategoryCheckResult[],
  report: AgentSearchReport | null,
  domain: string
): CategoryCheckResult[] {
  if (!report) return results;
  const checks = checksFor(report, domain);
  if (checks.length === 0) return results;

  return results.map((result) => {
    if (result.applicable === false) return result;
    const mine = checks.filter((c) => c.category === result.category);
    if (mine.length === 0) return result;

    const ownWeight = result.findings
      .filter((f) => !FOLD_IN_PREFIXES.some((p) => f.id.startsWith(p)))
      .reduce((a, f) => a + f.weight, 0);
    const weight = Math.round(ownWeight * SEARCH_VISIBILITY_SHARE * 100) / 100;

    const added: CheckFinding[] = mine.map((c) => ({ ...c.finding, weight }));
    const frictions: Friction[] = mine
      .filter((c) => c.friction)
      .map((c) => ({ ...c.friction!, category: result.category }));

    const findings = [...result.findings, ...added];
    return {
      ...result,
      score: scoreFindings(findings),
      findings,
      frictions: [...result.frictions, ...frictions],
    };
  });
}
