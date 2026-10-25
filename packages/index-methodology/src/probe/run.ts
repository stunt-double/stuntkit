import { curveScore, weightedOverallScore, type CategoryId } from '../index.ts';
import type { AgentSearchInput, AgentSearchResult } from './agent-search-types.ts';
import { accuracy } from './categories/accuracy.ts';
import { brandAwareness } from './categories/brand-awareness.ts';
import { checkout } from './categories/checkout.ts';
import { delegatedAccess } from './categories/delegated-access.ts';
import { discovery } from './categories/discovery.ts';
import { informationRetrieval } from './categories/information-retrieval.ts';
import { marketRanking } from './categories/market-ranking.ts';
import { support } from './categories/support.ts';
import { applyIsAgenticReport } from './is-agentic-checks.ts';
import type { IsAgenticResult } from './is-agentic-types.ts';
import { extractDomainMetadata, parentDomainOf, pickDeclaredNames } from './metadata.ts';
import type { Monetisation } from './monetisation-model.ts';
import { flattenJsonLd } from './parse.ts';
import { gateDomain, probeDomain, type DomainProbe, type ProbeGate } from './probe.ts';
import type { ProviderSpec } from './providers.ts';
import { runProviderProbes, toProviderScores } from './providers.ts';
import { applyAgentSearchReport, topicQueryFor } from './search-visibility-checks.ts';
import { detectSector, sectorFromDomainSuffix, type SectorSignals } from './sector.ts';
import type { CategoryScore, Friction } from './shapes.ts';
import { resolveSiteName } from './site-name.ts';
import type { CategoryCheckResult, CheckContext, CheckFinding, DomainReport } from './types.ts';

const CHECKS: Array<(probe: DomainProbe, context: CheckContext) => CategoryCheckResult> = [
  brandAwareness,
  discovery,
  informationRetrieval,
  marketRanking,
  accuracy,
  checkout,
  delegatedAccess,
  support,
];

const cleanDomain = (input: string): string => {
  const trimmed = (input ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
  }
};

function sectorSignals(probe: DomainProbe): SectorSignals | null {
  const html = probe.html;
  if (!html) return null;
  const jsonLdTypes: string[] = [];
  for (const n of flattenJsonLd(html.jsonLd)) {
    const t = n['@type'];
    const arr = Array.isArray(t) ? t : t ? [t] : [];
    for (const tt of arr) if (typeof tt === 'string') jsonLdTypes.push(tt);
  }
  return {
    domain: probe.domain,
    jsonLdTypes,
    ogType: html.meta['og:type'] ?? null,
    text: html.text,
    anchors: html.anchors,
  };
}

export type ProbeReport = DomainReport;

/**
 * The report for a site that opted out: no scores, no findings, only what we
 * can say without reading any more of it. Callers persist and enqueue nothing
 * for it (see `scoreAndEnqueue`).
 */
function optedOutReport(domain: string, gate: ProbeGate, started: number): DomainReport {
  return {
    domain,
    name: resolveSiteName({ domain, declared: [], titles: [] }),
    sector: sectorFromDomainSuffix(domain) ?? 'saas',
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    overallScore: 0,
    categoryScores: [],
    providerScores: [],
    providerProbes: [],
    frictions: [],
    findings: {} as Record<CategoryId, CheckFinding[]>,
    reachable: false,
    homepageStatus: gate.homepage.status,
    metadata: {
      faviconUrl: null,
      iconUrl: null,
      themeColor: null,
      title: null,
      description: null,
      locale: null,
      locales: [],
      markets: [],
      audience: null,
      keywords: [],
      categoryTags: [],
    },
    parentDomain: parentDomainOf(domain),
    optOut: gate.optOut,
  };
}

/**
 * The third-party reads a run folds in. Neither touches the site: each one
 * needs an outside API and its keys, which only the caller holds. A lookup left
 * out answers as unavailable and the categories stay on the probe alone.
 */
export type ProbeLookups = {
  isAgentic: (domain: string, signal?: AbortSignal) => Promise<IsAgenticResult>;
  agentSearch: (input: AgentSearchInput, signal?: AbortSignal) => Promise<AgentSearchResult>;
};

export type ProbeOptions = {
  /** Aborts every outstanding probe fetch when it fires. */
  signal?: AbortSignal;
  /** The domain's stored monetisation verdict, when the caller has one. */
  monetisation?: Monetisation | null;
  /** The agent providers to report reachability for. Empty by default. */
  providers?: readonly ProviderSpec[];
  lookups?: Partial<ProbeLookups>;
};

const NO_LOOKUPS: ProbeLookups = {
  isAgentic: async () => ({ status: 'unavailable' }),
  agentSearch: async () => ({ status: 'unavailable' }),
};

