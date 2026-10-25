// The headers every probe request carries: the Index's user agent, and whatever
// a deployment adds. A deployment that holds a Web Bot Auth signing key passes
// a function that signs each request, called from the request path, since a
// signature is short-lived by design. Set once at start-up.

import { INDEX_USER_AGENT } from './identity.ts';

/** The headers a probe request carries, for the URL it is sent to. */
export type RequestHeaders = (url: string) => Record<string, string>;

let headersFor: RequestHeaders = () => ({ 'user-agent': INDEX_USER_AGENT });

export function setRequestHeaders(headers: RequestHeaders): void {
  headersFor = headers;
}

/** The headers for one probe request to `url`. */
export function requestHeaders(url: string): Record<string, string> {
  return headersFor(url);
}
