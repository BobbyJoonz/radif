import { prisma } from "@/server/db";
import type { SessionContext } from "@/server/session";
import type { EvaluationRow, IntentKey } from "@/lib/dto";
import type { Prisma } from "@/generated/prisma/client";
import { INTENT_KEYS } from "@/server/providers/types";

/**
 * Evaluation — what the analysis actually cost and what it actually proposed.
 *
 * One rule matters more than the rest here (CONTRACTS §7, brief §15): **"not
 * measured" is `null`, never `0`.** A provider that does not report usage leaves
 * `tokensIn`, `tokensOut` and `costMicroUsd` null; summing those as zero would
 * invent a saving that was never measured.
 *
 * Intents are read from the run's *suggestions* — the proposals a human can see
 * and review — not from the provider's raw output, so the screen and the record
 * cannot disagree.
 */

const INTENT_SET = new Set<string>(INTENT_KEYS);

/** Pull an intent key out of one suggestion, whichever shape it was stored in. */
function intentOfSuggestion(field: string, proposedValue: Prisma.JsonValue): IntentKey | null {
  if (field.startsWith("intent.")) {
    const suffix = field.slice("intent.".length);
    if (INTENT_SET.has(suffix)) return suffix as IntentKey;
  }
  if (proposedValue && typeof proposedValue === "object" && !Array.isArray(proposedValue)) {
    const intent = (proposedValue as Record<string, Prisma.JsonValue>).intent;
    if (typeof intent === "string" && INTENT_SET.has(intent)) return intent as IntentKey;
  }
  if (typeof proposedValue === "string" && INTENT_SET.has(proposedValue)) {
    return proposedValue as IntentKey;
  }
  return null;
}

export async function listRuns(ctx: SessionContext): Promise<EvaluationRow[]> {
  const runs = await prisma.analysisRun.findMany({
    where: { tenantId: ctx.tenant.id },
    include: {
      suggestions: { select: { field: true, proposedValue: true } },
    },
    orderBy: [{ queuedAt: "desc" }],
    take: 200,
  });

  return runs.map((run) => {
    const intents: IntentKey[] = [];
    for (const suggestion of run.suggestions) {
      const intent = intentOfSuggestion(suggestion.field, suggestion.proposedValue);
      if (intent && !intents.includes(intent)) intents.push(intent);
    }

    return {
      id: run.id,
      messageId: run.messageId,
      provider: run.provider,
      model: run.model,
      promptVersion: run.promptVersion,
      rulesVersion: run.rulesVersion,
      status: run.status,
      // Null means "the provider did not report it"; zero would be a lie.
      latencyMs: run.latencyMs ?? null,
      tokensIn: run.tokensIn ?? null,
      tokensOut: run.tokensOut ?? null,
      costMicroUsd: run.costMicroUsd === null ? null : run.costMicroUsd.toString(),
      attempts: run.attempts,
      createdAt: run.queuedAt.toISOString(),
      intents,
    };
  });
}
