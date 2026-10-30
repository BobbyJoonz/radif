import { prisma } from "@/server/db";
import type { SessionContext } from "@/server/session";
import { errors } from "@/server/http";
import type {
  AuditEntryDTO,
  OrderDetailDTO,
  OrderItemDTO,
  OrderRow,
  OrderStatusValue,
  OrderSummaryDTO,
  PaymentClaimDTO,
  PaymentStatusValue,
  ShipmentDTO,
  ShipmentStatusValue,
  SuggestionDTO,
} from "@/lib/dto";
import type { Prisma } from "@/generated/prisma/client";
import type { TaskType } from "@/generated/prisma/enums";
import {
  assertOrderTransition,
  assertPaymentTransition,
  assertShipmentTransition,
  canShipOrder,
  canVerifyPayments,
  isOrderEditable,
  isPaymentClaimVerifiable,
  normaliseTrackingCode,
} from "@/server/domain/state";
import { sumLines } from "@/server/domain/money";
import { buildReplyPreview } from "@/server/domain/reply";
import { taskDedupeKey } from "@/server/domain/dedupe";
import { taskInclude, toQueueRow } from "./tasks";
import { previewReply as previewReplyFromInbox } from "./inbox";

/**
 * Orders — the write side of the three state machines (CONTRACTS §4, §6 rules
 * 2, 3, 6, 8, 14).
 *
 * The invariants this file exists to hold:
 *
 *  • **Three machines stay three tables.** `Order.status`, the claim rows and the
 *    shipment row are read and written separately. Confirming a draft touches the
 *    order row only: it never verifies a payment and never advances a shipment
 *    (rule 3). A payment is `claimed` until an owner verifies it (rule 2).
 *  • **Optimistic locking.** Every state write carries `version` and matches it in
 *    the `WHERE`; a mismatch is 409, never a silent overwrite (rule 14).
 *  • **A tracking code is data, never evidence.** We do not invent one (rule 6),
 *    and holding one does not mean the parcel was delivered.
 *  • **Post-shipment address change is a human decision.** It is refused and a
 *    `human_review` task is opened; the shipment itself is untouched (rule 8).
 */

// ───────────────────────────── reads ─────────────────────────────

/** The include that can answer "what state is this order in?". Shared with customers. */
export const orderStateInclude = {
  customer: { select: { id: true, displayName: true } },
  items: {
    select: { id: true, titleSnapshot: true, qty: true, unitPriceMinor: true, currency: true, productId: true },
    orderBy: { id: "asc" },
  },
  paymentClaims: {
    select: {
      id: true,
      status: true,
      amountMinor: true,
      currency: true,
      claimedAt: true,
      verifiedAt: true,
      disputeReason: true,
      sourceMessageId: true,
      verifiedBy: { select: { name: true } },
    },
    orderBy: { claimedAt: "desc" },
  },
  shipments: {
    select: {
      id: true,
      status: true,
      carrier: true,
      trackingCode: true,
      shippedAt: true,
      deliveredAt: true,
      pausedReason: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  },
} satisfies Prisma.OrderInclude;

type OrderState = Prisma.OrderGetPayload<{ include: typeof orderStateInclude }>;
type ClaimState = OrderState["paymentClaims"][number];
type ShipmentState = OrderState["shipments"][number];

/**
 * The claim rows folded into one payment status. `refunded` and `verified` are
 * final and outrank a newer assertion; `unknown` means "nobody ever said
 * anything", which is different from `disputed`.
 */
export function aggregatePaymentStatus(claims: readonly { status: PaymentStatusValue }[]): PaymentStatusValue {
  const has = (status: PaymentStatusValue) => claims.some((claim) => claim.status === status);
  if (has("refunded")) return "refunded";
  if (has("verified")) return "verified";
  if (has("disputed")) return "disputed";
  if (has("claimed")) return "claimed";
  return "unknown";
}

/** The newest shipment row is the truth; no row at all means `not_ready`. */
export function latestShipmentStatus(shipments: readonly { status: ShipmentStatusValue }[]): ShipmentStatusValue {
  return shipments[0]?.status ?? "not_ready";
}

export function toOrderSummaryDTO(order: OrderState): OrderSummaryDTO {
  return {
    id: order.id,
    publicRef: order.publicRef,
    customerName: order.customer.displayName,
    status: order.status,
    paymentStatus: aggregatePaymentStatus(order.paymentClaims),
    shipmentStatus: latestShipmentStatus(order.shipments),
    totalMinor: order.totalMinor.toString(),
    currency: order.currency,
    itemCount: order.items.reduce((count, item) => count + item.qty, 0),
    dueAt: null,
    createdAt: order.orderCreatedAt.toISOString(),
    version: order.version,
  };
}

/**
 * The Orders screen. `needsReview` is true when the order is explicitly in review
 * or when an unreviewed suggestion points at it — the two facts that make the row
 * stand out, both read from the database rather than guessed.
 */
export async function listOrders(
  ctx: SessionContext,
  opts: { status?: OrderStatusValue } = {},
): Promise<OrderRow[]> {
  const orders = await prisma.order.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: orderStateInclude,
    orderBy: [{ orderCreatedAt: "desc" }],
    take: 300,
  });
  if (orders.length === 0) return [];

  const proposed = await prisma.suggestion.groupBy({
    by: ["orderId"],
    where: {
      tenantId: ctx.tenant.id,
      reviewState: "proposed",
      orderId: { in: orders.map((order) => order.id) },
    },
    _count: { _all: true },
  });
  const proposedByOrder = new Map<string, number>();
  for (const row of proposed) {
    if (row.orderId) proposedByOrder.set(row.orderId, row._count._all);
  }

  return orders.map((order) => ({
    ...toOrderSummaryDTO(order),
    needsReview: order.status === "needs_review" || (proposedByOrder.get(order.id) ?? 0) > 0,
  }));
}

