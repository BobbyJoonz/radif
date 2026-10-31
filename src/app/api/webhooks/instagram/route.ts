import { NextResponse } from "next/server";
import { handler, ok } from "@/server/http";
import { instagramConfig, parseWebhook, verifyChallenge, verifySignature } from "@/server/channels/instagram/api";
import { ingestInbound } from "@/server/services/instagram";

/**
 * Instagram webhooks.
 *
 * GET  — Meta's subscription handshake (hub.mode/token/challenge).
 * POST — message events. The body is read as text first, because the signature is
 *        computed over the raw bytes; parsing before verifying would be a hole.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const challenge = verifyChallenge(
    {
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
    },
    instagramConfig().verifyToken,
  );
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
});

export const POST = handler(async (request: Request) => {
  const raw = await request.text();
  const config = instagramConfig();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_signature", message: "امضای وبهوک معتبر نیست." } },
      { status: 401 },
    );
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_json", message: "بدنهٔ وبهوک JSON نیست." } }, { status: 400 });
  }

  const events = parseWebhook(payload);
  const result = await ingestInbound(events);
  // Meta only needs a 200; the counts are for our logs and health screen.
  return ok(result);
});
