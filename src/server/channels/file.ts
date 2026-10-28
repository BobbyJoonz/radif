import { createHash } from "node:crypto";
import type { IncomingMessage } from "@/lib/dto";
import { incomingMessageSchema } from "@/server/ingestion/schemas";
import { MAX_IMPORT_ROWS } from "@/server/ingestion/limits";
import { CANONICAL_FIELDS, type CanonicalField, mapHeader, parseCsv } from "./csv";
import { rejectionReason, type ChannelAdapter, type ChannelParseOutput, type ColumnReport, type ParseInput } from "./types";

/**
 * The file channel: a seller exports DMs from a tool (or our own sample file) and
 * drops it in. JSON and CSV are the only formats, and both map onto the same
 * canonical fields, so the preview can explain a column mapping either way.
 *
 * Deterministic identity: when a row has no message id, the key is built from
 * (import identity, conversation, row number) — *not* from the text hash. The same
 * customer may genuinely send «سلام» twice, and those are two messages; importing
 * the same file twice must, however, produce zero new rows.
 */
export class FileChannelAdapter implements ChannelAdapter {
  readonly channel = "file" as const;

  parse(input: ParseInput): ChannelParseOutput {
    if (input.format === "csv") return this.parseCsvFile(input);
    return this.parseJsonFile(input);
  }

  private parseCsvFile(input: ParseInput): ChannelParseOutput {
    const parsed = parseCsv(input.content, MAX_IMPORT_ROWS + 1);
    const columns: ColumnReport[] = parsed.header.map((header) => ({
      key: header,
      label: header,
      mappedTo: mapHeader(header),
    }));

    const fieldIndex = new Map<CanonicalField, number>();
    columns.forEach((column, index) => {
      if (column.mappedTo && !fieldIndex.has(column.mappedTo)) fieldIndex.set(column.mappedTo, index);
    });

    const messages: IncomingMessage[] = [];
    const rejected: { row: number; reason: string }[] = [];

    if (parsed.error) {
      return { messages, rejected, columns, totalRows: 0, fatal: parsed.error };
    }

    parsed.rows.forEach((row, index) => {
      const rowNumber = index + 2; // row 1 is the header, as the user sees it
      if (index >= MAX_IMPORT_ROWS) {
        rejected.push({ row: rowNumber, reason: `فایل بیش از ${MAX_IMPORT_ROWS} ردیف دارد؛ ردیف‌های بعدی خوانده نشد.` });
        return;
      }
      const cells: Record<CanonicalField, string | undefined> = {} as Record<CanonicalField, string | undefined>;
      for (const field of CANONICAL_FIELDS) {
        const at = fieldIndex.get(field);
        cells[field] = at === undefined ? undefined : row.cells[at];
      }
      const result = this.buildMessage(cells, input, rowNumber);
      if (result.message) messages.push(result.message);
      else rejected.push({ row: rowNumber, reason: result.reason });
    });

    return { messages, rejected, columns, totalRows: parsed.rows.length, fatal: null };
  }

  private parseJsonFile(input: ParseInput): ChannelParseOutput {
    let payload: unknown;
    try {
      payload = JSON.parse(input.content);
    } catch {
      return { messages: [], rejected: [], columns: [], totalRows: 0, fatal: "فایل JSON خوانده نشد." };
    }

    const rows: { row: number; value: unknown }[] = [];
    if (Array.isArray(payload)) {
      payload.forEach((value, index) => rows.push({ row: index + 1, value }));
    } else if (payload && typeof payload === "object" && Array.isArray((payload as { messages?: unknown }).messages)) {
      ((payload as { messages: unknown[] }).messages).forEach((value, index) => rows.push({ row: index + 1, value }));
    } else if (payload && typeof payload === "object") {
      rows.push({ row: 1, value: payload });
    } else {
      return { messages: [], rejected: [], columns: [], totalRows: 0, fatal: "فایل JSON باید آرایه یا {messages:[…]} باشد." };
    }

    // Column report from the union of keys, in first-seen order.
    const columns: ColumnReport[] = [];
    const seen = new Set<string>();
    for (const { value } of rows) {
      if (!value || typeof value !== "object") continue;
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (seen.has(key)) continue;
        seen.add(key);
        columns.push({ key, label: key, mappedTo: mapHeader(key) });
      }
    }

