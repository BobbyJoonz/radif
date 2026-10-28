import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InboxScreen } from "@/components/screens/inbox-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";
import { getConversation, listConversations } from "@/server/services/inbox";
import type { ConversationDetailDTO, ConversationRow } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : "fa").nav.inbox };
}

export default async function InboxPage({
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

  const filter = (typeof sp.filter === "string" ? sp.filter : "all") as
    | "all"
    | "unanswered"
    | "payment"
    | "review";
  const q = typeof sp.q === "string" ? sp.q : "";
  const requested = typeof sp.conversation === "string" ? sp.conversation : null;

  let state = readDesignedState(sp.state);
  let rows: ConversationRow[] = [];
  let detail: ConversationDetailDTO | null = null;

  if (!state) {
    try {
      rows = await listConversations(ctx, { filter, q });
      const target = requested ?? rows[0]?.id ?? null;
      detail = target ? await getConversation(ctx, target) : null;
      if (detail === null && rows.length === 0) state = "empty";
    } catch (error) {
      console.error("[inbox] read failed", error);
      state = "error";
    }
  }

  return (
    <InboxScreen
      locale={locale}
      rows={rows}
      detail={detail}
      filter={filter}
      q={q}
      role={ctx.role}
      state={state}
      nowISO={new Date().toISOString()}
    />
  );
}
