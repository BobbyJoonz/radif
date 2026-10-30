import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * A personal demo instance (audit: visitors must not share one mutable shop).
 *
 * One seeded shop is the template: read once, cloned into a tenant of the visitor's
 * own with fresh ids, so every action lands in their copy and reset is allowed on it
 * (sharedDemo stays false). Relations are preserved by remapping ids as rows are
 * created, in dependency order, inside one transaction.
 */

const TEMPLATE_SLUG = "toranj";

export type DemoInstance = {
  tenantId: string;
  email: string;
  password: string;
  customers: number;
  conversations: number;
  orders: number;
  tasks: number;
};

export async function createDemoInstance(options: { intoTenantId?: string } = {}): Promise<DemoInstance> {
  if (env.APP_MODE === "production") throw new Error("demo instances are not available in production");

  const template = await prisma.tenant.findFirst({
    where: { slug: TEMPLATE_SLUG },
    select: { id: true, nameFa: true, nameEn: true, timezone: true, currency: true },
  });
  if (!template) throw new Error("demo template is missing; seed the database first");
  const from = template.id;

  const [products, customers, identities, conversations, messages, orders, items, claims, shipments, runs, suggestions, tasks] =
    await Promise.all([
      prisma.product.findMany({ where: { tenantId: from } }),
      prisma.customer.findMany({ where: { tenantId: from } }),
      prisma.customerIdentity.findMany({ where: { tenantId: from } }),
      prisma.conversation.findMany({ where: { tenantId: from } }),
      prisma.message.findMany({ where: { tenantId: from } }),
      prisma.order.findMany({ where: { tenantId: from } }),
      prisma.orderItem.findMany({ where: { tenantId: from } }),
      prisma.paymentClaim.findMany({ where: { tenantId: from } }),
      prisma.shipment.findMany({ where: { tenantId: from } }),
      prisma.analysisRun.findMany({ where: { tenantId: from } }),
      prisma.suggestion.findMany({ where: { tenantId: from } }),
      prisma.task.findMany({ where: { tenantId: from } }),
    ]);

  // Referential remap: the template's users are not members of the new shop, so
  // a copied task assigned to them would point at a stranger (the audit found
  // exactly this). In a fresh personal instance every human reference becomes the
  // new host, who is the only member.
  const sourceUsers = new Set(
    (await prisma.membership.findMany({ where: { tenantId: from }, select: { userId: true } })).map((row) => row.userId),
  );

  const ids = new Map<string, string>();
  const next = (old: string | null | undefined): string | null => {
    if (!old) return null;
    const hit = ids.get(old);
    if (hit) return hit;
    const created = randomUUID();
    ids.set(old, created);
    return created;
  };
  const must = (old: string) => next(old) as string;

  const password = `demo-${randomUUID().slice(0, 8)}`;
  const stamp = Date.now().toString(36);
  const email = `demo-${stamp}-${randomUUID().slice(0, 4)}@radif.local`;
  const hash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const tenantId = options.intoTenantId ?? randomUUID();
    if (!options.intoTenantId) {
      await tx.tenant.create({
        data: {
          id: tenantId,
          slug: `demo-${stamp}-${randomUUID().slice(0, 6)}`,
          nameFa: template.nameFa,
          nameEn: template.nameEn,
          timezone: template.timezone,
          currency: template.currency,
          isDemo: true,
          sharedDemo: false,
          settings: { create: { demoMode: true } },
        },
      });
    }

    let hostUserId: string | null = null;
    if (!options.intoTenantId) {
      const user = await tx.user.create({ data: { id: randomUUID(), name: "میزبان دمو", email, emailVerified: true, locale: "fa" } });
      hostUserId = user.id;
      await tx.account.create({ data: { id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: hash } });
      await tx.membership.create({ data: { id: randomUUID(), tenantId, userId: user.id, role: "owner" } });
    }

    const existingConnection = options.intoTenantId
      ? await tx.channelConnection.findFirst({ where: { tenantId }, select: { id: true } })
      : null;
    const connection =
      existingConnection ??
      (await tx.channelConnection.create({
        data: { id: randomUUID(), tenantId, channel: "replay", accountRef: "template.demo", displayName: template.nameFa, status: "ready" },
      }));

    // Each block casts its payload: rows read from the database are structurally
    // valid createMany inputs, but Json columns do not widen to InputJsonValue.
    const remapUser = (old: string | null) =>
      !options.intoTenantId && old && sourceUsers.has(old) && hostUserId ? hostUserId : old;

    if (products.length)
      await tx.product.createMany({ data: products.map((r) => ({ ...r, id: must(r.id), tenantId })) as unknown as Prisma.ProductCreateManyInput[] });
    if (customers.length)
      await tx.customer.createMany({ data: customers.map((r) => ({ ...r, id: must(r.id), tenantId })) as unknown as Prisma.CustomerCreateManyInput[] });
    if (identities.length)
      await tx.customerIdentity.createMany({
        data: identities.map((r) => ({ ...r, id: must(r.id), tenantId, customerId: must(r.customerId), connectionId: connection.id })) as unknown as Prisma.CustomerIdentityCreateManyInput[],
      });
    if (conversations.length)
      await tx.conversation.createMany({
        data: conversations.map((r) => ({ ...r, id: must(r.id), tenantId, connectionId: connection.id, customerId: must(r.customerId) })) as unknown as Prisma.ConversationCreateManyInput[],
      });
    if (messages.length)
      await tx.message.createMany({
        data: messages.map((r) => ({ ...r, id: must(r.id), tenantId, conversationId: must(r.conversationId) })) as unknown as Prisma.MessageCreateManyInput[],
      });
    if (orders.length)
      await tx.order.createMany({ data: orders.map((r) => ({ ...r, id: must(r.id), tenantId, customerId: must(r.customerId), confirmedById: remapUser(r.confirmedById) })) as unknown as Prisma.OrderCreateManyInput[] });
    if (items.length)
      await tx.orderItem.createMany({
        data: items.map((r) => ({ ...r, id: must(r.id), tenantId, orderId: must(r.orderId), productId: next(r.productId) })) as unknown as Prisma.OrderItemCreateManyInput[],
      });
    if (claims.length)
      await tx.paymentClaim.createMany({
        data: claims.map((r) => ({ ...r, id: must(r.id), tenantId, orderId: must(r.orderId), sourceMessageId: next(r.sourceMessageId), verifiedById: remapUser(r.verifiedById) })) as unknown as Prisma.PaymentClaimCreateManyInput[],
      });
    if (shipments.length)
      await tx.shipment.createMany({ data: shipments.map((r) => ({ ...r, id: must(r.id), tenantId, orderId: must(r.orderId) })) as unknown as Prisma.ShipmentCreateManyInput[] });
    if (runs.length)
      await tx.analysisRun.createMany({ data: runs.map((r) => ({ ...r, id: must(r.id), tenantId, messageId: must(r.messageId) })) as unknown as Prisma.AnalysisRunCreateManyInput[] });
    if (suggestions.length)
      await tx.suggestion.createMany({
        data: suggestions.map((r) => ({ ...r, id: must(r.id), tenantId, analysisRunId: must(r.analysisRunId), sourceMessageId: must(r.sourceMessageId), orderId: next(r.orderId), customerId: next(r.customerId), reviewedById: remapUser(r.reviewedById) })) as unknown as Prisma.SuggestionCreateManyInput[],
      });
    if (tasks.length)
      await tx.task.createMany({
        data: tasks.map((r) => ({ ...r, id: must(r.id), tenantId, orderId: next(r.orderId), messageId: next(r.messageId), customerId: next(r.customerId), assigneeId: remapUser(r.assigneeId) })) as unknown as Prisma.TaskCreateManyInput[],
      });

    return { tenantId, email, password, customers: customers.length, conversations: conversations.length, orders: orders.length, tasks: tasks.length };
  });
}
