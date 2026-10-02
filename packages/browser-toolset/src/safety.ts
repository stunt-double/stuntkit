// A promise about an agent's sessions, enforced rather than asked for: "they
// never pay or sign up for real: no payments go through and no real
// registration details are ever entered". Benchmark sessions on third-party
// sites (such as the Stunt Double Index, https://index.stuntdouble.io) make
// that promise. A prompt line is a request the model under test may ignore,
// and ignoring it is exactly the behaviour a benchmark may be measuring, so
// the tools refuse instead.
//
// Everything here is off unless a caller opts in (`BrowserSafetyOptions`):
// agents testing their own product fill forms with test data on purpose, and
// must keep doing so.
//
// No runtime imports, so it runs under `node --test` and inside the page script.

export type BrowserSafetyOptions = {
  /**
   * Refuse typing into a password or payment card field (including a card
   * field inside a payment provider's iframe), and refuse any typed or filled
   * value that is a Luhn-valid card number, whatever field it is headed for.
   */
  refuseSensitiveInput: boolean;
  /**
   * Refuse a click, or Enter in a field, that would submit a form which pays,
   * subscribes or creates an account. A link that only navigates (a "Sign up"
   * link to the sign-up page) is always allowed: reaching the form is the task.
   */
  blockSubmit?: boolean;
};

/**
 * Every guard on: what benchmark sessions on sites that are not yours should
 * run with. Named for the Stunt Double Index (https://index.stuntdouble.io),
 * where every session runs with it.
 */
export const INDEX_SESSION_SAFETY: BrowserSafetyOptions = {
  refuseSensitiveInput: true,
  blockSubmit: true,
};

/** The text an agent gets back when a guard refuses: a result, not an error. */
export const SAFETY_REFUSAL_SUFFIX =
  'This session is not allowed to pay, subscribe, create an account or enter passwords or card details. Do not try another way round: report what you observed and what the next step would be, then carry on or call done.';

/**
 * Payment providers' own hosts, as suffix-matched domains (an entry covers
 * itself and its subdomains). Stripe is listed by host rather than as
 * `stripe.com` so its marketing site and docs stay reachable, which matters
 * when stripe.com is itself the site under test.
 */
export const PAYMENT_PROVIDER_DOMAINS: readonly string[] = [
  'js.stripe.com',
  'api.stripe.com',
  'checkout.stripe.com',
  'm.stripe.network',
  'hooks.stripe.com',
  'paypal.com',
  'paypalobjects.com',
  'adyen.com',
  'adyenpayments.com',
  'braintreegateway.com',
  'braintree-api.com',
  'pay.google.com',
  'payments.google.com',
  'applepay.cdn-apple.com',
  'klarna.com',
  'klarnaservices.com',
  'afterpay.com',
  'checkout.com',
  'squareup.com',
  'squarecdn.com',
  'paddle.com',
  'lemonsqueezy.com',
];

/** Whether `host` is `domain` or one of its subdomains. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase().replace(/^\*\./, '');
  return h === d || h.endsWith(`.${d}`);
}

export function isPaymentProviderHost(
  host: string,
  domains: readonly string[] = PAYMENT_PROVIDER_DOMAINS
): boolean {
  return domains.some((d) => hostMatchesDomain(host, d));
}

/** The last two labels of a host: crude, but every provider above is a plain `.com`/`.network`. */
function baseDomain(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').split('.').slice(-2).join('.');
}

/**
 * The payment hosts to block for a session visiting `targetHost`. A provider's
 * own site is exempt, or visiting paypal.com would block the page under test.
 */
export function paymentBlocklistFor(targetHost: string): string[] {
  const target = baseDomain(targetHost);
  return PAYMENT_PROVIDER_DOMAINS.filter((d) => baseDomain(d) !== target);
}

/** The Luhn checksum every payment card number carries. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum > 0 && sum % 10 === 0;
}

/**
 * Whether a value contains something that reads as a card number: 13 to 19
 * digits, optionally grouped by spaces or dashes, passing Luhn. The Luhn check
 * is what keeps phone numbers, order ids and postcodes from tripping it.
 */
