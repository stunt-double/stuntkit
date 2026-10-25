// robots.txt and X-Robots-Tag, read the way a well-behaved crawler reads them.
//
// The methodology page promises that when robots.txt or a site's headers say
// no, the Index stays out. This is the one evaluator both halves of the Index
// obey: the quick-check probe, which fetches robots.txt before anything else,
// and any agent session a caller starts, which should check again first. It also answers the per-provider
// question the report shows ("does this site's robots.txt let GPTBot in?")
// without us ever sending a request that pretends to be GPTBot.
//
// Parsing and matching follow RFC 9309: user-agent lines open a group, groups
// that name the same agent are merged, the `*` group applies only when no
// group names the agent, and the longest matching Allow/Disallow pattern
// wins, with Allow winning a tie. `Crawl-delay` is not in the RFC but is
// widely used, so it is read from the same group.
//
// Kept free of runtime imports (bar the sibling identity constants) so
// `node --test` can load it by path.

import { INDEX_AGENT_TOKEN } from './identity.ts';

export type RobotsRule = { allow: boolean; pattern: string };

export type RobotsGroup = {
  /** Product tokens, lowercased and stripped of any version (`gptbot`, `*`). */
  agents: string[];
  rules: RobotsRule[];
  /** Seconds, when the group sets a valid `Crawl-delay`. */
  crawlDelay: number | null;
};

export type RobotsPolicy = {
  rules: RobotsRule[];
  crawlDelay: number | null;
  /** Which groups applied: ones naming the agent, the `*` group, or none at all. */
  matched: 'agent' | 'wildcard' | 'none';
};

/** The longest `Crawl-delay` we honour. Past this a probe could not finish, so it fetches less instead. */
export const MAX_CRAWL_DELAY_SECONDS = 10;

function normaliseAgent(value: string): string {
  return value.trim().toLowerCase().split(/[/\s]/)[0] ?? '';
}

/** Parses a robots.txt body into its groups. Lines before the first `User-agent` are ignored. */
export function parseRobots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // A user-agent line directly after another joins its group; after any rule
  // it opens a new one.
  let collectingAgents = false;
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      const agent = normaliseAgent(value);
      if (!collectingAgents || !current) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
        collectingAgents = true;
      }
      if (agent) current.agents.push(agent);
      continue;
    }
    // `Sitemap` (and anything unknown) sits outside the group structure.
    if (key !== 'allow' && key !== 'disallow' && key !== 'crawl-delay') continue;
    collectingAgents = false;
    if (!current) continue;

    if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
      continue;
    }
    // An empty pattern matches nothing: `Disallow:` on its own allows everything.
    if (!value) continue;
    const pattern = value.startsWith('/') || value.startsWith('*') ? value : `/${value}`;
    current.rules.push({ allow: key === 'allow', pattern });
  }
  return groups;
}

function mergeGroups(groups: RobotsGroup[], matched: RobotsPolicy['matched']): RobotsPolicy {
  const delays = groups.map((g) => g.crawlDelay).filter((d): d is number => d !== null);
  return {
    rules: groups.flatMap((g) => g.rules),
    crawlDelay: delays.length > 0 ? Math.max(...delays) : null,
    matched,
  };
}

/**
 * The rules that apply to one agent: every group naming its product token,
 * merged, or failing that every `*` group. `groups` may be a parsed file or
 * the raw body.
 */
export function policyFor(groups: RobotsGroup[] | string, token: string): RobotsPolicy {
  const parsed = typeof groups === 'string' ? parseRobots(groups) : groups;
  const wanted = normaliseAgent(token);
  const named = parsed.filter((g) => g.agents.includes(wanted));
  if (named.length > 0) return mergeGroups(named, 'agent');
  const wildcard = parsed.filter((g) => g.agents.includes('*'));
  if (wildcard.length > 0) return mergeGroups(wildcard, 'wildcard');
  return { rules: [], crawlDelay: null, matched: 'none' };
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path);
}

/**
 * Whether `path` (path plus query, starting `/`) may be fetched under
 * `rules`: the longest matching pattern decides, Allow wins a tie, and no
 * match means allowed. `/robots.txt` itself is always allowed.
 */
