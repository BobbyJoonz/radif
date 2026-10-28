import { prisma } from "@/server/db";
import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { enqueueAnalysis } from "@/server/ingestion/ingest";
import { enforceRateLimit } from "../../../_lib/rate-limit";

/**
 * POST /api/messages/:id/analyze — controlled retry (CONTRACTS §5, §6 rule 12).
 *
 * A retry is a *new* AnalysisRun plus a *new* job, never a mutation of the failed
 * one: the failed run stays as evidence, and the dedupe key of the new job includes
 * its run id so a retry cannot be swallowed by the original job's key.
 *
 * If a run for this message is already queued (`running` with no `startedAt`), that
 * is what we return — clicking twice must not queue two analyses of the same text.
 *
 * Rate limit: 10/min per user; analysis is the most expensive thing the server does.
 */
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MIN = 10;

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  enforceRateLimit(`analyze:${ctx.user.id}`, RATE_LIMIT_PER_MIN);

  const { id } = await context.params;
  const tenantId = ctx.tenant.id;
  const now = new Date();

  const message = await prisma.message.findFirst({
    where: { id, tenantId },
    select: { id: true, direction: true, analysisState: true },
  });
  // Another tenant's message is simply not here (404), never 403.
  if (!message) throw errors.notFound("این پیام پیدا نشد.");
  if (message.direction === "outbound") {
    throw errors.invalid("پاسخ فروشنده تحلیل نمی‌شود؛ فقط پیام مشتری تحلیل دارد.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const queued = await tx.analysisRun.findFirst({
      where: { tenantId, messageId: message.id, status: "running", startedAt: null },
      orderBy: { queuedAt: "desc" },
      select: { id: true },
    });
    if (queued) return { runId: queued.id, state: "pending" as const, queued: true };

    await tx.message.update({ where: { id: message.id }, data: { analysisState: "pending" } });
    await enqueueAnalysis(tx, tenantId, message.id, now);

    const run = await tx.analysisRun.findFirst({
      where: { tenantId, messageId: message.id },
      orderBy: { queuedAt: "desc" },
      select: { id: true },
    });
    if (!run) throw errors.invalid("تحلیل دوباره در صف قرار نگرفت.");

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "analysis.retried",
        entityType: "message",
        entityId: message.id,
        after: { runId: run.id, previousState: message.analysisState },
      },
    });

    return { runId: run.id, state: "pending" as const, queued: false };
  });

  return ok({ runId: result.runId, state: result.state });
});
