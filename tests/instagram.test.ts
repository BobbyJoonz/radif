import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { sealToken, tokenFingerprint, unsealToken } from "@/server/crypto/seal";
import {
  buildAuthUrl,
  parseWebhook,
  signState,
  verifySignature,
  verifyState,
  REQUIRED_SCOPES,
} from "@/server/channels/instagram/api";
import { ingestInbound } from "@/server/services/instagram";
import { resetDatabase } from "./helpers/db";
import { createTenant, type TestTenant } from "./helpers/fixtures";

/**
 * The read-only Instagram path: OAuth state, sealed tokens, webhook parsing and
 * ingestion. No network is touched — Meta's own calls are the one part that cannot
 * be tested offline, and they are isolated behind exchangeCode().
 */
const SECRET = "test-app-secret";

describe("token sealing", () => {
  beforeEach(() => {
    process.env.CHANNEL_TOKEN_ENC_KEY = "a".repeat(64);
  });

  it("round-trips a token and refuses to open it for another tenant", () => {
    const sealed = sealToken("IGQ-token-value", "tenant_a");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("IGQ-token-value");
    expect(unsealToken(sealed, "tenant_a")).toBe("IGQ-token-value");
    expect(() => unsealToken(sealed, "tenant_b")).toThrow();
  });

  it("rejects a tampered ciphertext", () => {
    const sealed = sealToken("IGQ-token-value", "tenant_a");
    const parts = sealed.split(".");
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    expect(() => unsealToken(parts.join("."), "tenant_a")).toThrow();
  });

  it("fingerprints without revealing the token", () => {
    const fingerprint = tokenFingerprint("IGQ-secret");
    expect(fingerprint).toHaveLength(12);
    expect(fingerprint).not.toContain("IGQ");
  });
});

describe("OAuth state", () => {
  it("binds the state to a tenant and rejects a forged or stale one", () => {
    const state = signState({ tenantId: "tenant_a", userId: "user_1", now: Date.now() }, SECRET);
    expect(verifyState(state, SECRET).tenantId).toBe("tenant_a");

    const [body] = state.split(".");
    expect(() => verifyState(`${body}.forged`, SECRET)).toThrow();
    expect(() => verifyState(state, "another-secret")).toThrow();

    const stale = signState({ tenantId: "tenant_a", userId: "user_1", now: Date.now() - 11 * 60_000 }, SECRET);
    expect(() => verifyState(stale, SECRET)).toThrow();
  });

  it("asks only for the scopes this product needs", () => {
    const url = buildAuthUrl({ appId: "123", redirectUri: "https://x/cb", state: "s" });
    expect(url).toContain("response_type=code");
    for (const scope of REQUIRED_SCOPES) expect(url).toContain(scope);
    expect(url).not.toContain("instagram_business_content_publish");
  });
});

describe("webhook", () => {
  it("verifies the signature over the raw body", () => {
    const body = JSON.stringify({ object: "instagram" });
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const signature = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
    expect(verifySignature(body, signature, SECRET)).toBe(true);
    expect(verifySignature(`${body} `, signature, SECRET)).toBe(false);
    expect(verifySignature(body, null, SECRET)).toBe(false);
  });

  it("keeps inbound text, drops echoes, attachments and unsigned ids", () => {
    const events = parseWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841400000000000",
          time: 1_760_000_000_000,
          messaging: [
            { sender: { id: "sender_1", username: "negar" }, message: { mid: "mid_1", text: "سلام" } },
            { sender: { id: "sender_1" }, message: { mid: "mid_2", text: "echo", is_echo: true } },
            { sender: { id: "sender_2" }, message: { mid: "mid_3" } },
            { sender: { id: "sender_3" }, message: { text: "no mid" } },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ accountId: "17841400000000000", senderId: "sender_1", messageId: "mid_1", text: "سلام" });
  });
});

describe("ingestion (read-only)", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
    await prisma.channelConnection.create({
      data: {
        tenantId: toranj.tenantId,
        channel: "instagram",
        accountRef: "17841400000000000",
        displayName: "@toranj.studio",
        status: "connected",
      },
    });
  });

  it("stores a message once, under the right customer and conversation", async () => {
    const event = {
      accountId: "17841400000000000",
      senderId: "sender_1",
      senderUsername: "negar",
      messageId: "mid_1",
      text: "سلام، شال موجوده؟",
      occurredAt: new Date("2026-10-31T08:00:00Z"),
    };

    const first = await ingestInbound([event]);
    expect(first).toEqual({ stored: 1, duplicates: 0, ignored: 0, unknownAccount: 0 });

    const second = await ingestInbound([event]);
    expect(second).toEqual({ stored: 0, duplicates: 1, ignored: 0, unknownAccount: 0 });

    const messages = await prisma.message.findMany({ where: { tenantId: toranj.tenantId, source: "instagram" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].externalRef).toBe("mid_1");

    const conversation = await prisma.conversation.findFirst({
      where: { tenantId: toranj.tenantId },
      select: { channelRef: true, customer: { select: { displayName: true } } },
    });
    expect(conversation?.channelRef).toBe("sender_1");
    expect(conversation?.customer.displayName).toBe("@negar");
  });

  it("ignores an unknown account instead of attaching it to a random shop", async () => {
    const result = await ingestInbound([
      {
        accountId: "999",
        senderId: "sender_9",
        senderUsername: null,
        messageId: "mid_9",
        text: "hi",
        occurredAt: new Date(),
      },
    ]);
    expect(result).toEqual({ stored: 0, duplicates: 0, ignored: 0, unknownAccount: 1 });
  });
});
