// The probe: the deterministic half of the Index score, run on a site over
// plain HTTP. It reads what an agent can reach and use (robots.txt, the
// homepage, the sitemap, llms.txt, structured data, discovery and commerce
// endpoints) and turns each finding into points for its category.
//
// It needs only the platform's `fetch`. The two third-party reads it can fold
// in (Is Agentic, agent search) take keys and outside APIs, so the caller runs
// them and passes the results through `lookups`.

export type {
  AgentSearchInput,
  AgentSearchReport,
  AgentSearchResult,
} from './agent-search-types.ts';
export type { IsAgenticReport, IsAgenticResult } from './is-agentic-types.ts';
export { gateDomain, probeDomain, type DomainProbe, type ProbeGate } from './probe.ts';
export { PROVIDER_ROBOTS_TOKENS, type ProviderProbe, type ProviderSpec } from './providers.ts';
export { setRequestHeaders, type RequestHeaders } from './request-headers.ts';
export {
  cleanDomain,
  runProbe,
  type ProbeLookups,
  type ProbeOptions,
  type ProbeReport,
} from './run.ts';
export type { CategoryScore, CheckFinding, Friction, ProviderScore } from './shapes.ts';
export type { DomainReport } from './types.ts';
