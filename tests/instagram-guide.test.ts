import { describe, expect, it } from "vitest";
import { buildGuide, diagnose, type GuideState } from "@/server/instagram/guide";

const base: GuideState = {
  appConfigured: true,
  verifyTokenSet: true,
  sealKeySet: true,
  webhookOrigin: "https://radif.example",
  connectedAccount: null,
  tokenStatus: "absent",
  lastWebhookAt: null,
  pendingWebhooks: 0,
};

describe("connect guide", () => {
  it("names the webhook URL the user must paste in Meta", () => {
    const { steps } = buildGuide(base);
    expect(steps[2].copyValue).toBe("https://radif.example/api/webhooks/instagram");
  });

  it("marks the missing environment variable as the blocker, in order", () => {
    expect(buildGuide({ ...base, sealKeySet: false }).blocker).toContain("CHANNEL_TOKEN_ENC_KEY");
    expect(buildGuide({ ...base, appConfigured: false }).blocker).toContain("INSTAGRAM_APP_ID");
    expect(buildGuide({ ...base, verifyTokenSet: false }).blocker).toContain("INSTAGRAM_WEBHOOK_VERIFY_TOKEN");
    expect(buildGuide(base).blocker).toBeNull();
    expect(buildGuide(base).ready).toBe(true);
  });

  it("only claims connection is done when a webhook arrived and the token works", () => {
    const open = buildGuide(base);
    expect(open.steps[5].ok).toBe(false);

    const done = buildGuide({ ...base, connectedAccount: "@toranj", tokenStatus: "valid", lastWebhookAt: "2026-10-31T10:00:00Z" });
    expect(done.steps[4].ok).toBe(true);
    expect(done.steps[5].ok).toBe(true);
  });

  it("diagnoses the three real failures in the right order", () => {
    expect(diagnose({ pendingWebhooks: 2, tokenStatus: "valid", lastWebhookAt: "x" })).toContain("drain");
    expect(diagnose({ pendingWebhooks: 0, tokenStatus: "invalid", lastWebhookAt: "x" })).toContain("توکن");
    expect(diagnose({ pendingWebhooks: 0, tokenStatus: "valid", lastWebhookAt: null })).toContain("وبهوک");
    expect(diagnose({ pendingWebhooks: 0, tokenStatus: "valid", lastWebhookAt: "x" })).toContain("سالم");
  });
});
