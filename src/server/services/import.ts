import { z } from "zod";
import { prisma } from "@/server/db";
import type { SessionContext } from "@/server/session";
import { errors } from "@/server/http";
import type { ImportCommitDTO, ImportPreviewDTO, IncomingMessage } from "@/lib/dto";
import { getChannelAdapter } from "@/server/channels";
import type { RejectedRow } from "@/server/channels/types";
import { ingestBatch } from "@/server/ingestion/ingest";
import { validateIncoming } from "@/server/ingestion/schemas";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, MAX_REPORTED_REJECTIONS } from "@/server/ingestion/limits";

/**
 * Import — preview then commit (CONTRACTS §4, §5).
 *
 * The two calls parse exactly the same bytes with exactly the same adapter, so the
 * preview cannot promise a different accepted set than the commit delivers. The
 * distinctions that matter:
 *
 *  • **Limits are enforced before anything is read into a transaction**: 5 MB of
 *    UTF-8 and 5 000 data rows, both from `ingestion/limits.ts` so the UI and the
 *    server cannot drift.
 *  • **A row that fails is reported, not thrown** — a single broken line must not
 *    throw away a 4 000-line import.
 *  • **Duplicates are decided by the database** (`@@unique([tenantId, source,
 *    externalRef])` inside `ingest`), so re-importing the same file adds zero rows
 *    (rule 1). Note that a repeated import of a file *with* ids collides, while a
 *    file without ids gets deterministic keys derived from the file identity and
 *    the conversation — never from the text, because a customer may genuinely send
 *    «سلام» twice.
 */

export const importInputSchema = z
  .object({
    format: z.enum(["json", "csv"]),
    filename: z.string().trim().min(1, "نام فایل لازم است.").max(200),
    content: z.string().min(1, "فایل خالی است."),
  })
  .strict();

export type ImportInput = z.infer<typeof importInputSchema>;

type ParsedImport = {
  messages: IncomingMessage[];
  rejected: RejectedRow[];
  columns: ImportPreviewDTO["columns"];
};

/** One parse, used by both preview and commit so their answers cannot differ. */
function parseFile(ctx: SessionContext, input: ImportInput): ParsedImport {
  const bytes = Buffer.byteLength(input.content, "utf8");
  if (bytes > MAX_IMPORT_BYTES) {
    throw errors.invalid(
      `حجم فایل ${Math.ceil(bytes / 1024)} کیلوبایت است؛ حد مجاز ${MAX_IMPORT_BYTES / (1024 * 1024)} مگابایت است.`,
    );
  }

  const adapter = getChannelAdapter("file");
  const parsed = adapter.parse({
    content: input.content,
    format: input.format,
    importRef: input.filename,
    accountRef: `file:${input.filename}`,
    timeZone: ctx.tenant.timezone,
    now: new Date(),
  });

  if (parsed.fatal) throw errors.invalid(parsed.fatal);

  return {
    messages: parsed.messages,
    rejected: parsed.rejected,
    columns: parsed.columns.map((column) => ({
      key: column.key,
      label: column.label,
      mappedTo: column.mappedTo,
    })),
  };
}

export async function previewImport(ctx: SessionContext, input: ImportInput): Promise<ImportPreviewDTO> {
  const parsed = parseFile(ctx, input);
  const refs = parsed.messages.map((message) => message.messageRef);

  // Rows that already exist count as "duplicate risk" before the commit, so the
  // seller sees the honest number instead of an import that adds nothing.
  const existing = refs.length
    ? await prisma.message.findMany({
        where: { tenantId: ctx.tenant.id, source: "file", externalRef: { in: refs } },
        select: { externalRef: true },
      })
    : [];
  const existingRefs = new Set(existing.map((row) => row.externalRef));
  const seen = new Set<string>();
  let duplicateRisk = 0;
  for (const ref of refs) {
    if (existingRefs.has(ref) || seen.has(ref)) duplicateRisk += 1;
    seen.add(ref);
  }

  return {
    columns: parsed.columns,
    accepted: parsed.messages.length,
    rejected: parsed.rejected.length,
    duplicateRisk,
    sample: parsed.messages.slice(0, 5).map((message, index) => ({
      // Position in the accepted set; exact file line numbers are in `rejections`.
      row: input.format === "csv" ? index + 2 : index + 1,
      text: message.text.length > 120 ? `${message.text.slice(0, 119)}…` : message.text,
      customer: message.senderRef,
      occurredAt: message.occurredAt,
    })),
    rejections: parsed.rejected.slice(0, MAX_REPORTED_REJECTIONS),
    limits: { maxBytes: MAX_IMPORT_BYTES, maxRows: MAX_IMPORT_ROWS },
  };
}

/**
 * Commit the file. Each row is ingested through the same path a webhook uses, one
 * transaction per row: a bad row is a `rejected` entry, never a rollback of the
 * good ones. Ids of the created jobs are returned so the UI can say "analysis is
 * queued" honestly instead of pretending it finished.
 */
export async function commitImport(ctx: SessionContext, input: ImportInput): Promise<ImportCommitDTO> {
  const parsed = parseFile(ctx, input);

  const rejected: RejectedRow[] = [...parsed.rejected];
  const validated = [];
  for (let index = 0; index < parsed.messages.length; index += 1) {
    const message = parsed.messages[index]!;
    try {
      validated.push(validateIncoming(message, ctx.tenant.timezone, new Date()));
    } catch (error) {
      rejected.push({
        row: input.format === "csv" ? index + 2 : index + 1,
        reason: (error as Error).message,
      });
    }
  }

  const batch = await ingestBatch(
    { tenantId: ctx.tenant.id, timeZone: ctx.tenant.timezone, isDemo: ctx.tenant.isDemo },
    validated,
    { now: new Date() },
  );

  const messageIds = batch.results.map((result) => result.messageId);
  const conversations = messageIds.length
    ? await prisma.message.findMany({
        where: { tenantId: ctx.tenant.id, id: { in: messageIds } },
        select: { conversationId: true },
        distinct: ["conversationId"],
      })
    : [];

  const jobIds = batch.results
    .map((result) => result.jobId)
    .filter((jobId): jobId is string => typeof jobId === "string");

  await prisma.auditEvent.create({
    data: {
      tenantId: ctx.tenant.id,
      actorType: "user",
      actorId: ctx.user.id,
      action: "import.committed",
      entityType: "import",
      entityId: input.filename,
      after: {
        format: input.format,
        imported: batch.imported,
        duplicates: batch.duplicates,
        rejected: rejected.length,
      },
    },
  });

  return {
    imported: batch.imported,
    duplicates: batch.duplicates,
    rejected: rejected.length,
    jobIds,
    conversationIds: conversations.map((row) => row.conversationId),
  };
}
