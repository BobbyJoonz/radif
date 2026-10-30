import { prisma } from "@/server/db";
import { enqueueAnalysis } from "@/server/ingestion/ingest";
import { isUniqueViolation } from "./errors";

/**
 * Recovery sweep: stored messages that were never queued for analysis.
 *
 * Ingestion writes the message, its `AnalysisRun` and its `Job` in one
 * transaction, so an orphan is not supposed to happen. It does happen anyway in
 * one honest case: demo/seed data written straight into the tables (or a
 * `db:seed` that only stores messages), and a job row that was pruned. The
 * worker's guarantee is that such a message is *recoverable* — not that it is
 * invisible (CONTRACTS §6 rule 13).
 *
 * The sweep is cheap and idempotent: only messages with `analysisState=pending`
 * and no run at all are considered, and a message with an active job is skipped.
 * The tenant comes from the message row itself — never from a caller.
 */

const DEFAULT_LIMIT = 200;

export async function recoverPendingAnalyses(options: { limit?: number; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();

  const messages = await prisma.message.findMany({
    where: {
      direction: "inbound",
      analysisState: "pending",
      analysisRuns: { none: {} },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: Math.max(1, options.limit ?? DEFAULT_LIMIT),
    select: { id: true, tenantId: true },
  });
  if (messages.length === 0) return 0;

  let enqueued = 0;
  for (const message of messages) {
    const active = await prisma.job.findFirst({
      where: {
        tenantId: message.tenantId,
        type: "analyze_message",
        status: { in: ["pending", "running"] },
        payload: { path: ["messageId"], equals: message.id },
      },
      select: { id: true },
    });
    if (active) continue;

    try {
      await prisma.$transaction((tx) => enqueueAnalysis(tx, message.tenantId, message.id, now));
      enqueued += 1;
    } catch (error) {
      // A concurrent sweep or a worker that just claimed it: the unique job key
      // says "already queued", which is the answer we wanted anyway.
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  return enqueued;
}

/**
 * Stale-lease reaper (audit: some jobs stayed `running` forever).
 *
 * A worker that dies leaves `status=running` with a lease that never renews. The
 * lease is the promise that another worker may take the job; without this sweep
 * the promise was never enforced and the job was invisible to every queue.
 *
 * Exhausted attempts are dead-lettered (visible, not looped); the rest go back to
 * pending with the reason recorded. Idempotent: it only touches expired leases.
 */
export async function reapExpiredLeases(now = new Date()): Promise<{ dead: number; requeued: number }> {
  const expired = { status: "running" as const, leaseUntil: { lt: now } };
  const dead = await prisma.job.updateMany({
    where: { ...expired, attempts: { gte: prisma.job.fields.maxAttempts } },
    data: { status: "dead", finishedAt: now, lastError: "lease_expired_max_attempts", leaseOwner: null, leaseUntil: null },
  });
  const requeued = await prisma.job.updateMany({
    where: { ...expired, attempts: { lt: prisma.job.fields.maxAttempts } },
    data: { status: "pending", lastError: "lease_expired", leaseOwner: null, leaseUntil: null },
  });
  return { dead: dead.count, requeued: requeued.count };
}
