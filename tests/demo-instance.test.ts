import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDemoInstance } from "@/server/services/demo-instance";
import { resetDatabase } from "./helpers/db";

/**
 * The audit's P1 for the personal demo: a copied task's assignee belonged to the
 * *template* shop, so in the new sandbox "my work" was empty and delegation pointed
 * at a stranger. A fresh personal instance has exactly one member, so every human
 * reference must land on that host.
 */
describe("personal demo instance remapping", () => {
  let templateTenantId: string;
  let templateOperatorId: string;

  beforeEach(async () => {
    await resetDatabase();
    const tenant = await prisma.tenant.create({
      data: {
        id: "tenant_template",
        slug: "toranj",
        nameFa: "آتلیهٔ ترنج",
        nameEn: "Atelier Toranj",
        isDemo: true,
        settings: { create: { demoMode: true } },
      },
    });
    templateTenantId = tenant.id;

    const owner = await prisma.user.create({ data: { id: "user_template_owner", name: "مالک الگو", email: "owner@template.local" } });
    const operator = await prisma.user.create({ data: { id: "user_template_operator", name: "اپراتور الگو", email: "op@template.local" } });
    templateOperatorId = operator.id;
    await prisma.membership.createMany({
      data: [
        { tenantId: templateTenantId, userId: owner.id, role: "owner" },
        { tenantId: templateTenantId, userId: operator.id, role: "operator" },
      ],
    });

    await prisma.task.create({
      data: {
        tenantId: templateTenantId,
        type: "customer_reply",
        title: "پاسخ به مشتری",
        reasonCode: "customer_reply",
        reasonText: "پاسخ لازم است",
        assigneeId: templateOperatorId,
      },
    });
  });

  it("moves the copied task to the new host, who really is a member", async () => {
    const instance = await createDemoInstance();

    const tasks = await prisma.task.findMany({
      where: { tenantId: instance.tenantId },
      select: { assigneeId: true },
    });
    expect(tasks).toHaveLength(1);

    const assignee = tasks[0].assigneeId;
    expect(assignee).toBeTruthy();
    expect(assignee).not.toBe(templateOperatorId);

    const membership = await prisma.membership.findFirst({
      where: { tenantId: instance.tenantId, userId: assignee as string },
      select: { role: true },
    });
    expect(membership?.role).toBe("owner");
  });

  it("leaves the template untouched", async () => {
    await createDemoInstance();
    const original = await prisma.task.findFirst({
      where: { tenantId: templateTenantId },
      select: { assigneeId: true },
    });
    expect(original?.assigneeId).toBe(templateOperatorId);
  });
});