/** One order, with everything the detail screen shows. `null` = not in this tenant. */
export async function getOrder(ctx: SessionContext, orderId: string): Promise<OrderDetailDTO | null> {
  const tenantId = ctx.tenant.id;
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      ...orderStateInclude,
      customer: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          phoneVerifiedAt: true,
          identities: { select: { externalRef: true } },
        },
      },
    },
  });
  if (!order) return null;

  const [tasks, audit, suggestions, replyPreview] = await Promise.all([
    prisma.task.findMany({
      where: { tenantId, orderId: order.id },
      include: taskInclude,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.auditEvent.findMany({
      where: { tenantId, orderId: order.id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.suggestion.findMany({
      where: { tenantId, orderId: order.id },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    getReplyPreview(ctx, order.id).catch(() => null),
  ]);

  const now = new Date();
  return {
    order: {
      ...toOrderSummaryDTO(order),
      notes: order.notes,
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
    },
    customer: {
      id: order.customer.id,
      displayName: order.customer.displayName,
      phone: order.customer.phone,
      phoneVerified: order.customer.phoneVerifiedAt !== null,
      handles: order.customer.identities.map((identity) => identity.externalRef),
    },
    items: order.items.map(toOrderItemDTO),
    paymentClaims: order.paymentClaims.map(toPaymentClaimDTO),
    shipment: order.shipments[0] ? toShipmentDTO(order.shipments[0]) : null,
    tasks: tasks.map((task) => toQueueRow(task, now)),
    audit: audit.map(toAuditEntryDTO),
    suggestions: suggestions.map(toSuggestionDTO),
    replyPreview,
  };
}

// ───────────────────────────── draft edits & confirmation ─────────────────────────────

export type DraftItemInput = {
  title: string;
  qty: number;
  unitPriceMinor: string;
  sku?: string | null;
};

export type UpdateDraftInput = {
  version: number;
  patch: { items?: DraftItemInput[]; notes?: string | null };
};

/**
 * Edit a draft (or a draft in review). Confirmed and cancelled orders are refused:
 * editing a record other screens already versioned would break the very lock this
 * route advertises, so the answer is a conflict the UI can explain.
 */
export async function updateDraft(
  ctx: SessionContext,
  orderId: string,
  input: UpdateDraftInput,
): Promise<{ version: number }> {
  const tenantId = ctx.tenant.id;

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw errors.notFound("این سفارش پیدا نشد.");

    if (!isOrderEditable(order.status)) {
      throw errors.conflict("این سفارش تأیید یا لغو شده و دیگر قابل ویرایش نیست؛ برای تغییر، سفارش تازه بسازید.");
    }
    if (order.version !== input.version) {
      throw errors.conflict("این سفارش جای دیگری تغییر کرده است؛ صفحه را تازه کنید.");
    }

    let totalMinor = order.totalMinor;
    if (input.patch.items) {
      const items = await resolveItems(tx, tenantId, input.patch.items, order.currency);
      totalMinor = sumLines(items.map((item) => ({ qty: item.qty, unitPriceMinor: item.unitPriceMinor })));
      await tx.orderItem.deleteMany({ where: { orderId: order.id, tenantId } });
      if (items.length > 0) {
        await tx.orderItem.createMany({
          data: items.map((item) => ({
            tenantId,
            orderId: order.id,
            productId: item.productId,
            titleSnapshot: item.title,
            qty: item.qty,
            unitPriceMinor: item.unitPriceMinor,
            currency: order.currency,
          })),
        });
      }
    }

    // The lock lives in the WHERE, not in the read above: a concurrent writer
    // between our SELECT and UPDATE loses the race here and gets a 409.
    const updated = await tx.order.updateMany({
      where: { id: order.id, tenantId, version: input.version },
      data: {
        version: { increment: 1 },
        totalMinor,
        ...(input.patch.notes !== undefined ? { notes: input.patch.notes } : {}),
      },
    });
    if (updated.count === 0) throw errors.conflict("این سفارش جای دیگری تغییر کرده است؛ صفحه را تازه کنید.");

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "order.draft_updated",
        entityType: "order",
        entityId: order.id,
        orderId: order.id,
        before: { version: order.version, totalMinor: order.totalMinor.toString() },
        after: {
          version: input.version + 1,
          totalMinor: totalMinor.toString(),
          items: input.patch.items ? input.patch.items.length : undefined,
        },
      },
    });

    return { version: input.version + 1 };
  });
}

/**
 * Confirming a draft finalises *the paperwork only*. Payment stays `unknown` and
 * the shipment stays `not_ready`: both are separate acts with their own evidence
 * (rule 3). There is no claim insert and no shipment insert in this function, on
 * purpose.
 */
export async function confirmDraft(
  ctx: SessionContext,
  orderId: string,
  input: { version: number; acknowledgeFreeOrder?: boolean },
): Promise<OrderSummaryDTO> {
  const tenantId = ctx.tenant.id;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw errors.notFound("این سفارش پیدا نشد.");

    try {
      assertOrderTransition(order.status, "confirmed");
    } catch (error) {
      throw errors.conflict((error as Error).message);
    }
    if (order.version !== input.version) {
      throw errors.conflict("این سفارش جای دیگری تغییر کرده است؛ صفحه را تازه کنید.");
    }

    // Audit's P0: an automatically created draft with no items and a default
    // total of zero used to confirm, producing an order that says nothing.
    // A stage-specific completeness gate is the only thing that makes a draft
    // "actionable" rather than "present".
    const items = await tx.orderItem.findMany({
      where: { tenantId, orderId: order.id },
      select: { qty: true, unitPriceMinor: true, currency: true },
    });
    const complete = items.filter((item) => item.qty > 0 && item.currency.trim().length > 0);
    if (complete.length === 0) {
      throw errors.invalid("این پیش‌نویس هیچ قلم معتبری ندارد؛ ابتدا اقلام سفارش را کامل کنید.");
    }
    const computedTotal = complete.reduce(
      (sum, item) => sum + BigInt(item.qty) * item.unitPriceMinor,
      0n,
    );
    // A genuinely free order is allowed, but only after an explicit human
    // acknowledgement — never because the total happened to default to zero.
    if (computedTotal === 0n && input.acknowledgeFreeOrder !== true) {
      throw errors.invalid("مبلغ این سفارش صفر است؛ اگر واقعاً رایگان است، آن را صریح تأیید کنید.");
    }

    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        tenantId,
        version: input.version,
        status: { in: ["draft", "needs_review"] },
      },
      data: {
        status: "confirmed",
        confirmedAt: now,
        confirmedById: ctx.user.id,
        // The stored total follows the items that were actually confirmed.
        totalMinor: computedTotal,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) throw errors.conflict("این سفارش جای دیگری تغییر کرده است؛ صفحه را تازه کنید.");

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "order.confirmed",
        entityType: "order",
        entityId: order.id,
        orderId: order.id,
        before: { status: order.status, version: order.version },
        after: { status: "confirmed", version: input.version + 1 },
      },
    });
  });

  const confirmed = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: orderStateInclude,
  });
  if (!confirmed) throw errors.notFound("این سفارش پیدا نشد.");
  return toOrderSummaryDTO(confirmed);
}

