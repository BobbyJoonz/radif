import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TaskStatus } from "@/generated/prisma/enums";
import { errors } from "@/server/http";
import type { SessionContext } from "@/server/session";
import { allowedActions, nextAction, type ActionKey, type CaseFacts, type Role } from "@/server/domain/next-action";

/**
 * The workdesk read model (stage C).
 *
 * One case per order — or per conversation when no order is known — carrying the
 * blockers, one primary action, what the role may do, who owns it and when it is
 * due. It is a read model over the existing tables: no new workflow engine, no
 * `Case` table.
 *
 * The two rules the audit cared about:
 *   • "My work" is filtered **on the server** by assigneeId (a title change is not
 *     a filter);
 *   • an invalid or foreign selection never silently returns another record — the
 *     pages resolve ids themselves, and this service only answers for the tenant it
 *     was given.
 */

export type WorkdeskView = "mine" | "unassigned" | "waiting" | "decisions" | "all";

export type WorkItemView = {
  key: string;
  orderId: string | null;
  conversationId: string | null;
  customerId: string | null;
  customerName: string | null;
  orderRef: string | null;
  taskIds: string[];
  blockers: string[];
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  primaryAction: ActionKey;
  primaryBlocker: string;
  allowedActions: ActionKey[];
  openCount: number;
};

const OPEN: TaskStatus[] = ["open", "in_progress", "waiting_customer"];
const MAX_ITEMS = 60;

function role(ctx: SessionContext): Role {
  return ctx.role === "owner" ? "owner" : "operator";
}

function viewWhere(ctx: SessionContext, view: WorkdeskView): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { tenantId: ctx.tenant.id, status: { in: OPEN } };
  switch (view) {
    case "mine":
      return { ...base, assigneeId: ctx.user.id };
    case "unassigned":
      return { ...base, assigneeId: null };
    case "waiting":
      return { ...base, status: "waiting_customer" };
    case "decisions":
      // what only an owner can decide: money and human review
      return {
        ...base,
        OR: [{ assigneeId: ctx.user.id }, { type: { in: ["payment_reconcile", "human_review"] } }],
      };
    case "all":
    default:
      return base;
  }
}

function factsFor(
  task: {
    order: { status: string; paymentClaims: { status: string }[]; shipments: { status: string; trackingCode: string | null }[] } | null;
    reasonCode: string;
    type: string;
  },
  openReasonCodes: string[],
): CaseFacts {
  const order = task.order;
  const claim = order?.paymentClaims?.[0] ?? null;
  const shipment = order?.shipments?.[0] ?? null;
  return {
    hasOrder: Boolean(order),
    orderStatus: (order?.status as CaseFacts["orderStatus"]) ?? null,
    paymentStatus: (claim?.status as CaseFacts["paymentStatus"]) ?? null,
    shipmentStatus: (shipment?.status as CaseFacts["shipmentStatus"]) ?? null,
    hasTracking: Boolean(shipment?.trackingCode),
    addressMissing: openReasonCodes.includes("address_change") || openReasonCodes.includes("address_change_before_shipping"),
    trackingRequested:
      openReasonCodes.includes("tracking_missing") ||
      openReasonCodes.includes("tracking_requested") ||
      openReasonCodes.includes("tracking_followup"),
    openReasonCodes,
  };
}

