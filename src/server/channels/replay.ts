import type { IncomingMessage } from "@/lib/dto";
import { DEMO_TEXTS } from "@/server/providers/fixtures";
import type { ChannelAdapter, ChannelParseOutput, ParseInput } from "./types";

/**
 * The replay channel: the demo's way in (CONTRACTS §2, brief §17).
 *
 * It produces a real `IncomingMessage` and goes through the *same* store → queue →
 * analyse path as an import. Nothing about the replay is special-cased in the
 * worker; the only thing "demo" about it is that the words are fixtures and the id
 * says `DEMO-`.
 *
 * Identity: each replay gets `DEMO-MSG-9001-R<n>`. Re-sending the same script as a
 * genuinely new message is what the demo wants to *see* happen, while the
 * dedupe keys on tasks and jobs are what stop it from cloning work. Ingesting the
 * *same* ref twice (the idempotency rule) is covered by the ingest tests, not by
 * the replay button.
 */
export type ReplayScenario = "scripted" | "address_after_shipping";

const SCRIPTED = {
  conversationRef: "DEMO-CONV-114",
  senderRef: "negar.ahmadi",
  messageRefPrefix: "DEMO-MSG-9001",
  text: DEMO_TEXTS.scripted,
} as const;

const ADDRESS_AFTER_SHIPPING = {
  conversationRef: "DEMO-CONV-121",
  senderRef: "amin.rezaei",
  messageRefPrefix: "DEMO-MSG-8835",
  text: DEMO_TEXTS.aminAddressAfterShipping,
} as const;

export const REPLAY_SCENARIOS: Record<ReplayScenario, { conversationRef: string; senderRef: string; messageRefPrefix: string; text: string }> = {
  scripted: SCRIPTED,
  address_after_shipping: ADDRESS_AFTER_SHIPPING,
};

export class ReplayChannelAdapter implements ChannelAdapter {
  readonly channel = "replay" as const;

  parse(input: ParseInput): ChannelParseOutput {
    const { scenario, sequence } = readOptions(input.content);
    const fixture = REPLAY_SCENARIOS[scenario];
    const now = input.now ?? new Date();
    const safeSequence = Math.max(1, Math.min(sequence, 9999));

    const message: IncomingMessage = {
      source: "replay",
      accountRef: input.accountRef,
      conversationRef: fixture.conversationRef,
      messageRef: `${fixture.messageRefPrefix}-R${safeSequence}`,
      senderRef: fixture.senderRef,
      direction: "inbound",
      occurredAt: now.toISOString(),
      text: fixture.text,
      attachments: [],
    };

    // The replay is already inside the tenant's own connection; no parse failure
    // is possible, but it still goes through the same validator at ingest time.
    return { messages: [message], rejected: [], columns: [], totalRows: 1, fatal: null };
  }
}

function readOptions(content: string): { scenario: ReplayScenario; sequence: number } {
  const trimmed = content?.trim() ?? "";
  if (trimmed.length === 0 || trimmed === "{}") return { scenario: "scripted", sequence: 1 };
  try {
    const parsed = JSON.parse(trimmed) as { scenario?: string; sequence?: number };
    const scenario: ReplayScenario =
      parsed.scenario === "address_after_shipping" ? "address_after_shipping" : "scripted";
    const sequence = typeof parsed.sequence === "number" && Number.isFinite(parsed.sequence) ? parsed.sequence : 1;
    return { scenario, sequence };
  } catch {
    return { scenario: "scripted", sequence: 1 };
  }
}
