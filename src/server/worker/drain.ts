import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { claimJobs } from "./claim";
import { runJob, type JobOutcome } from "./handlers";
import { recoverPendingAnalyses, reapExpiredLeases } from "./recover";

/**
 * Draining the queue from a request instead of a daemon.
 *
 * The alert that started this work — "forwarding to destination channels stopped,
 * last file 13 hours ago" — is what a stalled queue looks like from outside: the
 * worker is a long-running process, and on a serverless host there is none, so jobs
 * sit `pending` forever.
 *
 * `drainQueue` is the same claim/lease/handle path as the daemon, bounded by a time
 * budget so it fits in a function invocation. A cron hitting it every minute turns
 * "the pipeline is asleep" into "the pipeline is one minute behind at worst".
 */

export type DrainResult = {
  recovered: number;
  reaped: number;
  claimed: number;
  outcomes: Record<JobOutcome, number>;
  ms: number;
};

const DEFAULT_BATCH = 3;
const DEFAULT_BUDGET_MS = 20_000;

export async function drainQueue(
  options: { maxJobs?: number; budgetMs?: number; owner?: string } = {},
): Promise<DrainResult> {
  const startedAt = Date.now();
  const budgetMs = Math.max(2_000, Math.min(options.budgetMs ?? DEFAULT_BUDGET_MS, 50_000));
  const maxJobs = Math.max(1, Math.min(options.maxJobs ?? 40, 200));
  const owner = options.owner ?? `drain-${process.pid}-${randomUUID().slice(0, 6)}`;

  // A crashed worker leaves `running` rows with an expired lease; a stored message
  // may have no job at all. Both are recoverable, and both are cheap to sweep.
  const reapedResult = await reapExpiredLeases(new Date()).catch(() => 0);
  const reaped = typeof reapedResult === "number" ? reapedResult : reapedResult.dead + reapedResult.requeued;
  const recovered = await recoverPendingAnalyses({ limit: 50 }).catch(() => 0);

  const outcomes: Record<JobOutcome, number> = { succeeded: 0, retry: 0, dead: 0, "lease-lost": 0 };
  let claimed = 0;

  while (claimed < maxJobs && Date.now() - startedAt < budgetMs) {
    const jobs = await claimJobs({ owner, limit: DEFAULT_BATCH });
    if (jobs.length === 0) break;
    claimed += jobs.length;
    for (const job of jobs) {
      const outcome = await runJob(job, owner);
      outcomes[outcome] += 1;
      if (Date.now() - startedAt >= budgetMs) break;
    }
  }

  return { recovered, reaped, claimed, outcomes, ms: Date.now() - startedAt };
}

export type QueueStats = {
  pending: number;
  running: number;
  stuck: number;
  dead: number;
  oldestPendingAgeSec: number | null;
  lastSucceededAt: string | null;
};

/**
 * What a monitor needs to answer "is the pipeline alive?" without reading logs:
 * how much is waiting, how old the oldest item is, and when anything last finished.
 */
export async function queueStats(tenantId?: string): Promise<QueueStats> {
  const scope = tenantId ? { tenantId } : {};
  const now = Date.now();

  const [pending, running, dead, oldest, lastSucceeded] = await Promise.all([
    prisma.job.count({ where: { ...scope, status: "pending" } }),
    prisma.job.count({ where: { ...scope, status: "running" } }),
    prisma.job.count({ where: { ...scope, status: { in: ["failed", "dead"] } } }),
    prisma.job.findFirst({
      where: { ...scope, status: "pending" },
      orderBy: { runAt: "asc" },
      select: { runAt: true },
    }),
    prisma.job.findFirst({
      where: { ...scope, status: "succeeded" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  const stuck = await prisma.job.count({
    where: { ...scope, status: "running", leaseUntil: { lt: new Date(now) } },
  });

  return {
    pending,
    running,
    stuck,
    dead,
    oldestPendingAgeSec: oldest ? Math.max(0, Math.round((now - oldest.runAt.getTime()) / 1000)) : null,
    lastSucceededAt: lastSucceeded?.finishedAt?.toISOString() ?? null,
  };
}