// ───────────────────────────── payments ─────────────────────────────

export type CreatePaymentClaimInput = {
  amountMinor?: string | null;
  currency?: string | null;
  sourceMessageId?: string | null;
};

/**
 * Record what the customer *said*, never what the bank did: the row is always
 * `claimed` (rule 2). `amountMinor: null` is a valid claim ("واریز کردم" with no
 * figure) and is not the same as zero.
 */
export async function createPaymentClaim(
  ctx: SessionContext,
  orderId: string,
  input: CreatePaymentClaimInput,
): Promise<PaymentClaimDTO> {
  const tenantId = ctx.tenant.id;
  const now = new Date();

  const claim = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true, status: true, currency: true },
    });
    if (!order) throw errors.notFound("این سفارش پیدا نشد.");
    if (order.status === "cancelled") {
      throw errors.conflict("سفارش لغو شده است؛ اعلام پرداخت برای آن ثبت نمی‌شود.");
    }

    let amountMinor: bigint | null = null;
    if (input.amountMinor !== null && input.amountMinor !== undefined) {
      if (!/^[0-9]+$/.test(input.amountMinor)) {
        throw errors.invalid("مبلغ باید عدد صحیح (ریال) باشد.");
      }
      amountMinor = BigInt(input.amountMinor);
    }

    let sourceMessageId: string | null = null;
    if (input.sourceMessageId) {
      const message = await tx.message.findFirst({
        where: { id: input.sourceMessageId, tenantId },
        select: { id: true },
      });
      if (!message) throw errors.notFound("پیام مبدأ پیدا نشد.");
      sourceMessageId = message.id;
    }

    const created = await tx.paymentClaim.create({
      data: {
        tenantId,
        orderId: order.id,
        status: "claimed",
        amountMinor,
        currency: input.currency?.trim() || order.currency,
        claimedAt: now,
        sourceMessageId,
      },
      include: { verifiedBy: { select: { name: true } } },
    });

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "payment.claim_created",
        entityType: "payment_claim",
        entityId: created.id,
        orderId: order.id,
        after: { status: created.status, amountMinor: created.amountMinor?.toString() ?? null },
      },
    });

    return created;
  });

  return {
    id: claim.id,
    status: claim.status,
    amountMinor: claim.amountMinor?.toString() ?? null,
    currency: claim.currency,
    claimedAt: claim.claimedAt.toISOString(),
    verifiedAt: claim.verifiedAt?.toISOString() ?? null,
    verifiedByName: claim.verifiedBy?.name ?? null,
    disputeReason: claim.disputeReason,
    sourceMessageId: claim.sourceMessageId,
  };
}

