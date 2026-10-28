import {
  DEFAULT_LEASE_MS,
  backoffMs,
  completeJob,
  extendLease,
  failJob,
  retryJob,
  type ClaimedJob,
} from "./claim";
import { analyzeMessage } from "./analyze";
import { recomputeConversation } from "./recompute";
import { UnrecoverableJob, errorCodeOf, isRetryableError } from "./errors";

/**
 * The job runner: dispatch → outcome → queue state.
 *
 * Everything about *durability* lives here, and nothing about *meaning*: a handler
 * either finishes or throws, and this file decides — from the error type and the
 * attempt count — whether the job is retried later, marked dead, or completed.
 *
 *   • a retryable failure before `maxAttempts` → `pending` again, with exponential
 *     backoff (`claim.ts`), so a flapping provider cannot spin the queue;
 *   • a non-retryable failure (invalid provider output, unknown job type) or the
 *     last attempt → `dead`, with the error kept on the row for a human;
 *   • success → `succeeded`.
 *
 * The message itself is never deleted and never left ambiguous: the analysis
 * records its own state before it throws (see `analyze.ts`).
 */

export type JobOutcome = "succeeded" | "retry" | "dead";

/** A job may legitimately take longer than the default claim window. */
const WORKER_LEASE_MS = Math.max(DEFAULT_LEASE_MS, 120_000);

export async function runJob(job: ClaimedJob, workerId: string): Promise<JobOutcome> {
  const startedAt = Date.now();
  const label = `${job.type}#${job.id.slice(-6)}`;

  // The lease was granted at claim time; renew it before the work starts so a slow
  // provider call cannot outlive the lease and hand the job to a second worker.
  await extendLease(job.id, { owner: workerId, leaseMs: WORKER_LEASE_MS });

  try {
    await dispatch(job);
    await completeJob(job.id);
    console.log(`[worker] ok ${label} attempt=${job.attempts} ${Date.now() - startedAt}ms`);
    return "succeeded";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = isRetryableError(error);
    const attemptsLeft = job.attempts < job.maxAttempts;

    if (retryable && attemptsLeft) {
      const runAt = new Date(Date.now() + backoffMs(job.attempts));
      await retryJob(job.id, { error: message, runAt });
      console.warn(
        `[worker] retry ${label} attempt=${job.attempts}/${job.maxAttempts} in ${Math.round(
          (runAt.getTime() - Date.now()) / 1000,
        )}s · ${errorCodeOf(error)} · ${message}`,
      );
      return "retry";
    }

    await failJob(job.id, { error: message, status: "dead" });
    console.error(
      `[worker] dead ${label} attempt=${job.attempts}/${job.maxAttempts} · ${errorCodeOf(error)} · ${message}`,
    );
    return "dead";
  }
}

async function dispatch(job: ClaimedJob): Promise<void> {
  switch (job.type) {
    case "analyze_message":
      return analyzeMessage(job);
    case "recompute_conversation":
      return recomputeConversation(job);
    case "build_draft":
    case "send_outbound":
      // Both exist in the queue enum so the outbox contract is explicit, but
      // nothing enqueues them in phase 1–2 (outbound is `preview` only). A job of
      // this type is a programming error, not a transient failure, so it dies
      // immediately instead of retrying five times.
      throw new UnrecoverableJob(`نوع کار «${job.type}» در این فاز پیاده‌سازی نشده است.`);
    default:
      throw new UnrecoverableJob(`نوع کار ناشناخته: ${job.type}`);
  }
}
