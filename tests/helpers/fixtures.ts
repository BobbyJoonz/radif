import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import type { SessionContext } from "@/server/session";
import type { Prisma } from "@/generated/prisma/client";
import type {
  AnalysisStatus,
  MembershipRole,
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
  TaskStatus,
  TaskType,
} from "@/generated/prisma/enums";

/**
 * Minimal fixtures, per file — not a copy of `prisma/seed.ts`.
 *
 * The suite must be deterministic and offline, so it creates exactly the rows a
 * case needs and nothing else. Ids are readable (`tenant_a`, `order_a1`, …) because
 * a failing assertion should name the row it was about.
 */

export type TestTenant = {
  tenantId: string;
  userId: string;
  email: string;
  ctx: SessionContext;
};

export type TenantOptions = {
  idPrefix?: string;
  role?: MembershipRole;
  isDemo?: boolean;
  nameFa?: string;
  settings?: Partial<{
    workdayStartMin: number;
    workdayEndMin: number;
    slaFirstReplyMin: number;
    slaShipMin: number;
    priceFreshnessMin: number;
    postingPaused: boolean;
  }>;
};

export async function createTenant(options: TenantOptions = {}): Promise<TestTenant> {
  const prefix = options.idPrefix ?? `t_${randomUUID().slice(0, 8)}`;
  const tenantId = prefix;
  const userId = `${prefix}_user`;
  const email = `${prefix}@test.local`;

  await prisma.user.create({
    data: { id: userId, name: `${prefix} user`, email, emailVerified: true, locale: "fa" },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      slug: tenantId,
      nameFa: options.nameFa ?? "فروشگاه آزمایشی",
      nameEn: "Test Shop",
      timezone: "Asia/Tehran",
      currency: "IRR",
      isDemo: options.isDemo ?? true,
    },
  });
  await prisma.membership.create({
    data: { tenantId, userId, role: options.role ?? "owner" },
  });

  const settings = {
    workdayStartMin: options.settings?.workdayStartMin ?? 540,
    workdayEndMin: options.settings?.workdayEndMin ?? 1260,
    slaFirstReplyMin: options.settings?.slaFirstReplyMin ?? 120,
    slaShipMin: options.settings?.slaShipMin ?? 2880,
    priceFreshnessMin: options.settings?.priceFreshnessMin ?? 1440,
    postingPaused: options.settings?.postingPaused ?? false,
  };
  await prisma.tenantSettings.create({
    data: { tenantId, ...settings, demoMode: options.isDemo ?? true },
  });

  const ctx: SessionContext = {
    user: { id: userId, name: `${prefix} user`, email, locale: "fa" },
    tenant: {
      id: tenantId,
      slug: tenantId,
      nameFa: options.nameFa ?? "فروشگاه آزمایشی",
      nameEn: "Test Shop",
      timezone: "Asia/Tehran",
      currency: "IRR",
      isDemo: options.isDemo ?? true,
    },
    role: options.role ?? "owner",
    settings: { ...settings, demoMode: options.isDemo ?? true },
    sessionId: `session_${prefix}`,
  };

  return { tenantId, userId, email, ctx };
}

/** An operator context for the same tenant (a second membership, not a second tenant). */
export async function createOperator(tenant: TestTenant): Promise<TestTenant> {
  const userId = `${tenant.tenantId}_operator`;
  const email = `${tenant.tenantId}_operator@test.local`;
  await prisma.user.create({ data: { id: userId, name: "اپراتور", email } });
  await prisma.membership.create({ data: { tenantId: tenant.tenantId, userId, role: "operator" } });

  return {
    tenantId: tenant.tenantId,
    userId,
    email,
    ctx: {
      ...tenant.ctx,
      user: { id: userId, name: "اپراتور", email, locale: "fa" },
      role: "operator",
      sessionId: `session_${userId}`,
    },
  };
}

export async function createConnection(tenantId: string, accountRef = "test.account") {
  return prisma.channelConnection.create({
    data: {
      tenantId,
      channel: "replay",
      accountRef,
      displayName: "اتصال آزمایشی",
      status: "ready",
    },
  });
}

