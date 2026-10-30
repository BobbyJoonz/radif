import { z } from "zod";
import { prisma } from "@/server/db";
import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import type { Prisma } from "@/generated/prisma/client";
import { readJsonBody } from "../../../_lib/request";

/**
 * POST /api/suggestions/:id/review — a human's decision about a proposal
 * (CONTRACTS §5).
 *
 * `proposedValue` is immutable: the system's suggestion stays exactly as it was
 * proposed, and the human's answer is recorded beside it (`reviewState`,
 * `correctedValue`, `reviewedAt`, `reviewedById`). That is what makes an audit of
 * "the machine said X, the human said Y" possible at all.
 *
 * A suggestion that has already been reviewed is 409, not silently overwritten: a
 * second click must not erase the first decision.
 */
export const dynamic = "force-dynamic";

const reviewSchema = z
  .object({
    action: z.enum(["accept", "correct", "reject"]),
    value: z.unknown().optional(),
  })
  .strict()
  .refine((input) => input.action !== "correct" || input.value !== undefined, {
    message: "برای اصلاح، مقدار درست را بفرستید.",
    path: ["value"],
  });

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = reviewSchema.parse(await readJsonBody(request));
  const tenantId = ctx.tenant.id;
  const now = new Date();

  const reviewState = body.action === "accept" ? "accepted" : body.action === "correct" ? "corrected" : "rejected";

  const suggestion = await prisma.suggestion.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      reviewState: true,
      sourceMessageId: true,
      orderId: true,
      customerId: true,
      field: true,
      proposedValue: true,
    },
  });
  if (!suggestion) throw errors.notFound("این پیشنهاد پیدا نشد.");
  if (suggestion.reviewState !== "proposed") {
    throw errors.conflict("این پیشنهاد قبلاً بررسی شده است؛ نظر ثبت‌شده تغییر نمی‌کند.");
  }

  const correctedValue =
    body.action === "correct" ? (body.value as Prisma.InputJsonValue) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.suggestion.update({
      where: { id: suggestion.id },
      data: {
        reviewState,
        reviewedAt: now,
        reviewedById: ctx.user.id,
        ...(correctedValue !== undefined ? { correctedValue } : {}),
      },
      select: { id: true, reviewState: true, correctedValue: true, reviewedAt: true },
    });

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: `suggestion.${body.action}`,
        entityType: "suggestion",
        entityId: suggestion.id,
        orderId: suggestion.orderId,
        before: { reviewState: suggestion.reviewState },
        after: {
          reviewState: result.reviewState,
          corrected: body.action === "correct" ? (body.value as Prisma.InputJsonValue) : undefined,
        },
      },
    });

    // Audit #5: a review that changes nothing is a note, not a decision.
    const applied = await applyOperationalValue(tx, {
      tenantId,
      action: body.action,
      field: suggestion.field,
      value: body.action === "correct" ? body.value : suggestion.proposedValue,
      customerId: suggestion.customerId,
      orderId: suggestion.orderId,
      actorId: ctx.user.id,
      suggestionId: suggestion.id,
      now,
    });

    return { ...result, applied };
  });

  return ok({
    id: updated.id,
    reviewState: updated.reviewState,
    correctedValue: updated.correctedValue ?? null,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    applied: updated.applied,
  });
});

type Applied = { applied: boolean; target: string | null; reason?: string };

const IRAN_MOBILE = /^\+989\d{9}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Write an accepted/corrected value onto the record it describes (audit #5).
 *
 * A rejected proposal is never applied, and a field with no operational home is
 * reported as such instead of being silently "accepted" into nowhere. The phone
 * case deliberately does not touch `phoneVerifiedAt`: verifying a number needs an
 * OTP (phase 4), and an accepted suggestion is not proof of ownership.
 */
async function applyOperationalValue(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    action: "accept" | "correct" | "reject";
    field: string;
    value: unknown;
    customerId: string | null;
    orderId: string | null;
    actorId: string;
    suggestionId: string;
    now: Date;
  },
): Promise<Applied> {
  if (input.action === "reject") return { applied: false, target: null, reason: "rejected" };

  if (input.field === "customer.phone") {
    // proposedValue is stored as { value } (or a bare value for corrected input).
    const candidate =
      input.value && typeof input.value === "object" && "value" in (input.value as object)
        ? (input.value as { value: unknown }).value
        : input.value;
    const raw = typeof candidate === "string" ? candidate.trim() : "";
    if (!E164.test(raw) && !IRAN_MOBILE.test(raw)) {
      throw errors.invalid("شمارهٔ تلفن با قالب بین‌المللی معتبر نیست.");
    }
    if (!input.customerId) return { applied: false, target: null, reason: "no_customer" };
    const before = await tx.customer.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId },
      select: { phone: true },
    });
    if (!before) return { applied: false, target: null, reason: "no_customer" };
    await tx.customer.update({
      where: { id: input.customerId },
      // phoneVerifiedAt is untouched on purpose.
      data: { phone: raw },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorType: "user",
        actorId: input.actorId,
        action: "suggestion.applied",
        entityType: "Customer",
        entityId: input.customerId,
        before: { phone: before.phone } as Prisma.InputJsonValue,
        after: { phone: raw, suggestionId: input.suggestionId } as Prisma.InputJsonValue,
      },
    });
    return { applied: true, target: "customer.phone" };
  }

  return { applied: false, target: null, reason: "no_operational_destination" };
}