export type VerifyPaymentInput = {
  decision: "verified" | "disputed";
  reason?: string | null;
};

/**
 * Verify or dispute a claim. **Owner only, enforced here as well as on the route**:
 * a route that forgets `requireRole` must still not let an operator move money
 * (rule 10). The database CHECK constraint repeats the same rule, which is why
 * `verifiedAt`/`verifiedById` are always written together.
 */
export async function verifyPayment(
  ctx: SessionContext,
  orderId: string,
  claimId: string,
  input: VerifyPaymentInput,
): Promise<PaymentClaimDTO> {
  if (!canVerifyPayments(ctx.role)) {
    throw errors.forbidden("تأیید یا رد پرداخت فقط با نقش «مالک» انجام می‌شود.");
  }

  const tenantId = ctx.tenant.id;
  const now = new Date();
  const reason = input.reason?.trim() || null;
  if (input.decision === "disputed" && !reason) {
    throw errors.invalid("برای رد پرداخت، دلیل را بنویسید.");
  }

  const claim = await prisma.$transaction(async (tx) => {
    const existing = await tx.paymentClaim.findFirst({ where: { id: claimId, orderId, tenantId } });
    if (!existing) throw errors.notFound("این اعلام پرداخت پیدا نشد.");
    if (!isPaymentClaimVerifiable(existing.status)) {
      throw errors.conflict("این اعلام پرداخت قبلاً بررسی شده است.");
    }
    try {
      assertPaymentTransition(existing.status, input.decision);
    } catch (error) {
      throw errors.conflict((error as Error).message);
    }

    const updated = await tx.paymentClaim.update({
      where: { id: existing.id },
      data: {
        status: input.decision,
        verifiedAt: now,
        verifiedById: ctx.user.id,
        disputeReason: input.decision === "disputed" ? reason : null,
      },
      include: { verifiedBy: { select: { name: true } } },
    });

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: input.decision === "verified" ? "payment.claim_verified" : "payment.claim_disputed",
        entityType: "payment_claim",
        entityId: updated.id,
        orderId,
        before: { status: existing.status },
        after: { status: updated.status, reason },
      },
    });

    return updated;
  });

  return {
    id: claim.id,
    status: claim.status,
    amountMinor: claim.amountMinor?.toString() ?? null,
    currency: claim.currency,
    claimedAt: claim.claimedAt.toISOString(),
    verifiedAt: claim.verifiedAt?.toISOString() ?? null,
    verifiedByName: claim.verifiedBy?.name ?? null,
    disputeReason: claim.disputeReason,
    sourceMessageId: claim.sourceMessageId,
  };
}

