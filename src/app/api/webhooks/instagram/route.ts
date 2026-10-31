import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handler, ok } from "@/server/http";
import { instagramConfig, parseWebhook, verifyChallenge, verifySignature } from "@/server/channels/instagram/api";

/**
 * Instagram webhooks.
 *
 * GET  — Meta's subscription handshake (hub.mode/token/challenge).
 * POST — store the raw delivery, then answer 200 immediately.
 *
 * The order matters: a webhook is customer data, and Meta treats a non-200 as a
 * reason to disable the subscription. Persisting first means a parsing bug or a slow
 * database cannot lose the message — the drain step processes the stored rows.
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
  const signatureOk = verifySignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret);
  if (!signatureOk) {
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
  const accountRef = events[0]?.accountId ?? "";
  const stored = await prisma.webhookEvent.create({
    data: { provider: "instagram", accountRef, payload: payload as object, signatureOk: true },
    select: { id: true },
  });

  return ok({ stored: stored.id, events: events.length });
});
