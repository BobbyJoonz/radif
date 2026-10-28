import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrdersScreen } from "@/components/screens/orders-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";
import { getOrder, listOrders } from "@/server/services/orders";
import type { OrderDetailDTO, OrderRow, OrderStatusValue } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : "fa").nav.orders };
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const sp = await searchParams;

  const ctx = await getSessionContext();
  if (!ctx) redirect(withLocale(locale, "/login"));

  const statusParam = typeof sp.status === "string" ? sp.status : "all";
  const filter: "all" | OrderStatusValue = statusParam as "all" | OrderStatusValue;
  const requested = typeof sp.order === "string" ? sp.order : null;

  let state = readDesignedState(sp.state);
  let rows: OrderRow[] = [];
  let detail: OrderDetailDTO | null = null;

  if (!state) {
    try {
      rows = await listOrders(ctx, filter === "all" ? undefined : { status: filter });
      const target = requested ?? rows[0]?.id ?? null;
      detail = target ? await getOrder(ctx, target) : null;
      if (rows.length === 0) state = "empty";
    } catch (error) {
      console.error("[orders] read failed", error);
      state = "error";
    }
  }

  return (
    <OrdersScreen
      locale={locale}
      rows={rows}
      detail={detail}
      filter={filter}
      role={ctx.role}
      state={state}
      nowISO={new Date().toISOString()}
    />
  );
}
