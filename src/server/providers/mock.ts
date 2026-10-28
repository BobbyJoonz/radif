import { candidatesOfKind } from "@/server/domain/spans";
import { detectIntents } from "@/server/domain/intents";
import { findMockFixture, type MockFixture } from "./fixtures";
import type { DecisionOutput, DecisionProvider, DecisionRequest } from "./types";

/**
 * The deterministic mock (brief §7 / CONTRACTS §7).
 *
 * Guarantees the tests and the demo rely on:
 *  • the same `(text, context)` always produces the same decision — there is no
 *    randomness, no clock, no network in this file;
 *  • a value is only ever *chosen* from a candidate code already extracted, so a
 *    hallucinated amount or phone is structurally impossible;
 *  • `usage` is `null` — "not measured" — never `0`, so the Evaluation screen can
 *    print «نامشخص» instead of a made-up cost.
 *
 * When no fixture matches, it falls back to the same rule-based intent detector
 * the rest of the server uses. That keeps demo data and hand-imported text on one
 * behaviour instead of two.
 */
export class MockDecisionProvider implements DecisionProvider {
  readonly name = "mock" as const;
  readonly model = "mock-v1";

  async classify(request: DecisionRequest): Promise<DecisionOutput> {
    const fixture = findMockFixture({ messageRef: undefined, text: request.text });
    const scan = detectIntents(request.text, request.normalizedText);
    const primary = fixture?.primary ?? scan.primary;

    const flagIntents = fixture
      ? fixture.flags.filter((flag) => flag.value).map((flag) => flag.intent)
      : scan.flags;

    const flags = flagIntents
      .filter((intent) => intent !== primary)
      .map((intent) => ({
        intent,
        value: true as const,
        probability: fixture?.probabilities[intent] ?? null,
      }));

    const amountCandidates = candidatesOfKind(request.candidates, "amount");
    const phoneCandidates = candidatesOfKind(request.candidates, "phone");
    const orderRefCandidates = candidatesOfKind(request.candidates, "order_ref");

    const amount = pickSingle(amountCandidates);
    const phone = pickSingle(phoneCandidates);
    const orderRef = pickSingle(orderRefCandidates);

    const probabilities: Record<string, number | null> = {
      [primary]: fixture?.probabilities[primary] ?? null,
    };
    for (const flag of flags) probabilities[flag.intent] = flag.probability;

    return {
      primary,
      probability: fixture?.probabilities[primary] ?? null,
      flags,
      amount: amount
        ? { candidateId: amount.id, unit: amount.meta?.unit ?? null }
        : amountCandidates.length > 1
          ? { candidateId: null, unit: null }
          : null,
      phone: phone ? { candidateId: phone.id } : phoneCandidates.length > 1 ? { candidateId: null } : null,
      orderRef: orderRef
        ? { candidateId: orderRef.id }
        : orderRefCandidates.length > 1
          ? { candidateId: null }
          : null,
      orderId: resolveOrderId(fixture, request),
      address: resolveAddress(fixture, primary, flagIntents),
      probabilities,
      usage: null,
    };
  }
}

/**
 * One candidate of a kind → that candidate. Zero → nothing was said. More than
 * one → the message contains two numbers/phones and the provider refuses to pick,
 * which pushes the proposal to `value: null` + needs review.
 */
function pickSingle<T>(candidates: readonly T[]): T | null {
  return candidates.length === 1 ? candidates[0]! : null;
}

function resolveOrderId(fixture: MockFixture | null, request: DecisionRequest): string | null {
  const openOrders = request.context.openOrders;
  const strategy = fixture?.orderStrategy ?? (openOrders.length === 1 ? "single_open_order" : openOrders.length > 1 ? "ambiguous" : "none");
  if (strategy === "none") return null;
  // Two or more open orders is never a coin flip: the caller turns this into a
  // `needs_review` proposal and a human task (CONTRACTS §6 rule 5).
  if (openOrders.length !== 1) return null;
  return openOrders[0]!.id;
}

function resolveAddress(
  fixture: MockFixture | null,
  primary: string,
  flagIntents: readonly string[],
): DecisionOutput["address"] {
  if (fixture?.address) return fixture.address;
  if (primary === "address_change" || flagIntents.includes("address_change")) {
    // The customer said the address changed but did not write the new one.
    return { stated: false, value: null };
  }
  return null;
}
