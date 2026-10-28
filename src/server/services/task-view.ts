import type { TaskRow } from "@/lib/dto";
import type { Prisma } from "@/generated/prisma/client";
import { reasonText as reasonTextForCode } from "@/server/domain/priority";

/**
 * Task → `TaskRow` mapping, in one place because three readers need the exact
 * same shape (Today's ledger, the inbox thread's task list, and the conversation
 * detail payload). Duplicating it would let the same task say two different
 * things on two screens.
 *
 * Two rules encoded here, both from the brief:
 *   • `overdue` is computed from the stored `dueAt` and the clock — never from
 *     the tone of a message, never from a status flag the UI could drift from;
 *   • `reasonText` is a sentence, not a code. The stored sentence wins (it was
 *     written when the task was raised, next to the fact that caused it); the
 *     domain dictionary is the fallback for a task that only has a code.
 */

export const TASK_VIEW_INCLUDE = {
  assignee: { select: { name: true } },
  customer: { select: { displayName: true } },
  order: {
    select: {
      id: true,
      publicRef: true,
      customer: { select: { displayName: true } },
    },
  },
  message: { select: { conversationId: true } },
} satisfies Prisma.TaskInclude;

export type TaskForView = Prisma.TaskGetPayload<{ include: typeof TASK_VIEW_INCLUDE }>;

/** Short Persian sentence: the stored one, else the domain's sentence for the code. */
export function taskReasonText(task: { reasonCode: string; reasonText?: string | null }): string {
  const stored = task.reasonText?.trim();
  if (stored) return stored;
  return reasonTextForCode(task.reasonCode);
}

export function toTaskRow(task: TaskForView, now: Date): TaskRow {
  const customerName = task.customer?.displayName ?? task.order?.customer?.displayName ?? null;
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    priority: task.priority,
    title: task.title,
    detail: task.detail,
    reasonCode: task.reasonCode,
    reasonText: taskReasonText(task),
    dueAt: task.dueAt?.toISOString() ?? null,
    overdue: task.status !== "done" && task.dueAt ? task.dueAt.getTime() < now.getTime() : false,
    assigneeName: task.assignee?.name ?? null,
    customerName,
    orderRef: task.order?.publicRef ?? null,
    orderId: task.orderId,
    conversationId: task.message?.conversationId ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

