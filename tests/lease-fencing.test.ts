import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { claimJobs, completeJob, failJob, retryJob } from "@/server/worker/claim";
import { resetDatabase } from "./helpers/db";
import { createTenant, type TestTenant } from "./helpers/fixtures";

/**
 * Lease fencing.
 *
 * A slow worker whose lease expired has already lost the job to somebody else.
 * Its late "done" (or "failed") must not touch the row the new owner is working
 * on — otherwise two workers write the same job and the second attempt silently
 * disappears. The audit listed this as a residual reliability risk.
 */
describe("worker lease fencing", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
  });

  async function enqueue() {
    return prisma.job.create({
      data: { tenantId: toranj.tenantId, type: "analyze_message", payload: {} },
    });
  }

  it("refuses a late completion from the worker that lost the lease", async () => {
    const job = await enqueue();

    const first = await claimJobs({ owner: "worker-a", leaseMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(first.map((row) => row.id)).toContain(job.id);

    // worker-a is slow; the lease expires and worker-b takes the job
    const second = await claimJobs({ owner: "worker-b", leaseMs: 60_000 });
    expect(second.map((row) => row.id)).toContain(job.id);

    expect(await completeJob(job.id, "worker-a")).toBe(false);
    const stillRunning = await prisma.job.findUnique({
      where: { id: job.id },
      select: { status: true, leaseOwner: true },
    });
    expect(stillRunning?.status).toBe("running");
    expect(stillRunning?.leaseOwner).toBe("worker-b");

    // the current owner can finish it
    expect(await completeJob(job.id, "worker-b")).toBe(true);
    const done = await prisma.job.findUnique({ where: { id: job.id }, select: { status: true } });
    expect(done?.status).toBe("succeeded");
  });

  it("fences retry and fail as well", async () => {
    const job = await enqueue();
    await claimJobs({ owner: "worker-a", leaseMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await claimJobs({ owner: "worker-b", leaseMs: 60_000 });

    expect(await retryJob(job.id, { error: "boom", runAt: new Date(), owner: "worker-a" })).toBe(false);
    expect(await failJob(job.id, { error: "boom", status: "dead", owner: "worker-a" })).toBe(false);

    const row = await prisma.job.findUnique({ where: { id: job.id }, select: { status: true, leaseOwner: true } });
    expect(row?.status).toBe("running");
    expect(row?.leaseOwner).toBe("worker-b");
  });
});
