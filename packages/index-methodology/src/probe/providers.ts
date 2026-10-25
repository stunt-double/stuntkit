import { curveScore } from '../index.ts';
import { detectBotChallenge } from './challenge.ts';
import { INDEX_USER_AGENT } from './identity.ts';
import type { DomainProbe } from './probe.ts';
import { providerAllowedByRobots } from './robots.ts';
import type { ProviderScore } from './shapes.ts';

export type ProviderProbe = {
  id: string;
  label: string;
  vendor: string;
  /**
   * The user agent the homepage was fetched with: always ours
   * (`INDEX_USER_AGENT`). The probe never impersonates a provider's crawler;
   * what differs per provider is what robots.txt says to its tokens.
   */
  userAgent: string;
  robotsTokens: string[];
  configured: boolean;
  configurationNote: string;
  /** robots.txt policy evaluated against this provider's tokens. */
  allowedByRobots: boolean;
  /** HTTP status of the probe's one identified homepage fetch. */
  homepageStatus: number;
  /** Bytes of server-rendered text that fetch returned. */
  ssrTextLength: number;
  /** Whether that page carries a known bot-challenge signature. */
  botChallenge: boolean;
  /** Time to first byte for that homepage fetch. */
  responseMs: number;
  /** Reachability score 0-100 derived from the real measurements above. */
  score: number;
};

/**
 * An agent provider the caller benchmarks. Which providers a deployment can
 * run is the caller's knowledge (its keys and harnesses), so the probe takes the
 * list rather than reading the environment.
 */
export type ProviderSpec = {
  id: string;
  label: string;
  vendor: string;
  configured: boolean;
  /** Human-readable reason the provider is or is not configured. */
  configurationNote: string;
};

/**
 * The robots.txt product tokens each provider's crawlers and agents answer to,
 * read from the site's own robots.txt. We never send these tokens.
 */
export const PROVIDER_ROBOTS_TOKENS: Readonly<Record<string, readonly string[]>> = {
  claude: ['claudebot', 'claude-web', 'anthropic-ai'],
  chatgpt: ['gptbot', 'chatgpt-user', 'oai-searchbot'],
  gemini: ['google-extended', 'googlebot'],
  perplexity: ['perplexitybot', 'perplexity-user'],
  copilot: ['bingbot', 'msnbot', 'copilot'],
  browserbase: [],
};

function scoreReachability(input: {
  ok: boolean;
  allowedByRobots: boolean;
  ssrTextLength: number;
  botChallenge: boolean;
  responseMs: number;
}): number {
  let score = 0;
  if (input.allowedByRobots) score += 30;
  if (input.ok) score += 30;
  if (input.ssrTextLength >= 800) score += 20;
  else if (input.ssrTextLength >= 200) score += 10;
  if (!input.botChallenge) score += 15;
  if (input.responseMs > 0 && input.responseMs < 2500) score += 5;
  else if (input.responseMs > 0 && input.responseMs < 5000) score += 2;
  return Math.max(0, Math.min(100, score));
}

/**
 * Per-provider reachability, without sending a request as anyone but
 * ourselves. Whether a provider may come in is what the site's robots.txt
 * says to that provider's tokens; whether the homepage answers, renders on
 * the server and is free of a bot challenge comes from the probe's one
 * identified homepage fetch, which every provider shares. A site that treats
 * one vendor's crawler differently at its firewall therefore reads the same
 * for every provider here: the agent sessions are where that shows.
 */
export function runProviderProbes(
  probe: DomainProbe,
  providers: readonly ProviderSpec[]
): ProviderProbe[] {
  const home = probe.homepage;
  const ssrTextLength = probe.html?.textLength ?? 0;
  const botChallenge = detectBotChallenge(home).challenged;
  return providers.map((p) => {
    const robotsTokens = [...(PROVIDER_ROBOTS_TOKENS[p.id] ?? [])];
    const allowedByRobots = providerAllowedByRobots(probe.robotsRules, robotsTokens);
    return {
      id: p.id,
      label: p.label,
      vendor: p.vendor,
      userAgent: INDEX_USER_AGENT,
      robotsTokens,
      configured: p.configured,
      configurationNote: p.configurationNote,
      allowedByRobots,
      homepageStatus: home.status,
      ssrTextLength,
      botChallenge,
      responseMs: home.durationMs,
      score: scoreReachability({
        ok: home.ok,
        allowedByRobots,
        ssrTextLength,
        botChallenge,
        responseMs: home.durationMs,
      }),
    };
  });
}

export function toProviderScores(probes: ProviderProbe[]): ProviderScore[] {
  // Only configured providers are published; the rest are kept for the report.
  return probes
    .filter((p) => p.configured)
    .map((p) => ({ provider: p.id, score: curveScore(p.score) }));
}