    const messages: IncomingMessage[] = [];
    const rejected: { row: number; reason: string }[] = [];

    rows.forEach(({ row, value }, index) => {
      if (index >= MAX_IMPORT_ROWS) {
        rejected.push({ row, reason: `فایل بیش از ${MAX_IMPORT_ROWS} ردیف دارد؛ ردیف‌های بعدی خوانده نشد.` });
        return;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        rejected.push({ row, reason: "ردیف یک شیء JSON نیست." });
        return;
      }
      const cells: Record<CanonicalField, string | undefined> = {} as Record<CanonicalField, string | undefined>;
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const field = mapHeader(key);
        if (!field || cells[field] !== undefined) continue;
        cells[field] = raw === null || raw === undefined ? undefined : typeof raw === "string" ? raw : JSON.stringify(raw);
      }
      const result = this.buildMessage(cells, input, row);
      if (result.message) messages.push(result.message);
      else rejected.push({ row, reason: result.reason });
    });

    return { messages, rejected, columns, totalRows: rows.length, fatal: null };
  }

  /** Assemble one row, fill the safe defaults, then validate — never guess a timestamp. */
  private buildMessage(
    cells: Record<CanonicalField, string | undefined>,
    input: ParseInput,
    rowNumber: number,
  ): { message: IncomingMessage | null; reason: string } {
    const conversationRef = cells.conversationRef?.trim();
    if (!conversationRef) return { message: null, reason: "گفتگوی پیام معلوم نیست (conversationRef)." };

    const occurredAt = cells.occurredAt?.trim();
    if (!occurredAt) return { message: null, reason: "زمان پیام معلوم نیست (occurredAt)." };

    const senderRef = cells.senderRef?.trim();
    if (!senderRef) return { message: null, reason: "فرستنده معلوم نیست (senderRef)." };

    const text = cells.text ?? "";
    if (text.trim().length === 0) return { message: null, reason: "متن پیام خالی است." };

    const directionRaw = (cells.direction ?? "inbound").trim().toLowerCase();
    const direction = ["outbound", "out", "خروجی", "ارسال‌شده", "ارسالشده"].includes(directionRaw)
      ? "outbound"
      : ["inbound", "in", "ورودی", "دریافتی"].includes(directionRaw) || directionRaw === ""
        ? "inbound"
        : null;
    if (!direction) return { message: null, reason: `جهت پیام «${directionRaw}» شناخته نشد.` };

    const messageRef =
      cells.messageRef?.trim() || `imp:${importScope(input.importRef)}:${conversationRef}:${rowNumber}`;

    let attachments: unknown = [];
    if (cells.attachments && cells.attachments.trim().length > 0) {
      try {
        attachments = JSON.parse(cells.attachments);
      } catch {
        return { message: null, reason: "ستون پیوستها JSON معتبر نیست." };
      }
    }

    const candidate = {
      source: "file" as const,
      accountRef: cells.accountRef?.trim() || input.accountRef,
      conversationRef,
      messageRef,
      senderRef,
      direction,
      occurredAt,
      text,
      attachments,
    };

    try {
      const validated = incomingMessageSchema(input.timeZone, input.now).parse(candidate);
      return {
        message: {
          ...validated,
          occurredAt: validated.occurredAt.toISOString(),
        },
        reason: "",
      };
    } catch (error) {
      return { message: null, reason: rejectionReason(error) };
    }
  }
}

/** Stable short id of the import file, safe inside a message ref. */
function importScope(importRef: string): string {
  const normalised = importRef.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 40);
  const digest = createHash("sha256").update(importRef).digest("hex").slice(0, 8);
  return `${normalised || "import"}-${digest}`;
}
