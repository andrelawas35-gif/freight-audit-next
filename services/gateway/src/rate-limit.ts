/**
 * rate-limit.ts — In-memory fixed-window failure counter.
 *
 * Used to slow API-key guessing on /v1/*. Only failed attempts are recorded,
 * so a client with a valid key is never throttled by its own traffic.
 * State is per process: with N gateway instances the effective limit is N x max.
 */

export interface FailureLimiter {
  /** Seconds the caller must wait, or 0 if it is not blocked. Does not record anything. */
  retryAfterSeconds(key: string): number;
  /** Record one failed attempt for `key`. */
  recordFailure(key: string): void;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createFailureLimiter(opts: {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
}): FailureLimiter {
  const { maxFailures, windowMs } = opts;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  // Bound memory: a scan from many source addresses must not grow the map forever.
  const sweep = (t: number): void => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= t) buckets.delete(key);
    }
  };

  return {
    retryAfterSeconds(key) {
      const bucket = buckets.get(key);
      const t = now();
      if (!bucket || bucket.resetAt <= t || bucket.count < maxFailures) return 0;
      return Math.max(1, Math.ceil((bucket.resetAt - t) / 1000));
    },
    recordFailure(key) {
      const t = now();
      if (buckets.size >= 10_000) sweep(t);
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + windowMs });
      } else {
        bucket.count += 1;
      }
    },
  };
}
