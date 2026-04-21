import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../src/rate-limit.js";

describe("rate limiter", () => {
  it("allows up to the limit within the window", () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 3, windowMs: 1000, now: () => now });
    expect(limiter.check("k")).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(limiter.check("k")).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });
    expect(limiter.check("k")).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 });
    const blocked = limiter.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => now });
    limiter.check("k"); limiter.check("k");
    expect(limiter.check("k").allowed).toBe(false);
    now = 1_200;
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("isolates buckets by key", () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});