export async function createCustomer(
  tenantId: string,
  input: { id?: string; displayName?: string; phone?: string | null; handle?: string; connectionId?: string } = {},
) {
  const customer = await prisma.customer.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tenantId,
      displayName: input.displayName ?? "مشتری آزمایشی",
      phone: input.phone ?? null,
    },
  });

  if (input.handle && input.connectionId) {
    await prisma.customerIdentity.create({
      data: {
        tenantId,
        customerId: customer.id,
        connectionId: input.connectionId,
        kind: "instagram_username",
        externalRef: input.handle.toLowerCase(),
      },
    });
  }
  return customer;
}

export async function createConversation(
  tenantId: string,
  input: { connectionId: string; customerId: string; channelRef?: string; lastMessageAt?: Date },
) {
  return prisma.conversation.create({
    data: {
      tenantId,
      connectionId: input.connectionId,
      customerId: input.customerId,
      channelRef: input.channelRef ?? `conv-${randomUUID().slice(0, 8)}`,
      lastMessageAt: input.lastMessageAt ?? null,
    },
  });
}

export async function createMessage(
  tenantId: string,
  input: {
    conversationId: string;
    text?: string;
    direction?: "inbound" | "outbound";
    externalRef?: string;
    occurredAt?: Date;
    source?: "file" | "replay" | "instagram" | "manual";
  },
) {
  return prisma.message.create({
    data: {
      tenantId,
      conversationId: input.conversationId,
      direction: input.direction ?? "inbound",
      source: input.source ?? "manual",
      externalRef: input.externalRef ?? `msg-${randomUUID().slice(0, 8)}`,
      senderRef: "customer.test",
      text: input.text ?? "سلام",
      occurredAt: input.occurredAt ?? new Date("2026-10-01T09:00:00.000Z"),
      analysisState: "done",
    },
  });
}

export async function createOrder(
  tenantId: string,
  customerId: string,
  input: {
    id?: string;
    publicRef?: string;
    status?: OrderStatus;
    totalMinor?: bigint;
    version?: number;
    currency?: string;
    confirmedAt?: Date | null;
    confirmedById?: string | null;
    notes?: string | null;
    items?: { title: string; qty: number; unitPriceMinor: bigint }[];
  } = {},
) {
  const order = await prisma.order.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tenantId,
      customerId,
      publicRef: input.publicRef ?? `TEST-ORD-${randomUUID().slice(0, 6)}`,
      status: input.status ?? "draft",
      currency: input.currency ?? "IRR",
      totalMinor: input.totalMinor ?? 0n,
      version: input.version ?? 1,
      confirmedAt: input.confirmedAt ?? null,
      confirmedById: input.confirmedById ?? null,
      notes: input.notes ?? null,
    },
  });

  for (const item of input.items ?? []) {
    await prisma.orderItem.create({
      data: {
        tenantId,
        orderId: order.id,
        titleSnapshot: item.title,
        qty: item.qty,
        unitPriceMinor: item.unitPriceMinor,
        currency: order.currency,
      },
    });
  }
  return order;
}

export async function createPaymentClaim(
  tenantId: string,
  orderId: string,
  input: { id?: string; status?: PaymentStatus; amountMinor?: bigint | null; verifiedById?: string } = {},
) {
  const status = input.status ?? "claimed";
  const verified = status === "verified";
  return prisma.paymentClaim.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tenantId,
      orderId,
      status,
      amountMinor: input.amountMinor ?? null,
      claimedAt: new Date("2026-10-01T09:00:00.000Z"),
      verifiedAt: verified ? new Date("2026-10-02T09:00:00.000Z") : null,
      verifiedById: verified ? (input.verifiedById ?? null) : null,
    },
  });
}

