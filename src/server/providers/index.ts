import { env } from "@/lib/env";
import { MockDecisionProvider } from "./mock";
import { ProviderUnavailable, type DecisionProvider } from "./types";
import { TypeSafeDecisionProvider } from "./typesafe";

/**
 * Provider factory — one place that decides which implementation runs.
 *
 * Two refusals, both intentional and both loud:
 *   • `DECISION_PROVIDER=typesafe` without a key throws instead of quietly using
 *     the mock. A production deployment must fail, not hallucinate a demo;
 *   • `APP_MODE=production` with `DECISION_PROVIDER=mock` throws for the same
 *     reason: mock output is never presented as a real analysis.
 *
 * The provider is stateless, so caching one instance per process is safe.
 */
let cached: DecisionProvider | null = null;

export function getDecisionProvider(): DecisionProvider {
  if (cached) return cached;

  if (env.DECISION_PROVIDER === "typesafe") {
    if (!env.TYPESAFE_API_KEY) {
      throw new ProviderUnavailable(
        "DECISION_PROVIDER=typesafe است ولی TYPESAFE_API_KEY خالی است. یا کلید را تنظیم کنید یا برای نمایش، mock را انتخاب کنید.",
      );
    }
    cached = new TypeSafeDecisionProvider(env.TYPESAFE_API_KEY, env.TYPESAFE_MODEL);
    return cached;
  }

  if (env.APP_MODE === "production") {
    throw new ProviderUnavailable(
      "در حالت production ارائه‌دهندهٔ mock مجاز نیست؛ DECISION_PROVIDER=typesafe و کلید واقعی لازم است.",
    );
  }

  cached = new MockDecisionProvider();
  return cached;
}

/** Tests inject their own provider; this clears the singleton between cases. */
export function resetDecisionProviderCache(): void {
  cached = null;
}

export function providerLabel(): string {
  return env.DECISION_PROVIDER === "typesafe" ? "TypeSafe" : "تحلیل نمایشی (mock)";
}

export * from "./fixtures";
export * from "./mock";
export * from "./types";
export * from "./typesafe";
