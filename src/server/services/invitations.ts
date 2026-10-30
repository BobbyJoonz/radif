import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { errors } from "@/server/http";
import type { SessionContext } from "@/server/session";

/**
 * Invitations: the only way a second person joins a shop.
 *
 * Four rules make this safe, and each one is tested:
 *   • only an owner may invite;
 *   • the token is random, single-use and stored **hashed** (a database dump
 *     cannot be replayed into a membership);
 *   • the invitation is bound to a tenant, a role and the intended email, so
 *     accepting it can never create a second shop or grant a different role;
 *   • accepting requires an authenticated identity whose email matches.
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type CreatedInvitation = {
  id: string;
  token: string;
  role: "owner" | "operator";
  email: string;
  expiresAt: string;
};

export async function createInvitation(
  ctx: SessionContext,
  input: { email: string; role?: "owner" | "operator" },
): Promise<CreatedInvitation> {
  if (ctx.role !== "owner") {
    throw errors.forbidden("دعوت همکار فقط با نقش «مالک» انجام می‌شود.");
  }
  const email = normalizeEmail(input.email ?? "");
  if (!EMAIL.test(email)) throw errors.invalid("ایمیل معتبر نیست.");

  const alreadyMember = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenant.id, user: { email } },
    select: { id: true },
  });
  if (alreadyMember) throw errors.conflict("این فرد از قبل عضو این فروشگاه است.");

  const role = input.role === "owner" ? "owner" : "operator";
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);

  const invitation = await prisma.$transaction(async (tx) => {
    const row = await tx.invitation.create({
      data: {
        tenantId: ctx.tenant.id,
        email,
        role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedById: ctx.user.id,
      },
      select: { id: true },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: ctx.tenant.id,
        actorType: "user",
        actorId: ctx.user.id,
        action: "invitation.created",
        entityType: "Invitation",
        entityId: row.id,
        after: { email, role, expiresAt: expiresAt.toISOString() },
      },
    });
    return row;
  });

  return { id: invitation.id, token, role, email, expiresAt: expiresAt.toISOString() };
}

export type AcceptedInvitation = { tenantId: string; role: "owner" | "operator"; alreadyMember: boolean };

/** A one-time, expiring, identity-bound acceptance that never creates a shop. */
export async function acceptInvitation(ctx: SessionContext, token: string): Promise<AcceptedInvitation> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, tenantId: true, email: true, role: true, expiresAt: true, acceptedAt: true },
  });
  if (!invitation) throw errors.notFound("این دعوت پیدا نشد.");
  if (invitation.acceptedAt) throw errors.conflict("این دعوت قبلاً پذیرفته شده است.");
  if (invitation.expiresAt.getTime() <= Date.now()) throw errors.conflict("این دعوت منقضی شده است.");
  if (normalizeEmail(invitation.email) !== normalizeEmail(ctx.user.email)) {
    throw errors.forbidden("این دعوت برای ایمیل دیگری صادر شده است.");
  }

  const existing = await prisma.membership.findFirst({
    where: { tenantId: invitation.tenantId, userId: ctx.user.id },
    select: { role: true },
  });

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.membership.create({
        data: { tenantId: invitation.tenantId, userId: ctx.user.id, role: invitation.role },
      });
    }
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: invitation.tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: existing ? "invitation.accepted_existing_member" : "invitation.accepted",
        entityType: "Invitation",
        entityId: invitation.id,
        after: { role: existing?.role ?? invitation.role },
      },
    });
  });

  return {
    tenantId: invitation.tenantId,
    role: (existing?.role ?? invitation.role) as "owner" | "operator",
    alreadyMember: Boolean(existing),
  };
}

/**
 * Removing a colleague. The last owner cannot be removed: a shop with no owner has
 * nobody who may verify payments or change settings, which is unrecoverable from
 * inside the product.
 */
export async function removeMember(ctx: SessionContext, userId: string): Promise<void> {
  if (ctx.role !== "owner") throw errors.forbidden("حذف همکار فقط با نقش «مالک» انجام می‌شود.");
  if (userId === ctx.user.id) throw errors.invalid("نمی‌توانید خودتان را حذف کنید.");

  const target = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenant.id, userId },
    select: { id: true, role: true },
  });
  if (!target) throw errors.notFound("این همکار در این فروشگاه عضو نیست.");

  if (target.role === "owner") {
    const owners = await prisma.membership.count({ where: { tenantId: ctx.tenant.id, role: "owner" } });
    if (owners <= 1) throw errors.conflict("آخرین مالک فروشگاه را نمی‌توان حذف کرد.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: target.id } });
    await tx.auditEvent.create({
      data: {
        tenantId: ctx.tenant.id,
        actorType: "user",
        actorId: ctx.user.id,
        action: "member.removed",
        entityType: "Membership",
        entityId: target.id,
        before: { userId, role: target.role },
      },
    });
  });
}
