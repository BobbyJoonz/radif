import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { claimJobs } from "./claim";
import { runJob } from "./handlers";
import { recoverPendingAnalyses } from "./recover";
import { reapExpiredLeases } from "./recover";

/**
 * The worker process — `pnpm worker` (CONTRACTS §6 rule 13, brief §6).
 *
 * One loop, no in-memory queue: every unit of work is a `Job` row claimed with
 * `FOR UPDATE SKIP LOCKED` and a lease, so several workers can run side by side
 * and a killed one loses nothing but the seconds it was holding.
 *
 * Shutdown is graceful: on SIGINT/SIGTERM the loop stops between jobs, lets the
 * one in flight finish (it is a small, bounded unit of work), and disconnects the
 * pool. A hard kill is also fine — the lease expires and the next poll retries.
 */

const OWNER = `worker-${process.pid}-${randomUUID().slice(0, 6)}`;
const BATCH = 5;
const POLL_MS = Math.max(250, env.WORKER_POLL_MS);

let stopping = false;

function requestStop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal} — finishing the current job, then stopping`);
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(
    `[worker] ${OWNER} started · poll ${POLL_MS}ms · provider ${env.DECISION_PROVIDER} · mode ${env.APP_MODE}`,
  );

  const recovered = await recoverPendingAnalyses();
  if (recovered > 0) {
    console.log(`[worker] recovered ${recovered} stored message(s) that had no analysis job`);
  }

  while (!stopping) {
    try {
      const jobs = await claimJobs({ owner: OWNER, limit: BATCH });
      if (jobs.length === 0) {
        await sleep(POLL_MS);
        continue;
      }
      for (const job of jobs) {
        if (stopping) break;
        await runJob(job, OWNER);
      }
    } catch (error) {
      // The database went away (or a transient connection error): back off and
      // keep the process alive — a worker that exits on a blip makes the demo
      // look broken, and nothing is lost while it waits.
      console.error("[worker] poll failed", (error as Error).message);
      await sleep(Math.min(10_000, POLL_MS * 2));
    }
  }

  await prisma.$disconnect();
  console.log(`[worker] ${OWNER} stopped`);
}

main().catch(async (error) => {
  console.error("[worker] fatal", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