export async function getWorkdesk(ctx: SessionContext, view: WorkdeskView = "all"): Promise<WorkItemView[]> {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: viewWhere(ctx, view),
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: MAX_ITEMS,
    include: {
      order: {
        select: {
          id: true,
          publicRef: true,
          status: true,
          paymentClaims: { select: { status: true }, orderBy: { claimedAt: "desc" }, take: 1 },
          shipments: { select: { status: true, trackingCode: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        },
      },
      customer: { select: { id: true, displayName: true } },
      message: { select: { conversationId: true } },
      assignee: { select: { name: true } },
    },
  });

  // Group by order, otherwise by the message's conversation — never by name.
  const groups = new Map<string, WorkItemView>();
  for (const task of tasks) {
    const key = task.orderId ?? task.message?.conversationId ?? `task:${task.id}`;
    const openReasonCodes = tasks
      .filter((row) => (row.orderId ?? row.message?.conversationId ?? `task:${row.id}`) === key)
      .map((row) => row.reasonCode);
    const facts = factsFor(task, openReasonCodes);
    const next = nextAction(facts, role(ctx));

    const existing = groups.get(key);
    if (existing) {
      existing.taskIds.push(task.id);
      existing.openCount = existing.taskIds.length;
      if (!existing.dueAt && task.dueAt) existing.dueAt = task.dueAt.toISOString();
      continue;
    }

    groups.set(key, {
      key,
      orderId: task.orderId,
      conversationId: task.message?.conversationId ?? null,
      customerId: task.customer?.id ?? null,
      customerName: task.customer?.displayName ?? null,
      orderRef: task.order?.publicRef ?? null,
      taskIds: [task.id],
      blockers: [...new Set(openReasonCodes)],
      assigneeId: task.assigneeId,
      assigneeName: task.assignee?.name ?? null,
      dueAt: task.dueAt ? task.dueAt.toISOString() : null,
      primaryAction: next.action,
      primaryBlocker: next.blocker,
      allowedActions: allowedActions(facts, role(ctx)),
      openCount: 1,
    });
  }

  return [...groups.values()].sort((a, b) => {
    const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Claiming an unassigned task.
 *
 * One conditional UPDATE is the whole concurrency story: the database decides who
 * wins, and the loser gets a conflict instead of a silent second owner.
 */
export async function claimTask(ctx: SessionContext, taskId: string): Promise<{ assigneeId: string }> {
  const result = await prisma.task.updateMany({
    where: {
      id: taskId,
      tenantId: ctx.tenant.id,
      status: { in: [...OPEN] },
      assigneeId: null,
    },
    data: { assigneeId: ctx.user.id },
  });
  if (result.count === 0) {
    throw errors.conflict("این کار همین حالا توسط فرد دیگری برداشته شد یا دیگر باز نیست.");
  }
  await prisma.auditEvent.create({
    data: {
      tenantId: ctx.tenant.id,
      actorType: "user",
      actorId: ctx.user.id,
      action: "task.claimed",
      entityType: "Task",
      entityId: taskId,
      after: { assigneeId: ctx.user.id },
    },
  });
  return { assigneeId: ctx.user.id };
}

/**
 * Delegation. Only an owner may hand work to somebody else; an operator can take
 * unassigned work (claimTask), but cannot re-assign a colleague. The assignee must
 * already belong to this shop: assignment is not an invitation.
 */
export async function assignTask(
  ctx: SessionContext,
  taskId: string,
  assigneeId: string | null,
): Promise<{ assigneeId: string | null }> {
  if (ctx.role !== "owner") {
    throw errors.forbidden("واگذاری کار فقط با نقش «مالک» انجام می‌شود.");
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId: ctx.tenant.id },
    select: { id: true, status: true, assigneeId: true },
  });
  if (!task) throw errors.notFound("این کار پیدا نشد.");
  if (task.status === "done") throw errors.conflict("این کار بسته شده است و واگذاری نمی‌شود.");

  if (assigneeId) {
    const membership = await prisma.membership.findFirst({
      where: { tenantId: ctx.tenant.id, userId: assigneeId },
      select: { userId: true },
    });
    if (!membership) throw errors.notFound("این همکار در این فروشگاه عضو نیست.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: task.id }, data: { assigneeId } });
    await tx.auditEvent.create({
      data: {
        tenantId: ctx.tenant.id,
        actorType: "user",
        actorId: ctx.user.id,
        action: "task.assigned",
        entityType: "Task",
        entityId: task.id,
        before: { assigneeId: task.assigneeId },
        after: { assigneeId },
      },
    });
  });

  return { assigneeId };
}
