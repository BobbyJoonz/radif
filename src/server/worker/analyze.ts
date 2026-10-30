import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { contextHash, PROMPT_VERSION, RULES_VERSION } from "@/server/domain/dedupe";
import { detectIntents } from "@/server/domain/intents";
import { reasonText as reasonTextForCode, computePriority } from "@/server/domain/priority";
import { normalizeText } from "@/server/domain/normalize";
import { clampSpan, extractCandidates, type Candidate } from "@/server/domain/spans";
import { getDecisionProvider } from "@/server/providers";
import {
  DecisionOutputSchema,
  PROVIDER_TIMEOUT_MS,
  ProviderInvalidOutput,
  withTimeout,
  type DecisionOrderContext,
  type DecisionOutput,
  type DecisionRequest,
} from "@/server/providers/types";
import type { ClaimedJob } from "./claim";
import { UnrecoverableJob, errorCodeOf, isRetryableError } from "./errors";
import { detectInjection } from "./injection";
import { planAnalysis, candidateAmount, type PlanInput, type PlanOrder, type TaskPlan } from "./plan";
import { enqueueRecompute } from "./recompute";

/**
 * `analyze_message` — the one job type that turns a stored message into
 * suggestions, tasks and an honest `AnalysisRun` (CONTRACTS §5–§7).
 *
 * The order of operations is the contract:
 *
 *   1. load the message *inside its tenant* (a job cannot reach another shop);
 *   2. find the candidates in the text and the orders of that customer — the
 *      provider may only choose among what code already found;
 *   3. one provider call, hard timeout, output validated with Zod;
 *   4. `worker/plan.ts` decides what becomes a row; code enforces the rules the
 *      model must never be trusted with (payment stays `claimed`, no tracking code
 *      is invented, an ambiguous order is not a coin flip);
 *   5. one transaction writes suggestions, tasks, the claim, the run and the
 *      message state — so a crash cannot leave a half-analysed message;
 *   6. on any failure the message is *kept*, its state says what really happened,
 *      a human task is opened and the queue decides whether to retry.
 */

const MAX_RECENT_MESSAGES = 6;
const MAX_OPEN_ORDERS = 5;
const MAX_PRODUCTS = 8;

/** The reason code used for the human task that a failed analysis opens. */
const ANALYSIS_FAILED = "analysis_failed";

type AnalyzePayload = { messageId: string; runId: string | null };

