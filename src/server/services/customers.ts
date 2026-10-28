import { prisma } from "@/server/db";
import type { SessionContext } from "@/server/session";
import type { CustomerDetailDTO, CustomerRow, OrderRow } from "@/lib/dto";
import type { Prisma } from "@/generated/prisma/client";
import { formatMinorFa } from "@/server/domain/money";
import { taskInclude, toQueueRow } from "./tasks";
import { orderStateInclude, toOrderSummaryDTO } from "./orders";

/**
 * Customers — read-only, and deliberately *not* an identity resolver.
 *
 * The brief (§5 «مشتری‌ها») is explicit: two handles that look alike are two
 * customers until a human says otherwise. Nothing in this file merges identities,
 * matches on phone numbers across rows, or "helpfully" unifies a typo. The
 * timeline below is a projection of rows that already point at this customer id;
 * it never *creates* an association.
 */

/** The `q` filter: name, phone, or a handle — case-insensitive, never fuzzy. */
function searchWhere(tenantId: string, q?: string): Prisma.CustomerWhereInput {
  const term = q?.trim();
  if (!term) return { tenantId };
  return {
    tenantId,
    OR: [
      { displayName: { contains: term, mode: "insensitive" } },
      { phone: { contains: term } },
      { identities: { some: { externalRef: { contains: term, mode: "insensitive" } } } },
    ],
  };
}

/** One include shape for both the list and the detail header. */
const customerListInclude = {
  identities: { select: { externalRef: true } },
  orders: { select: { id: true } },
  tasks: { where: { status: { not: "done" } }, select: { id: true } },
  conversations: { select: { lastMessageAt: true } },
} satisfies Prisma.CustomerInclude;

type CustomerListRow = Prisma.CustomerGetPayload<{ include: typeof customerListInclude }>;

