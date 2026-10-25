import { CheckBuilder } from '../check-builder.ts';
import { flattenJsonLd } from '../parse.ts';
import type { DomainProbe } from '../probe.ts';
import type { CategoryCheckResult } from '../types.ts';

export function accuracy(probe: DomainProbe): CategoryCheckResult {
  const b = new CheckBuilder('accuracy');
  const html = probe.html;
  const home = probe.homepage;

  const canonical = !!html?.linkRels.find((l) => l.rel === 'canonical');
  b.add('canonical', 'Canonical URL declared', 15, canonical);
  if (!canonical)
    b.friction('low', 'No canonical URL. Agents may cite ephemeral query-string variants.');

  const lastModified =
    !!home.headers['last-modified'] || !!home.headers['etag'] || !!probe.sitemap?.ok;
  b.add('freshness', 'Last-Modified, ETag, or sitemap available', 15, lastModified);
  if (!lastModified)
    b.friction('medium', 'No freshness headers. Agents can\u2019t tell when content was updated.');

  const contentType = (home.headers['content-type'] ?? '').toLowerCase();
  const utf8 = contentType.includes('utf-8') || contentType.includes('utf8');
  b.add('utf8', 'UTF-8 declared in content-type', 10, utf8);

  const nodes = flattenJsonLd(html?.jsonLd ?? []);
  const validStructured =
    nodes.length > 0 &&
    nodes.every((n) => typeof n === 'object' && ('@type' in n || '@context' in n));
  b.add(
    'structured-valid',
    nodes.length > 0 ? 'Every JSON-LD block has @type or @context' : 'Structured data present',
    20,
    validStructured
  );
  if (nodes.length === 0)
    b.friction('medium', 'No JSON-LD at all. Every factual claim must be inferred from prose.');

  const hasBrandInText =
    !!html &&
    probe.domain
      .replace(/\.(com|io|co|net|org|app|so|ai|dev|uk|us|ca|au)$/, '')
      .split('.')
      .filter(Boolean)
      .every((fragment) => html.lower.includes(fragment.toLowerCase()));
  b.add(
    'brand-in-text',
    'Brand name appears in server-rendered text',
    20,
    hasBrandInText,
    'Domain root tokens must appear in visible text.'
  );
  if (!hasBrandInText)
    b.friction(
      'high',
      'Brand name not present in server-rendered HTML. Non-JS agents may not associate the domain with the product.'
    );

  const statusStable = home.ok;
  b.add('status-stable', 'Homepage stable 2xx response', 10, statusStable);

  const privacyLink = (html?.anchors ?? []).some((h) => /\/privacy|privacy-policy/i.test(h));
  b.add('privacy-policy', 'Privacy policy linked', 10, privacyLink);
  if (!privacyLink)
    b.friction(
      'low',
      'No privacy policy linked from the homepage. Agents can\u2019t cite policy when asked.'
    );

  return b.build();
}