export async function analyzeMessage(job: ClaimedJob, options: { now?: Date } = {}): Promise<void> {
  const now = options.now ?? new Date();
  const payload = readPayload(job.payload);

  const message = await prisma.message.findFirst({
    where: { id: payload.messageId, tenantId: job.tenantId },
    include: { conversation: { include: { customer: true } } },
  });
  if (!message) throw new UnrecoverableJob("پیام این کار پیدا نشد.");

  // A seller's own reply has no intents to extract; ingestion never queues one,
  // but a hand-made retry should not fabricate an analysis for it either.
  if (message.direction === "outbound") {
    await prisma.message.updateMany({
      where: { id: message.id, tenantId: job.tenantId },
      data: { analysisState: "done" },
    });
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: job.tenantId },
    include: { settings: true },
  });
  if (!tenant) throw new UnrecoverableJob("فروشگاه این کار پیدا نشد.");

  const run = await resolveRun(job, message.id, payload.runId, now);
  const startedAt = new Date();
  await markRunning(job.tenantId, message.id, run.id, startedAt);

  const customer = message.conversation.customer;
  const timeZone = tenant.timezone;
  const currency = tenant.currency;
  const settings = tenant.settings;

  let latencyMs: number | null = null;

  try {
    const normalizedText = normalizeText(message.text);
    const scan = detectIntents(message.text, normalizedText);
    const candidates = extractCandidates(message.text, normalizedText);
    const injection = detectInjection(normalizedText);

    const [recentMessages, orderRows, products, lastOutbound, firstUnanswered] = await Promise.all([
      prisma.message.findMany({
        where: {
          tenantId: job.tenantId,
          conversationId: message.conversationId,
          id: { not: message.id },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: MAX_RECENT_MESSAGES,
        select: { direction: true, text: true, occurredAt: true },
      }),
      prisma.order.findMany({
        where: {
          tenantId: job.tenantId,
          customerId: customer.id,
          status: { in: ["draft", "needs_review", "confirmed"] },
        },
        orderBy: [{ orderCreatedAt: "desc" }],
        take: MAX_OPEN_ORDERS,
        include: {
          items: { select: { qty: true, unitPriceMinor: true } },
          shipments: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { status: true, trackingCode: true, carrier: true },
          },
          paymentClaims: {
            orderBy: { claimedAt: "desc" },
            take: 1,
            select: { status: true, amountMinor: true },
          },
        },
      }),
      prisma.product.findMany({
        where: { tenantId: job.tenantId, active: true },
        orderBy: [{ infoConfirmedAt: "desc" }],
        take: MAX_PRODUCTS,
        select: { sku: true, titleFa: true, priceMinor: true, currency: true, infoValidUntil: true },
      }),
      prisma.message.findFirst({
        where: { tenantId: job.tenantId, conversationId: message.conversationId, direction: "outbound" },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { occurredAt: true },
      }),
      prisma.message.findFirst({
        where: { tenantId: job.tenantId, conversationId: message.conversationId, direction: "inbound" },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: { occurredAt: true },
      }),
    ]);

    const openOrders = orderRows.map(toPlanOrder);
    const contextOrders = orderRows.map(toDecisionOrder);
    const request = buildRequest({
      tenantId: job.tenantId,
      message,
      customer,
      normalizedText,
      candidates,
      recentMessages: recentMessages.reverse(),
      contextOrders,
      products: products.map((product) => ({
        sku: product.sku,
        titleFa: product.titleFa,
        priceMinor: product.priceMinor.toString(),
        currency: product.currency,
        fresh: product.infoValidUntil.getTime() > now.getTime(),
      })),
      timeZone,
      nowIso: now.toISOString(),
    });

    const provider = getDecisionProvider();
    const callStarted = Date.now();
    const raw = await withTimeout(provider.classify(request), PROVIDER_TIMEOUT_MS);
    latencyMs = Date.now() - callStarted;

    const parsedOutput = DecisionOutputSchema.safeParse(raw);
    if (!parsedOutput.success) {
      throw new ProviderInvalidOutput(
        "پاسخ سرویس تشخیص با قرارداد نمی‌خواند.",
        parsedOutput.error.issues,
      );
    }
    const output = parsedOutput.data;

    // The provider may name an order, but only one we offered it.
    const order = resolveOrder(output, openOrders);
    const ambiguousAssociation = order === null && openOrders.length > 1;

    const firstUnansweredAt =
      firstUnanswered && (!lastOutbound || firstUnanswered.occurredAt.getTime() > lastOutbound.occurredAt.getTime())
        ? firstUnanswered.occurredAt
        : null;

    const planInput: PlanInput = {
      now,
      message: { id: message.id, conversationId: message.conversationId },
      customer: { id: customer.id, displayName: customer.displayName },
      scan,
      candidates,
      output,
      openOrders,
      order,
      ambiguousAssociation,
      firstUnansweredAt,
      slaFirstReplyMin: settings?.slaFirstReplyMin ?? 120,
      slaShipMin: settings?.slaShipMin ?? 2880,
      injection,
    };
    const plan = planAnalysis(planInput);

    const claimAmount = claimedAmountOf({ output, candidates });

    await persist({
      job,
      message,
      run,
      plan,
      output,
      request,
      latencyMs,
      claimAmount,
      currency,
      now,
    });

    await enqueueRecompute({ tenantId: job.tenantId, conversationId: message.conversationId, messageId: message.id, now });
  } catch (error) {
    await recordFailure({ job, message, run, error, latencyMs, startedAt, now });
    throw error;
  }
}

