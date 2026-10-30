import { describe, expect, it } from "vitest";
import { accountMenuKeys, canSee, navKeysFor, ownerOnlySections } from "@/lib/nav-matrix";

/**
 * The audit's P1: the main navigation was role-aware, but the account menu still
 * offered settings and evaluation to an operator. Navigation is one policy, so it
 * is tested as one policy — and the real authorisation is still server-side.
 */
describe("navigation capability policy", () => {
  it("gives the owner every section", () => {
    expect(navKeysFor("owner")).toEqual([
      "today",
      "inbox",
      "orders",
      "tasks",
      "customers",
      "import",
      "settings",
      "evaluation",
    ]);
  });

  it("keeps import, settings and evaluation away from the operator", () => {
    const operator = navKeysFor("operator");
    expect(operator).toEqual(["today", "inbox", "orders", "tasks", "customers"]);
    for (const key of ownerOnlySections()) {
      expect(operator).not.toContain(key);
      expect(canSee("operator", key)).toBe(false);
    }
  });

  it("never renders an account-menu door the role cannot open", () => {
    expect(accountMenuKeys("owner")).toEqual(["settings", "evaluation"]);
    expect(accountMenuKeys("operator")).toEqual([]);
  });

  it("returns copies, so a caller cannot mutate the policy", () => {
    const keys = navKeysFor("owner");
    keys.push("settings");
    expect(navKeysFor("owner")).toHaveLength(8);
  });
});