export async function createShipment(
  tenantId: string,
  orderId: string,
  input: {
    status?: ShipmentStatus;
    carrier?: string | null;
    trackingCode?: string | null;
    shippedAt?: Date | null;
    deliveredAt?: Date | null;
  } = {},
) {
  const status = input.status ?? "not_ready";
  const needsShip = status === "shipped" || status === "delivered";
  return prisma.shipment.create({
    data: {
      tenantId,
      orderId,
      status,
      carrier: input.carrier ?? null,
      trackingCode: input.trackingCode ?? null,
      shippedAt: input.shippedAt ?? (needsShip ? new Date("2026-10-02T10:00:00.000Z") : null),
      deliveredAt: input.deliveredAt ?? (status === "delivered" ? new Date("2026-10-04T10:00:00.000Z") : null),
    },
  });
}

export async function createTask(
  tenantId: string,
  input: {
    id?: string;
    type?: TaskType;
    status?: TaskStatus;
    priority?: "P0" | "P1" | "P2" | "P3";
    title?: string;
    reasonCode?: string;
    reasonText?: string;
    dueAt?: Date | null;
    orderId?: string | null;
    customerId?: string | null;
    messageId?: string | null;
    dedupeKey?: string | null;
    closedAt?: Date | null;
    assigneeId?: string | null;
  } = {},
) {
  return prisma.task.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tenantId,
      type: input.type ?? "human_review",
      status: input.status ?? "open",
      priority: input.priority ?? "P2",
      title: input.title ?? "کار آزمایشی",
      reasonCode: input.reasonCode ?? "unknown_message",
      reasonText: input.reasonText ?? "بررسی لازم است.",
      dueAt: input.dueAt ?? null,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      messageId: input.messageId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      closedAt: input.closedAt ?? null,
      assigneeId: input.assigneeId ?? null,
      createdBy: "system",
    },
  });
}

export async function createAnalysisRun(
  tenantId: string,
  messageId: string,
  input: {
    id?: string;
    status?: AnalysisStatus;
    provider?: string;
    model?: string;
    tokensIn?: number | null;
    tokensOut?: number | null;
    costMicroUsd?: bigint | null;
    latencyMs?: number | null;
    queuedAt?: Date;
  } = {},
): Promise<{ id: string }> {
  return prisma.analysisRun.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tenantId,
      messageId,
      provider: input.provider ?? "mock",
      model: input.model ?? "mock-v1",
      promptVersion: "test-prompt",
      rulesVersion: "test-rules",
      contextHash: `hash-${randomUUID()}`,
      status: input.status ?? "succeeded",
      latencyMs: input.latencyMs ?? null,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
      costMicroUsd: input.costMicroUsd ?? null,
      queuedAt: input.queuedAt ?? new Date("2026-10-01T09:00:00.000Z"),
    },
  });
}

export async function createSuggestion(
  tenantId: string,
  input: {
    analysisRunId: string;
    sourceMessageId: string;
    orderId?: string | null;
    customerId?: string | null;
    field: string;
    proposedValue?: unknown;
    reviewState?: "proposed" | "accepted" | "corrected" | "rejected";
    evidenceStart?: number | null;
    evidenceEnd?: number | null;
    confidence?: number | null;
  },
) {
  return prisma.suggestion.create({
    data: {
      tenantId,
      analysisRunId: input.analysisRunId,
      sourceMessageId: input.sourceMessageId,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      field: input.field,
      proposedValue: (input.proposedValue ?? { value: null }) as Prisma.InputJsonValue,
      reviewState: input.reviewState ?? "proposed",
      evidenceStart: input.evidenceStart ?? null,
      evidenceEnd: input.evidenceEnd ?? null,
      confidence: input.confidence ?? null,
    },
  });
}

/** Assert the exact API error a service raises, rather than "it threw something". */
export async function expectApiError(
  operation: () => Promise<unknown>,
  expected: { status: number; code: string },
): Promise<ApiError> {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status !== expected.status || error.code !== expected.code) {
      throw new Error(`expected ${expected.status}/${expected.code}, got ${error.status}/${error.code}: ${error.message}`);
    }
    return error;
  }
  throw new Error(`expected an ApiError ${expected.status}/${expected.code}, but nothing was thrown`);
}