// ───────────────────────────── loading ─────────────────────────────

function readPayload(payload: unknown): AnalyzePayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new UnrecoverableJob("payload این کار شیء نیست.");
  }
  const record = payload as Record<string, unknown>;
  const messageId = typeof record.messageId === "string" ? record.messageId : null;
  if (!messageId) throw new UnrecoverableJob("payload این کار شناسهٔ پیام ندارد.");
  return { messageId, runId: typeof record.runId === "string" ? record.runId : null };
}

/**
 * The run row this job belongs to. `ingest` creates one per message; a job that
 * arrived without a usable run id (a hand-made retry) gets a fresh row rather
 * than writing results with no provenance.
 */
async function resolveRun(
  job: ClaimedJob,
  messageId: string,
  runId: string | null,
  now: Date,
): Promise<{ id: string }> {
  if (runId) {
    const existing = await prisma.analysisRun.findFirst({
      where: { id: runId, tenantId: job.tenantId, messageId },
      select: { id: true },
    });
    if (existing) return existing;
  }

  const latest = await prisma.analysisRun.findFirst({
    where: { tenantId: job.tenantId, messageId },
    orderBy: [{ queuedAt: "desc" }],
    select: { id: true },
  });
  if (latest) return latest;

  return prisma.analysisRun.create({
    data: {
      tenantId: job.tenantId,
      messageId,
      provider: env.DECISION_PROVIDER,
      model: env.DECISION_PROVIDER === "mock" ? "mock-v1" : env.TYPESAFE_MODEL,
      promptVersion: PROMPT_VERSION,
      rulesVersion: RULES_VERSION,
      contextHash: contextHash({ tenantId: job.tenantId, messageId, PROMPT_VERSION, RULES_VERSION }),
      status: "running",
      queuedAt: now,
      startedAt: now,
      attempts: 1,
    },
    select: { id: true },
  });
}

/** `running` on both the message and the run, so the UI can say "in progress". */
async function markRunning(tenantId: string, messageId: string, runId: string, startedAt: Date): Promise<void> {
  await prisma.$transaction([
    prisma.message.updateMany({
      where: { id: messageId, tenantId },
      data: { analysisState: "running" },
    }),
    prisma.analysisRun.updateMany({
      where: { id: runId, tenantId },
      data: { status: "running", startedAt, finishedAt: null, errorCode: null, attempts: { increment: 1 } },
    }),
  ]);
}

type MessageForAnalysis = Prisma.MessageGetPayload<{
  include: { conversation: { include: { customer: true } } };
}>;

type ConversionInput = {
  tenantId: string;
  message: MessageForAnalysis;
  customer: { id: string; displayName: string; phone: string | null };
  normalizedText: string;
  candidates: Candidate[];
  recentMessages: { direction: "inbound" | "outbound"; text: string; occurredAt: Date }[];
  contextOrders: DecisionOrderContext[];
  products: { sku: string; titleFa: string; priceMinor: string; currency: string; fresh: boolean }[];
  timeZone: string;
  nowIso: string;
};

/** The request the provider sees: one tenant's facts, never the whole database. */
function buildRequest(input: ConversionInput): DecisionRequest {
  const hash = contextHash({
    tenantId: input.tenantId,
    messageId: input.message.id,
    promptVersion: PROMPT_VERSION,
    rulesVersion: RULES_VERSION,
    text: input.message.text,
    orders: input.contextOrders.map((order) => [order.id, order.status, order.paymentStatus, order.shipmentStatus]),
    recent: input.recentMessages.map((message) => message.text),
    timezone: input.timeZone,
  });

  return {
    tenantId: input.tenantId,
    messageId: input.message.id,
    promptVersion: PROMPT_VERSION,
    rulesVersion: RULES_VERSION,
    text: input.message.text,
    normalizedText: input.normalizedText,
    candidates: input.candidates,
    context: {
      customerName: input.customer.displayName,
      customerPhone: input.customer.phone ?? null,
      conversationRef: input.message.conversation.channelRef,
      recentMessages: input.recentMessages.map((message) => ({
        direction: message.direction,
        text: message.text,
        occurredAt: message.occurredAt.toISOString(),
      })),
      openOrders: input.contextOrders,
      products: input.products,
      timezone: input.timeZone,
      nowIso: input.nowIso,
    },
    contextHash: hash,
  };
}

