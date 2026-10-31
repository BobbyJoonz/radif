import { NextResponse } from "next/server";
import { handler } from "@/server/http";
import { requireSession } from "@/server/session";
import { startConnect } from "@/server/instagram";

/**
 * GET /api/channels/instagram/connect — start the OAuth handshake (owner only).
 * Redirects to Meta; the tenant travels inside a signed, short-lived state.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const ctx = await requireSession();
  const url = new URL(request.url);
  const redirectUri = new URL("/api/channels/instagram/callback", url.origin).toString();
  try {
    const target = await startConnect(ctx, redirectUri);
    return NextResponse.redirect(target);
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    const back = new URL(`/${ctx.user.locale === "en" ? "en" : "fa"}/settings?instagram=config`, url.origin);
    return NextResponse.redirect(back);
  }
});