// ───────────────────────────── shipments ─────────────────────────────

export type UpdateShipmentInput = {
  status?: ShipmentStatusValue;
  trackingCode?: string | null;
  carrier?: string | null;
  /**
   * A new address the customer announced. There is no address column in phase 1–2
   * (the parcel is shipped by the seller's own carrier system), so this is not
   * stored on the order: it is the trigger for rule 8 — refuse after shipping,
   * open a task for a human before shipping.
   */
  addressChange?: string | null;
};

/**
 * Advance the parcel. Nothing here reads a tracking code as proof: `delivered` is
 * only ever set explicitly, and `shipped` needs a confirmed order plus a ship time.
 *
 * Rule 8: an address change after the parcel left the building is refused, and it
 * leaves a `human_review` task behind so the request is not lost — the shipment row
 * itself is not touched.
 */
export async function updateShipment(
  ctx: SessionContext,
  orderId: string,
  input: UpdateShipmentInput,
): Promise<ShipmentDTO> {
  const tenantId = ctx.tenant.id;
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
      include: { shipments: { orderBy: { updatedAt: "desc" }, take: 1 } },
    });
    if (!order) throw errors.notFound("این سفارش پیدا نشد.");

    const current = order.shipments[0] ?? null;
    const currentStatus: ShipmentStatusValue = current?.status ?? "not_ready";

    // ── rule 8: an address change after shipping is a human's call ──
    const addressChange = input.addressChange?.trim() || null;
    if (addressChange && (currentStatus === "shipped" || currentStatus === "delivered")) {
      await ensureTask(tx, {
        tenantId,
        type: "human_review",
        priority: "P1",
        title: `بررسی تغییر آدرس پس از ارسال — سفارش ${order.publicRef}`,
        detail: "مشتری آدرس را پس از ارسال عوض کرده است؛ مرسوله بازفرستادن یا هماهنگی با مشتری تصمیم انسان است.",
        reasonCode: "address_change_after_shipment",
        reasonText: "آدرس بعد از ارسال عوض شده؛ مرسوله را دستی بررسی کنید.",
        orderId: order.id,
        customerId: order.customerId,
        dedupeKey: taskDedupeKey("human_review", { orderId: order.id, discriminator: "address_after_shipment" }),
      });
      return {
        kind: "refused" as const,
        message: "مرسولهٔ این سفارش ارسال شده است؛ تغییر آدرس توسط انسان بررسی می‌شود و وضعیت ارسال تغییر نکرد.",
      };
    }

    // Before the parcel leaves: an address change is legitimate, but we do not have
    // the new address, so it becomes a task for a human instead of a silent note.
    // The shipment itself is untouched either way.
    if (addressChange) {
      await ensureTask(tx, {
        tenantId,
        type: "address_complete",
        priority: "P1",
        title: `ثبت آدرس تازه — سفارش ${order.publicRef}`,
        detail: "مشتری آدرس را عوض کرده است؛ آدرس کامل تازه باید از مشتری گرفته و ثبت شود.",
        reasonCode: "address_change",
        reasonText: "آدرس پیش از ارسال عوض شده و آدرس تازه نیامده است.",
        orderId: order.id,
        customerId: order.customerId,
        dedupeKey: taskDedupeKey("address_complete", { orderId: order.id }),
      });
    }

    // ── tracking code: normalise or refuse, never invent ──
    let nextTrackingCode = current?.trackingCode ?? null;
    if (input.trackingCode !== undefined) {
      if (input.trackingCode === null || input.trackingCode.trim() === "") {
        nextTrackingCode = null;
      } else {
        const normalised = normaliseTrackingCode(input.trackingCode);
        if (!normalised) throw errors.invalid("کد رهگیری معتبر نیست (دست‌کم ۴ نویسه، حروف و رقم).");
        nextTrackingCode = normalised;
      }
    }

    let nextStatus = currentStatus;
    let shippedAt = current?.shippedAt ?? null;
    let deliveredAt = current?.deliveredAt ?? null;
    let pausedReason = current?.pausedReason ?? null;

    if (input.status && input.status !== currentStatus) {
      if (!current) {
        throw errors.conflict("برای این سفارش مرسوله‌ای ثبت نشده است؛ ابتدا وضعیت ارسال را آماده‌سازی کنید.");
      }
      if (input.status === "shipped" && !canShipOrder(order.status, currentStatus)) {
        throw errors.conflict(
          order.status !== "confirmed"
            ? "سفارش تأیید نشده است؛ «ارسال شد» ثبت نمی‌شود."
            : `از وضعیت «${currentStatus}» نمی‌توان مستقیم ارسال شد.`,
        );
      }
      try {
        assertShipmentTransition(currentStatus, input.status);
      } catch (error) {
        throw errors.conflict((error as Error).message);
      }

      nextStatus = input.status;
      if (nextStatus === "shipped") shippedAt = shippedAt ?? now;
      if (nextStatus === "delivered") {
        deliveredAt = deliveredAt ?? now;
        shippedAt = shippedAt ?? now; // the CHECK constraint needs both times
      }
      if (nextStatus === "paused") pausedReason = "وضعیت ارسال به‌دست کاربر متوقف شد.";
      if (nextStatus === "preparing" || nextStatus === "not_ready") pausedReason = null;

      // A shipped parcel with no code is honest data, not an error — but it opens
      // the follow-up task so nobody can reply "کد رهگیری…" with nothing (rule 6).
      if (nextStatus === "shipped" && !nextTrackingCode) {
        await ensureTask(tx, {
          tenantId,
          type: "tracking_followup",
          priority: "P2",
          title: `ثبت کد رهگیری — سفارش ${order.publicRef}`,
          detail: "مرسوله ارسال شده ولی کدی ثبت نشده؛ کد واقعی را وارد کنید. کد ساختگی مجاز نیست.",
          reasonCode: "tracking_missing",
          reasonText: "مرسوله ارسال شده؛ کد رهگیری ثبت نشده است.",
          orderId: order.id,
          customerId: order.customerId,
          dedupeKey: taskDedupeKey("tracking_followup", { orderId: order.id }),
        });
      }
    }

    const data = {
      status: nextStatus,
      trackingCode: nextTrackingCode,
      ...(input.carrier !== undefined ? { carrier: input.carrier?.trim() || null } : {}),
      shippedAt,
      deliveredAt,
      pausedReason,
    };

    const shipment = current
      ? await tx.shipment.update({ where: { id: current.id }, data })
      : await tx.shipment.create({ data: { tenantId, orderId: order.id, ...data } });

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "shipment.updated",
        entityType: "shipment",
        entityId: shipment.id,
        orderId: order.id,
        before: { status: currentStatus, trackingCodePresent: Boolean(current?.trackingCode) },
        after: { status: shipment.status, trackingCodePresent: Boolean(shipment.trackingCode) },
      },
    });

    return { kind: "ok" as const, shipment };
  });

  if (outcome.kind === "refused") throw errors.conflict(outcome.message);
  return toShipmentDTO(outcome.shipment);
}

