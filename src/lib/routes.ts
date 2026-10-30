import type { Locale } from "@/i18n/config";

/**
 * One place that knows what a product URL looks like.
 *
 * The audit found three different conventions for the same three details
 * (`?o=` vs `?order=`, `?c=` vs `?customer=`/`?conversation=`, and a
 * `/orders/{id}` path that no page serves). Every producer now goes through this
 * module, and the pages read exactly these parameters.
 *
 * Rules:
 *   • the detail id is a query parameter, because the list and the detail are one
 *     page with one selection;
 *   • unknown/empty values are dropped, never serialised as "undefined";
 *   • filters survive selection changes, and selection survives filter changes;
 *   • legacy `?o=` / `?c=` are read by the pages for one release, then removed.
 */
export type TodayView = "mine" | "unassigned" | "waiting" | "decisions" | "all";
export type DueView = "overdue" | "next24h" | "next7d";

export type TodayQuery = {
  order?: string | null;
  conversation?: string | null;
  assignee?: "me" | "unassigned" | null;
  due?: DueView | null;
};

function qs(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const routes = {
  landing: (locale: Locale) => `/${locale}`,

  /** The workdesk (today). A selected case is a query parameter, not a path. */
  today: (locale: Locale, query: TodayQuery = {}) =>
    `/${locale}/today${qs({
      order: clean(query.order),
      conversation: clean(query.conversation),
      assignee: query.assignee ?? null,
      due: query.due ?? null,
    })}`,

  inbox: (locale: Locale, conversationId?: string | null) =>
    `/${locale}/inbox${qs({ conversation: clean(conversationId) })}`,

  orders: (locale: Locale, orderId?: string | null, status?: string | null) =>
    `/${locale}/orders${qs({ order: clean(orderId), status: clean(status) })}`,

  customers: (locale: Locale, customerId?: string | null, q?: string | null) =>
    `/${locale}/customers${qs({ customer: clean(customerId), q: clean(q) })}`,

  tasks: (locale: Locale) => `/${locale}/tasks`,
  import: (locale: Locale) => `/${locale}/import`,
  settings: (locale: Locale) => `/${locale}/settings`,
  evaluation: (locale: Locale) => `/${locale}/evaluation`,
  login: (locale: Locale, next?: string | null) => `/${locale}/login${qs({ next: clean(next) })}`,
  signup: (locale: Locale) => `/${locale}/signup`,
  customerDemo: (locale: Locale) => `/${locale}/demo/customer`,

  /**
   * Rebuild the same destination in the other language, keeping the path tail,
   * the selection and the filters. Used by the language switch, which used to
   * drop the query string and therefore the selected record.
   */
  switchLocale: (pathname: string, search: string, target: Locale) => {
    const stripped = pathname.replace(/^\/(fa|en)(?=\/|$)/, "");
    const tail = stripped === "" ? "" : stripped;
    const query = search.startsWith("?") ? search : search ? `?${search}` : "";
    return `/${target}${tail}${query}`;
  },
};

/** Reads a query value that may be an array (Next gives string[] for repeats). */
export function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Legacy parameter names the audit found in links: `o` for order and `c` for
 * customer/conversation. Pages accept them for one release; this helper returns
 * the canonical value plus whether the request needs redirecting.
 */
export function canonicalParam(
  sp: Record<string, string | string[] | undefined>,
  canonical: "order" | "customer" | "conversation",
): { value: string | undefined; legacy: boolean } {
  const direct = first(sp[canonical]);
  if (direct) return { value: direct, legacy: false };
  if (canonical === "order" && first(sp.o)) return { value: first(sp.o), legacy: true };
  if ((canonical === "customer" || canonical === "conversation") && first(sp.c)) {
    return { value: first(sp.c), legacy: true };
  }
  return { value: undefined, legacy: false };
}
