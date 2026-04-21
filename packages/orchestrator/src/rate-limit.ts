export interface RateLimiterOptions {
  max: number;             // allowed events per window
  windowMs: number;        // rolling window size
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

/**
 * Sliding-window rate limiter. Keeps an array of event timestamps per key,
 * pruned to (now - windowMs) on each check. Small N and small windows only —
 * fine for demo-scale arena traffic (5/min/IP).
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, number[]>();

  return {
    check(key) {
      const t = now();
      const cutoff = t - opts.windowMs;
      const arr = buckets.get(key) ?? [];
      while (arr.length && arr[0] < cutoff) arr.shift();
      if (arr.length >= opts.max) {
        const retryAfterMs = Math.max(1, arr[0] + opts.windowMs - t);
        return { allowed: false, remaining: 0, retryAfterMs };
      }
      arr.push(t);
      buckets.set(key, arr);
      return { allowed: true, remaining: opts.max - arr.length, retryAfterMs: 0 };
    }
  };
}
