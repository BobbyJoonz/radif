import { describe, expect, it } from "vitest";
import { canSee, navKeysFor, ownerOnlySections } from "@/lib/nav-matrix";

/**
 * Audit MENU_MATRIX.csv / RBAC_MATRIX.csv, as a test.
 *
 * The owner runs the shop; the operator works the queue. Import, settings and
 * evaluation are owner sections, and the operator must not be offered them in the
 * menu (and, per the pages' own guard, must not reach them by URL either).
 */
describe("navigation follows the audit menu matrix", () => {
  it("owner sees the eight shop sections", () => {
    expect(navKeysFor("owner")).toEqual(["today", "inbox", "orders", "tasks", "customers", "import", "settings", "evaluation"]);
  });

  it("operator sees the five work sections and no administration", () => {
    expect(navKeysFor("operator")).toEqual(["today", "inbox", "orders", "tasks", "customers"]);
    for (const key of ["import", "settings", "evaluation"] as const) {
      expect(canSee("operator", key)).toBe(false);
      expect(canSee("owner", key)).toBe(true);
    }
  });

  it("the owner-only set is exactly the three administration sections", () => {
    expect(ownerOnlySections()).toEqual(["import", "settings", "evaluation"]);
  });
});
