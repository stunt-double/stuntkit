// Vendored verbatim from the Stunt Double monorepo, packages/platform/src/checklists/failure-cause.ts
// at ee0ccb43c, so a local run is scored by exactly the code that scores a cloud run. Do not
// edit it here: change the source and copy it again. ponytail: a copy until the scoring is
// published as @stunt-double/checklist, which both sides can then import.

/**
 * Why a checklist run failed, as stored in `checklist_runs.failure_cause`.
 *
 * A failed run used to say one thing for three different problems, and only
 * one of them is ours to fix:
 *
 *   - `site_unreachable`  the site under test could not be loaded at all (DNS,
 *                         a refused or reset connection, a TLS failure, or a
 *                         page that never finished loading).
 *   - `site_error`        the site answered, with a server error (5xx) on the
 *                         page the run starts from.
 *   - `service`           our own machinery broke: the browser, the model, the
 *                         worker, or the task itself.
 *
 * None of the three is a verdict on the checklist. That is `outcome`, which is
 * only ever written by a run that finished. Readers keep them apart: a site
 * that is down is not a failed checklist, and a red "Failed" beside it sends
 * people hunting a regression that was never observed.
 *
 * Only a 5xx counts as a site error. A 4xx on the start page is often the page
 * itself working (a bot challenge that resolves after a script runs, a sign-in
 * wall the actor is meant to go through), so the run carries on and the actor
 * judges what it sees.
 *
 * Pure module: no runtime imports, so `node --test` can load it directly.
 */

export const CHECKLIST_RUN_FAILURE_CAUSES = ['site_unreachable', 'site_error', 'service'] as const;

export type ChecklistRunFailureCause = (typeof CHECKLIST_RUN_FAILURE_CAUSES)[number];

export function isChecklistRunFailureCause(value: unknown): value is ChecklistRunFailureCause {
  return (
    typeof value === 'string' && (CHECKLIST_RUN_FAILURE_CAUSES as readonly string[]).includes(value)
  );
}

/** Null for anything unknown, including a run that predates the column. */
export function resolveRunFailureCause(value: unknown): ChecklistRunFailureCause | null {
  return isChecklistRunFailureCause(value) ? value : null;
}

/** Badge labels, shared so the runs list, the report and the shared page agree. */
export const RUN_FAILURE_CAUSE_LABELS: Record<ChecklistRunFailureCause, string> = {
  site_unreachable: 'Site unreachable',
  site_error: 'Site error',
  service: 'Internal error',
};

/** One line each, for a tooltip or the line beside a badge. */
export const RUN_FAILURE_CAUSE_DESCRIPTIONS: Record<ChecklistRunFailureCause, string> = {
  site_unreachable:
    'The site could not be loaded, so no checks ran. This is a problem with the site, not the checklist.',
  site_error:
    'The site returned a server error, so no checks ran. This is a problem with the site, not the checklist.',
  service: 'Something went wrong on our side while running the checklist. It is not the site.',
};

/** A failure of the site under test, found before the actor started. */
export type SiteFailure = {
  cause: Extract<ChecklistRunFailureCause, 'site_unreachable' | 'site_error'>;
  /**
   * Curated wording for `checklist_runs.summary` and notifications. Never the
   * raw browser message: that is a caught error, and it never becomes text a
   * customer reads.
   */
  summary: string;
};

/**
 * Network error codes that mean the site could not be reached, mapped to what
 * they mean in plain words. Chromium's `net::ERR_*` names, which both
 * Browserbase and a local Chrome report from `goto`.
 */
const UNREACHABLE_CODES: ReadonlyArray<[RegExp, string]> = [
  [/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ENOTFOUND/i, 'its address could not be found'],
  [/ERR_CONNECTION_REFUSED|ECONNREFUSED/i, 'it refused the connection'],
  [
    /ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|ECONNRESET/i,
    'it dropped the connection',
  ],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ETIMEDOUT/i, 'it did not respond in time'],
  [/ERR_SSL_|ERR_CERT_/i, 'its secure connection failed'],
  [
    /ERR_ADDRESS_UNREACHABLE|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|EHOSTUNREACH/i,
    'it could not be reached',
  ],
  [/ERR_TOO_MANY_REDIRECTS/i, 'it redirected too many times'],
];

/**
 * Read a failed start-page navigation as a site failure, or null when it was
 * not one (the browser connection itself closing is ours, not the site's).
 */
export function classifyNavigationError(error: unknown): SiteFailure | null {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  if (!message) return null;

  for (const [pattern, reason] of UNREACHABLE_CODES) {
    if (pattern.test(message)) {
      return { cause: 'site_unreachable', summary: `The site could not be loaded: ${reason}.` };
    }
  }
  // A navigation that never reached `domcontentloaded`. Matched on the
  // navigation wording so a timeout elsewhere (a CDP call to a dead browser)
  // is not blamed on the site.
  if (/navigation|goto|page\.load|load event/i.test(message) && /time(d)?\s?out/i.test(message)) {
    return {
      cause: 'site_unreachable',
      summary: 'The site could not be loaded: it did not finish loading in time.',
    };
  }
  return null;
}

/**
 * Read the start page's HTTP status as a site failure, or null when the page
 * can be tested. Null for an unknown status (a navigation that produced no
 * response object, such as a same-document change), which is not evidence of
 * anything.
 */
export function classifyStartResponse(status: number | null | undefined): SiteFailure | null {
  if (typeof status !== 'number' || !Number.isFinite(status)) return null;
  if (status >= 500 && status <= 599) {
    return {
      cause: 'site_error',
      summary: `The site returned a server error (HTTP ${status}) on the start page.`,
    };
  }
  return null;
}

/**
 * The HTTP status from whatever `goto` returned, or null. The driver types the
 * response as `unknown` because the two browser backends return different
 * objects; both expose `status()`.
 */
export function responseStatus(response: unknown): number | null {
  if (typeof response !== 'object' || response === null) return null;
  const status = (response as { status?: unknown }).status;
  if (typeof status === 'function') {
    try {
      const value = (status as () => unknown).call(response);
      return typeof value === 'number' ? value : null;
    } catch {
      return null;
    }
  }
  return typeof status === 'number' ? status : null;
}
