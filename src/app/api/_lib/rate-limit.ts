import { errors } from "@/server/http";

/**
 * A deliberately tiny in-memory limiter for the three expensive routes (ingest,
 * import, analyze). It is per process, on purpose:
 *
 *  • it exists to stop a looping tab or an accidental script from hammering the
 *    queue, not to be a security control — the real limits belong to the proxy or
 *    the provider;
 *  • it is not persisted, so a restart forgets it. That is the honest behaviour for
 *    a single-node app; a shared limit would need Redis and is out of phase 2's
 *    scope.
 *
 * Keys include the user id, so one user's burst cannot lock another out.
 */
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 2_000;

const hits = new Map<string, number[]>();

/** True when the call is allowed; records it otherwise. */
export function allow(key: string, limit: number, now = Date.now()): boolean {
  const windowStart = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((at) => at > windowStart);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_BUCKETS) {
    for (const [bucket, times] of hits) {
      const last = times[times.length - 1];
      if (!last || last <= windowStart) hits.delete(bucket);
    }
  }
  return true;
}

/** Throttle or throw the one error shape the UI knows how to render. */
export function enforceRateLimit(key: string, limit: number): void {
  if (!allow(key, limit)) throw errors.rateLimited();
}

/** Tests drive the limiter directly; nothing in the app calls this. */
export function resetRateLimits(): void {
  hits.clear();
}
