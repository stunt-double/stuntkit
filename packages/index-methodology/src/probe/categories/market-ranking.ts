import { CheckBuilder } from '../check-builder.ts';
import { detectMonetisation, PRICE_RE, pricingApplies } from '../monetisation.ts';
import { hasJsonLdType } from '../parse.ts';
import type { DomainProbe } from '../probe.ts';
import { jsonEndpointExists, pageExists } from '../probe.ts';
import type { CategoryCheckResult, CheckContext } from '../types.ts';

export function marketRanking(probe: DomainProbe, context: CheckContext): CategoryCheckResult {
  const b = new CheckBuilder('market-ranking');
  const html = probe.html;
  const nodes = html?.jsonLd ?? [];

  const productLd = hasJsonLdType(nodes, ['Product', 'Service', 'SoftwareApplication', 'Offer']);
  b.add('product-schema', 'Product/Service/Offer JSON-LD', 25, productLd);
  if (!productLd)
    b.friction(
      'medium',
      'No Product/Service schema on the homepage. Agents can\u2019t easily compare offerings.'
    );

  const rating = hasJsonLdType(nodes, ['AggregateRating', 'Review']);
  b.add('ratings', 'Reviews / aggregateRating markup', 20, rating);
  if (!rating)
    b.friction(
      'low',
      'No review or aggregateRating schema. Agents have no signal for ranking vs peers.'
    );

  const breadcrumb = hasJsonLdType(nodes, 'BreadcrumbList');
  b.add('breadcrumb', 'Breadcrumb schema', 10, breadcrumb);

  // Only a site that sells something is held to disclosing a price. One that
  // does not (a publication, a docs site, a charity) is not scored on it at
  // all, so these weights drop out. The stored verdict decides when there is
  // one (see `pricingApplies`); the probe's detection covers the rest.
  const pricingPageOk = pageExists(probe.extraPages['pricing']);
  const monetised = pricingApplies(
    context.monetisation,
    () =>
      !html ||
      detectMonetisation({
        anchors: html.anchors,
        text: html.text,
        raw: html.raw,
        pageUrl: probe.homepage.finalUrl || probe.origin,
        pricingPage: pricingPageOk,
        offerSchema: hasJsonLdType(nodes, ['Product', 'Offer', 'AggregateOffer']),
        ucp: jsonEndpointExists(probe.ucp),
      }).monetised
  );

  if (monetised) {
    const hasPrice = !!html && PRICE_RE.test(html.text);
    b.add('visible-price', 'Pricing visible in server-rendered HTML', 20, hasPrice);
    if (!hasPrice)
      b.friction(
        'medium',
        'Pricing only available if JavaScript is enabled. Agents may report "pricing not disclosed".'
      );

    b.add('pricing-page', 'Dedicated /pricing page exists', 10, pricingPageOk);
  }

  const anchorCount = html?.anchors.length ?? 0;
  b.add(
    'navigable',
    'Homepage has ≥ 20 internal anchors',
    15,
    anchorCount >= 20,
    `${anchorCount} anchors`
  );

  return b.build();
}
