import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { acceptInvitation, createInvitation, hashToken, removeMember } from "@/server/services/invitations";
import { resetDatabase } from "./helpers/db";
import { createOperator, createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

/**
 * Owner/operator collaboration. Every case is a real database round trip: the
 * point of the invitation is that it is single-use, expiring, bound to a tenant,
 * a role and an identity, and that it can never create a second shop.
 */
describe("invitations", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
  });

  async function outsider(email: string) {
    const user = await prisma.user.create({ data: { id: `user_${email}`, name: "تازه‌وارد", email } });
    return { ...toranj.ctx, user: { ...toranj.ctx.user, id: user.id, name: user.name, email: user.email }, role: "operator" as const };
  }

  it("an owner invites, the invited identity accepts, and joins the same shop", async () => {
    const before = await prisma.tenant.count();
    const invitation = await createInvitation(toranj.ctx, { email: "new@test.local" });
    expect(invitation.role).toBe("operator");
    expect(invitation.token.length).toBeGreaterThan(20);

    const stored = await prisma.invitation.findUnique({ where: { id: invitation.id }, select: { tokenHash: true } });
    expect(stored?.tokenHash).toBe(hashToken(invitation.token));
    expect(stored?.tokenHash).not.toContain(invitation.token);

    const ctx = await outsider("new@test.local");
    const accepted = await acceptInvitation(ctx, invitation.token);

    expect(accepted.tenantId).toBe(toranj.tenantId);
    expect(accepted.role).toBe("operator");
    const membership = await prisma.membership.findFirst({
      where: { tenantId: toranj.tenantId, userId: ctx.user.id },
      select: { role: true },
    });
    expect(membership?.role).toBe("operator");
    expect(await prisma.tenant.count()).toBe(before); // accepting never creates a shop
  });

  it("a token cannot be used twice", async () => {
    const invitation = await createInvitation(toranj.ctx, { email: "twice@test.local" });
    const ctx = await outsider("twice@test.local");
    await acceptInvitation(ctx, invitation.token);

    await expectApiError(() => acceptInvitation(ctx, invitation.token), { status: 409, code: "conflict" });
  });

  it("an expired invitation is refused", async () => {
    const invitation = await createInvitation(toranj.ctx, { email: "late@test.local" });
    await prisma.invitation.update({ where: { id: invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const ctx = await outsider("late@test.local");
    await expectApiError(() => acceptInvitation(ctx, invitation.token), { status: 409, code: "conflict" });
  });

  it("the invitation is bound to the intended identity", async () => {
    const invitation = await createInvitation(toranj.ctx, { email: "intended@test.local" });
    const ctx = await outsider("someone-else@test.local");
    await expectApiError(() => acceptInvitation(ctx, invitation.token), { status: 403, code: "forbidden" });
  });

  it("an operator cannot invite anyone", async () => {
    const operator = await createOperator(toranj);
    await expectApiError(() => createInvitation(operator.ctx, { email: "x@test.local" }), {
      status: 403,
      code: "forbidden",
    });
  });

  it("the last owner cannot be removed", async () => {
    await expectApiError(() => removeMember(toranj.ctx, toranj.userId), { status: 422, code: "invalid" });

    const secondOwner = await outsider("owner2@test.local");
    await prisma.membership.create({ data: { tenantId: toranj.tenantId, userId: secondOwner.user.id, role: "owner" } });

    // now a different owner can be removed, and the shop keeps an owner
    await removeMember(toranj.ctx, secondOwner.user.id);
    const owners = await prisma.membership.count({ where: { tenantId: toranj.tenantId, role: "owner" } });
    expect(owners).toBe(1);
  });
});
