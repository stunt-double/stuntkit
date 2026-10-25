import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pacedMap } from './pace.ts';

// A clock that only moves when the code under test sleeps or a task takes time.
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

test('never has more than `concurrency` requests in flight', async () => {
  let inFlight = 0;
  let peak = 0;
  const results = await pacedMap(
    Array.from({ length: 12 }, (_, i) => i),
    async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return i * 2;
    },
    { concurrency: 4, spacingMs: 0, deadline: Number.POSITIVE_INFINITY }
  );
  assert.equal(peak, 4);
  assert.deepEqual(
    results,
    Array.from({ length: 12 }, (_, i) => i * 2)
  );
});

test('a crawl delay runs one request at a time, that far apart', async () => {
  const clock = fakeClock();
  const starts: number[] = [];
  await pacedMap(
    [1, 2, 3],
    async () => {
      starts.push(clock.now());
      clock.advance(100);
    },
    { concurrency: 4, spacingMs: 1_000, deadline: 10_000, now: clock.now, sleep: clock.sleep }
  );
  assert.deepEqual(starts, [0, 1_000, 2_000]);
});

test('the first spacing counts from the last request the caller made', async () => {
  const clock = fakeClock();
  const starts: number[] = [];
  await pacedMap(
    [1],
    async () => {
      starts.push(clock.now());
    },
    {
      concurrency: 1,
      spacingMs: 500,
      deadline: 10_000,
      lastStart: 0,
      now: clock.now,
      sleep: clock.sleep,
    }
  );
  assert.deepEqual(starts, [500]);
});

test('stops starting requests once the budget is spent, leaving the rest undefined', async () => {
  const clock = fakeClock();
  const results = await pacedMap([1, 2, 3, 4, 5], async (n) => n, {
    concurrency: 4,
    spacingMs: 2_000,
    deadline: 3_000,
    now: clock.now,
    sleep: clock.sleep,
  });
  // Starts at 0 and 2000; the third would start at 4000, past the deadline.
  assert.deepEqual(results, [1, 2, undefined, undefined, undefined]);
});

test('an aborted signal stops new requests', async () => {
  const controller = new AbortController();
  controller.abort();
  const results = await pacedMap([1, 2], async (n) => n, {
    concurrency: 2,
    spacingMs: 0,
    deadline: Number.POSITIVE_INFINITY,
    signal: controller.signal,
  });
  assert.deepEqual(results, [undefined, undefined]);
});