export function containsCardNumber(value: string): boolean {
  const runs = value.match(/\d(?:[ -]?\d){12,18}/g) ?? [];
  return runs.some((run) => {
    const digits = run.replace(/[ -]/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

/**
 * Field names, ids and labels that mark a payment card field. Kept loose on
 * separators (`card_number`, `cardNumber`, `card-number`) and tight on words,
 * so "gift card" and "expires in" do not trip it.
 */
export const CARD_FIELD_PATTERN =
  /card.?(?:number|num|no\b)|cc.?(?:num|number|no\b|exp|csc|cvv|cvc)|credit.?card|debit.?card|\bcvc\b|\bcvv2?\b|\bcsc\b|security.?code|card.?(?:verification|code)|expir(?:y|ation)|exp.?(?:date|month|year)|\bmm.?\/?.?yy\b|card.?holder|name.?on.?card|\bpan\b/i;

/**
 * Accessible names of buttons that take money. Anchored at the start of the
 * label and checked on any non-link button, since checkouts built without a
 * `<form>` still pay on a plain button; the lookahead keeps billing toggles
 * ("Pay monthly") and provider choices ("Pay with PayPal") clickable.
 */
export const PAYMENT_ACTION_PATTERN =
  /^(?:pay(?:\s+now)?\b(?!\s+(?:monthly|annually|yearly|per|by|with|later|in|over|as))|purchase\b|complete (?:my |your |the )?(?:purchase|order|payment|booking)\b|place (?:my |your |the )?order\b|confirm (?:and|&) pay\b|confirm (?:order|purchase|payment|booking)\b|submit (?:order|payment)\b|book and pay\b)/i;

/**
 * Accessible names of controls that commit money or an identity. Checked only
 * on controls that submit a form, never on links, so the "Sign up" link that
 * leads to the sign-up page still works.
 */
export const COMMIT_ACTION_PATTERN =
  /\b(?:pay|purchase|place (?:my |your |the )?order|complete (?:my |your |the )?(?:order|purchase|booking)|subscribe|buy now|sign ?up|create (?:an |my |your )?account|register|join now|start (?:my |your )?(?:free )?trial|confirm (?:order|booking)|submit order)\b/i;

/**
 * The narrower set for a button outside any form on a page showing a password
 * or card field. "Sign up" and "Subscribe" are left out on purpose: outside a
 * form they usually open the sign-up form, which is what the task asks for.
 */
export const FORMLESS_COMMIT_PATTERN =
  /^(?:create (?:an |my |your )?account|complete (?:my |your )?(?:registration|sign ?up)|start (?:my |your )?(?:free )?trial)\b/i;

/** What the page script reports about an element the agent is about to act on. */
export type ElementFacts = {
  /** Lower-case tag name, e.g. "input", "button", "a", "iframe". */
  tag: string;
  type: string;
  autocomplete: string;
  name: string;
  id: string;
  ariaLabel: string;
  placeholder: string;
  /** The accessible name as `read_page` would print it. */
  label: string;
  role: string;
  /** A link with a real destination (not `#` or `javascript:`). */
  isNavigatingLink: boolean;
  /** A control that submits its form when clicked. */
  isSubmit: boolean;
  /** A button-like control that is not a link. */
  isButton: boolean;
  /** For an iframe, its `src`; the field is inside it when focus is. */
  iframeSrc: string;
  iframeTitle: string;
  inForm: boolean;
  /**
   * The enclosing form holds a password field, a card field or a payment
   * provider's iframe; outside any form, the page shows one.
   */
  formSensitive: boolean;
  /** The label of the form's first submit control, for Enter-to-submit. */
  formSubmitLabel: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Why typing into this element is refused, or null. */
export function sensitiveFieldReason(f: ElementFacts): string | null {
  if (f.type === 'password' || /(?:current|new)-password/.test(f.autocomplete)) {
    return 'That is a password field.';
  }
  if (/\bcc-/.test(f.autocomplete)) return 'That is a payment card field.';
  if (f.tag === 'iframe') {
    if (isPaymentProviderHost(hostOf(f.iframeSrc)))
      return 'That is a payment provider’s card field.';
    if (CARD_FIELD_PATTERN.test(`${f.iframeTitle} ${f.name}`))
      return 'That is a payment card field.';
  }
  const text = [f.name, f.id, f.ariaLabel, f.placeholder, f.label].join(' ');
  if (f.tag !== 'a' && f.tag !== 'button' && CARD_FIELD_PATTERN.test(text)) {
    return 'That is a payment card field.';
  }
  return null;
}

/** Why clicking this element is refused, or null. */
export function submitReason(f: ElementFacts): string | null {
  if (f.isNavigatingLink) return null;
  if (f.isSubmit && f.formSensitive) {
    return 'That would submit a form holding a password or payment card field.';
  }
  if (f.isSubmit && COMMIT_ACTION_PATTERN.test(f.label)) {
    return `That would submit "${f.label.slice(0, 60)}".`;
  }
  // A single-page sign-up with no <form>: the button is the submit.
  if (f.isButton && !f.inForm && f.formSensitive && FORMLESS_COMMIT_PATTERN.test(f.label.trim())) {
    return `That would press "${f.label.slice(0, 60)}".`;
  }
  if (f.isButton && PAYMENT_ACTION_PATTERN.test(f.label.trim())) {
    return `That would press "${f.label.slice(0, 60)}".`;
  }
  return null;
}

/** Why pressing Enter in this (focused) element is refused, or null. */
export function enterSubmitReason(f: ElementFacts): string | null {
  if (!f.inForm || f.tag === 'textarea') return null;
  if (f.formSensitive) return 'Enter would submit a form holding a password or payment card field.';
  if (COMMIT_ACTION_PATTERN.test(f.formSubmitLabel)) {
    return `Enter would submit "${f.formSubmitLabel.slice(0, 60)}".`;
  }
  return null;
}

export function refusalText(reason: string): string {
  return `Refused: ${reason} ${SAFETY_REFUSAL_SUFFIX}`;
}
