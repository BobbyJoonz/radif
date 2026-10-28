/**
 * Ingest limits, in one place so the UI, the route and the parser cannot disagree.
 *
 * The numbers are stated in the product (Import screen: «≤ ۵ مگابایت، ≤ ۵٬۰۰۰
 * ردیف») and enforced here before anything is read into memory for long.
 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5_000;

/** A single DM longer than this is truncated by us? No — it is rejected, never altered. */
export const MAX_MESSAGE_TEXT = 8_000;
export const MAX_ATTACHMENTS = 20;
export const MAX_REF_LENGTH = 200;

/** How many rejected rows the preview reports before it stops listing them. */
export const MAX_REPORTED_REJECTIONS = 100;

/** Import refuses a byte size before parsing; the message is Persian because it surfaces. */
export function assertWithinByteLimit(bytes: number): void {
  if (bytes > MAX_IMPORT_BYTES) {
    throw new Error(
      `حجم فایل ${Math.ceil(bytes / 1024)} کیلوبایت است؛ حد مجاز ${MAX_IMPORT_BYTES / (1024 * 1024)} مگابایت است.`,
    );
  }
}
