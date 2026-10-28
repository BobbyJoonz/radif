import { createHash } from "node:crypto";

/**
 * Dedupe keys — the mechanism that makes replay and retry boring.
 *
 * Three different problems, three different keys:
 *
 *  • A **Job** may be produced twice (an import retried, a worker restarted
 *    after a lease expired). `Job.@@unique([tenantId, dedupeKey])` makes the
 *    second insert a no-op instead of a second analysis.
 *
 *  • A **Task** may be produced for the same open issue on every message of a
 *    conversation. The key is scoped to the *thing being worked on* (an order, a
 *    conversation) plus the task type, so "payment reconcile for order X" exists
 *    once while it is open. When it closes, the key is released (the service sets
 *    `dedupeKey = null`) so a later, genuinely new issue can open a new task.
 *
 *  • An **AnalysisRun** may be produced for the same message when nothing that
 *    affects the decision has changed. The context hash covers tenant, model,
 *    prompt/rules version, the message and the verified state sent along with it.
 */

/** Bump when the questions sent to the provider change shape. Stored on every run. */
export const PROMPT_VERSION = "radif-analyze-v1";

/** Bump when the rules that turn output into tasks change. Stored on every run. */
export const RULES_VERSION = "radif-rules-v1";

/**
 * Deterministic JSON, so two identical contexts hash identically regardless of
 * key insertion order. Plain `JSON.stringify` does not promise that.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

/**
 * SHA-256 of a canonical object. Callers must include the tenant id — the hash
 * is stored on a tenant-scoped row and must never match across shops (two shops
 * can have the same message text and a different history).
 */
export function contextHash(parts: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(parts)).digest("hex");
}

export type TaskScope = {
  orderId?: string | null;
  conversationId?: string | null;
  customerId?: string | null;
  messageId?: string | null;
  /** Extra discrimination inside the same scope (e.g. `analysis_failed`). */
  discriminator?: string | null;
};

/**
 * `payment_reconcile|order:abc` — stable, readable in a query result, and long
 * enough to be unique inside a tenant. Scope order is deliberate: the narrowest
 * object wins, so two orders of the same customer never share a task.
 */
export function taskDedupeKey(type: string, scope: TaskScope): string {
  const parts = [type];
  if (scope.orderId) parts.push(`order:${scope.orderId}`);
  else if (scope.conversationId) parts.push(`conv:${scope.conversationId}`);
  else if (scope.customerId) parts.push(`cust:${scope.customerId}`);
  else if (scope.messageId) parts.push(`msg:${scope.messageId}`);
  if (scope.discriminator) parts.push(scope.discriminator);
  return parts.join("|");
}

/** `analyze:message-id` / `analyze:message-id:run-id` for a forced retry. */
export function jobDedupeKey(kind: string, id: string, suffix?: string | null): string {
  return suffix ? `${kind}:${id}:${suffix}` : `${kind}:${id}`;
}

/**
 * A short, human-readable tag used in logs and in the Evaluation screen. Never
 * contains message text: a hash is enough to correlate two runs.
 */
export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
