import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Instagram (Meta) connect + webhook primitives.
 *
 * Read-only ingestion first: OAuth, token exchange, webhook subscription and
 * signature verification. Nothing here sends a message — that is a deliberate
 * later step, and the UI must not pretend otherwise.
 *
 * Docs this follows:
 *   • Instagram API with Instagram Login — authorization code flow
 *     GET https://www.instagram.com/oauth/authorize  → code
 *     POST https://api.instagram.com/oauth/access_token → short-lived token
 *     GET  https://graph.instagram.com/access_token    → long-lived token (60d)
 *     GET  https://graph.instagram.com/v23.0/me?fields=user_id,username,account_type
 *   • Webhooks: GET verify (hub.challenge) + POST with X-Hub-Signature-256
 *     (HMAC-SHA256 of the raw body with the app secret).
 */

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION ?? "v23.0";
const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;

/** Reading DMs needs this scope; the app review grant is what actually enables it. */
export const REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
] as const;

export class InstagramError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export function instagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
  return {
    appId: appId ?? null,
    appSecret: appSecret ?? null,
    verifyToken: verifyToken ?? null,
    configured: Boolean(appId && appSecret),
    graphVersion: GRAPH_VERSION,
  };
}

// ── OAuth state: signed, short-lived, tenant-bound ──────────────────────────

export type ConnectState = { tenantId: string; userId: string; nonce: string; issuedAt: number };

const STATE_TTL_MS = 10 * 60_000;

function stateKey(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signState(input: { tenantId: string; userId: string; now?: number }, secret: string): string {
  const payload: ConnectState = {
    tenantId: input.tenantId,
    userId: input.userId,
    nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
    issuedAt: input.now ?? Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${stateKey(secret, body)}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): ConnectState {
  const [body, signature] = state.split(".");
  if (!body || !signature) throw new InstagramError("state is malformed");
  const expected = stateKey(secret, body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InstagramError("state signature is invalid");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConnectState;
  if (now - payload.issuedAt > STATE_TTL_MS) throw new InstagramError("state has expired");
  return payload;
}

// ── Meta calls ─────────────────────────────────────────────────────────────

export function buildAuthUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function postForm(url: string, fields: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || (body as { error_message?: string } | null)?.error_message) {
    throw new InstagramError(`Meta rejected ${url}`, response.status, body);
  }
  return body;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body || body.error) {
    throw new InstagramError(`Meta rejected ${url}`, response.status, body);
  }
  return body;
}

export type ExchangeResult = { accessToken: string; expiresAt: Date; userId: string; username: string };

/** code → long-lived token → who it belongs to. */
export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
  now?: Date;
}): Promise<ExchangeResult> {
  const short = (await postForm(TOKEN_URL, {
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  })) as { access_token?: string };

  if (!short.access_token) throw new InstagramError("no access_token in the code exchange");

  const longLived = await getJson(
    `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
      input.appSecret,
    )}&access_token=${encodeURIComponent(short.access_token)}`,
  );
  const accessToken = String(longLived.access_token ?? short.access_token);
  const expiresIn = Number(longLived.expires_in ?? 60 * 24 * 3600);

  const me = await getJson(`${GRAPH}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(accessToken)}`);
  const userId = String(me.user_id ?? me.id ?? "");
  const username = String(me.username ?? "");
  if (!userId || !username) throw new InstagramError("the token does not resolve to an Instagram account");

  return {
    accessToken,
    expiresAt: new Date((input.now ?? new Date()).getTime() + expiresIn * 1000),
    userId,
    username,
  };
}

// ── Webhooks ───────────────────────────────────────────────────────────────

export function verifyChallenge(query: { mode: string | null; token: string | null; challenge: string | null }, verifyToken: string | null): string {
  if (!verifyToken) throw new InstagramError("INSTAGRAM_WEBHOOK_VERIFY_TOKEN is not set");
  if (query.mode !== "subscribe" || query.token !== verifyToken || !query.challenge) {
    throw new InstagramError("webhook verification failed");
  }
  return query.challenge;
}

/** Constant-time HMAC check of X-Hub-Signature-256 against the raw body. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string | null): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type InboundMessage = {
  accountId: string;
  senderId: string;
  senderUsername: string | null;
  messageId: string;
  text: string;
  occurredAt: Date;
};

type WebhookEntry = {
  id?: string;
  time?: number;
  messaging?: {
    sender?: { id?: string; username?: string };
    recipient?: { id?: string };
    timestamp?: number;
    message?: { mid?: string; text?: string; is_echo?: boolean };
  }[];
};

/**
 * Turn a webhook payload into messages we can store.
 *
 * Skipped on purpose: echoes (our own sends), non-text (attachments/stickers, which
 * need a different model), and anything without a mid — a message we cannot dedupe
 * is a message we will store twice.
 */
export function parseWebhook(payload: unknown): InboundMessage[] {
  const body = payload as { object?: string; entry?: WebhookEntry[] } | null;
  if (!body || body.object !== "instagram" || !Array.isArray(body.entry)) return [];

  const out: InboundMessage[] = [];
  for (const entry of body.entry) {
    const accountId = entry.id;
    if (!accountId) continue;
    for (const event of entry.messaging ?? []) {
      const message = event.message;
      if (!message || message.is_echo === true || !message.mid) continue;
      if (message.text === undefined) continue;
      out.push({
        accountId,
        senderId: event.sender?.id ?? "",
        senderUsername: event.sender?.username ?? null,
        messageId: message.mid,
        text: message.text,
        occurredAt: new Date(event.timestamp ?? entry.time ?? Date.now()),
      });
    }
  }
  return out.filter((item) => item.senderId.length > 0);
}
