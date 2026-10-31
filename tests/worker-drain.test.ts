import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { drainQueue, queueStats } from "@/server/worker/drain";
import { resetDatabase } from "./helpers/db";
import { createTenant, type TestTenant } from "./helpers/fixtures";

/**
 * The alert this answers: "forwarding stopped, last file 13 hours ago" is a stalled
 * queue, not a broken feature. drainQueue is bounded so a scheduler can call it, and
 * queueStats is what a monitor reads instead of digging through logs.
 */
describe("queue drain", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
  });

  it("reports the backlog and how old it is", async () => {
    await prisma.job.create({
      data: {
        tenantId: toranj.tenantId,
        type: "analyze_message",
        payload: {},
        runAt: new Date(Date.now() - 13 * 3600 * 1000),
        maxAttempts: 1,
      },
    });

    const stats = await queueStats();
    expect(stats.pending).toBe(1);
    expect(stats.oldestPendingAgeSec ?? 0).toBeGreaterThan(12 * 3600);
  });

  it("drains what is waiting and reaps a dead worker's lease", async () => {
    await prisma.job.create({
      data: { tenantId: toranj.tenantId, type: "analyze_message", payload: {}, maxAttempts: 1 },
    });
    await prisma.job.create({
      data: {
        tenantId: toranj.tenantId,
        type: "analyze_message",
        payload: {},
        status: "running",
        attempts: 1,
        maxAttempts: 1,
        leaseOwner: "dead-worker",
        leaseUntil: new Date(Date.now() - 60_000),
      },
    });

    expect((await queueStats()).stuck).toBe(1);

    const result = await drainQueue({ maxJobs: 5, budgetMs: 10_000 });
    expect(result.claimed).toBeGreaterThanOrEqual(1);

    const after = await queueStats();
    expect(after.pending).toBe(0);
    expect(after.stuck).toBe(0);
  });

  it("is safe to call on an empty queue", async () => {
    const result = await drainQueue({ maxJobs: 1, budgetMs: 2_000 });
    expect(result.claimed).toBe(0);
    expect(result.outcomes.succeeded).toBe(0);
  });
});