export function isPathAllowed(rules: RobotsRule[], path: string): boolean {
  if (path === '/robots.txt') return true;
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/** Whether our own agent may fetch `path` under this robots.txt. */
export function indexMayFetch(robots: RobotsGroup[] | string, path: string): boolean {
  return isPathAllowed(policyFor(robots, INDEX_AGENT_TOKEN).rules, path);
}

/**
 * Whether a provider's crawlers may reach the homepage, judged from the site's
 * robots.txt alone. A provider answers to several tokens (Anthropic's
 * ClaudeBot and anthropic-ai, say): the tokens the file names decide, and the
 * provider counts as allowed when any of them is; only when none is named does
 * the `*` group apply.
 */
export function providerAllowedByRobots(robots: RobotsGroup[] | string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const parsed = typeof robots === 'string' ? parseRobots(robots) : robots;
  const named = tokens
    .map((token) => policyFor(parsed, token))
    .filter((policy) => policy.matched === 'agent');
  if (named.length > 0) return named.some((policy) => isPathAllowed(policy.rules, '/'));
  return isPathAllowed(policyFor(parsed, '*').rules, '/');
}

/**
 * Our `Crawl-delay` in milliseconds, capped at `MAX_CRAWL_DELAY_SECONDS`.
 * Zero when the file sets none for us.
 */
export function indexCrawlDelayMs(robots: RobotsGroup[] | string): number {
  const { crawlDelay } = policyFor(robots, INDEX_AGENT_TOKEN);
  if (crawlDelay === null) return 0;
  return Math.round(Math.min(crawlDelay, MAX_CRAWL_DELAY_SECONDS) * 1000);
}

/**
 * Whether a robots.txt response carries rules to obey. RFC 9309: a 2xx body
 * is the rules; a 4xx means there are none. A 5xx or no answer should mean
 * "assume disallow", but the Index reads that as no rules for this visit
 * rather than recording a site as having opted out because its robots.txt
 * was briefly down. A 2xx that is plainly an HTML page (a catch-all router)
 * has no rules in it either.
 */
export function robotsBodyToObey(res: {
  status: number;
  body: string;
  contentType?: string | null;
}): string {
  if (res.status < 200 || res.status >= 300) return '';
  const body = res.body.trimStart();
  if ((res.contentType ?? '').toLowerCase().includes('text/html') || body.startsWith('<')) {
    return '';
  }
  return res.body;
}

// Directives whose value follows a colon, so `max-snippet: 20` is not read as
// a directive scoped to an agent called `max-snippet`.
const VALUED_DIRECTIVES = new Set([
  'unavailable_after',
  'max-snippet',
  'max-image-preview',
  'max-video-preview',
]);

/** Directives that tell the Index to stay out. */
const OPT_OUT_DIRECTIVES = new Set(['noai', 'none']);

/**
 * The X-Robots-Tag directive that opts the Index out, or null. A header may
 * hold several comma-separated directives, and repeated headers arrive joined
 * the same way. A directive prefixed with an agent (`googlebot: noindex`)
 * binds only that agent; an unprefixed one binds everyone. `noai` and `none`
 * opt us out, unprefixed or scoped to `StuntDoubleIndex`.
 */
export function xRobotsTagOptOut(
  value: string | null | undefined,
  token: string = INDEX_AGENT_TOKEN
): string | null {
  if (!value) return null;
  const ours = normaliseAgent(token);
  for (const part of value.split(',')) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;
    const scoped = /^([a-z0-9_-]+)\s*:\s*(.+)$/.exec(trimmed);
    if (scoped && !VALUED_DIRECTIVES.has(scoped[1])) {
      const [, agent, directive] = scoped;
      if ((agent === ours || agent === '*') && OPT_OUT_DIRECTIVES.has(directive.trim())) {
        return part.trim();
      }
      continue;
    }
    if (OPT_OUT_DIRECTIVES.has(trimmed)) return part.trim();
  }
  return null;
}

export type IndexOptOut = {
  source: 'robots-txt' | 'x-robots-tag';
  /** What the site said, in words a report can show. */
  detail: string;
};

/**
 * Whether a site has asked the Index to stay out: robots.txt disallows `/` for
 * `StuntDoubleIndex` (or for every agent, with no group naming us), or the
 * homepage's X-Robots-Tag says `noai` or `none` to us. `robotsBody` is what
 * `robotsBodyToObey` returned.
 */
export function indexOptOut(input: {
  robotsBody: string;
  xRobotsTag?: string | null;
}): IndexOptOut | null {
  const policy = policyFor(input.robotsBody, INDEX_AGENT_TOKEN);
  if (!isPathAllowed(policy.rules, '/')) {
    return {
      source: 'robots-txt',
      detail:
        policy.matched === 'agent'
          ? `robots.txt disallows ${INDEX_AGENT_TOKEN}`
          : 'robots.txt disallows all agents',
    };
  }
  const directive = xRobotsTagOptOut(input.xRobotsTag);
  if (directive) return { source: 'x-robots-tag', detail: `X-Robots-Tag: ${directive}` };
  return null;
}
