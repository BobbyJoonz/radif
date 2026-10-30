/**
 * Phone values, in one place.
 *
 * The audit found the planner emitting `order.phone` while the review route only
 * applied `customer.phone`, so a phone number could be "accepted" and land
 * nowhere. The name is canonical now (`customer.phone`), and so is the rule for
 * what a change does to verification: an accepted suggestion is not proof of
 * possession, and changing a previously verified number must not leave that old
 * verification standing.
 */

const IRAN_MOBILE = /^\+989\d{9}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

export function isDialable(phone: string): boolean {
  // An Iranian number must have the full Iranian mobile shape; the generic E164
  // rule alone would accept a +98 number that is one digit short.
  if (phone.startsWith("+98")) return IRAN_MOBILE.test(phone);
  return E164.test(phone);
}

/** Trim and keep only the digits/plus the contract allows. Never guess a prefix. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s()-]/g, "");
  return isDialable(compact) ? compact : null;
}

/**
 * The verification state after writing `next` over `previous`.
 *
 *   • same number            → keep whatever verification existed
 *   • changed number         → verification of the old value is void (null)
 *   • no previous phone      → nothing to invalidate
 *
 * The caller still decides *when* to write this; the rule itself is here so it
 * can be tested without a database.
 */
export function verificationAfterChange(
  previousPhone: string | null,
  previousVerifiedAt: Date | null,
  nextPhone: string,
): { phone: string; phoneVerifiedAt: Date | null; invalidated: boolean } {
  const changed = previousPhone !== null && previousPhone !== nextPhone;
  return {
    phone: nextPhone,
    phoneVerifiedAt: changed ? null : previousVerifiedAt,
    invalidated: changed && previousVerifiedAt !== null,
  };
}