export async function listCustomers(ctx: SessionContext, q?: string): Promise<CustomerRow[]> {
  const customers = await prisma.customer.findMany({
    where: searchWhere(ctx.tenant.id, q),
    include: customerListInclude,
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const rows = customers.map(toCustomerRow);

  // Most recently seen first; a customer with no message at all sorts last, which
  // is honest rather than treating "never" as "now".
  rows.sort((a, b) => {
    const aTime = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
    const bTime = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
    return bTime - aTime;
  });
  return rows;
}

/**
 * One customer with a merged timeline: messages, orders, payment claims,
 * shipments, tasks and audit events, newest first. A merged view is a *read*; it
 * writes nothing and proves nothing about identity.
 */
export async function getCustomer(ctx: SessionContext, customerId: string): Promise<CustomerDetailDTO | null> {
  const tenantId = ctx.tenant.id;
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    include: customerListInclude,
  });
  if (!customer) return null;

  const orderIds = customer.orders.map((order) => order.id);

  const [orders, messages, claims, shipments, tasks, audit] = await Promise.all([
    orderIds.length
      ? prisma.order.findMany({
          where: { tenantId, customerId, id: { in: orderIds } },
          include: orderStateInclude,
          orderBy: { orderCreatedAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.message.findMany({
      where: { tenantId, conversation: { customerId } },
      select: { id: true, text: true, occurredAt: true, direction: true, conversationId: true },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    prisma.paymentClaim.findMany({
      where: { tenantId, order: { customerId } },
      select: {
        id: true,
        status: true,
        amountMinor: true,
        claimedAt: true,
        verifiedAt: true,
        order: { select: { id: true, publicRef: true } },
      },
      orderBy: { claimedAt: "desc" },
      take: 50,
    }),
    prisma.shipment.findMany({
      where: { tenantId, order: { customerId } },
      select: {
        id: true,
        status: true,
        carrier: true,
        trackingCode: true,
        updatedAt: true,
        order: { select: { id: true, publicRef: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      where: { tenantId, customerId },
      include: taskInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.auditEvent.findMany({
      where: {
        tenantId,
        OR: [
          { entityType: "customer", entityId: customerId },
          ...(orderIds.length ? [{ orderId: { in: orderIds } }] : []),
        ],
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const now = new Date();
  const timeline: CustomerDetailDTO["timeline"] = [];

  for (const message of messages) {
    timeline.push({
      at: message.occurredAt.toISOString(),
      kind: "message",
      summary:
        message.direction === "inbound"
          ? `پیام مشتری: ${truncate(message.text, 90)}`
          : `پاسخ فروشگاه: ${truncate(message.text, 90)}`,
      conversationId: message.conversationId,
      orderId: null,
    });
  }

  for (const order of orders) {
    timeline.push({
      at: order.orderCreatedAt.toISOString(),
      kind: "order",
      summary: `سفارش ${order.publicRef}: ${order.status}، ${formatMinorFa(order.totalMinor, order.currency)}`,
      conversationId: null,
      orderId: order.id,
    });
    if (order.confirmedAt) {
      timeline.push({
        at: order.confirmedAt.toISOString(),
        kind: "order",
        summary: `سفارش ${order.publicRef} تأیید شد.`,
        conversationId: null,
        orderId: order.id,
      });
    }
  }

  for (const claim of claims) {
    timeline.push({
      at: claim.claimedAt.toISOString(),
      kind: "payment",
      summary:
        `اعلام پرداخت ${claim.order.publicRef}: ${claim.status}` +
        (claim.amountMinor !== null ? `، ${formatMinorFa(claim.amountMinor)}` : "، بدون مبلغ"),
      conversationId: null,
      orderId: claim.order.id,
    });
    if (claim.verifiedAt) {
      timeline.push({
        at: claim.verifiedAt.toISOString(),
        kind: "payment",
        summary: `پرداخت ${claim.order.publicRef} بررسی و ${claim.status === "verified" ? "تأیید" : "رد"} شد.`,
        conversationId: null,
        orderId: claim.order.id,
      });
    }
  }

  for (const shipment of shipments) {
    timeline.push({
      at: shipment.updatedAt.toISOString(),
      kind: "shipment",
      summary:
        `ارسال ${shipment.order.publicRef} — ${shipment.status}` +
        (shipment.carrier ? `، ${shipment.carrier}` : "") +
        (shipment.trackingCode ? `، کد ${shipment.trackingCode}` : "، بدون کد رهگیری"),
      conversationId: null,
      orderId: shipment.order.id,
    });
  }

  for (const task of tasks) {
    const row = toQueueRow(task, now);
    timeline.push({
      at: task.createdAt.toISOString(),
      kind: "task",
      summary: `${row.title}${row.status === "done" ? " (انجام شد)" : ""}`,
      conversationId: row.conversationId,
      orderId: row.orderId,
    });
  }

  for (const event of audit) {
    timeline.push({
      at: event.createdAt.toISOString(),
      kind: "audit",
      summary: `${event.action}${event.actor?.name ? ` — ${event.actor.name}` : ""}`,
      conversationId: null,
      orderId: event.orderId,
    });
  }

  timeline.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    customer: toCustomerRow(customer),
    orders: orders.map(
      (order): OrderRow => ({
        ...toOrderSummaryDTO(order),
        needsReview: order.status === "needs_review",
      }),
    ),
    timeline: timeline.slice(0, 150),
  };
}

function toCustomerRow(customer: CustomerListRow): CustomerRow {
  const lastSeen = customer.conversations.reduce<Date | null>((latest, conversation) => {
    if (!conversation.lastMessageAt) return latest;
    return !latest || conversation.lastMessageAt > latest ? conversation.lastMessageAt : latest;
  }, null);

  return {
    id: customer.id,
    displayName: customer.displayName,
    phone: customer.phone,
    phoneVerified: customer.phoneVerifiedAt !== null,
    handles: customer.identities.map((identity) => identity.externalRef),
    ordersCount: customer.orders.length,
    openTasks: customer.tasks.length,
    lastSeenAt: lastSeen?.toISOString() ?? null,
  };
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
}

