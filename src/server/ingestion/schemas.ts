import { z } from "zod";
import type { IncomingMessage, SourceValue } from "@/lib/dto";
import { zonedLocalToUtc } from "@/server/domain/time";
import { MAX_ATTACHMENTS, MAX_MESSAGE_TEXT, MAX_REF_LENGTH } from "./limits";

/**
 * The validation edge for ingestion.
 *
 * `.strict()` is not cosmetic: a body that carries `tenantId`, `analysisState` or
 * `status` is rejected outright instead of being silently accepted and ignored.
 * The tenant of a write always comes from the session/membership (or, for the
 * worker, from the job row) — never from the payload. That is also what makes the
 * "prompt injection in a DM" rule structural: injected text is just `text`, and
 * text has no field that could change a permission or a state.
 */

const refSchema = z
  .string()
  .trim()
  .min(1, "شناسه نباید خالی باشد.")
  .max(MAX_REF_LENGTH, "شناسه بیش از حد بلند است.");

/**
 * Timestamps arrive as ISO 8601. Two accepted shapes:
 *   • with an explicit offset (`2026-10-28T21:04:00+03:30`) — used as given;
 *   • a wall-clock time without an offset (`2026-10-28 21:04`) — read in the
 *     *tenant's* timezone, because that is what a seller's export means. Reading
 *     it as UTC or as the server's zone would shift every imported message.
 */
export function parseOccurredAt(raw: string, timeZone: string, now: Date = new Date()): Date {
  const value = raw.trim();
  let date: Date | null = null;

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const parsed = new Date(value.replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
    if (match) {
      date = zonedLocalToUtc(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4] ?? 0),
        Number(match[5] ?? 0),
        Number(match[6] ?? 0),
        timeZone,
      );
    }
  }

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`زمان «${value.slice(0, 32)}» خوانده نشد؛ قالب ISO لازم است.`);
  }
  // Out-of-order is allowed (a webhook can arrive late); nonsense is not.
  if (date.getTime() < Date.UTC(2000, 0, 1) || date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new Error("زمان پیام بیرون از بازهٔ قابل‌قبول است.");
  }
  return date;
}

/** The validated form: same shape as the DTO, with `occurredAt` already a UTC `Date`. */
export type ValidatedIncoming = Omit<IncomingMessage, "occurredAt" | "source"> & {
  source: SourceValue;
  occurredAt: Date;
};

export const attachmentSchema = z
  .object({
    kind: z.string().trim().min(1).max(60),
    externalRef: z.string().trim().max(400).optional(),
  })
  .strict();

/**
 * A schema *factory* because the tenant's timezone is part of parsing, not of the
 * data. The route builds it from the session; the parser builds it from the job.
 */
export function incomingMessageSchema(timeZone: string, now: Date = new Date()) {
  return z
    .object({
      source: z.enum(["file", "replay", "instagram", "manual"]),
      accountRef: refSchema,
      conversationRef: refSchema,
      messageRef: refSchema,
      senderRef: z.string().trim().min(1, "فرستنده معلوم نیست.").max(MAX_REF_LENGTH),
      direction: z.enum(["inbound", "outbound"]),
      occurredAt: z
        .string()
        .min(4)
        .max(40)
        .transform((value, ctx) => {
          try {
            return parseOccurredAt(value, timeZone, now);
          } catch (error) {
            ctx.addIssue({ code: "custom", message: (error as Error).message });
            return z.NEVER;
          }
        }),
      text: z
        .string()
        .min(1, "متن پیام خالی است.")
        .max(MAX_MESSAGE_TEXT, "متن پیام بیش از حد بلند است.")
        .refine((value) => value.trim().length > 0, "متن پیام خالی است."),
      attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
    })
    .strict();
}

/** Parse and normalise one incoming payload; throws `ZodError` on a bad shape. */
export function validateIncoming(payload: unknown, timeZone: string, now?: Date): ValidatedIncoming {
  return incomingMessageSchema(timeZone, now).parse(payload);
}

/** Attachments as the JSON column stores them (plain JSON, no undefined). */
export function normaliseAttachments(attachments: ValidatedIncoming["attachments"]): { kind: string; externalRef?: string }[] {
  return attachments.map((attachment) => ({
    kind: attachment.kind,
    ...(attachment.externalRef ? { externalRef: attachment.externalRef } : {}),
  }));
}
