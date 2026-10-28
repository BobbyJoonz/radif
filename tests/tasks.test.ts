import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listTasks, updateTask } from "@/server/services/tasks";
import { resetDatabase } from "./helpers/db";
import {
  createCustomer,
  createOrder,
  createTask,
  createTenant,
  expectApiError,
  type TestTenant,
} from "./helpers/fixtures";

/**
 * Tasks — the queue's two hard rules: `done` must record when it closed, and closing
 * must release the dedupe key so a new issue can open a new task (rules 1, 13).
 */
describe("tasks service", () => {
  let tenant: TestTenant;
  let otherTenant: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ idPrefix: "tenant_tasks" });
    otherTenant = await createTenant({ idPrefix: "tenant_other" });
  });

  it("closing a task writes closedAt and releases its dedupe key", async () => {
    const task = await createTask(tenant.tenantId, {
      status: "open",
      dedupeKey: "payment_reconcile|order:o1",
      reasonCode: "payment_mismatch",
    });

    const row = await updateTask(tenant.ctx, task.id, { status: "done", closeNote: "تطبیق شد" });

    expect(row.status).toBe("done");
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.closedAt).not.toBeNull();
    expect(stored.closeNote).toBe("تطبیق شد");
    expect(stored.dedupeKey).toBeNull();
    expect(stored.dedupeState).toBe("released");
  });

  it("a genuinely new request can take the released key and open a new task (rule 1)", async () => {
    const first = await createTask(tenant.tenantId, {
      dedupeKey: "payment_reconcile|order:o1",
      status: "open",
    });
    await updateTask(tenant.ctx, first.id, { status: "done" });

    // The same key is free again: the unique index accepts a second, new task.
    const second = await createTask(tenant.tenantId, {
      dedupeKey: "payment_reconcile|order:o1",
      status: "open",
    });

    expect(second.id).not.toBe(first.id);
    expect(await prisma.task.count({ where: { tenantId: tenant.tenantId } })).toBe(2);
  });

  it("a done task cannot be reopened: a new request is a new task", async () => {
    const task = await createTask(tenant.tenantId, { status: "done", closedAt: new Date() });

    await expectApiError(() => updateTask(tenant.ctx, task.id, { status: "open" }), {
      status: 409,
      code: "conflict",
    });
  });

  it("assigns only a member of this tenant; a foreign user id is 404 (rule 9)", async () => {
    const task = await createTask(tenant.tenantId, { status: "open" });

    await expectApiError(
      () => updateTask(tenant.ctx, task.id, { status: "in_progress", assigneeId: otherTenant.userId }),
      { status: 404, code: "not_found" },
    );

    const assigned = await updateTask(tenant.ctx, task.id, {
      status: "in_progress",
      assigneeId: tenant.userId,
    });
    expect(assigned.assigneeName).toBe(tenant.ctx.user.name);
  });

  it("another tenant's task is 404, never 403 (rule 9)", async () => {
    const task = await createTask(tenant.tenantId, { status: "open" });

    await expectApiError(() => updateTask(otherTenant.ctx, task.id, { status: "in_progress" }), {
      status: 404,
      code: "not_found",
    });
  });

  it("listTasks hides done tasks when asked and orders hardest priority first", async () => {
    const customer = await createCustomer(tenant.tenantId, {});
    const order = await createOrder(tenant.tenantId, customer.id, { publicRef: "TEST-ORD-9" });
    await createTask(tenant.tenantId, { priority: "P3", status: "open", title: "کم‌اهمیت" });
    await createTask(tenant.tenantId, {
      priority: "P1",
      status: "open",
      title: "مهم",
      orderId: order.id,
      customerId: customer.id,
    });
    await createTask(tenant.tenantId, { priority: "P2", status: "done", closedAt: new Date(), title: "تمام‌شده" });
    await createTask(otherTenant.tenantId, { priority: "P0", status: "open", title: "مال دیگری" });

    const open = await listTasks(tenant.ctx, { includeDone: false });
    expect(open.map((task) => task.title)).toEqual(["مهم", "کم‌اهمیت"]);
    expect(open[0]!.orderRef).toBe("TEST-ORD-9");
    expect(open[0]!.customerName).toBe("مشتری آزمایشی");

    const all = await listTasks(tenant.ctx);
    expect(all).toHaveLength(3);
    expect(all.some((task) => task.status === "done")).toBe(true);

    const done = await listTasks(tenant.ctx, { status: "done" });
    expect(done).toHaveLength(1);
    expect(done[0]!.overdue).toBe(false);
  });

  it("marks an overdue open task as overdue and a done one as not", async () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    await createTask(tenant.tenantId, { status: "open", dueAt: past });
    await createTask(tenant.tenantId, { status: "done", dueAt: past, closedAt: new Date() });

    const rows = await listTasks(tenant.ctx);
    const open = rows.find((row) => row.status === "open");
    const done = rows.find((row) => row.status === "done");
    expect(open?.overdue).toBe(true);
    expect(done?.overdue).toBe(false);
  });
});
