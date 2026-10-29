import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";

/**
 * Cheap numbers the shell needs on every screen: how many tasks are overdue and
 * how many need a human. They are real counts, and they are the *only* numbers
 * allowed in the chrome (DIRECTION.md §3: no KPI card row).
 */
export async function getShellCounts(tenantId: string) {
  const now = new Date();
  const [overdue, needsReview] = await Promise.all([
    prisma.task.count({
      where: {
        tenantId,
        status: { in: ["open", "in_progress"] },
        dueAt: { lt: now },
      },
    }),
    prisma.suggestion.count({
      where: { tenantId, reviewState: "proposed" },
    }),
  ]);

  return { overdue, needsReview, demo: isDemo() };
}

export async function getLastSync(tenantId: string): Promise<string | null> {
  const latest = await prisma.message.findFirst({
    where: { tenantId },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  return latest?.occurredAt.toISOString() ?? null;
}
