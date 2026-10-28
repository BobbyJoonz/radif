import { ProviderInvalidOutput, ProviderTimeout, ProviderUnavailable } from "@/server/providers/types";

/**
 * One vocabulary for "what went wrong in a job", shared by `analyze.ts`,
 * `handlers.ts` and the retry decision. Keeping it here (instead of in the
 * handler) means the analysis can record an honest failure *and* let the queue
 * decide what to do, without either importing the other.
 */

/** The job cannot be fixed by retrying: the input is gone, or the work is unknown. */
export class UnrecoverableJob extends Error {
  readonly code = "job_unrecoverable";
  constructor(message = "این کار قابل اجرا نیست.") {
    super(message);
    this.name = "UnrecoverableJob";
  }
}

/** Is a retry likely to produce a different answer? */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof UnrecoverableJob) return false;
  // The provider answered in a shape the contract forbids; the same input will
  // produce the same garbage, so retrying is a way of burning money (brief §7).
  if (error instanceof ProviderInvalidOutput) return false;
  if (error instanceof ProviderTimeout) return true;
  if (error instanceof ProviderUnavailable) return true;
  // Anything else (a database blip, a socket reset) is treated as transient.
  return true;
}

/** A short, stable code for `AnalysisRun.errorCode` and job logs. */
export function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "string" && code.length > 0) return code;
  return "unexpected_error";
}

/** Prisma's unique-constraint violation — the answer is "it already exists". */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
