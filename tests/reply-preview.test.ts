import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildReplyPreview, type ReplyInput } from "@/server/domain/reply";

/**
 * Audit: "replies may consume values nobody reviewed", and "a rejected proposal
 * must not influence the customer reply".
 *
 * The builder is a pure function of *stored* state (order/payment/shipment/tracking
 * + two booleans). There is no parameter through which a suggestion could enter —
 * and these tests hold both halves: the wording never claims an unrecorded fact,
 * and the surface has nowhere to put an unreviewed proposal.
 */

const base: ReplyInput = {
  orderRef: "DEMO-ORD-1042",
  orderStatus: "confirmed",
  paymentStatus: "unknown",
  shipmentStatus: "preparing",
  trackingCode: null,
  carrier: null,
  trackingRequested: false,
  addressMissing: false,
  addressChangeAfterShipment: false,
  postingPaused: false,
};

describe("the reply preview only says what the database recorded", () => {
  it("never says the payment is verified while it is only claimed", () => {
    const reply = buildReplyPreview({ ...base, paymentStatus: "claimed", trackingRequested: false });
    expect(reply.body).not.toMatch(/تأیید شد/);
    expect(reply.body).toMatch(/بررسی/);
  });

  it("never invents a tracking code when none is stored", () => {
    const reply = buildReplyPreview({ ...base, trackingRequested: true, trackingCode: null });
    expect(reply.body).not.toMatch(/\b\d{6,}\b/);
    expect(reply.body).toMatch(/رهگیری/);
    expect(reply.templateKey).toBe("tracking_missing");
  });

  it("uses the stored code when one exists, and only then", () => {
    const reply = buildReplyPreview({ ...base, shipmentStatus: "shipped", trackingRequested: true, trackingCode: "DEMO-TRK-778120" });
    expect(reply.body).toContain("DEMO-TRK-778120");
    expect(reply.templateKey).toBe("tracking_registered");
  });

  it("treats an address change after shipping as human work, never as an automatic change", () => {
    const reply = buildReplyPreview({ ...base, shipmentStatus: "shipped", addressMissing: true, addressChangeAfterShipment: true });
    expect(reply.templateKey).toBe("address_after_shipment");
  });
});

describe("no path exists for an unreviewed or rejected proposal to reach the reply", () => {
  it("the reply input carries no suggestion, review or proposed value", async () => {
    const source = await readFile("src/server/domain/reply.ts", "utf8");
    const inputType = source.slice(source.indexOf("export type ReplyInput"), source.indexOf("export type ReplyPreview"));
    expect(inputType).not.toMatch(/suggestion/i);
    expect(inputType).not.toMatch(/reviewState|proposedValue|correctedValue/i);
  });

  it("the reply module has no write path (a preview cannot mark anything sent)", async () => {
    const source = await readFile("src/server/domain/reply.ts", "utf8");
    expect(source).not.toMatch(/OutboundMessage|status:\s*"sent"|prisma\./);
  });
});
