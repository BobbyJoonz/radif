import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { demoRoleCredentials, listDemoPrincipals } from "@/server/services/demo-role";
import { resetDatabase } from "./helpers/db";
import { createOperator, createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

/**
 * The audit's P1 for the demo: one sandbox, switch the role inside it — never a
 * fourth entry card, and never a way for a real shop to gain a role.
 */
describe("demo role switch", () => {
  let demo: TestTenant;
  let real: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    demo = await createTenant({ idPrefix: "tenant_demo" });
    real = await createTenant({ idPrefix: "tenant_real" });
    await prisma.tenant.update({ where: { id: demo.tenantId }, data: { isDemo: true } });
    await prisma.tenant.update({ where: { id: real.tenantId }, data: { isDemo: false } });
  });

  function inDemo(tenant: TestTenant): TestTenant {
    return { ...tenant, ctx: { ...tenant.ctx, tenant: { ...tenant.ctx.tenant, isDemo: true } } };
  }

  it("lists the principals of the same sandbox", async () => {
    const operator = await createOperator(demo);
    const principals = await listDemoPrincipals(inDemo(demo).ctx);

    expect(principals.map((p) => p.role).sort()).toEqual(["operator", "owner"]);
    expect(principals.find((p) => p.current)?.email).toBe(demo.email);
    expect(principals.find((p) => p.role === "operator")?.email).toBe(operator.email);
  });

  it("hands back the other principal's credentials, in this tenant only", async () => {
    const operator = await createOperator(demo);
    const result = await demoRoleCredentials(inDemo(demo).ctx, "operator");

    expect(result.email).toBe(operator.email);
    expect(result.password).toBe("radif-demo-1405");
    expect(result.same).toBe(false);

    // switching to your own role is a no-op, not a credential leak
    const self = await demoRoleCredentials(inDemo(demo).ctx, "owner");
    expect(self.same).toBe(true);
    expect(self.password).toBeNull();
  });

  it("refuses to work on a real shop", async () => {
    const realCtx = { ...real.ctx, tenant: { ...real.ctx.tenant, isDemo: false } };
    await expectApiError(() => listDemoPrincipals(realCtx), { status: 403, code: "forbidden" });
    await expectApiError(() => demoRoleCredentials(realCtx, "owner"), { status: 403, code: "forbidden" });
  });
});