// ───────────────────────────── ordering ─────────────────────────────

function toPlanOrder(order: {
  id: string;
  publicRef: string;
  status: string;
  confirmedAt: Date | null;
  totalMinor: bigint;
  currency: string;
  items: { qty: number; unitPriceMinor: bigint }[];
  shipments: { status: string; trackingCode: string | null }[];
  paymentClaims: { status: string }[];
}): PlanOrder {
  return {
    id: order.id,
    publicRef: order.publicRef,
    status: order.status as PlanOrder["status"],
    confirmedAt: order.confirmedAt,
    paymentStatus: (order.paymentClaims[0]?.status as PlanOrder["paymentStatus"]) ?? "unknown",
    shipmentStatus: (order.shipments[0]?.status as PlanOrder["shipmentStatus"]) ?? "not_ready",
    trackingCode: order.shipments[0]?.trackingCode ?? null,
    totalMinor: order.totalMinor,
    currency: order.currency,
    itemCount: order.items.length,
  };
}

function toDecisionOrder(order: {
  id: string;
  publicRef: string;
  status: string;
  confirmedAt: Date | null;
  totalMinor: bigint;
  currency: string;
  items: unknown[];
  shipments: { status: string; trackingCode: string | null }[];
  paymentClaims: { status: string }[];
}): DecisionOrderContext {
  return {
    id: order.id,
    publicRef: order.publicRef,
    status: order.status,
    paymentStatus: order.paymentClaims[0]?.status ?? "unknown",
    shipmentStatus: order.shipments[0]?.status ?? "not_ready",
    itemCount: order.items.length,
    totalMinor: order.totalMinor.toString(),
    currency: order.currency,
    trackingCode: order.shipments[0]?.trackingCode ?? null,
    dueAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
  };
}

/**
 * Which order the message is about, if any. The provider's answer is accepted
 * only when it names an order we offered; a single open order is the only
 * association code may make on its own. Two or more stays undecided — that is
 * rule 5, and a human resolves it.
 */
function resolveOrder(output: DecisionOutput, openOrders: readonly PlanOrder[]): PlanOrder | null {
  if (output.orderId) {
    const named = openOrders.find((order) => order.id === output.orderId);
    if (named) return named;
  }
  return openOrders.length === 1 ? openOrders[0]! : null;
}

/** The claimed amount, only when the message stated a unit (rule 7). */
function claimedAmountOf(input: { output: DecisionOutput; candidates: readonly Candidate[] }): bigint | null {
  const id = input.output.amount?.candidateId;
  if (!id) return null;
  const candidate = input.candidates.find((entry) => entry.id === id);
  if (!candidate) return null;
  return candidateAmount(candidate).amountMinor;
}

// ───────────────────────────── writing ─────────────────────────────

type PersistInput = {
  job: ClaimedJob;
  message: MessageForAnalysis;
  run: { id: string };
  plan: ReturnType<typeof planAnalysis>;
  output: DecisionOutput;
  request: DecisionRequest;
  latencyMs: number | null;
  claimAmount: bigint | null;
  currency: string;
  now: Date;
};

