import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { SessionContext } from "@/server/session";
import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";
import { errors } from "@/server/http";
import { ReplayChannelAdapter } from "@/server/channels/replay";
import { ingestValidated, type TenantRef } from "@/server/ingestion/ingest";
import { validateIncoming } from "@/server/ingestion/schemas";
import { createDemoInstance } from "@/server/services/demo-instance";

/**
 * The demo's two write paths (CONTRACTS §5 `POST /api/demo/*`, DEMO.md).
 *
 * Both are demo-only, and the reset is owner-only. Nothing here is special-cased
 * in the worker: the replay produces a normal `IncomingMessage`, goes through the
 * *same* validate → store → enqueue path a file import uses, and is analysed by
 * the same worker. That is the point of the demo — the pipeline is the product.
 */

/** How long the re-seed may take before the request gives up. */
const SEED_TIMEOUT_MS = 180_000;

function assertDemoMode(ctx: SessionContext): void {
  if (!isDemo() || !ctx.tenant.isDemo) {
    // Production has no demo data, no replay and no reset (CONTRACTS §2).
    throw errors.forbidden("این کار فقط در حالت نمایشی (demo) در دسترس است.");
  }
}

function tenantRef(ctx: SessionContext): TenantRef {
  return { tenantId: ctx.tenant.id, timeZone: ctx.tenant.timezone, isDemo: ctx.tenant.isDemo };
}

// ───────────────────────────── replay ─────────────────────────────

/**
 * Re-send the scripted demo message through the real ingestion path.
 *
 * The message id is `DEMO-MSG-9001-R<n>`, not `DEMO-MSG-9001`: the seeded message
 * already exists, and the demo wants to *see* a new message arrive. Idempotency is
 * still the rule for a provider event — re-delivering the same ref stays one
 * message — while the dedupe keys on jobs and tasks stop the replay from cloning
 * analysis or work.
 *
 * Returns the stored message id; the analysis happens in the worker (or in
 * `pnpm worker:once`), never inside the request.
 */
export async function replaySampleMessage(ctx: SessionContext): Promise<string> {
  assertDemoMode(ctx);

  const tenant = tenantRef(ctx);
  const connection = await prisma.channelConnection.findFirst({
    where: { tenantId: ctx.tenant.id, channel: "replay" },
    orderBy: { createdAt: "asc" },
    select: { accountRef: true },
  });
  const accountRef = connection?.accountRef ?? `demo.${ctx.tenant.slug}`;
  const now = new Date();
  const sequence = await nextReplaySequence(ctx.tenant.id);

  const parsed = new ReplayChannelAdapter().parse({
    content: JSON.stringify({ scenario: "scripted", sequence }),
    format: "json",
    importRef: `replay-${sequence}`,
    accountRef,
    timeZone: ctx.tenant.timezone,
    now,
  });

  if (parsed.messages.length === 0) {
    throw errors.invalid(parsed.fatal ?? "پیام نمونه ساخته نشد.");
  }

  let messageId: string | null = null;
  for (const message of parsed.messages) {
    // Same validator the import route uses: the payload is untrusted until it
    // passes, even when the content came from our own fixture.
    const validated = validateIncoming(message, ctx.tenant.timezone, now);
    const result = await ingestValidated(tenant, validated, { now });
    messageId ??= result.messageId;
  }

  if (!messageId) throw errors.invalid("پیام نمونه ذخیره نشد.");
  return messageId;
}

