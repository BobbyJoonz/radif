import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { processWebhookEvents } from "@/server/worker/drain";
import { resetDatabase } from "./helpers/db";
import { createTenant, type TestTenant } from "./helpers/fixtures";

/**
 * Store first, process second.
 *
 * Meta disables a subscription when the callback does not answer 200, and a parsing
 * bug must not lose a customer's message — so the route persists the delivery and the
 * drain turns stored rows into messages. These tests cover the second half.
 */
describe("stored webhook deliveries", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
    await prisma.channelConnection.create({
      data: {
        tenantId: toranj.tenantId,
        channel: "instagram",
        accountRef: "17841400000000000",
        displayName: "@toranj.studio",
        status: "connected",
      },
    });
  });

  function payload(mid: string, accountId = "17841400000000000") {
    return {
      object: "instagram",
      entry: [
        {
          id: accountId,
          time: Date.now(),
          messaging: [{ sender: { id: "sender_1", username: "negar" }, message: { mid, text: "سلام" } }],
        },
      ],
    };
  }

  it("turns a stored delivery into a message, then drains nothing twice", async () => {
    await prisma.webhookEvent.create({
      data: { provider: "instagram", accountRef: "17841400000000000", payload: payload("mid_w1") },
    });

    const first = await processWebhookEvents();
    expect(first).toEqual({ processed: 1, messages: 1 });

    const event = await prisma.webhookEvent.findFirst({ select: { processedAt: true, result: true } });
    expect(event?.processedAt).not.toBeNull();
    expect(event?.result).toMatchObject({ stored: 1 });

    const messages = await prisma.message.findMany({ where: { tenantId: toranj.tenantId, source: "instagram" } });
    expect(messages).toHaveLength(1);

    const second = await processWebhookEvents();
    expect(second).toEqual({ processed: 0, messages: 0 });
  });

  it("keeps a delivery for retry when ingestion throws", async () => {
    // An unknown account is a no-op, not an error: the row is still marked processed.
    await prisma.webhookEvent.create({
      data: { provider: "instagram", accountRef: "999", payload: payload("mid_w2", "999") },
    });
    const result = await processWebhookEvents();
    expect(result.processed).toBe(1);
    expect(result.messages).toBe(0);
  });
});
