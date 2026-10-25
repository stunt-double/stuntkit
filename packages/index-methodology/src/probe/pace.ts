// How the quick-check probe spaces its requests to one site. The methodology
// page promises we cap how often we request pages from each site, so the probe
// never fans out more than a few requests at once, honours a robots.txt
// `Crawl-delay` by sending one request at a time that far apart, and stops
// starting requests once its time budget is spent rather than holding the
// caller past its deadline. What it did not get to is left `undefined`, for
// the caller to record as not fetched.
//
// Kept free of runtime imports so `node --test` can load it by path.

export type PaceOptions = {
  /** Requests in flight at once when there is no delay to honour. */
  concurrency: number;
  /** Minimum gap between the starts of two requests; above zero, requests run one at a time. */
  spacingMs: number;
  /** Epoch ms after which no new request starts. */
  deadline: number;
  /** When the caller's own last request to the site started, so the first spacing counts from it. */
  lastStart?: number;
  signal?: AbortSignal;
  /** Injectable for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` over `items` in order, paced as above. Results keep the order of
 * `items`; an item never started (budget spent, or aborted) is `undefined`.
 */
export async function pacedMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: PaceOptions
): Promise<Array<R | undefined>> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const results: Array<R | undefined> = new Array(items.length).fill(undefined);
  const spaced = opts.spacingMs > 0;
  const workers = spaced ? 1 : Math.max(1, Math.min(opts.concurrency, items.length));
  let next = 0;
  let lastStart: number | null = opts.lastStart ?? null;

  const worker = async () => {
    while (next < items.length) {
      if (opts.signal?.aborted) return;
      if (spaced && lastStart !== null) {
        const wait = lastStart + opts.spacingMs - now();
        // Waiting past the deadline would only be to start a request we are
        // not allowed to start.
        if (now() + Math.max(0, wait) > opts.deadline) return;
        if (wait > 0) await sleep(wait);
      }
      if (now() > opts.deadline || opts.signal?.aborted) return;
      const index = next++;
      lastStart = now();
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
