import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { commitImport, previewImport } from "@/server/services/import";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/server/ingestion/limits";
import { resetDatabase } from "./helpers/db";
import { createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

/**
 * Import — preview and commit must agree, a bad row is a report rather than a
 * failure, and re-importing the same file adds nothing (rules 1 and 12's shape).
 */
describe("import service", () => {
  let tenant: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ idPrefix: "tenant_import" });
  });

  const jsonRows = [
    {
      conversationRef: "DEMO-CONV-201",
      senderRef: "negar.ahmadi",
      direction: "inbound",
      occurredAt: "2026-10-01T09:00:00+03:30",
      text: "سلام واریز کردم",
    },
    {
      conversationRef: "DEMO-CONV-201",
      senderRef: "negar.ahmadi",
      direction: "outbound",
      occurredAt: "2026-10-01T09:05:00+03:30",
      text: "بررسی می‌کنیم",
    },
  ];

  it("previews a JSON file with mapped columns and a sample", async () => {
    const preview = await previewImport(tenant.ctx, {
      format: "json",
      filename: "export.json",
      content: JSON.stringify(jsonRows),
    });

    expect(preview.accepted).toBe(2);
    expect(preview.rejected).toBe(0);
    expect(preview.duplicateRisk).toBe(0);
    expect(preview.sample).toHaveLength(2);
    expect(preview.sample[0]).toMatchObject({ text: "سلام واریز کردم", customer: "negar.ahmadi" });
    expect(preview.limits).toEqual({ maxBytes: MAX_IMPORT_BYTES, maxRows: MAX_IMPORT_ROWS });

    const mapped = Object.fromEntries(preview.columns.map((column) => [column.key, column.mappedTo]));
    expect(mapped.conversationRef).toBe("conversationRef");
    expect(mapped.text).toBe("text");
    expect(mapped.occurredAt).toBe("occurredAt");
  });

  it("reports a broken row with a reason instead of failing the file (rule 12's spirit)", async () => {
    const content = [
      "conversationRef,senderRef,direction,occurredAt,text",
      "DEMO-CONV-1,negar,inbound,2026-10-01T09:00:00+03:30,سلام",
      "DEMO-CONV-1,negar,inbound,,بدون زمان",
      "DEMO-CONV-1,negar,inbound,2026-10-01T09:10:00+03:30,",
    ].join("\n");

    const preview = await previewImport(tenant.ctx, { format: "csv", filename: "bad.csv", content });

    expect(preview.accepted).toBe(1);
    expect(preview.rejected).toBe(2);
    expect(preview.rejections.map((row) => row.row)).toEqual([3, 4]);
    expect(preview.rejections[0]!.reason).toContain("زمان");
    expect(preview.rejections[1]!.reason).toContain("متن");
  });

  it("refuses a file that is not valid JSON with 422", async () => {
    await expectApiError(
      () => previewImport(tenant.ctx, { format: "json", filename: "x.json", content: "{not json" }),
      { status: 422, code: "invalid" },
    );
  });

  it("enforces the 5 MB limit before reading", async () => {
    const oversized = JSON.stringify([{ conversationRef: "c", senderRef: "s", text: "x".repeat(MAX_IMPORT_BYTES) }]);
    await expectApiError(
      () => previewImport(tenant.ctx, { format: "json", filename: "big.json", content: oversized }),
      { status: 422, code: "invalid" },
    );
  });

  it("stops at the 5 000-row limit and reports the overflow as a rejected row", async () => {
    const lines = ["conversationRef,senderRef,direction,occurredAt,text"];
    for (let index = 0; index <= MAX_IMPORT_ROWS; index += 1) {
      lines.push(`DEMO-CONV-${index},negar,inbound,2026-10-01T09:00:00+03:30,پیام ${index}`);
    }

    const preview = await previewImport(tenant.ctx, {
      format: "csv",
      filename: "huge.csv",
      content: lines.join("\n"),
    });

    expect(preview.accepted).toBe(MAX_IMPORT_ROWS);
    expect(preview.rejected).toBe(1);
    expect(preview.rejections[0]!.reason).toContain(String(MAX_IMPORT_ROWS));
  });

  it("commits the file through the real ingest path and queues one job per inbound message", async () => {
    const result = await commitImport(tenant.ctx, {
      format: "json",
      filename: "export.json",
      content: JSON.stringify(jsonRows),
    });

    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.rejected).toBe(0);
    // Only the inbound message needs analysis; the seller's own reply does not.
    expect(result.jobIds).toHaveLength(1);
    expect(result.conversationIds).toHaveLength(1);

    expect(await prisma.message.count({ where: { tenantId: tenant.tenantId } })).toBe(2);
    const inbound = await prisma.message.findFirstOrThrow({
      where: { tenantId: tenant.tenantId, direction: "inbound" },
      include: { analysisRuns: true },
    });
    expect(inbound.analysisState).toBe("pending");
    expect(inbound.analysisRuns).toHaveLength(1);
    expect(await prisma.job.count({ where: { tenantId: tenant.tenantId, status: "pending" } })).toBe(1);
  });

  it("re-importing the same file adds no message and no job (rule 1)", async () => {
    const input = { format: "json" as const, filename: "export.json", content: JSON.stringify(jsonRows) };
    await commitImport(tenant.ctx, input);
    const second = await commitImport(tenant.ctx, input);

    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(second.jobIds).toHaveLength(0);
    expect(await prisma.message.count({ where: { tenantId: tenant.tenantId } })).toBe(2);
  });

  it("the preview sees the duplicate risk before the commit runs", async () => {
    const input = { format: "json" as const, filename: "export.json", content: JSON.stringify(jsonRows) };
    await commitImport(tenant.ctx, input);

    const preview = await previewImport(tenant.ctx, input);
    expect(preview.accepted).toBe(2);
    expect(preview.duplicateRisk).toBe(2);
  });

  it("builds stable keys for rows without a message id: same file twice is a duplicate, two identical texts are two messages", async () => {
    const content = JSON.stringify([
      { conversationRef: "DEMO-CONV-9", senderRef: "sara", occurredAt: "2026-10-01T09:00:00+03:30", text: "سلام" },
      { conversationRef: "DEMO-CONV-9", senderRef: "sara", occurredAt: "2026-10-01T09:10:00+03:30", text: "سلام" },
    ]);
    const input = { format: "json" as const, filename: "no-ids.json", content };

    const first = await commitImport(tenant.ctx, input);
    expect(first.imported).toBe(2);

    const refs = await prisma.message.findMany({
      where: { tenantId: tenant.tenantId },
      select: { externalRef: true },
      orderBy: { externalRef: "asc" },
    });
    expect(refs).toHaveLength(2);
    expect(refs[0]!.externalRef).not.toBe(refs[1]!.externalRef);
    expect(refs.every((row) => row.externalRef.startsWith("imp:"))).toBe(true);

    const again = await commitImport(tenant.ctx, input);
    expect(again.imported).toBe(0);
    expect(again.duplicates).toBe(2);
  });

  it("does not let one tenant's import touch another tenant's data", async () => {
    const other = await createTenant({ idPrefix: "tenant_import_other" });
    await commitImport(other.ctx, {
      format: "json",
      filename: "export.json",
      content: JSON.stringify(jsonRows),
    });

    const preview = await previewImport(tenant.ctx, {
      format: "json",
      filename: "export.json",
      content: JSON.stringify(jsonRows),
    });
    expect(preview.duplicateRisk).toBe(0);
    expect(await prisma.message.count({ where: { tenantId: tenant.tenantId } })).toBe(0);
  });
});