// ───────────────────────────── reply preview ─────────────────────────────

/** What the preview endpoint returns (same shape the inbox service uses). */
export type ReplyPreviewView = {
  templateKey: string;
  templateVersion: string;
  body: string;
  allowed: boolean;
};

/**
 * The reply a human may copy. Built from *stored state* only, and it never writes
 * anything — no `sent`, no outbound row (rule 15). We defer to
 * `inbox.previewReply` when it is reachable so the Inbox and Orders screens cannot
 * disagree, and fall back to the same pure template builder otherwise.
 */
export async function getReplyPreview(
  ctx: SessionContext,
  orderId: string,
): Promise<ReplyPreviewView | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: ctx.tenant.id },
    include: {
      ...orderStateInclude,
      tasks: { select: { reasonCode: true } },
    },
  });
  if (!order) return null;

  const delegated = await previewFromInbox(ctx, orderId);
  if (delegated) return delegated;

  const reasonCodes = new Set(order.tasks.map((task) => task.reasonCode));
  const paymentStatus = aggregatePaymentStatus(order.paymentClaims);
  const shipment = order.shipments[0] ?? null;

  return buildReplyPreview({
    orderRef: order.publicRef,
    orderStatus: order.status,
    paymentStatus,
    shipmentStatus: latestShipmentStatus(order.shipments),
    trackingCode: shipment?.trackingCode ?? null,
    carrier: shipment?.carrier ?? null,
    trackingRequested:
      reasonCodes.has("tracking_missing") ||
      reasonCodes.has("tracking_requested") ||
      reasonCodes.has("tracking_followup"),
    addressMissing: reasonCodes.has("address_change") || reasonCodes.has("address_change_before_shipping"),
    addressChangeAfterShipment: reasonCodes.has("address_change_after_shipment"),
    postingPaused: ctx.settings.postingPaused,
  });
}

