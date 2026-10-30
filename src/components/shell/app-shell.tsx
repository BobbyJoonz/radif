import Link from "next/link";
import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { BrandMark } from "@/components/brand/brand-mark";
import { UserMenu } from "@/components/shell/user-menu";
import { MobileNav, TopNav, type NavItem } from "./nav";

export type ShellSession = {
  userName: string;
  shopName: string;
  role: "owner" | "operator";
  demo: boolean;
  lastSyncAt: string | null;
};

/**
 * The shell is a *ledger header*, not a dashboard chrome: a wordmark row and a
 * rule with the sections under it. No logo tile, no icon rail, no badge
 * confetti. On a phone the same sections move to a thumb-reachable bottom bar.
 */
export function AppShell({
  locale,
  dict,
  session,
  counts,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  session: ShellSession;
  counts: { overdue: number; needsReview: number };
  children: ReactNode;
}) {
  const items: NavItem[] = [
    { key: "today", href: "today", label: dict.nav.today, count: counts.overdue },
    { key: "inbox", href: "inbox", label: dict.nav.inbox },
    { key: "orders", href: "orders", label: dict.nav.orders },
    { key: "tasks", href: "tasks", label: dict.nav.tasks },
    { key: "customers", href: "customers", label: dict.nav.customers },
    { key: "import", href: "import", label: dict.nav.import },
    { key: "settings", href: "settings", label: dict.nav.settings },
    { key: "evaluation", href: "evaluation", label: dict.nav.evaluation },
  ];

  return (
    <div className="appshell">
      <a className="skip-link" href="#main">
        {dict.shell.skipToContent}
      </a>

      <header className="shellhead">
        <div className="shellhead-top">
          <Link href={`/${locale}/today`} className="brand" aria-label={`${dict.brand.name} — ${dict.brand.tagline}`}>
            <BrandMark locale={locale} priority />
          </Link>
          <span className="brand-divider" aria-hidden="true" />
          <span className="shopname">{session.shopName}</span>
          <span className="shellhead-spacer" />
          {session.demo ? (
            <span className="demochip" title={dict.shell.demoLong}>
              <span className="demochip-dot" aria-hidden="true" />
              {dict.shell.demo}
            </span>
          ) : null}
          <UserMenu
            locale={locale}
            name={session.userName}
            roleLabel={session.role === "owner" ? dict.shell.roleOwner : dict.shell.roleOperator}
            shop={session.shopName}
            labels={{
              account: dict.shell.account,
              settings: dict.nav.settings,
              evaluation: dict.nav.evaluation,
              signOut: dict.shell.signOut,
              signingOut: locale === "fa" ? "در حال خروج…" : "Signing out…",
              signOutError: locale === "fa" ? "خروج انجام نشد؛ دوباره تلاش کنید." : "Sign-out failed; try again.",
              menu: dict.shell.account,
            }}
          />
        </div>
        <TopNav items={items} locale={locale} dict={dict} />
      </header>

      <main id="main" className="shellmain">
        {children}
      </main>

      <MobileNav items={items} locale={locale} dict={dict} />
    </div>
  );
}
