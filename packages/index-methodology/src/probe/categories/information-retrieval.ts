import { CheckBuilder } from '../check-builder.ts';
import type { DomainProbe } from '../probe.ts';
import type { CategoryCheckResult } from '../types.ts';

export function informationRetrieval(probe: DomainProbe): CategoryCheckResult {
  const b = new CheckBuilder('information-retrieval');
  const html = probe.html;
  const home = probe.homepage;

  b.add('http-200', 'Homepage returns 2xx', 15, home.ok, `status ${home.status}`);
  if (!home.ok)
    b.friction(
      'high',
      `Homepage did not return 2xx (status ${home.status || 'unreachable'}) to a standard client.`,
      home.error
    );

  const fast = home.durationMs > 0 && home.durationMs < 2500;
  const acceptable = home.durationMs > 0 && home.durationMs < 5000;
  b.add(
    'fast-response',
    fast ? 'Fast response (< 2.5s)' : acceptable ? 'Acceptable response (< 5s)' : 'Slow homepage',
    10,
    fast || acceptable,
    `${home.durationMs}ms`
  );
  if (!acceptable)
    b.friction('medium', `Homepage responded in ${home.durationMs}ms. Slow for agent workflows.`);

  const substantive = (html?.textLength ?? 0) >= 800;
  b.add(
    'ssr-content',
    'Server-rendered text ≥ 800 chars',
    20,
    substantive,
    `${html?.textLength ?? 0} chars of text`
  );
  if (!substantive)
    b.friction(
      'high',
      'Homepage ships little text to server-rendered HTML. Agents without a browser see an empty shell.'
    );

  // Content negotiation: serving markdown to `Accept: text/markdown` cuts
  // agent token cost dramatically. Cloudflare's 2026 readiness study found
  // 99% of top sites fail this; it is a genuine differentiator.
  const mdType = (probe.markdownVariant.headers['content-type'] ?? '').toLowerCase();
  const servesMarkdown =
    probe.markdownVariant.ok && (mdType.includes('text/markdown') || mdType.includes('text/plain'));
  b.add(
    'markdown-negotiation',
    'Serves a markdown/plain-text variant to `Accept: text/markdown`',
    10,
    servesMarkdown,
    servesMarkdown ? mdType : `got ${mdType || 'no content-type'}`
  );

  const semantic = html ? Object.values(html.semanticTags).filter(Boolean).length : 0;
  b.add('semantic-html', 'Uses ≥ 3 semantic landmark tags', 10, semantic >= 3);

  const hasHeadings = (html?.headings.h1 ?? 0) >= 1 && (html?.headings.h2 ?? 0) >= 1;
  b.add('headings', 'Has both h1 and h2 headings', 10, hasHeadings);

  b.add('jsonld', 'At least one JSON-LD block', 15, (html?.jsonLd.length ?? 0) > 0);
  if ((html?.jsonLd.length ?? 0) === 0)
    b.friction('medium', 'No JSON-LD structured data. Agents must infer entities from markup.');

  const noscriptBlock = !!html?.hasNoscriptWarning;
  b.add('no-noscript-warning', 'No "enable JavaScript" warning', 10, !noscriptBlock);
  if (noscriptBlock)
    b.friction('high', 'Site renders a "please enable JavaScript" notice to non-JS clients.');

  return b.build();
}
