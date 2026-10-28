import { describe, expect, it } from "vitest";
import { normalizeText } from "@/server/domain/normalize";
import { parseAmount } from "@/server/domain/money";
import { computePriority, reasonText } from "@/server/domain/priority";
import { buildReplyPreview } from "@/server/domain/reply";
import {
  canShipOrder,
  canTransitionOrder,
  canTransitionPayment,
  canTransitionShipment,
  canTransitionTask,
  normaliseTrackingCode,
} from "@/server/domain/state";

/**
 * The pure rules behind the contract, tested without a database. These are the ones
 * a worker or a route must not re-implement differently: ambiguity is P1, an amount
 * with no unit is not an amount, a tracking code is never invented, and the three
 * state machines are separate.
 */
describe("domain rules", () => {
  it("treats an ambiguous order association as P1 needing review (rule 5)", () => {
    const result = computePriority({
      taskType: "human_review",
      intents: ["tracking_request"],
      orderStatus: "confirmed",
      paymentStatus: "unknown",
      shipmentStatus: "not_ready",
      hasOpenOrder: true,
      slaBreached: false,
      paymentMismatch: false,
      paymentClaimUnverified: false,
      amountUnitMissing: false,
      addressChangeRequested: false,
      addressChangeAfterShipment: false,
      ambiguousAssociation: true,
      trackingRequested: true,
      trackingCodePresent: false,
    });

    expect(result).toMatchObject({ priority: "P1", reasonCode: "ambiguous_order_association", needsReview: true });
    expect(result.reasonText).toBe(reasonText("ambiguous_order_association"));
  });

  it("keeps an amount without a unit as null, never a guessed number (rule 7)", () => {
    const bare = parseAmount("250");
    expect(bare.amountMinor).toBeNull();
    expect(bare.unit).toBeNull();
    expect(bare.note).not.toBeNull();

    // Only a stated unit turns a number into money, and toman is converted to rial.
    expect(parseAmount("250 تومان").amountMinor).toBe(2500n);
    expect(parseAmount("250 تومان").unit).toBe("toman");
    expect(parseAmount("250 ریال").amountMinor).toBe(250n);

    // Persian digits are a display concern; normalisation happens first.
    expect(normalizeText("۲۵۰")).toBe("250");
  });

  it("never invents a tracking code and never accepts a blank one", () => {
    expect(normaliseTrackingCode("")).toBeNull();
    expect(normaliseTrackingCode("   ")).toBeNull();
    expect(normaliseTrackingCode("ab")).toBeNull();
    expect(normaliseTrackingCode("۱۲۳۴۵")).toBe("12345");
    expect(normaliseTrackingCode("demo-trk-778120")).toBe("DEMO-TRK-778120");
  });

  it("a reply about tracking says the code is missing when none is stored (rule 6)", () => {
    const preview = buildReplyPreview({
      orderRef: "DEMO-ORD-1042",
      orderStatus: "confirmed",
      paymentStatus: "claimed",
      shipmentStatus: "preparing",
      trackingCode: null,
      carrier: "تیپاکس",
      trackingRequested: true,
      addressMissing: false,
      addressChangeAfterShipment: false,
      postingPaused: false,
    });

    expect(preview.templateKey).toBe("tracking_missing");
    expect(preview.allowed).toBe(true);
    // No code-shaped token was made up: the only identifier is the order's own ref.
    expect(preview.body).not.toContain("TRK");
    expect(preview.body).toContain("ثبت نشده");
    expect(preview.body).not.toContain("تأیید");
  });

  it("a reply never claims a verified payment, shipping or delivery that is not stored", () => {
    const claimed = buildReplyPreview({
      orderRef: "DEMO-ORD-1042",
      orderStatus: "confirmed",
      paymentStatus: "claimed",
      shipmentStatus: "not_ready",
      trackingCode: null,
      carrier: null,
      trackingRequested: false,
      addressMissing: false,
      addressChangeAfterShipment: false,
      postingPaused: true,
    });
    expect(claimed.templateKey).toBe("payment_claimed");
    expect(claimed.body).not.toContain("تأیید شده");

    const shipped = buildReplyPreview({
      orderRef: "DEMO-ORD-1031",
      orderStatus: "confirmed",
      paymentStatus: "verified",
      shipmentStatus: "delivered",
      trackingCode: "DEMO-TRK-778120",
      carrier: "پست",
      trackingRequested: false,
      addressMissing: false,
      addressChangeAfterShipment: true,
      postingPaused: false,
    });
    // The post-shipment address change wins: it is the thing a human must handle.
    expect(shipped.templateKey).toBe("address_after_shipment");
    expect(shipped.allowed).toBe(true);
  });

  it("keeps the three state machines independent and honest about illegal edges", () => {
    expect(canTransitionOrder("draft", "confirmed")).toBe(true);
    expect(canTransitionOrder("cancelled", "confirmed")).toBe(false);

    // A claim never jumps to verified, and nothing jumps *to* claimed but unknown.
    expect(canTransitionPayment("unknown", "verified")).toBe(false);
    expect(canTransitionPayment("unknown", "claimed")).toBe(true);
    expect(canTransitionPayment("claimed", "verified")).toBe(true);

    expect(canTransitionShipment("shipped", "preparing")).toBe(false);
    expect(canTransitionShipment("preparing", "shipped")).toBe(true);
    // Shipping needs a confirmed order, not just a legal edge.
    expect(canShipOrder("draft", "preparing")).toBe(false);
    expect(canShipOrder("confirmed", "preparing")).toBe(true);

    expect(canTransitionTask("open", "done")).toBe(true);
    expect(canTransitionTask("done", "open")).toBe(false);
  });
});
