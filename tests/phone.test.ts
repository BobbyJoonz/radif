import { describe, expect, it } from "vitest";
import { isDialable, normalizePhone, verificationAfterChange } from "@/server/domain/phone";

/**
 * The audit's P1: the planner proposed `order.phone` while the review route only
 * applied `customer.phone`, so an accepted number landed nowhere. These tests pin
 * the canonical name's rules: a value is only dialable once normalised, and a
 * changed number can never keep an old verification.
 */
describe("normalizePhone", () => {
  it("accepts international and Iranian mobile formats", () => {
    expect(normalizePhone("+989121234567")).toBe("+989121234567");
    expect(normalizePhone("  +98 912 123 4567 ")).toBe("+989121234567");
    expect(normalizePhone("+1 (555) 010-2030")).toBe("+15550102030");
  });

  it("rejects what it cannot dial instead of guessing a prefix", () => {
    expect(normalizePhone("09121234567")).toBeNull(); // no country code
    expect(normalizePhone("9121234567")).toBeNull();
    expect(normalizePhone("سلام")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("+98")).toBeNull();
  });

  it("keeps the dialable predicate honest", () => {
    expect(isDialable("+989351112233")).toBe(true);
    expect(isDialable("+98935111223")).toBe(false);
  });
});

describe("verificationAfterChange", () => {
  const verified = new Date("2026-10-01T10:00:00Z");

  it("keeps verification when the number is unchanged", () => {
    const result = verificationAfterChange("+989121234567", verified, "+989121234567");
    expect(result.phoneVerifiedAt).toBe(verified);
    expect(result.invalidated).toBe(false);
  });

  it("voids verification when the number changes", () => {
    const result = verificationAfterChange("+989121234567", verified, "+989351112233");
    expect(result.phoneVerifiedAt).toBeNull();
    expect(result.invalidated).toBe(true);
  });

  it("does not report an invalidation when there was nothing verified", () => {
    const result = verificationAfterChange("+989121234567", null, "+989351112233");
    expect(result.phoneVerifiedAt).toBeNull();
    expect(result.invalidated).toBe(false);
  });

  it("treats a first-ever number as a change of nothing", () => {
    const result = verificationAfterChange(null, null, "+989351112233");
    expect(result.phoneVerifiedAt).toBeNull();
    expect(result.invalidated).toBe(false);
  });
});
