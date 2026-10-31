import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createKnowledge, scoreEntry, searchKnowledge, tokenize } from "@/server/services/knowledge";
import { deliverOutbound, queueReply, replyWindow } from "@/server/instagram/send";
import { resetDatabase } from "./helpers/db";
import { createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

/**
 * Replying, the knowledge book, and the two rules that make the feature honest:
 * the 24-hour window is computed on the server, and preview mode never claims a
 * message reached a customer.
 */
describe("knowledge book", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
  });

  it("tokenizes and ranks the entry that actually matches", async () => {
    expect(tokenize("شال موجوده؟")).toEqual(["شال", "موجوده"]);

    const a = { question: "موجودی شال", answer: "بله، هفت عدد موجود است.", tags: ["شال"] };
    const b = { question: "ساعت کاری", answer: "۹ تا ۲۱", tags: [] };
    expect(scoreEntry(a, ["شال", "موجوده"])).toBeGreaterThan(scoreEntry(b, ["شال", "موجوده"]));
  });

  it("stores and finds an answer by a different wording", async () => {
    await createKnowledge(toranj.ctx, {
      question: "موجودی شال ابریشم",
      answer: "هفت عدد موجود است.",
      tags: ["شال", "موجودی"],
    });
    await createKnowledge(toranj.ctx, { question: "ساعت کاری", answer: "۹ تا ۲۱" });

    const results = await searchKnowledge(toranj.ctx, "شال موجوده؟", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].question).toContain("شال");
  });

  it("never returns an entry for a query it cannot match", async () => {
    await createKnowledge(toranj.ctx, { question: "ساعت کاری", answer: "۹ تا ۲۱" });
    expect(await searchKnowledge(toranj.ctx, "کیف چرمی", 3)).toHaveLength(0);
  });
});

describe("reply window and delivery", () => {
  let toranj: TestTenant;
  let conversationId: string;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
    const connection = await prisma.channelConnection.create({
      data: {
        tenantId: toranj.tenantId,
        channel: "instagram",
        accountRef: "17841400000000000",
        displayName: "@toranj.studio",
        status: "connected",
      },
    });
    const customer = await prisma.customer.create({
      data: { tenantId: toranj.tenantId, displayName: "@negar" },
    });
    const conversation = await prisma.conversation.create({
      data: {
        tenantId: toranj.tenantId,
        connectionId: connection.id,
        customerId: customer.id,
        channelRef: "sender_1",
      },
    });
    conversationId = conversation.id;
  });

  async function inbound(occurredAt: Date) {
    await prisma.message.create({
      data: {
        tenantId: toranj.tenantId,
        conversationId,
        direction: "inbound",
        source: "instagram",
        externalRef: `mid_${occurredAt.getTime()}`,
        senderRef: "sender_1",
        text: "سلام، شال موجوده؟",
        occurredAt,
        analysisState: "done",
      },
    });
  }

  it("closes the window 24 hours after the customer's last message", async () => {
    await inbound(new Date(Date.now() - 25 * 3600 * 1000));
    const closed = await replyWindow(toranj.ctx, conversationId);
    expect(closed.canReply).toBe(false);
    expect(closed.reason).toBe("window_closed");
    expect(closed.expiresAt).not.toBeNull();
  });

  it("refuses a reply once the window is closed, with a real reason", async () => {
    await inbound(new Date(Date.now() - 25 * 3600 * 1000));
    await expectApiError(() => queueReply(toranj.ctx, { conversationId, text: "سلام" }), {
      status: 409,
      code: "conflict",
    });
  });

  it("records a preview instead of pretending to send", async () => {
    await inbound(new Date());
    const queued = await queueReply(toranj.ctx, { conversationId, text: "سلام، بله موجوده." });
    expect(queued.mode).toBe("preview");
    expect(queued.status).toBe("draft");

    const outcome = await deliverOutbound(queued.id);
    expect(outcome.delivered).toBe(false);
    expect(outcome.reason).toBe("preview_mode");

    const stored = await prisma.outboundMessage.findUnique({ where: { id: queued.id }, select: { status: true } });
    expect(stored?.status).toBe("delivery_unknown");
  });

  it("is idempotent for a double-click", async () => {
    await inbound(new Date());
    const first = await queueReply(toranj.ctx, { conversationId, text: "عین متن" });
    const second = await queueReply(toranj.ctx, { conversationId, text: "عین متن" });
    expect(second.id).toBe(first.id);
    const count = await prisma.outboundMessage.count({ where: { tenantId: toranj.tenantId, conversationId } });
    expect(count).toBe(1);
  });

  it("refuses to schedule outside the 24-hour window", async () => {
    await inbound(new Date());
    await expectApiError(
      () =>
        queueReply(toranj.ctx, {
          conversationId,
          text: "بعداً",
          scheduleAt: new Date(Date.now() + 30 * 3600 * 1000),
        }),
      { status: 422, code: "invalid" },
    );
  });

  it("keeps quick replies with the message body", async () => {
    await inbound(new Date());
    const queued = await queueReply(toranj.ctx, {
      conversationId,
      text: "کدام را می‌خواهید؟",
      quickReplies: ["شال", "روسری"],
    });
    const stored = await prisma.outboundMessage.findUnique({ where: { id: queued.id }, select: { body: true } });
    expect(stored?.body).toContain("شال");
    expect(stored?.body).toContain("روسری");
  });
});
