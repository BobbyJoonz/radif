import { normalizeText } from "@/server/domain/normalize";

/**
 * A small RFC 4180 CSV reader — no dependency, because the import path must not
 * pull a new package into a product that is already shipped (and the brief asks
 * for a documented, testable format, not a framework).
 *
 * It handles what real seller exports contain: a BOM, CRLF, quoted fields with
 * commas or newlines inside, doubled quotes, and trailing blank lines. Anything it
 * cannot read is reported per row rather than throwing the whole file away — a
 * single broken line must not stop a 4,000-line import.
 */

export type CsvCellRow = { rowNumber: number; cells: string[] };

export type CsvParseResult = {
  header: string[];
  rows: CsvCellRow[];
  /** Fatal problems (unterminated quote) — the caller shows these, not a stack. */
  error: string | null;
};

export function parseCsv(content: string, maxRows: number): CsvParseResult {
  const text = content.replace(/^\uFEFF/, "");
  const rows: CsvCellRow[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowNumber = 1;
  let error: string | null = null;
  let sawChar = false;

  const pushField = () => {
    cells.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push({ rowNumber, cells });
    cells = [];
    rowNumber += 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    sawChar = true;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // CRLF: the \n branch will finish the row.
      if (text[i + 1] !== "\n") pushRow();
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    error = "گیومهٔ باز در فایل CSV بسته نشده است.";
  } else if (sawChar && (field.length > 0 || cells.length > 0)) {
    pushRow();
  }

  // Drop a trailing row that is one empty cell (the usual trailing newline).
  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.cells.length === 1 && last.cells[0]!.trim() === "") rows.pop();
    else break;
  }

  const header = rows.shift()?.cells.map((cell) => cell.trim()) ?? [];
  if (rows.length > maxRows) {
    return { header, rows: rows.slice(0, maxRows), error: `فایل بیش از ${maxRows} ردیف داده دارد.` };
  }
  return { header, rows, error };
}

/** Canonical fields the importer can map a column onto. */
export const CANONICAL_FIELDS = [
  "conversationRef",
  "messageRef",
  "senderRef",
  "direction",
  "occurredAt",
  "text",
  "accountRef",
  "attachments",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/**
 * Keys are already through `normaliseHeader`: lower-case, ZWNJ/spaces/underscores
 * removed. So the column `Message ID`, `message_id` and `messageId` all arrive
 * here as `messageid`.
 */
const HEADER_ALIASES: Record<string, CanonicalField> = {
  conversationref: "conversationRef",
  conversation: "conversationRef",
  conversationid: "conversationRef",
  thread: "conversationRef",
  chat: "conversationRef",
  گفتگو: "conversationRef",
  گفتگوid: "conversationRef",
  مکالمه: "conversationRef",

  messageref: "messageRef",
  messageid: "messageRef",
  id: "messageRef",
  msgid: "messageRef",
  شناسهپیام: "messageRef",
  کدپیام: "messageRef",

  senderref: "senderRef",
  sender: "senderRef",
  from: "senderRef",
  user: "senderRef",
  username: "senderRef",
  handle: "senderRef",
  فرستنده: "senderRef",

  direction: "direction",
  dir: "direction",
  جهت: "direction",
  نوع: "direction",

  occurredat: "occurredAt",
  date: "occurredAt",
  datetime: "occurredAt",
  time: "occurredAt",
  timestamp: "occurredAt",
  createdat: "occurredAt",
  زمان: "occurredAt",
  تاریخ: "occurredAt",

  text: "text",
  message: "text",
  body: "text",
  content: "text",
  متن: "text",
  متنپیام: "text",

  accountref: "accountRef",
  account: "accountRef",
  page: "accountRef",
  اکانت: "accountRef",

  attachments: "attachments",
  attachment: "attachments",
  پیوست: "attachments",
};

/** Strip case, ZWNJ, spaces and punctuation so `Message ID` and `message_id` agree. */
export function normaliseHeader(raw: string): string {
  return normalizeText(raw)
    .replace(/[\s_-]+/g, "")
    .replace(/["'()]/g, "")
    .trim();
}

/** Best-effort mapping of a column (or JSON key) onto a canonical field, or null. */
export function mapHeader(raw: string): CanonicalField | null {
  return HEADER_ALIASES[normaliseHeader(raw)] ?? null;
}
