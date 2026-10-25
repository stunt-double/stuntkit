import { CheckBuilder } from '../check-builder.ts';
import { socialHandles } from '../parse.ts';
import type { DomainProbe } from '../probe.ts';
import type { CategoryCheckResult } from '../types.ts';

export function brandAwareness(probe: DomainProbe): CategoryCheckResult {
  const b = new CheckBuilder('brand-awareness');
  const html = probe.html;

  const faviconOk = probe.favicon.ok || !!html?.linkRels.some((l) => /icon|shortcut/.test(l.rel));
  b.add('favicon', 'Favicon is served', 10, faviconOk);
  if (!faviconOk) b.friction('low', 'No favicon. Agents struggle to render brand previews.');

  const orgLd =
    !!html?.jsonLd.length &&
    html.jsonLd.some((n) =>
      JSON.stringify(n)
        .toLowerCase()
        .match(/"@type"\s*:\s*"(organization|brand|localbusiness)"/)
    );
  b.add('org-jsonld', 'Organization / Brand JSON-LD', 20, orgLd);
  if (!orgLd)
    b.friction(
      'medium',
      'No Organization JSON-LD. Agents can\u2019t tell who owns the site at a glance.'
    );

  const ogTitle = !!html?.meta['og:title'];
  const ogDesc = !!html?.meta['og:description'];
  const ogImage = !!html?.meta['og:image'];
  b.add('og-core', 'Open Graph title + description + image', 15, ogTitle && ogDesc && ogImage);
  if (!(ogTitle && ogDesc && ogImage))
    b.friction('low', 'Missing Open Graph tags. Link previews degrade in agent chats.');

  const twitterCard = !!html?.meta['twitter:card'];
  b.add('twitter-card', 'Twitter card meta tag', 10, twitterCard);

  const socials = html ? socialHandles(html) : [];
  b.add(
    'socials',
    'At least 2 social profiles linked',
    15,
    socials.length >= 2,
    socials.join(', ')
  );
  if (socials.length < 2)
    b.friction(
      'low',
      'Fewer than two social profiles linked. Agents struggle to triangulate the brand.'
    );

  const title = html?.title ?? '';
  const hasDistinctTitle = title.length >= 15 && !/^untitled|^index$|^home$/i.test(title);
  b.add('title', 'Distinctive page title', 15, hasDistinctTitle, title ? `"${title}"` : undefined);

  const hasDescription = (html?.meta['description']?.length ?? 0) >= 50;
  b.add('meta-description', 'Meta description ≥ 50 chars', 15, hasDescription);
  if (!hasDescription)
    b.friction('medium', 'Homepage meta description is missing or too short for agent snippets.');

  return b.build();
}