async function persist(input: PersistInput): Promise<void> {
  const { job, message, run, plan, output, request, latencyMs, claimAmount, currency, now } = input;
  const tenantId = job.tenantId;

  await prisma.$transaction(async (tx) => {
    // A retry must replace its own proposals, and a newer run supersedes the
    // proposals of an older one — but a human's accepted/corrected/rejected rows
    // are never touched (a review decision is not something analysis may undo).
    await tx.suggestion.deleteMany({ where: { tenantId, analysisRunId: run.id } });
    await tx.suggestion.deleteMany({
      where: { tenantId, sourceMessageId: message.id, reviewState: "proposed" },
    });

    if (plan.suggestions.length > 0) {
      await tx.suggestion.createMany({
        data: plan.suggestions.map((suggestion) => ({
          tenantId,
          analysisRunId: run.id,
          sourceMessageId: message.id,
          orderId: suggestion.orderId,
          customerId: suggestion.customerId,
          field: suggestion.field,
          proposedValue: suggestion.proposedValue as Prisma.InputJsonValue,
          candidateId: suggestion.candidateId,
          evidenceStart: clampSpan(suggestion.evidence, message.text.length)?.start ?? null,
          evidenceEnd: clampSpan(suggestion.evidence, message.text.length)?.end ?? null,
          confidence: suggestion.confidence,
          reviewState: suggestion.reviewState,
        })),
      });
    }

    if (plan.intents.includes("payment_claim")) {
      await recordPaymentClaim(tx, {
        tenantId,
        messageId: message.id,
        orderId: plan.tasks.find((task) => task.type === "payment_reconcile")?.orderId ?? null,
        amountMinor: claimAmount,
        currency,
        now,
      });
    }

    for (const task of plan.tasks) {
      await upsertTask(tx, tenantId, task, message.id, now);
    }

    if (plan.draft) {

      const draftOrderId = await createDraftOrder(tx, {

        tenantId,

        messageId: message.id,

        conversationId: message.conversationId,

        reason: plan.draft.reason,

        currency,

        now,

      });

    }

    // A message that failed before and succeeds now closes the manual-review task
    // it opened: the reason it existed is gone.
    await tx.task.updateMany({
      where: {
        tenantId,
        dedupeKey: failureTaskKey(message.id),
        status: { not: "done" },
      },
      data: {
        status: "done",
        closedAt: now,
        closeNote: "تحلیل با موفقیت انجام شد.",
        dedupeKey: null,
        dedupeState: "released",
      },
    });

    const runData: Prisma.AnalysisRunUpdateManyMutationInput = {
      status: "succeeded",
      contextHash: request.contextHash,
      errorCode: null,
      latencyMs,
      finishedAt: now,
      tokensIn: output.usage?.tokensIn ?? null,
      tokensOut: output.usage?.tokensOut ?? null,
      // Null, never zero: the mock reports no cost and "not measured" must be
      // printable as such (CONTRACTS §7).
      costMicroUsd: output.usage?.costMicroUsd ? BigInt(output.usage.costMicroUsd) : null,
      typedOutput: output as unknown as Prisma.InputJsonValue,
      ...(output.probabilities ? { probabilities: output.probabilities as Prisma.InputJsonValue } : {}),
    };
    await tx.analysisRun.updateMany({ where: { id: run.id, tenantId }, data: runData });

    await tx.message.updateMany({ where: { id: message.id, tenantId }, data: { analysisState: "done" } });

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "system",
        action: "analysis.completed",
        entityType: "Message",
        entityId: message.id,
        after: {
          provider: env.DECISION_PROVIDER,
          intents: plan.intents,
          suggestions: plan.suggestions.length,
          tasks: plan.tasks.length,
        } as Prisma.InputJsonValue,
        createdAt: now,
      },
    });
  });
}

/**
 * A customer saying "I paid" opens a claim at `claimed`. It is never `verified`:
 * that transition needs a named owner, a timestamp and a decision (rule 2).
 */
async function recordPaymentClaim(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    messageId: string;
    orderId: string | null;
    amountMinor: bigint | null;
    currency: string;
    now: Date;
  },
): Promise<void> {
  if (!input.orderId) return;

  const active = await tx.paymentClaim.findFirst({
    where: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      status: { in: ["claimed", "disputed"] },
    },
    select: { id: true },
  });
  if (active) return;

  await tx.paymentClaim.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      status: "claimed",
      amountMinor: input.amountMinor,
      currency: input.currency,
      claimedAt: input.now,
      sourceMessageId: input.messageId,
    },
  });
}