/**
 * Delegation to the inbox service. It is wrapped because a preview is a *read* on
 * a screen that must still render: if the inbox service throws, the stored-state
 * template below is the answer, not an error page.
 */
async function previewFromInbox(ctx: SessionContext, orderId: string): Promise<ReplyPreviewView | null> {
  try {
    const preview = await previewReplyFromInbox(ctx, orderId);
    return preview && typeof preview.body === "string" ? preview : null;
  } catch {
    return null;
  }
}

// ───────────────────────────── mappers ─────────────────────────────

export function toOrderItemDTO(item: OrderState["items"][number]): OrderItemDTO {
  return {
    id: item.id,
    title: item.titleSnapshot,
    qty: item.qty,
    unitPriceMinor: item.unitPriceMinor.toString(),
    currency: item.currency,
    sku: item.productId,
  };
}

export function toPaymentClaimDTO(claim: ClaimState): PaymentClaimDTO {
  return {
    id: claim.id,
    status: claim.status,
    amountMinor: claim.amountMinor?.toString() ?? null,
    currency: claim.currency,
    claimedAt: claim.claimedAt.toISOString(),
    verifiedAt: claim.verifiedAt?.toISOString() ?? null,
    verifiedByName: claim.verifiedBy?.name ?? null,
    disputeReason: claim.disputeReason,
    sourceMessageId: claim.sourceMessageId,
  };
}

export function toShipmentDTO(shipment: ShipmentState): ShipmentDTO {
  return {
    id: shipment.id,
    status: shipment.status,
    carrier: shipment.carrier,
    trackingCode: shipment.trackingCode,
    shippedAt: shipment.shippedAt?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    pausedReason: shipment.pausedReason,
  };
}

export function toAuditEntryDTO(event: {
  id: string;
  action: string;
  actorType: "system" | "user" | "demo";
  actor: { name: string } | null;
  entityType: string;
  entityId: string;
  createdAt: Date;
  after: Prisma.JsonValue;
}): AuditEntryDTO {
  const after = event.after;
  const summary =
    after && typeof after === "object" && !Array.isArray(after) && typeof after.summary === "string"
      ? after.summary
      : null;

  return {
    id: event.id,
    action: event.action,
    actorType: event.actorType,
    actorName: event.actor?.name ?? null,
    entityType: event.entityType,
    entityId: event.entityId,
    at: event.createdAt.toISOString(),
    summary,
  };
}

