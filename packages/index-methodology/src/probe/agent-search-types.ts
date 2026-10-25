// The shape of an agent search report, as the probe's fold-in reads it. The
// lookup (Exa or Tavily, with their keys) is not part of this package: a caller
// runs it and passes the result in (see `ProbeLookups`).

export type AgentSearchProvider = 'exa' | 'tavily';

export const AGENT_SEARCH_PROVIDER_LABELS: Record<AgentSearchProvider, string> = {
  exa: 'Exa',
  tavily: 'Tavily',
};

/** How deep a result counts as found. Agents rarely read past the first page. */
export const AGENT_SEARCH_DEPTH = 10;

/** Where a domain landed for a query: its 1-based position, or null when absent. */
export type SearchRank = { query: string; rank: number | null };

export type AgentSearchReport = {
  provider: AgentSearchProvider;
  /** The site's own name as the query. Null when that lookup failed. */
  brand: SearchRank | null;
  /** What the site does, without its name. Null when there was nothing to ask or it failed. */
  topic: SearchRank | null;
  /** Pages the index holds for the domain. Null when that lookup failed. */
  indexed: { pages: number; withText: number } | null;
};

export type AgentSearchResult =
  | { status: 'ok'; report: AgentSearchReport }
  | { status: 'unconfigured' }
  | { status: 'unavailable' };

/** What a lookup needs to find the site: its domain, name, what it does and its parent. */
export type AgentSearchInput = {
  domain: string;
  name: string;
  topicQuery: string | null;
  parentDomain: string | null;
};