/**
 * Create the task, or refresh the one that already exists for the same issue.
 *
 * `@@unique([tenantId, dedupeKey])` is the guarantee behind rule 1/13: replaying
 * a message refreshes the active task instead of cloning a second one. A task
 * that a human already closed is not silently reopened — a genuinely new message
 * raises a new task under a key bound to that message, so the history stays true.
 */
async function upsertTask(
  tx: Prisma.TransactionClient,
  tenantId: string,
  plan: TaskPlan,
  messageId: string,
  now: Date,
): Promise<void> {
  const data = {
    type: plan.type,
    priority: plan.priority,
    title: plan.title,
    detail: plan.detail,
    reasonCode: plan.reasonCode,
    reasonText: plan.reasonText,
    dueAt: plan.dueAt,
    orderId: plan.orderId,
    customerId: plan.customerId,
    messageId,
  };

  const existing = await tx.task.findFirst({
    where: { tenantId, dedupeKey: plan.dedupeKey },
    select: { id: true, status: true },
  });

  if (!existing) {
    // A task for the same issue may already exist under a different key — a seed
    // or a human raised it, or an older rules version used another format. The
    // contract is "one active task set", not "one key per writer", so the existing
    // task wins and is left alone: its sentence was written next to the fact.
    const sameIssue = await tx.task.findFirst({
      where: {
        tenantId,
        type: plan.type,
        status: { not: "done" },
        OR: [
          { messageId },
          ...(plan.orderId ? [{ orderId: plan.orderId }] : []),
        ],
      },
      select: { id: true },
    });
    if (sameIssue) {
      // Keep the issue visible with the newest deadline, without rewriting what a
      // human (or the seed) decided it says.
      if (plan.dueAt) {
        await tx.task.updateMany({
          where: { id: sameIssue.id, tenantId, dueAt: null },
          data: { dueAt: plan.dueAt },
        });
      }
      return;
    }

    await tx.task.create({
      data: { tenantId, ...data, dedupeKey: plan.dedupeKey, createdBy: "system", createdAt: now },
    });
    return;
  }

  if (existing.status === "done") {
    const reopenedKey = `${plan.dedupeKey}|msg:${messageId}`;
    const reopened = await tx.task.findFirst({
      where: { tenantId, dedupeKey: reopenedKey },
      select: { id: true },
    });
    if (reopened) return;
    await tx.task.create({
      data: { tenantId, ...data, dedupeKey: reopenedKey, createdBy: "system", createdAt: now },
    });
    return;
  }

  await tx.task.updateMany({ where: { id: existing.id, tenantId }, data });
}

// ───────────────────────────── failure ─────────────────────────────

type FailureInput = {
  job: ClaimedJob;
  message: MessageForAnalysis;
  run: { id: string };
  error: unknown;
  latencyMs: number | null;
  startedAt: Date;
  now: Date;
};

/**
 * Control-flow rule 12: a failure never deletes the message. The run says what
 * went wrong, the message's analysis state says whether a human has to look at it
 * now (`needs_human`) or after a retry (`failed`), and a manual-review task is
 * opened once — the dedupe key makes it idempotent, and a later success closes it.
 */
