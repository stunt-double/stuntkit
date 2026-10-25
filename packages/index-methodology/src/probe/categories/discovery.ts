import { CheckBuilder } from '../check-builder.ts';
import type { DomainProbe } from '../probe.ts';
import { pageExists, textEndpointExists } from '../probe.ts';
import type { CategoryCheckResult } from '../types.ts';

// The fetchers that answer-engines use when acting for a user, plus the
// crawlers that feed retrieval. Blocking these makes the brand invisible at
// the moment of recommendation.
const FRIENDLY_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-Web',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
];

export function discovery(probe: DomainProbe): CategoryCheckResult {
  const b = new CheckBuilder('discovery');
  const html = probe.html;

  const robotsOk = probe.robotsTxt.ok && probe.robotsTxt.body.length > 0;
  b.add('robots-txt', 'robots.txt is served', 15, robotsOk);
  if (!robotsOk)
    b.friction('medium', 'No robots.txt. Agents fall back to defaults and may miss crawl hints.');

  const robotsBody = probe.robotsTxt.body.toLowerCase();
  const blocksAllBots = /user-agent:\s*\*\s*[\r\n]+disallow:\s*\/\s*(?:[\r\n]|$)/i.test(
    probe.robotsTxt.body
  );
  b.add('robots-allow', 'robots.txt does not block all user agents', 20, !blocksAllBots);
  if (blocksAllBots)
    b.friction('high', 'robots.txt disallows `/` for all agents. The site is invisible to them.');

  const mentionedBots = FRIENDLY_BOTS.filter((bot) => robotsBody.includes(bot.toLowerCase()));
  b.add(
    'robots-agent-allowlist',
    'robots.txt declares a policy for AI agent/answer-engine bots',
    10,
    mentionedBots.length > 0,
    mentionedBots.length > 0 ? mentionedBots.join(', ') : 'no AI bot tokens mentioned'
  );

  // Cloudflare Content Signals Policy: explicit machine-readable consent for
  // search vs AI input vs training. Not yet a formal standard, but it is the
  // clearest way to state agent policy today.
  const contentSignal = /content-signal\s*:/i.test(probe.robotsTxt.body);
  b.add(
    'content-signals',
    'robots.txt declares Content-Signal directives',
    5,
    contentSignal,
    contentSignal ? undefined : 'no Content-Signal lines'
  );

  const sitemapOk = pageExists(probe.sitemap);
  b.add('sitemap', 'sitemap.xml is discoverable', 15, sitemapOk);
  if (!sitemapOk) b.friction('medium', 'No sitemap.xml. Agents can’t enumerate indexable pages.');

  const metaDescription = (html?.meta['description']?.length ?? 0) >= 50;
  b.add('meta-description', 'Homepage meta description', 10, metaDescription);

  const canonical = !!html?.linkRels.find((l) => l.rel === 'canonical');
  b.add('canonical', 'Canonical link tag', 10, canonical);
  if (!canonical)
    b.friction(
      'low',
      'No canonical URL. Agents may conflate duplicate pages as separate entities.'
    );

  // llms.txt is a cheap positive signal of intent, but large-scale studies
  // (SE Ranking, 300k domains) show no effect on AI citations and no major
  // provider consumes it. Low weight by design.
  const llmsTxtOk = textEndpointExists(probe.llmsTxt);
  const llmsFullOk = textEndpointExists(probe.llmsFullTxt);
  b.add(
    'llms-txt',
    'llms.txt is served',
    5,
    llmsTxtOk,
    llmsFullOk ? 'llms-full.txt also present' : undefined
  );

  const hreflang = !!html?.linkRels.some((l) => l.rel === 'alternate' && /hreflang/i.test(l.href));
  b.add('hreflang', 'Localized alternates declared', 10, hreflang);

  return b.build();
}
