import type { FetchResult } from './fetch.ts';

// Detects whether a response is a bot-mitigation challenge page rather than
// real content. Header and status signals are checked first because they are
// unambiguous; body phrases are restricted to strings that only appear on
// actual interstitial pages. A site merely *mentioning* "cloudflare" or
// "captcha" (CDN scripts, help articles, Turnstile embeds on a contact form)
// must not count as a challenge.
const CHALLENGE_BODY_SIGNATURES: Array<{ re: RegExp; reason: string }> = [
  { re: /<title[^>]*>\s*just a moment/i, reason: 'Cloudflare "Just a moment…" interstitial' },
  { re: /<title[^>]*>\s*attention required!?\s*\|\s*cloudflare/i, reason: 'Cloudflare block page' },
  {
    re: /cf-browser-verification|cf_chl_opt|challenge-platform\/h\/[bg]\/orchestrate/i,
    reason: 'Cloudflare challenge script',
  },
  {
    re: /verify(?:ing)? you are (?:a )?human|confirm you are (?:a )?human/i,
    reason: 'human-verification interstitial',
  },
  {
    re: /geo\.captcha-delivery\.com|x-datadome|dd\.js.{0,40}datadome/i,
    reason: 'DataDome challenge',
  },
  { re: /px-captcha|_pxhd|perimeterx/i, reason: 'PerimeterX / HUMAN challenge' },
  { re: /<title[^>]*>\s*access denied/i, reason: '"Access Denied" block page' },
  { re: /enable javascript and cookies to continue/i, reason: 'JS/cookie gate interstitial' },
];

const BLOCK_STATUSES = new Set([401, 403, 429, 503]);

export type ChallengeVerdict = {
  challenged: boolean;
  /** Human-readable evidence, e.g. 'HTTP 403 + cf-mitigated: challenge'. */
  reason: string | null;
};

export function detectBotChallenge(res: FetchResult): ChallengeVerdict {
  const cfMitigated = res.headers['cf-mitigated'];
  if (cfMitigated === 'challenge') {
    return { challenged: true, reason: `HTTP ${res.status} + cf-mitigated: challenge` };
  }
  if (res.headers['x-datadome'] || res.headers['x-datadome-cid']) {
    return { challenged: true, reason: `HTTP ${res.status} + DataDome headers` };
  }

  for (const { re, reason } of CHALLENGE_BODY_SIGNATURES) {
    if (re.test(res.body)) {
      // Body signatures on a 2xx can still be a soft challenge (Cloudflare
      // serves "Just a moment…" with 200 in some modes), so don't require a
      // block status here.
      return { challenged: true, reason: `HTTP ${res.status} + ${reason}` };
    }
  }

  // A blocked status alone with a near-empty body from a bot-management CDN
  // is a strong challenge signal even without a recognisable page.
  if (BLOCK_STATUSES.has(res.status)) {
    const server = (res.headers['server'] ?? '').toLowerCase();
    const viaBotCdn = server.includes('cloudflare') || server.includes('akamai');
    if (viaBotCdn && res.body.length < 4_000) {
      return { challenged: true, reason: `HTTP ${res.status} from ${server} with no content` };
    }
  }

  return { challenged: false, reason: null };
}