/** `DEMO-MSG-9001-R1`, `-R2`, … — one sequence per tenant, never reused. */
async function nextReplaySequence(tenantId: string): Promise<number> {
  const existing = await prisma.message.findMany({
    where: { tenantId, externalRef: { startsWith: "DEMO-MSG-9001" } },
    select: { externalRef: true },
  });

  let highest = 0;
  for (const { externalRef } of existing) {
    const match = /-R(\d+)$/.exec(externalRef);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

// ───────────────────────────── reset ─────────────────────────────

/**
 * Rebuild the demo data — owner only, demo only.
 *
 * Why a child process: the seed is the *only* description of the demo rows
 * (`prisma/seed.ts`), and duplicating a 950-line dataset inside a service would
 * drift from it within a day. The seed is idempotent by design ("delete the two
 * demo tenants and rebuild them"), so the reset is: delete + re-create, in one
 * run, for both demo tenants — not just the caller's. That is stated here rather
 * than pretended otherwise.
 *
 * The seed deletes the demo `User` rows, which cascades to `Session` — so the
 * owner who pressed the button would be signed out mid-demo. The session row is
 * snapshotted before the seed and put back afterwards (same id, same token, same
 * expiry), which keeps the cookie valid without weakening anything: the user it
 * points at exists again with the same id.
 *
 * `stdio: "ignore"` is deliberate: the seed's own logs are not needed by the
 * response, and a piped child would depend on the host being able to hand pipes
 * to a nested process. Only the exit code is inspected.
 */
export async function resetDemoData(ctx: SessionContext): Promise<void> {
  assertDemoMode(ctx);
  if (ctx.role !== "owner") {
    throw errors.forbidden("بازنشانی دادهٔ نمایشی فقط با نقش «مالک» انجام می‌شود.");
  }

  const session = await prisma.session.findUnique({ where: { id: ctx.sessionId } });

  let exit: { code: number | null; signal: NodeJS.Signals | null };
  try {
    exit = await runDemoSeed();
  } catch (error) {
    console.error("[demo] seed could not start", (error as Error).message);
    throw errors.upstream("بازنشانی دادهٔ نمایشی انجام نشد؛ دوباره تلاش کنید.");
  }
  if (exit.code !== 0) {
    console.error("[demo] seed exited", { code: exit.code, signal: exit.signal });
    throw errors.upstream("بازنشانی دادهٔ نمایشی انجام نشد؛ دوباره تلاش کنید.");
  }

  // The seed wiped and rebuilt both demo tenants. If this tenant did not come
  // back, say so instead of returning a success the next page load would
  // contradict.
  const rebuilt = await prisma.tenant.findUnique({ where: { id: ctx.tenant.id }, select: { id: true } });
  if (!rebuilt) {
    throw errors.upstream("بازنشانی دادهٔ نمایشی نیمه‌کاره ماند؛ دوباره تلاش کنید.");
  }

  if (session) await restoreSession(session);
}

/** Put the caller's session back after the seed re-created its user. */
async function restoreSession(session: {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } });
  if (!user) return;
  try {
    await prisma.session.create({
      data: {
        id: session.id,
        token: session.token,
        userId: session.userId,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      },
    });
  } catch (error) {
    // A concurrent request may have re-created it already; a live session that
    // exists is all we need.
    console.warn("[demo] session restore skipped", (error as Error).message);
  }
}

function runDemoSeed(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd();
    const cli = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
    const script = path.join(cwd, "prisma", "seed.ts");
    if (!existsSync(cli) || !existsSync(script)) {
      reject(new Error("seed runner not found"));
      return;
    }

    const child = spawn(process.execPath, [cli, script], {
      cwd,
      // The seed refuses to run outside demo mode; be explicit about it.
      env: { ...process.env, APP_MODE: "demo" },
      stdio: "ignore",
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("seed timed out"));
    }, SEED_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

/**
 * Reset a *personal* demo instance (audit: a visitor must never reset the shared
 * template). The clone is rebuilt from the template inside its own tenant: its
 * operational rows are cleared and copied again, while the shared shops are not
 * touched at all — no seed process, no global effect.
 */
export async function resetPersonalDemo(ctx: SessionContext): Promise<{ scope: "personal" }> {
  assertDemoMode(ctx);
  const tenantId = ctx.tenant.id;
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { sharedDemo: true } });
  if (!tenant || tenant.sharedDemo) {
    throw errors.forbidden("بازنشانی فقط روی دموی شخصی انجام می‌شود؛ فروشگاه مشترک دست‌نخورده می‌ماند.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.job.deleteMany({ where: { tenantId } });
    await tx.auditEvent.deleteMany({ where: { tenantId } });
    await tx.suggestion.deleteMany({ where: { tenantId } });
    await tx.task.deleteMany({ where: { tenantId } });
    await tx.paymentClaim.deleteMany({ where: { tenantId } });
    await tx.shipment.deleteMany({ where: { tenantId } });
    await tx.outboundMessage.deleteMany({ where: { tenantId } });
    await tx.orderItem.deleteMany({ where: { tenantId } });
    await tx.order.deleteMany({ where: { tenantId } });
    await tx.analysisRun.deleteMany({ where: { tenantId } });
    await tx.message.deleteMany({ where: { tenantId } });
    await tx.conversation.deleteMany({ where: { tenantId } });
    await tx.customerIdentity.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });
    await tx.product.deleteMany({ where: { tenantId } });
  });
  await createDemoInstance({ intoTenantId: tenantId });
  return { scope: "personal" };
}
