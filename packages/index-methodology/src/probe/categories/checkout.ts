import { detectBotChallenge } from '../challenge.ts';
import { CheckBuilder } from '../check-builder.ts';
import { COMMERCE_RAILS } from '../monetisation.ts';
import type { DomainProbe } from '../probe.ts';
import { jsonEndpointExists, pageExists } from '../probe.ts';
import { detectSignIn } from '../sign-in.ts';
import type { CategoryCheckResult } from '../types.ts';

// Language that advertises a primary task an agent could carry out on behalf of
// a user, deliberately cross-sector (buy, sign up, book, subscribe, contact).
const PRIMARY_CTA_RE =
  /\b(buy now|add to cart|start free|start for free|sign up|create account|start trial|checkout|subscribe|get started|book now|request (?:a )?demo|contact sales|download|try it free|open an account|apply now|join now)\b/i;

// Paths that commonly host a delegated task entry point. A task-completing
// agent needs at least one of these reachable without authentication.
const TASK_PATH_KEYS = [
  'pricing',
  'cart',
  'checkout',
  'signup',
  'register',
  'book',
  'demo',
  'getStarted',
  'subscribe',
  'contactSales',
] as const;

// Auth / delegation primitives that let an agent act on behalf of a user
// without driving a full browser session.
const DELEGATION_RE =
  /\b(passkey|webauthn|oauth|openid|mcp|api key|personal access token|delegated checkout|agent checkout|scoped access)\b/i;

// A homepage link whose path says a task starts there. Guessing fixed paths
// (`/pricing`, `/cart`) and asking whether they answer without auth measured
// URL conventions, not the site: a store at `/shop/basket` or a SaaS whose
// sign-up lives on `app.` failed it. What an agent actually does is follow a
// link from the page it landed on, so that is what this looks for.
const TASK_LINK_RE =
  /\/(?:[^/?#]*[-_])?(?:pricing|plans?|sign-?up|register|join|trial|get-?started|start|cart|basket|bag|checkout|book(?:ing)?s?|reserv\w*|demo|subscribe|subscriptions?|contact-?sales|shop|store|buy|order)(?:[/?#.]|$)/i;

/** Homepage hrefs that point at a task entry on this site (or a subdomain of it). */
function taskLinks(anchors: string[], pageUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const apex = base.hostname.replace(/^www\./, '');
  const found = new Set<string>();
  for (const href of anchors) {
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    const host = url.hostname.replace(/^www\./, '');
    if (host !== apex && !host.endsWith(`.${apex}`)) continue;
    if (TASK_LINK_RE.test(url.pathname)) found.add(url.pathname);
    if (found.size >= 5) break;
  }
  return [...found];
}

/** Below this much server-rendered text the homepage is probably an app shell. */
const MIN_TEXT_FOR_TASK_EVIDENCE = 500;

export function checkout(probe: DomainProbe): CategoryCheckResult {
  const b = new CheckBuilder('checkout');
  const html = probe.html;

  const hasPrimaryCta = PRIMARY_CTA_RE.test(html?.text ?? '');
  b.add(
    'primary-cta',
    'Homepage exposes a primary call-to-action an agent can act on',
    20,
    hasPrimaryCta
  );
  if (!hasPrimaryCta)
    b.friction(
      'medium',
      'No visible primary call-to-action in the server-rendered HTML. Agents have nothing concrete to click on behalf of a user.'
    );

  const reachableEntries = TASK_PATH_KEYS.filter((key) => pageExists(probe.extraPages[key]));
  const linkedEntries = html
    ? taskLinks(html.anchors, probe.homepage.finalUrl || probe.origin)
    : [];
  const rails = COMMERCE_RAILS.filter((r) => r.re.test(html?.raw ?? ''));
  const ucp = jsonEndpointExists(probe.ucp);

  // Only a site that offers a task to delegate (buy, sign up, book, subscribe)
  // is held to having a reachable entry for one. A site that advertises none
  // (a publication, a docs site, a brochure) is not scored on it at all, so its
  // weight drops out of the category. A client-rendered shell (next to no
  // server text) gives no evidence either way, so it stays scored.
  const offersTasks =
    reachableEntries.length > 0 ||
    linkedEntries.length > 0 ||
    hasPrimaryCta ||
    rails.length > 0 ||
    ucp ||
    !html ||
    html.textLength < MIN_TEXT_FOR_TASK_EVIDENCE ||
    detectSignIn({
      anchors: html.anchors,
      text: html.text,
      pageUrl: probe.homepage.finalUrl || probe.origin,
      authMetadata:
        jsonEndpointExists(probe.wellKnownOidc) || jsonEndpointExists(probe.oauthAuthServer),
      accountPages: false,
    }).hasSignIn;

  // Passes on a task link the homepage offers, or failing that on a common
  // task path that answers (a homepage whose links are all client-rendered).
  if (offersTasks) {
    const entries = linkedEntries.length > 0 ? linkedEntries : reachableEntries.map((k) => `/${k}`);
    b.add(
      'task-entry-linked',
      'The homepage links to where a task starts (pricing, sign-up, cart, booking, etc.)',
      25,
      entries.length > 0,
      entries.length > 0 ? entries.join(', ') : 'no task link in the server-rendered homepage'
    );
    if (entries.length === 0)
      b.friction(
        'medium',
        'The homepage has no link an agent can follow to start a task (pricing, sign-up, cart, booking). Links rendered only by JavaScript are invisible to agents that read the HTML.'
      );
  }

  const challenge = detectBotChallenge(probe.homepage);
  b.add(
    'no-bot-challenge',
    'No CAPTCHA / bot-challenge at the first step',
    20,
    !challenge.challenged,
    challenge.reason ?? undefined
  );
  if (challenge.challenged)
    b.friction(
      'high',
      'Homepage returns a bot-challenge / CAPTCHA. Agents can’t complete a task if they can’t load the site.',
      challenge.reason ?? undefined
    );

  b.add(
    'agentic-commerce-rails',
    'On a payment rail with agentic checkout support (Stripe / Shopify / PayPal / UCP)',
    15,
    rails.length > 0 || ucp,
    [...rails.map((r) => r.id), ...(ucp ? ['UCP discovery endpoint'] : [])].join(', ') || undefined
  );
  if (rails.length === 0 && !ucp)
    b.friction(
      'low',
      'No detectable agentic-commerce rail (Stripe SPT, Shopify/UCP, PayPal ACP). Agent-initiated payment needs custom work.'
    );

  const delegationSignal = DELEGATION_RE.test(html?.raw ?? '');
  b.add(
    'agent-friendly-auth',
    'Signals passkey / OAuth / MCP / delegated access',
    10,
    delegationSignal
  );
  if (!delegationSignal)
    b.friction(
      'medium',
      'No mention of delegated auth primitives (passkey, OAuth, MCP). Agents must drive a full browser session.'
    );

  const guestPath =
    /\b(guest checkout|continue as guest|no account (?:needed|required)|try (?:it )?without signing up)\b/i.test(
      html?.raw ?? ''
    );
  b.add('guest-path', 'A no-account / guest path is signaled', 10, guestPath);

  return b.build();
}
