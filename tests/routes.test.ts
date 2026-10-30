import { describe, expect, it } from "vitest";
import { canonicalParam, first, routes } from "@/lib/routes";

/**
 * The URL contract. These tests exist because the audit found the same detail
 * reachable under three different conventions (a `?o=` producer, a `?c=`
 * producer, and a `/orders/{id}` path that no page served), which is exactly the
 * kind of mismatch that silently opens the wrong record.
 */
describe("routes", () => {
  it("puts the selected record in a query parameter, never in the path", () => {
    expect(routes.orders("fa", "order_1042")).toBe("/fa/orders?order=order_1042");
    expect(routes.inbox("en", "conv_negar")).toBe("/en/inbox?conversation=conv_negar");
    expect(routes.customers("fa", "cust_negar")).toBe("/fa/customers?customer=cust_negar");
  });

  it("drops empty or missing values instead of serialising them", () => {
    expect(routes.orders("fa")).toBe("/fa/orders");
    expect(routes.orders("fa", "")).toBe("/fa/orders");
    expect(routes.inbox("fa", null)).toBe("/fa/inbox");
    expect(routes.today("fa", { order: "  " })).toBe("/fa/today");
  });

  it("keeps selection and filters together on the workdesk", () => {
    expect(routes.today("fa", { order: "order_1042", due: "overdue", assignee: "me" })).toBe(
      "/fa/today?order=order_1042&assignee=me&due=overdue",
    );
  });

  it("trims ids so a pasted URL cannot smuggle whitespace", () => {
    expect(routes.orders("fa", "  order_1042  ")).toBe("/fa/orders?order=order_1042");
  });

  it("switches language without losing the path tail, the selection or the filters", () => {
    expect(routes.switchLocale("/fa/orders", "?order=order_1042", "en")).toBe("/en/orders?order=order_1042");
    expect(routes.switchLocale("/fa/today", "?due=overdue", "en")).toBe("/en/today?due=overdue");
    expect(routes.switchLocale("/fa", "", "en")).toBe("/en");
  });
});

describe("canonicalParam", () => {
  it("reads the canonical name first", () => {
    expect(canonicalParam({ order: "order_1" }, "order")).toEqual({ value: "order_1", legacy: false });
  });

  it("accepts the legacy short names and reports that a redirect is needed", () => {
    expect(canonicalParam({ o: "order_1" }, "order")).toEqual({ value: "order_1", legacy: true });
    expect(canonicalParam({ c: "cust_1" }, "customer")).toEqual({ value: "cust_1", legacy: true });
    expect(canonicalParam({ c: "conv_1" }, "conversation")).toEqual({ value: "conv_1", legacy: true });
  });

  it("never invents a selection", () => {
    expect(canonicalParam({}, "order")).toEqual({ value: undefined, legacy: false });
    expect(first(["", "  "])).toBeUndefined();
  });
});
