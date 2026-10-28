import { z } from "zod";
import type { IntentKey } from "@/lib/dto";
import type { Candidate } from "@/server/domain/spans";

/**
 * The `DecisionProvider` contract (brief §7, CONTRACTS §7).
 *
 * A provider is a *structured decision* service: it classifies and it chooses
 * among candidates that code already found. It is never asked for free text, SQL,
 * a summary, or "just do the right thing with the order". Everything that changes
 * the database is decided by our own rules after the provider answers.
 *
 * The output is validated with Zod at the boundary (`DecisionOutputSchema`), so a
 * provider that returns garbage becomes `ProviderInvalidOutput` — a known state
 * that leaves the message stored and opens a human task — instead of an untyped
 * value leaking into the rules.
 */

export type ProviderName = "mock" | "typesafe";

export const PROVIDER_TIMEOUT_MS = 8_000;

export const INTENT_KEYS = [
  "product_question",
  "new_order",
  "repeat_order",
  "payment_claim",
  "order_status",
  "tracking_request",
  "address_change",
  "cancellation",
  "refund_or_return",
  "complaint",
  "other_unknown",
] as const satisfies readonly IntentKey[];

const intentSchema = z.enum(INTENT_KEYS);
const probabilitySchema = z.number().min(0).max(1).nullable();

/** One order the message could plausibly be about — the only ids a provider may name. */
export type DecisionOrderContext = {
  id: string;
  publicRef: string;
  status: string;
  paymentStatus: string;
  shipmentStatus: string;
  itemCount: number;
  totalMinor: string;
  currency: string;
  trackingCode: string | null;
  dueAt: string | null;
};

export const DecisionOutputSchema = z
  .object({
    primary: intentSchema,
    probability: probabilitySchema,
    flags: z
      .array(z.object({ intent: intentSchema, value: z.boolean(), probability: probabilitySchema }))
      .max(12),
    amount: z.object({ candidateId: z.string().nullable(), unit: z.enum(["toman", "rial"]).nullable() }).nullable(),
    phone: z.object({ candidateId: z.string().nullable() }).nullable(),
    orderRef: z.object({ candidateId: z.string().nullable() }).nullable(),
    /** Must be one of the ids in `request.context.openOrders`; anything else is discarded by the caller. */
    orderId: z.string().nullable(),
    address: z.object({ stated: z.boolean(), value: z.string().max(500).nullable() }).nullable(),
    /** Per-intent probabilities, for the Evaluation screen. Optional. */
    probabilities: z.record(z.string(), probabilitySchema).nullable(),
    /** Provider-reported usage. `null` means "not measured", never zero. */
    usage: z
      .object({
        tokensIn: z.number().int().nonnegative().nullable(),
        tokensOut: z.number().int().nonnegative().nullable(),
        /** Decimal string of micro-USD. Null when the provider does not report cost. */
        costMicroUsd: z.string().regex(/^[0-9]+$/).nullable(),
      })
      .nullable(),
  })
  .strict();

export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

/** What the provider is allowed to see: one tenant's context, never more. */
export type DecisionRequest = {
  tenantId: string;
  messageId: string;
  promptVersion: string;
  rulesVersion: string;
  /** Original text — the provider may read it but may not translate offsets. */
  text: string;
  /** Length-preserving normalised twin, for the provider's own matching. */
  normalizedText: string;
  candidates: Candidate[];
  context: {
    customerName: string;
    customerPhone: string | null;
    conversationRef: string;
    recentMessages: { direction: "inbound" | "outbound"; text: string; occurredAt: string }[];
    openOrders: DecisionOrderContext[];
    products: { sku: string; titleFa: string; priceMinor: string; currency: string; fresh: boolean }[];
    timezone: string;
    /** The shop's own time, so a provider cannot invent a server-local deadline. */
    nowIso: string;
  };
  contextHash: string;
};

export interface DecisionProvider {
  readonly name: ProviderName;
  readonly model: string;
  classify(request: DecisionRequest, options?: { signal?: AbortSignal }): Promise<DecisionOutput>;
}

/** The provider cannot be used at all (no key, no network, provider down). Retryable. */
export class ProviderUnavailable extends Error {
  readonly code = "provider_unavailable";
  constructor(message = "سرویس تشخیص در دسترس نیست.") {
    super(message);
    this.name = "ProviderUnavailable";
  }
}

/** The provider took longer than `PROVIDER_TIMEOUT_MS`. Retryable, with backoff. */
export class ProviderTimeout extends Error {
  readonly code = "provider_timeout";
  constructor(message = "پاسخ سرویس تشخیص دیر رسید.") {
    super(message);
    this.name = "ProviderTimeout";
  }
}

/**
 * The provider answered, but not in the shape the contract allows. Retrying the
 * same input would produce the same garbage, so the worker treats this as a
 * non-retryable failure and asks a human.
 */
export class ProviderInvalidOutput extends Error {
  readonly code = "provider_invalid_output";
  constructor(
    message = "پاسخ سرویس تشخیص معتبر نبود.",
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ProviderInvalidOutput";
  }
}

/** Run a provider call with a hard timeout; a slow provider must not hold a lease forever. */
export async function withTimeout<T>(promise: Promise<T>, ms = PROVIDER_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProviderTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