/**
 * `options.signal`, when given, aborts every outstanding probe fetch if the
 * caller abandons this run, so a caller-side deadline stops the network calls
 * this makes rather than leaving them to run to their own timeouts.
 *
 * `options.monetisation` is a stored verdict to follow, when the caller has
 * one; left out, the probe detects it from the page.
 */
export async function runProbe(
  rawDomain: string,
  options: ProbeOptions = {}
): Promise<ProbeReport> {
  const { signal, providers = [] } = options;
  const lookups = { ...NO_LOOKUPS, ...options.lookups };
  const storedMonetisation = options.monetisation ?? null;
  const domain = cleanDomain(rawDomain);
  if (!domain || !domain.includes('.')) {
    throw new Error('invalid domain');
  }
  const started = Date.now();
  // The Is Agentic lookup is a cached read against a public API (not the
  // site), so it runs beside our own probe rather than after it. Any failure
  // (no stored report, rate limited, timed out) leaves the categories on our
  // probes alone.
  const isAgenticLookup = lookups.isAgentic(domain, signal);
  const gate = await gateDomain(domain, signal);
  if (gate.optOut) {
    // Nothing else is fetched from a site that has asked us to stay out.
    // Settle the lookup so its rejection (if any) is not left unhandled.
    await isAgenticLookup.catch(() => null);
    return optedOutReport(domain, gate, started);
  }
  const [probe, isAgentic] = await Promise.all([probeDomain(gate, signal), isAgenticLookup]);
  const monetisation = storedMonetisation;

  const metadata = extractDomainMetadata(probe);
  // The name is checked against the domain: a homepage's title can be a
  // tagline or, on bing.com, the caption of the day's photo.
  const derivedName = resolveSiteName({
    domain,
    declared: probe.html ? pickDeclaredNames(probe.html) : [],
    titles: [probe.html?.title, metadata.title],
  });
  const parentDomain = parentDomainOf(domain);

  // Agent search (Exa or Tavily) asks for the site by its name and by what it
  // does, so it waits for the probe to read both off the homepage. Unconfigured
  // or failed, it adds nothing and the categories stay on our probes alone.
  const agentSearch = probe.homepage.ok
    ? await lookups.agentSearch(
        {
          domain,
          name: derivedName,
          topicQuery: topicQueryFor({
            domain,
            name: derivedName,
            title: probe.html?.title ?? metadata.title,
            description: metadata.description,
          }),
          parentDomain,
        },
        signal
      )
    : null;

  const heuristics: CategoryCheckResult[] = applyAgentSearchReport(
    applyIsAgenticReport(
      CHECKS.map((fn) => fn(probe, { monetisation })),
      isAgentic.status === 'ok' ? isAgentic.report : null
    ),
    agentSearch?.status === 'ok' ? agentSearch.report : null,
    domain
  );
  const providerProbes = runProviderProbes(probe, providers);

  // The checks award raw points: `probeScore` keeps them for the persisted
  // blend, and `score` is the published (curved) number the live report shows.
  const categoryScores: CategoryScore[] = heuristics.map((r) => ({
    category: r.category,
    score: r.applicable === false ? 0 : curveScore(r.score),
    probeScore: r.score,
    deltaWeek: 0,
    ...(r.applicable === false ? { applicable: false } : {}),
  }));
  const overallScore = weightedOverallScore(categoryScores);

  const frictions: Friction[] = heuristics.flatMap((r) => r.frictions);
  // Only raise provider-specific frictions for providers we actually
  // benchmark; unconfigured ones are not surfaced anywhere in the app.
  for (const p of providerProbes.filter((probe) => probe.configured)) {
    if (!p.allowedByRobots) {
      frictions.push({
        severity: 'medium',
        category: 'discovery',
        summary: `${p.label} is disallowed by robots.txt.`,
        evidence: `Tokens checked: ${p.robotsTokens.join(', ') || 'n/a'}`,
      });
    }
    if (p.botChallenge) {
      frictions.push({
        severity: 'high',
        category: 'checkout',
        summary: `${p.label} hits a bot-challenge page on the homepage.`,
      });
    }
  }

  const findings: Record<CategoryId, CheckFinding[]> = {} as Record<CategoryId, CheckFinding[]>;
  for (const r of heuristics) {
    findings[r.category] = r.findings;
  }

  const signals = sectorSignals(probe);
  const sector = signals ? detectSector(signals) : (sectorFromDomainSuffix(domain) ?? 'saas');

  return {
    domain,
    name: derivedName,
    sector,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    overallScore,
    categoryScores,
    providerScores: toProviderScores(providerProbes),
    providerProbes,
    frictions,
    findings,
    reachable: probe.homepage.ok,
    homepageStatus: probe.homepage.status,
    metadata,
    parentDomain,
  };
}

export { cleanDomain };
