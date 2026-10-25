// Whether a site has sign-in or user accounts, from what the probe already
// fetched (no extra requests). Delegated access (MCP, OAuth, scoped API keys)
// is only scored for sites that have accounts to delegate; see
// CATEGORY_REQUIREMENTS in @stuntdouble/platform/index-benchmarks.
//
// Kept free of runtime imports so `node --test` can exercise it.

export type SignInSignals = {
  /** Every `href` on the homepage, as written. */
  anchors: ReadonlyArray<string>;
  /** The homepage's visible text. */
  text: string;
  /** Where the homepage landed, to resolve relative hrefs against. */
  pageUrl: string;
  /** OIDC or OAuth authorization server metadata is served. */
  authMetadata: boolean;
  /** `/signup` or `/register` exists. */
  accountPages: boolean;
};

export type SignInDetection = { hasSignIn: boolean; evidence: string };

// A path segment that is an account entry point: `/login`, `/sign-in`,
// `/account/...`, `/auth/login`, `/users/sign_up`.
const ACCOUNT_PATH_RE =
  /(?:^|\/)(?:log-?in|sign[-_]?in|sign[-_]?up|register|my-?account|account|accounts|auth|sso|oauth)(?:\/|$|\.)/i;

// A subdomain that is typically the signed-in product.
const ACCOUNT_HOST_RE =
  /^(?:app|apps|accounts?|auth|login|signin|my|portal|dashboard|console|id)\./i;

const ACCOUNT_TEXT_RE =
  /\b(?:log ?in|sign ?in|sign up|create (?:an |your )?account|my account|member login)\b/i;

export function detectSignIn(signals: SignInSignals): SignInDetection {
  if (signals.authMetadata) return { hasSignIn: true, evidence: 'OAuth or OIDC metadata served' };
  if (signals.accountPages) return { hasSignIn: true, evidence: 'signup or register page exists' };

  for (const href of signals.anchors) {
    let url: URL;
    try {
      url = new URL(href, signals.pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (ACCOUNT_PATH_RE.test(url.pathname)) {
      return { hasSignIn: true, evidence: `links to ${url.host}${url.pathname}` };
    }
    if (ACCOUNT_HOST_RE.test(url.host)) {
      return { hasSignIn: true, evidence: `links to ${url.host}` };
    }
  }

  const text = ACCOUNT_TEXT_RE.exec(signals.text);
  if (text) return { hasSignIn: true, evidence: `homepage says "${text[0]}"` };

  return { hasSignIn: false, evidence: 'no sign-in link, account page or auth metadata found' };
}