async function recordFailure(input: FailureInput): Promise<void> {
  const { job, message, run, error, latencyMs, startedAt, now } = input;
  const tenantId = job.tenantId;
  const retryable = isRetryableError(error);
  const attemptsLeft = job.attempts < job.maxAttempts;
  const final = !retryable || !attemptsLeft;
  const invalidOutput = error instanceof ProviderInvalidOutput;

  const status = invalidOutput ? "invalid_output" : "failed";
  const analysisState = final ? "needs_human" : "failed";

  try {
    await prisma.$transaction([
      prisma.analysisRun.updateMany({
        where: { id: run.id, tenantId },
        data: {
          status,
          errorCode: errorCodeOf(error),
          finishedAt: new Date(),
          latencyMs,
          startedAt,
        },
      }),
      prisma.message.updateMany({
        where: { id: message.id, tenantId },
        data: { analysisState },
      }),
    ]);

    await ensureManualReviewTask(tenantId, message, now);
  } catch (secondary) {
    // Logging the truth must never hide the original error: the job still fails
    // with the provider's error, which is what the retry/dead decision needs.
    console.error("[worker] could not record analysis failure", {
      messageId: message.id,
      error: (secondary as Error).message,
    });
  }
}

/**
 * "تحلیل انجام نشد؛ بررسی دستی" — one open task per failed message, so the seller
 * sees the message in Today instead of a silent `failed` row.
 */
async function ensureManualReviewTask(tenantId: string, message: MessageForAnalysis, now: Date): Promise<void> {
  const dedupeKey = failureTaskKey(message.id);
  const existing = await prisma.task.findFirst({
    where: { tenantId, dedupeKey },
    select: { id: true, status: true },
  });
  if (existing) return;

  const customerName = message.conversation.customer.displayName;
  const priority = computePriority({
    taskType: "human_review",
    intents: ["other_unknown"],
    orderStatus: null,
    paymentStatus: null,
    shipmentStatus: null,
    hasOpenOrder: false,
    slaBreached: false,
    paymentMismatch: false,
    paymentClaimUnverified: false,
    amountUnitMissing: false,
    addressChangeRequested: false,
    addressChangeAfterShipment: false,
    ambiguousAssociation: false,
    trackingRequested: false,
    trackingCodePresent: false,
  }).priority;

  await prisma.task.create({
    data: {
      tenantId,
      type: "human_review",
      status: "open",
      priority,
      title: `بررسی دستی پیام — ${customerName}`,
      detail: "تحلیل خودکار انجام نشد؛ پیام ذخیره شده و باید دستی خوانده شود.",
      reasonCode: ANALYSIS_FAILED,
      reasonText: reasonTextForCode(ANALYSIS_FAILED),
      messageId: message.id,
      customerId: message.conversation.customerId,
      dedupeKey,
      createdBy: "system",
      createdAt: now,
    },
  });
}

function failureTaskKey(messageId: string): string {
  return `human_review|msg:${messageId}|${ANALYSIS_FAILED}`;
}

/**
 * A draft order from a purchase message (audit #4).
 *
 * Draft means draft: no confirmation, no payment, no shipment. It exists so the
 * seller has an object to review. Idempotent twice over — one open draft per
 * customer, and a publicRef derived from the message id — so a replay or a retry
 * cannot create a second one.
 */
async function createDraftOrder(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    messageId: string;
    conversationId: string;
    reason: string;
    currency: string;
    now: Date;
  },
): Promise<string | null> {
  const conversation = await tx.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
    select: { customerId: true },
  });
  if (!conversation) return null;

  const openDraft = await tx.order.findFirst({
    where: {
      tenantId: input.tenantId,
      customerId: conversation.customerId,
      status: { in: ["draft", "needs_review"] },
    },
    select: { id: true },
  });
  if (openDraft) return openDraft.id;

  const order = await tx.order.create({
    data: {
      tenantId: input.tenantId,
      customerId: conversation.customerId,
      publicRef: "DRAFT-" + input.messageId,
      status: "draft",
      currency: input.currency,
      totalMinor: 0n,
      notes: "پیش‌نویس خودکار از پیام؛ اقلام و مبلغ تأیید نشده‌اند.",
      orderCreatedAt: input.now,
    },
  });

  await tx.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      actorType: "system",
      action: "order.draft_created",
      entityType: "Order",
      entityId: order.id,
      orderId: order.id,
      after: { messageId: input.messageId, intent: input.reason } as Prisma.InputJsonValue,
    },
  });

  return order.id;
}
