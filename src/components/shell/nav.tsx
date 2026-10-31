"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { otherLocale } from "@/i18n/config";
import { TabIcon } from "./tab-icons";
import type { NavKey } from "@/lib/nav-matrix";

export type NavItem = { key: string; href: string; label: string; count?: number };

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(fa|en)(?=\/|$)/, "") || "/";
}

// A section's menu key is not always its route: the inbox lives at /conversations.
// Without this the current section is unmarked on that screen (aria-current null).
const ROUTE_ALIASES: Record<string, string> = { inbox: "conversations" };

function isActive(pathname: string, href: string): boolean {  const here = stripLocale(pathname);
  if (href === "") return here === "/";
  if (here === `/${href}` || here.startsWith(`/${href}/`)) return true;
  const alias = ROUTE_ALIASES[href];
  return alias ? here === `/${alias}` || here.startsWith(`/${alias}/`) : false;}

export function TopNav({
  items,
  locale,
  dict,
}: {
  items: NavItem[];
  locale: Locale;
  dict: Dictionary;
}) {
  const pathname = usePathname();
  const primary = items.slice(0, 5);
  const secondary = items.slice(5);

  return (
    <nav className="topnav" aria-label={dict.nav.primary}>
      <ul className="topnav-primary">
        {primary.map((item) => (
          <li key={item.key}>
            <Link
              href={`/${locale}${item.href ? `/${item.href}` : ""}`}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="topnav-link"
            >
              {item.label}
              {typeof item.count === "number" && item.count > 0 ? (
                <span className="topnav-count nums">{item.count.toLocaleString(locale === "fa" ? "fa-IR" : "en-GB")}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="topnav-secondary">
        {secondary.map((item) => (
          <li key={item.key}>
            <Link
              href={`/${locale}/${item.href}`}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="topnav-link subtle"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <LocaleSwitch locale={locale} dict={dict} />
    </nav>
  );
}

function LocaleSwitch({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const pathname = usePathname();
  const target = otherLocale(locale);
  const stripped = stripLocale(pathname);
  const href = `/${target}${stripped === "/" ? "" : stripped}`;
  return (
    <Link
      href={href}
      className="lang-switch"
      aria-label={dict.lang.switchTo}
      title={dict.lang.switchTo}
      hrefLang={target}
    >
      {target === "en" ? "EN" : "فا"}
    </Link>
  );
}

export function MobileNav({ items, locale, dict }: { items: NavItem[]; locale: Locale; dict: Dictionary }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = items.slice(0, 4);
  // "More" lists what the bar cannot hold; settings is only listed once.
  const rest = items.slice(4).filter((item) => item.key !== "settings");
  const settingsItem = items.find((item) => item.key === "settings");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <nav className="tabbar" aria-label={dict.nav.primary}>
        {primary.map((item) => (
          <Link
            key={item.key}
            href={`/${locale}${item.href ? `/${item.href}` : ""}`}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className="tabbar-item"
          >
            <TabIcon name={item.key as NavKey} className="tabbar-icon" />
            <span className="tabbar-label">{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className="tabbar-item"
          aria-expanded={open}
          aria-controls="tabbar-sheet"
          onClick={() => setOpen((value) => !value)}
        >
          <TabIcon name="more" className="tabbar-icon" />
          <span className="tabbar-label">{dict.nav.more}</span>
        </button>
      </nav>

      {open ? (
        <>
          <button
            type="button"
            className="tabbar-scrim"
            aria-label={dict.shell.closeMenu}
            onClick={() => setOpen(false)}
          />
          <div className="tabbar-sheet" id="tabbar-sheet" role="dialog" aria-modal="true" aria-label={dict.nav.menu}>
            <span className="tabbar-grabber" aria-hidden="true" />
            <ul>
              {rest.map((item) => (
                <li key={item.key}>
                  <Link
                    href={`/${locale}/${item.href}`}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <TabIcon name={item.key as NavKey} className="tabbar-sheet-icon" />
                    {item.label}
                  </Link>
                </li>
              ))}
              {settingsItem && !rest.some((item) => item.key === "settings") ? (
                <li>
                  <Link href={`/${locale}/settings`} onClick={() => setOpen(false)}>
                    <TabIcon name="settings" className="tabbar-sheet-icon" />
                    {settingsItem.label}
                  </Link>
                </li>
              ) : null}
              <li>
                <LocaleLink locale={locale} dict={dict} />
              </li>
            </ul>
            <button type="button" className="tabbar-close" onClick={() => setOpen(false)}>
              {dict.shell.closeMenu}
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

function LocaleLink({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const pathname = usePathname();
  const target = otherLocale(locale);
  const stripped = stripLocale(pathname);
  return (
    <Link href={`/${target}${stripped === "/" ? "" : stripped}`} onClick={() => {}}>
      {dict.lang.switchTo}
    </Link>
  );
}
