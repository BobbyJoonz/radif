"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { otherLocale } from "@/i18n/config";

export type NavItem = { key: string; href: string; label: string; count?: number };

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(fa|en)(?=\/|$)/, "") || "/";
}

function isActive(pathname: string, href: string): boolean {
  const here = stripLocale(pathname);
  if (href === "") return here === "/";
  return here === `/${href}` || here.startsWith(`/${href}/`);
}

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
  const rest = items.slice(4);

  return (
    <>
      <nav className="mobilenav" aria-label={dict.nav.primary}>
        {primary.map((item) => (
          <Link
            key={item.key}
            href={`/${locale}${item.href ? `/${item.href}` : ""}`}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className="mobilenav-link"
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          className="mobilenav-link"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {dict.nav.more}
        </button>
      </nav>
      {open ? (
        <div className="mobilenav-sheet" role="dialog" aria-label={dict.nav.menu}>
          <ul>
            {rest.map((item) => (
              <li key={item.key}>
                <Link
                  href={`/${locale}/${item.href}`}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={`/${locale}/settings`} onClick={() => setOpen(false)}>
                {dict.nav.settings}
              </Link>
            </li>
            <li>
              <LocaleLink locale={locale} dict={dict} />
            </li>
          </ul>
          <button type="button" className="mobilenav-close" onClick={() => setOpen(false)}>
            {dict.shell.closeMenu}
          </button>
        </div>
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
