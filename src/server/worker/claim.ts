import { prisma } from "@/server/db";

/**
 * The durable queue on Postgres (CONTRACTS §6 rule 13, brief §6).
 *
 * Claiming is one statement: `SELECT … FOR UPDATE SKIP LOCKED` inside a CTE feeds
 * an `UPDATE` that stamps the lease. Two workers polling at the same instant get
 * disjoint job sets — the database arbitrates, not a timing coincidence.
 *
 * A lease is what makes a crash recoverable:
 *   • a worker that dies mid-job leaves `status=running` with a `leaseUntil` in the
 *     past; the next poll picks it up again (`attempts` was already incremented, so
 *     the retry budget is honest);
 *   • a worker that is merely slow keeps renewing nothing — the lease is a fixed
 *     window, deliberately, so a wedged process cannot block the queue forever.
 *
 * Timestamps: the columns are `timestamp` holding UTC (Prisma writes UTC), while
 * this database's session timezone is `Asia/Tehran`. Comparing against `now()`
 * would therefore be wrong by 3.5 hours, so every instant below is passed as an
 * ISO string and converted explicitly with `AT TIME ZONE 'UTC'`.
 */

export type ClaimedJob = {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

type RawClaimedJob = {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

export type ClaimOptions = {
  owner: string;
  limit?: number;
  leaseMs?: number;
  now?: Date;
};

export const DEFAULT_LEASE_MS = 60_000;

export async function claimJobs(options: ClaimOptions): Promise<ClaimedJob[]> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 1, 50));
  const leaseUntil = new Date(now.getTime() + (options.leaseMs ?? DEFAULT_LEASE_MS));
  const nowIso = now.toISOString();
  const leaseIso = leaseUntil.toISOString();

  const rows = await prisma.$queryRaw<RawClaimedJob[]>`
    WITH candidate AS (
      SELECT "id"
      FROM "Job"
      WHERE "attempts" < "maxAttempts"
        AND (
          ("status" = 'pending' AND "runAt" <= (${nowIso}::timestamptz AT TIME ZONE 'UTC'))
          OR (
            "status" = 'running'
            AND ("leaseUntil" IS NULL OR "leaseUntil" < (${nowIso}::timestamptz AT TIME ZONE 'UTC'))
          )
        )
      ORDER BY "runAt" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "Job"
    SET "status" = 'running',
        "leaseOwner" = ${options.owner},
        "leaseUntil" = (${leaseIso}::timestamptz AT TIME ZONE 'UTC'),
        "attempts" = "attempts" + 1,
        "finishedAt" = NULL
    WHERE "id" IN (SELECT "id" FROM candidate)
    RETURNING "id", "tenantId", "type", "payload", "attempts", "maxAttempts"
  `;

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    payload: row.payload,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
  }));
}

/**
 * Push a claimed job's lease forward.
 *
 * A lease is a fixed window on purpose (a wedged process must not block the
 * queue), so a job that legitimately takes longer than one window has to say so
 * explicitly — this is the worker's heartbeat, not an automatic renewal. It only
 * extends a job this worker still owns: a stale worker whose lease was taken over
 * must not steal it back by accident.
 */
export async function extendLease(
  jobId: string,
  input: { owner: string; leaseMs?: number; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS));
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: "running", leaseOwner: input.owner },
    data: { leaseUntil },
  });
  return result.count > 0;
}

/**
 * The job finished and did what it promised.
 *
 * `owner` is a fence, not a label: a worker whose lease expired while it was busy
 * has already lost the job to another worker, and its late "done" must not mark
 * that second worker's in-flight attempt as succeeded. Fenced updates return
 * whether the caller still owned the lease.
 */
export async function completeJob(jobId: string, owner: string, now = new Date()): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: "running", leaseOwner: owner },
    data: { status: "succeeded", finishedAt: now, leaseOwner: null, leaseUntil: null, lastError: null },
  });
  return result.count > 0;
}

/**
 * The job failed but may be retried: put it back as `pending` with a later
 * `runAt` (exponential backoff) and release the lease so another worker can take it.
 */
export async function retryJob(
  jobId: string,
  input: { error: string; runAt: Date; owner: string; now?: Date },
): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, leaseOwner: input.owner },
    data: {
      status: "pending",
      leaseOwner: null,
      leaseUntil: null,
      lastError: input.error.slice(0, 500),
      runAt: input.runAt,
    },
  });
  return result.count > 0;
}

/** Out of attempts (or a failure retrying cannot fix): stop, keep the error for a human. */
export async function failJob(
  jobId: string,
  input: { error: string; status?: "failed" | "dead"; owner: string; now?: Date },
): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, leaseOwner: input.owner },
    data: {
      status: input.status ?? "dead",
      leaseOwner: null,
      leaseUntil: null,
      lastError: input.error.slice(0, 500),
      finishedAt: input.now ?? new Date(),
    },
  });
  return result.count > 0;
}

/**
 * Exponential backoff in milliseconds: 0.5s, 1s, 2s, 4s … capped at one minute.
 * Deliberately small: analysis is interactive work, not a nightly batch.
 */
export function backoffMs(attempts: number): number {
  return Math.min(60_000, 500 * 2 ** Math.max(0, attempts - 1));
}
