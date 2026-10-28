import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/server/http";
import { allow, enforceRateLimit, resetRateLimits } from "@/app/api/_lib/rate-limit";

/**
 * The limiter is small on purpose; the things worth pinning down are that it counts
 * per key, forgets old hits at the window edge, and answers with the same 429
 * envelope as every other route.
 */
describe("in-memory rate limiter", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows up to the limit inside the window and refuses the next call", () => {
    const now = 1_000_000;
    expect(allow("user_a", 2, now)).toBe(true);
    expect(allow("user_a", 2, now)).toBe(true);
    expect(allow("user_a", 2, now)).toBe(false);
  });

  it("counts each key separately, so one user cannot lock another out", () => {
    const now = 1_000_000;
    expect(allow("user_a", 1, now)).toBe(true);
    expect(allow("user_a", 1, now)).toBe(false);
    expect(allow("user_b", 1, now)).toBe(true);
  });

  it("forgets hits once they fall outside the one-minute window", () => {
    const start = 1_000_000;
    expect(allow("user_a", 1, start)).toBe(true);
    expect(allow("user_a", 1, start + 30_000)).toBe(false);
    expect(allow("user_a", 1, start + 61_000)).toBe(true);
  });

  it("throws the shared 429 error envelope", () => {
    enforceRateLimit("user_a", 1);
    try {
      enforceRateLimit("user_a", 1);
      throw new Error("expected a rate limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(429);
      expect((error as ApiError).code).toBe("rate_limited");
    }
  });
});
