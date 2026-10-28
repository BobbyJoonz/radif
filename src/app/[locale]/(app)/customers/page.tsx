import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomersScreen } from "@/components/screens/customers-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";
import { getCustomer, listCustomers } from "@/server/services/customers";
import type { CustomerDetailDTO, CustomerRow } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : "fa").nav.customers };
}

export default async function CustomersPage({
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

  const q = typeof sp.q === "string" ? sp.q : "";
  const requested = typeof sp.customer === "string" ? sp.customer : null;

  let state = readDesignedState(sp.state);
  let rows: CustomerRow[] = [];
  let detail: CustomerDetailDTO | null = null;

  if (!state) {
    try {
      rows = await listCustomers(ctx, q);
      const target = requested ?? rows[0]?.id ?? null;
      detail = target ? await getCustomer(ctx, target) : null;
      if (rows.length === 0) state = "empty";
    } catch (error) {
      console.error("[customers] read failed", error);
      state = "error";
    }
  }

  return (
    <CustomersScreen
      locale={locale}
      rows={rows}
      detail={detail}
      q={q}
      state={state}
      nowISO={new Date().toISOString()}
    />
  );
}