/** Suggestion → DTO. The `group` is derived from the field prefix, nothing else. */
export function toSuggestionDTO(suggestion: {
  id: string;
  field: string;
  proposedValue: Prisma.JsonValue;
  candidateId: string | null;
  confidence: Prisma.Decimal | null;
  reviewState: SuggestionDTO["reviewState"];
  evidenceStart: number | null;
  evidenceEnd: number | null;
  sourceMessageId: string;
}): SuggestionDTO {
  const proposed = suggestion.proposedValue;
  const readString = (value: Prisma.JsonValue): string | number | null => {
    if (typeof value === "string" || typeof value === "number") return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, Prisma.JsonValue>;
      const candidate = record.value ?? record.intent ?? record.text ?? null;
      return typeof candidate === "string" || typeof candidate === "number" ? candidate : null;
    }
    return null;
  };

  const displayValue =
    proposed && typeof proposed === "object" && !Array.isArray(proposed)
      ? typeof (proposed as Record<string, Prisma.JsonValue>).displayValue === "string"
        ? ((proposed as Record<string, Prisma.JsonValue>).displayValue as string)
        : null
      : null;

  return {
    id: suggestion.id,
    field: suggestion.field,
    value: readString(proposed),
    displayValue,
    confidence: suggestion.confidence === null ? null : Number(suggestion.confidence),
    reviewState: suggestion.reviewState,
    evidence:
      suggestion.evidenceStart !== null && suggestion.evidenceEnd !== null
        ? { start: suggestion.evidenceStart, end: suggestion.evidenceEnd }
        : null,
    sourceMessageId: suggestion.sourceMessageId,
    candidateId: suggestion.candidateId,
    group: suggestionGroup(suggestion.field),
  };
}

function suggestionGroup(field: string): SuggestionDTO["group"] {
  if (field.startsWith("intent.")) return "intent";
  if (field.startsWith("order.")) return "order";
  if (field.startsWith("risk.") || field.includes("flag")) return "risk";
  return "field";
}

// ───────────────────────────── internal helpers ─────────────────────────────

async function resolveItems(
  tx: Prisma.TransactionClient,
  tenantId: string,
  items: readonly DraftItemInput[],
  currency: string,
): Promise<
  { title: string; qty: number; unitPriceMinor: bigint; productId: string | null; currency: string }[]
> {
  if (items.length === 0) return [];
  if (items.length > 100) throw errors.invalid("تعداد اقلام بیش از حد مجاز است.");

  const skus = items.map((item) => item.sku?.trim()).filter((sku): sku is string => Boolean(sku));
  const products = skus.length
    ? await tx.product.findMany({ where: { tenantId, sku: { in: skus } }, select: { id: true, sku: true } })
    : [];
  const bySku = new Map(products.map((product) => [product.sku, product.id]));

  return items.map((item) => {
    if (!/^[0-9]+$/.test(item.unitPriceMinor)) {
      throw errors.invalid("قیمت واحد باید عدد صحیح (ریال) باشد.");
    }
    const sku = item.sku?.trim();
    if (sku && !bySku.has(sku)) {
      throw errors.invalid(`محصولی با کد «${sku}» در این فروشگاه نیست.`);
    }
    return {
      title: item.title.trim(),
      qty: item.qty,
      unitPriceMinor: BigInt(item.unitPriceMinor),
      productId: sku ? (bySku.get(sku) ?? null) : null,
      currency,
    };
  });
}

/**
 * Create a task only when its dedupe key is still free: the database's
 * `@@unique([tenantId, dedupeKey])` is the arbiter, and a released key (closed
 * task) allows a genuinely new one.
 */
async function ensureTask(
  tx: Prisma.TransactionClient,
  data: {
    tenantId: string;
    type: TaskType;
    priority: "P0" | "P1" | "P2" | "P3";
    title: string;
    detail: string;
    reasonCode: string;
    reasonText: string;
    orderId: string;
    customerId: string | null;
    dedupeKey: string;
  },
): Promise<void> {
  const existing = await tx.task.findFirst({
    where: { tenantId: data.tenantId, dedupeKey: data.dedupeKey },
    select: { id: true, status: true, dedupeState: true },
  });
  if (existing && existing.dedupeState === "active") return;
  if (existing) {
    // A released row still holding the key: free it so the unique index allows the
    // new task. `updateTask` normally does this when a task closes.
    await tx.task.update({ where: { id: existing.id }, data: { dedupeKey: null } });
  }

  await tx.task.create({
    data: {
      tenantId: data.tenantId,
      type: data.type,
      priority: data.priority,
      title: data.title,
      detail: data.detail,
      reasonCode: data.reasonCode,
      reasonText: data.reasonText,
      status: "open",
      orderId: data.orderId,
      customerId: data.customerId,
      dedupeKey: data.dedupeKey,
      dedupeState: "active",
      createdBy: "system",
    },
  });
}
