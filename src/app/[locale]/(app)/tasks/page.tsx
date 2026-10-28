import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TasksScreen } from "@/components/screens/tasks-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";
import { listTasks } from "@/server/services/tasks";
import type { TaskRow } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : "fa").nav.tasks };
}

export default async function TasksPage({
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

  const showDone = sp.done === "1";
  let state = readDesignedState(sp.state);
  let rows: TaskRow[] = [];

  if (!state) {
    try {
      rows = await listTasks(ctx, { includeDone: showDone });
      if (rows.length === 0) state = "empty";
    } catch (error) {
      console.error("[tasks] read failed", error);
      state = "error";
    }
  }

  return (
    <TasksScreen
      locale={locale}
      rows={rows}
      showDone={showDone}
      userId={ctx.user.id}
      role={ctx.role}
      state={state}
      nowISO={new Date().toISOString()}
    />
  );
}
