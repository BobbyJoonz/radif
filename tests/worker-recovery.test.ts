import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { reapExpiredLeases } from "@/server/worker/recover";

/**
 * Audit finding: some jobs stayed `running` forever after a worker died. The lease
 * existed in a comment but nothing enforced it. This asserts the sweep: expired
 * leases go back to pending, and an exhausted job is dead-lettered instead of
 * looping.
 */
describe("stale worker leases are reaped", () => {
  async function job(status: "running", attempts: number, maxAttempts: number) {
    const tenant = await prisma.tenant.create({
      data: { slug: `reap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, nameFa: "ت", nameEn: "T" },
    });
    return prisma.job.create({
      data: {
        tenantId: tenant.id,
        type: "analyze_message",
        payload: {},
        status,
        attempts,
        maxAttempts,
        leaseOwner: "dead-worker",
        leaseUntil: new Date(Date.now() - 60_000),
      },
    });
  }

  it("returns an expired lease to pending", async () => {
    const created = await job("running", 1, 5);
    await reapExpiredLeases();
    const after = await prisma.job.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("pending");
    expect(after.leaseOwner).toBeNull();
    expect(after.lastError).toBe("lease_expired");
  });

  it("dead-letters an exhausted job instead of looping it", async () => {
    const created = await job("running", 5, 5);
    await reapExpiredLeases();
    const after = await prisma.job.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("dead");
    expect(after.finishedAt).not.toBeNull();
  });
});
