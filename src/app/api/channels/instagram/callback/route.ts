import { NextResponse } from "next/server";
import { handler } from "@/server/http";
import { requireSession } from "@/server/session";
import { completeConnect } from "@/server/instagram";

/**
 * GET /api/channels/instagram/callback — finish the handshake.
 *
 * Failures redirect back to settings with a reason instead of rendering a JSON error
 * in a browser tab the user did not ask for.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const settings = (status: string) => NextResponse.redirect(new URL(`/fa/settings?instagram=${status}`, url.origin));

  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) return settings("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return settings("invalid");

  try {
    const ctx = await requireSession();
    const redirectUri = new URL("/api/channels/instagram/callback", url.origin).toString();
    await completeConnect(ctx, { code, state, redirectUri });
    return settings("connected");
  } catch {
    return settings("failed");
  }
});
