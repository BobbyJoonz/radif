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
    select: { id: true, reviewState: true, sourceMessageId: true, orderId: true },
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

    return result;
  });

  return ok({
    id: updated.id,
    reviewState: updated.reviewState,
    correctedValue: updated.correctedValue ?? null,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
  });
});
