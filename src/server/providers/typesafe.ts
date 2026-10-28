import { ProviderUnavailable, type DecisionOutput, type DecisionProvider, type DecisionRequest } from "./types";

/**
 * The real provider seam (CONTRACTS §7).
 *
 * It exists so the contract is explicit and testable, and it is deliberately
 * *not* a fake connection: the brief (§20) says the provider's current schema,
 * model id and endpoint must be verified at the source before wiring it, and that
 * a guessed API must not be shipped. So this class:
 *   • refuses to construct without `TYPESAFE_API_KEY` (typed `ProviderUnavailable`);
 *   • with a key, still fails closed with a message naming what is missing, rather
 *     than pretending to analyse — nothing in the product can silently fall back
 *     to the mock in a production setting.
 *
 * When the real integration lands, `classify` is the only method to implement:
 * send the question set, validate with `DecisionOutputSchema`, and let the caller
 * combine the answer with business rules exactly as it does for the mock.
 */
export class TypeSafeDecisionProvider implements DecisionProvider {
  readonly name = "typesafe" as const;

  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string,
  ) {}

  async classify(_request: DecisionRequest): Promise<DecisionOutput> {
    if (!this.apiKey) {
      throw new ProviderUnavailable("کلید TypeSafe تنظیم نشده است؛ تحلیل تصمیم انجام نشد.");
    }
    throw new ProviderUnavailable(
      "اتصال شبکه‌ای TypeSafe در این نسخه پیاده‌سازی نشده است. برای فعال‌سازی، مسیر و schema رسمی را در README ثبت و سپس این متد را پیاده کنید.",
    );
  }
}
