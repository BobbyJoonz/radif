import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

/**
 * Platform administration is its own principal (audit RBAC_MATRIX.csv).
 *
 * It is not a shop membership and not a bigger owner: an admin has a flag on the
 * user, no Membership, and the pages it may open show metadata — counts and states —
 * never a customer's message, address or phone (platform.private_shop_data is a
 * scoped support grant in the matrix, not a default).
 */
export type PlatformAdmin = { userId: string; email: string };

export async function currentPlatformAdmin(): Promise<PlatformAdmin | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const user = await prisma.user.findFirst({
    where: { id: session.user.id, platformAdmin: true },
    select: { id: true, email: true },
  });
  return user ? { userId: user.id, email: user.email } : null;
}

export type PlatformOverview = {
  shops: number;
  sharedDemoShops: number;
  members: number;
  messages: number;
  jobsByStatus: Record<string, number>;
  analysisRuns: number;
  verifiedPayments: number;
};

/** Metadata only: counts and processing states, never private content. */
export async function platformOverview(): Promise<PlatformOverview> {
  const [shops, sharedDemoShops, members, messages, analysisRuns, verifiedPayments, jobs] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { sharedDemo: true } }),
    prisma.membership.count(),
    prisma.message.count(),
    prisma.analysisRun.count(),
    prisma.paymentClaim.count({ where: { status: "verified" } }),
    prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const jobsByStatus: Record<string, number> = {};
  for (const row of jobs) jobsByStatus[row.status] = row._count._all;
  return { shops, sharedDemoShops, members, messages, analysisRuns, verifiedPayments, jobsByStatus };
}
