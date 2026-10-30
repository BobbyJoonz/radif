import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { claimJobs } from "./claim";
import { runJob, type JobOutcome } from "./handlers";
import { recoverPendingAnalyses } from "./recover";
import { reapExpiredLeases } from "./recover";

/**
 * `pnpm worker:once` — drain the queue and exit.
 *
 * Same claim/lease/handle code as the long-running worker, but bounded: it runs
 * until no job is claimable, reports what happened, and exits with a code so CI
 * and the demo script can trust it:
 *
 *   • `0` — everything that was queued ran, nothing died;
 *   • `1` — at least one job ended `dead` (a real failure a human must see; the
 *     message is still stored, its `AnalysisRun` says why).
 *
 * Messages that were stored but never queued (a seed that writes rows directly)
 * are recovered first, so "drain the seeded queue" really means the seeded
 * messages get analysed, not just that an empty queue stays empty.
 */

const OWNER = `worker-once-${process.pid}-${randomUUID().slice(0, 6)}`;
const BATCH = 5;
const MAX_JOBS = 500;

function summaryLine(startedAt: number, counts: Record<JobOutcome, number>, recovered: number): string {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  return `[worker:once] drained in ${seconds}s · recovered ${recovered} · succeeded ${counts.succeeded} · retry ${counts.retry} · dead ${counts.dead}`;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const counts: Record<JobOutcome, number> = { succeeded: 0, retry: 0, dead: 0, "lease-lost": 0 };

  const recovered = await recoverPendingAnalyses();
  if (recovered > 0) {
    console.log(`[worker:once] queued ${recovered} stored message(s) that had no analysis job`);
  }

  // Jobs that were put back with a backoff are not re-claimed in this run: the
  // point of `once` is "drain what is ready", not "burn the retry budget of a
  // provider that is down".
  const seen = new Set<string>();
  let processed = 0;

  for (;;) {
    const jobs = await claimJobs({ owner: OWNER, limit: BATCH });
    if (jobs.length === 0) break;

    const fresh = jobs.filter((job) => !seen.has(job.id));
    if (fresh.length === 0) break; // only jobs this run already handled

    for (const job of fresh) {
      if (processed >= MAX_JOBS) break;
      seen.add(job.id);
      processed += 1;
      counts[await runJob(job, OWNER)] += 1;
    }
    if (processed >= MAX_JOBS) {
      console.warn(`[worker:once] stopped after ${MAX_JOBS} jobs; run it again to continue`);
      break;
    }
  }

  // What is left is either waiting for its backoff or out of attempts; say which.
  const remaining = await prisma.job.groupBy({
    by: ["status"],
    where: { status: { in: ["pending", "running"] } },
    _count: { _all: true },
  });
  const remainingText = remaining.map((row) => `${row.status}=${row._count._all}`).join(" ") || "none";

  console.log(summaryLine(startedAt, counts, recovered));
  console.log(`[worker:once] still queued (scheduled retry): ${remainingText}`);

  await prisma.$disconnect();
  process.exit(counts.dead > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error("[worker:once] fatal", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
