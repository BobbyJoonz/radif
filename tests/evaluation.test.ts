import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listRuns } from "@/server/services/evaluation";
import { resetDatabase } from "./helpers/db";
import {
  createAnalysisRun,
  createConnection,
  createConversation,
  createCustomer,
  createMessage,
  createSuggestion,
  createTenant,
  type TestTenant,
} from "./helpers/fixtures";

/**
 * Evaluation — intents come from the suggestions a human can see, and "not
 * measured" stays `null`. A zero here would be a claim about cost that nobody made.
 */
describe("evaluation service", () => {
  let tenant: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ idPrefix: "tenant_eval" });
  });

  async function seedMessage() {
    const connection = await createConnection(tenant.tenantId);
    const customer = await createCustomer(tenant.tenantId, {});
    const conversation = await createConversation(tenant.tenantId, {
      connectionId: connection.id,
      customerId: customer.id,
    });
    const message = await createMessage(tenant.tenantId, {
      conversationId: conversation.id,
      text: "واریز کردم، کد رهگیری رو می‌فرستید؟ آدرسم هم عوض شده",
    });
    return { message, conversation, customer };
  }

  it("keeps usage and cost null when the provider reported nothing", async () => {
    const { message } = await seedMessage();
    await createAnalysisRun(tenant.tenantId, message.id, { latencyMs: 240 });

    const rows = await listRuns(tenant.ctx);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      messageId: message.id,
      provider: "mock",
      model: "mock-v1",
      status: "succeeded",
      latencyMs: 240,
    });
    expect(rows[0]!.tokensIn).toBeNull();
    expect(rows[0]!.tokensOut).toBeNull();
    expect(rows[0]!.costMicroUsd).toBeNull();
    expect(rows[0]!.intents).toEqual([]);
  });

  it("parses every intent from the run's suggestions, in proposal order", async () => {
    const { message } = await seedMessage();
    const run = await createAnalysisRun(tenant.tenantId, message.id);
    await createSuggestion(tenant.tenantId, {
      analysisRunId: run.id,
      sourceMessageId: message.id,
      field: "intent.payment_claim",
      proposedValue: { intent: "payment_claim" },
    });
    await createSuggestion(tenant.tenantId, {
      analysisRunId: run.id,
      sourceMessageId: message.id,
      field: "intent.flag.tracking_request",
      proposedValue: { intent: "tracking_request" },
    });
    await createSuggestion(tenant.tenantId, {
      analysisRunId: run.id,
      sourceMessageId: message.id,
      field: "order.ref",
      proposedValue: { value: "DEMO-ORD-1042" },
    });

    const rows = await listRuns(tenant.ctx);

    expect(rows[0]!.intents).toEqual(["payment_claim", "tracking_request"]);
  });

  it("reports a measured cost as a decimal string, never as a number", async () => {
    const { message } = await seedMessage();
    await createAnalysisRun(tenant.tenantId, message.id, {
      tokensIn: 1200,
      tokensOut: 300,
      costMicroUsd: 42n,
      latencyMs: 800,
    });

    const rows = await listRuns(tenant.ctx);

    expect(rows[0]).toMatchObject({ tokensIn: 1200, tokensOut: 300, costMicroUsd: "42" });
    expect(typeof rows[0]!.costMicroUsd).toBe("string");
  });

  it("is tenant-scoped and newest-first", async () => {
    const { message } = await seedMessage();
    await createAnalysisRun(tenant.tenantId, message.id, { queuedAt: new Date("2026-10-01T09:00:00.000Z") });
    await createAnalysisRun(tenant.tenantId, message.id, { queuedAt: new Date("2026-10-02T09:00:00.000Z") });

    const rows = await listRuns(tenant.ctx);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.createdAt).toBe("2026-10-02T09:00:00.000Z");

    const other = await createTenant({ idPrefix: "tenant_eval_other" });
    expect(await listRuns(other.ctx)).toHaveLength(0);
    // Nothing leaked into the other tenant's rows either.
    expect(await prisma.analysisRun.count({ where: { tenantId: other.tenantId } })).toBe(0);
  });
});
