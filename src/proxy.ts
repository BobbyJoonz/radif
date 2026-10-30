import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, defaultLocale, isLocale } from "@/i18n/config";

/**
 * Locale routing (Next 16 calls this "proxy"; it was "middleware" before 16).
 *
 * It only does the two cheap things a proxy should do:
 *   1. give every page a locale prefix (`/` → `/fa`, `/inbox` → `/fa/inbox`);
 *   2. remember the last locale in a cookie so the next bare URL keeps it.
 *
 * It does NOT check sessions. Authorization belongs in the route/page, where
 * the tenant is known — the docs are explicit that a proxy is not a session
 * layer, and a cookie-presence check there would be security theatre.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // An *optimistic* gate so an anonymous visitor never waits for a streamed
  // page that then redirects client-side: a real 307, no flash. The
  // authoritative check stays in the (app) layout, as the Next docs require.
  const appMatch = pathname.match(/^\/(fa|en)\/(today|inbox|orders|tasks|customers|import|settings|evaluation)(\/|$)/);
  if (appMatch && !request.cookies.has("radif.session_token")) {
    const url = request.nextUrl.clone();
    url.pathname = `/${appMatch[1]}/login`;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const hasLocale = /^\/(fa|en)(\/|$)/.test(pathname);
  if (hasLocale) {
    const response = NextResponse.next();
    const urlLocale = pathname.split("/")[1];
    if (isLocale(urlLocale)) {
      response.cookies.set(LOCALE_COOKIE, urlLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return response;
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API routes, Next internals, and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|fonts|favicon\\.ico|.*\\..*).*)"],
};
