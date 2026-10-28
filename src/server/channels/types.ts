import type { IncomingMessage } from "@/lib/dto";
import type { CanonicalField } from "./csv";

/**
 * `ChannelAdapter` — the seam between "how a message arrived" and "what the
 * server does with it" (CONTRACTS §1, brief §6).
 *
 * An adapter only parses. It never writes to the database, never decides
 * intentions and never sees a tenant id from the client. Its whole job is to turn
 * a file (or a replay script) into `IncomingMessage[]` plus an honest report of
 * the rows it could not read — a report the Import screen shows verbatim.
 */

export type RejectedRow = {
  /** 1-based row number as the user sees it in the file. */
  row: number;
  /** Persian, short, actionable. */
  reason: string;
};

export type ColumnReport = {
  /** Raw header text as it appeared in the file. */
  key: string;
  label: string;
  /** Which canonical field it was mapped onto, or null when it is ignored. */
  mappedTo: CanonicalField | null;
};

export type ParseInput = {
  content: string;
  format: "json" | "csv";
  /**
   * Stable identity of this import (e.g. the filename). Used to build a
   * deterministic message key for rows that have no message id — a hash of the
   * text alone would collide when a customer really sends the same words twice.
   */
  importRef: string;
  /** Fallback channel account when a row does not carry one. */
  accountRef: string;
  /** The tenant's timezone, for timestamps without an offset. */
  timeZone: string;
  now?: Date;
};

export type ChannelParseOutput = {
  /** Validated messages, ready for ingestion. */
  messages: IncomingMessage[];
  rejected: RejectedRow[];
  columns: ColumnReport[];
  /** Data rows seen, accepted or not. */
  totalRows: number;
  /** A fatal problem with the file as a whole (unclosed quote, invalid JSON). */
  fatal: string | null;
};

export interface ChannelAdapter {
  readonly channel: "file" | "replay" | "instagram";
  parse(input: ParseInput): ChannelParseOutput;
}

/** Raised for a file-level failure the user must fix, not for a single bad row. */
export class ChannelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelParseError";
  }
}

/** Turn a Zod issue into a short Persian reason for the rejected-row list. */
export function rejectionReason(error: unknown): string {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (issues && issues.length > 0) {
    const issue = issues[0]!;
    const path = issue.path.filter((part) => part !== undefined).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  }
  return (error as Error).message ?? "ردیف خوانده نشد.";
}
