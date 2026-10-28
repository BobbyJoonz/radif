import { prisma } from "@/server/db";
import type { SessionContext } from "@/server/session";
import { errors } from "@/server/http";
import type { TaskRow, TaskStatusValue } from "@/lib/dto";
import { assertTaskTransition } from "@/server/domain/state";
import { TASK_VIEW_INCLUDE, toTaskRow, type TaskForView } from "./task-view";

/**
 * Tasks — the queue a human actually works (CONTRACTS §4, §6 rules 1 and 13).
 *
 * Two things happen here and nowhere else:
 *
 *  • **Closing releases the dedupe key.** `Task.@@unique([tenantId, dedupeKey])`
 *    is what stops a replayed message from cloning an active task (rule 1). When
 *    the task is `done` the key must be freed (`dedupeKey = null`,
 *    `dedupeState = released`), otherwise a *genuinely new* request about the same
 *    order could never open a task again — the opposite failure, and a worse one.
 *
 *  • **`done` records when it was done.** The database enforces
 *    `Task_done_has_closed_at`; this service fills `closedAt` so the constraint is
 *    satisfied by design rather than by luck.
 *
 * The row mapping itself lives in `task-view.ts`, shared with Today and Inbox, so
 * one task cannot say two different things on two screens.
 */

/** Re-exported for the other services so they include exactly the same relations. */
export const taskInclude = TASK_VIEW_INCLUDE;
export { toTaskRow };
export type TaskWithRelations = TaskForView;

export type ListTasksOptions = {
  status?: TaskStatusValue;
  assigneeId?: string;
  /** The Tasks screen's «نمایش انجام‌شده‌ها» toggle. Default: include them. */
  includeDone?: boolean;
};

/**
 * The queue, ordered the way a person reads it: hardest priority first, then the
 * nearest deadline, then newest. Filtering is tenant-scoped — a caller cannot ask
 * for another shop's tasks, and an unknown `assigneeId` simply matches nothing.
 */
export async function listTasks(ctx: SessionContext, opts: ListTasksOptions = {}): Promise<TaskRow[]> {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(opts.status
        ? { status: opts.status }
        : opts.includeDone === false
          ? { status: { not: "done" as const } }
          : {}),
      ...(opts.assigneeId ? { assigneeId: opts.assigneeId } : {}),
    },
    include: taskInclude,
    orderBy: [{ priority: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  return tasks.map((task) => toTaskRow(task, now));
}

export type UpdateTaskInput = {
  status: TaskStatusValue;
  assigneeId?: string | null;
  closeNote?: string | null;
};

/**
 * Move a task. Legal edges come from `domain/state.ts`, not from this file, so a
 * route cannot invent a transition (a `done` task never reopens: a new request is
 * a new task, with its own history).
 */
export async function updateTask(
  ctx: SessionContext,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskRow> {
  const now = new Date();
  const tenantId = ctx.tenant.id;

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, tenantId } });
    if (!task) throw errors.notFound("این کار پیدا نشد.");

    if (task.status !== input.status) {
      try {
        assertTaskTransition(task.status, input.status);
      } catch (error) {
        throw errors.conflict((error as Error).message);
      }
    }

    // An assignee is a member of *this* tenant. A foreign user id is "not found",
    // never "forbidden": ids must not be probeable from here either (rule 9).
    let assigneeId: string | null | undefined = input.assigneeId;
    if (input.assigneeId) {
      const membership = await tx.membership.findFirst({
        where: { tenantId, userId: input.assigneeId },
        select: { userId: true },
      });
      if (!membership) throw errors.notFound("این کاربر در این فروشگاه عضو نیست.");
      assigneeId = membership.userId;
    }

    const closing = input.status === "done";
    const updated = await tx.task.update({
      where: { id: task.id },
      data: {
        status: input.status,
        ...(assigneeId !== undefined ? { assigneeId } : {}),
        ...(closing
          ? {
              closedAt: task.closedAt ?? now,
              closeNote: input.closeNote?.trim() || task.closeNote,
              // Free the unique key so a genuinely new issue can open a task.
              dedupeKey: null,
              dedupeState: "released",
            }
          : {}),
      },
      include: taskInclude,
    });

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "task.status_changed",
        entityType: "task",
        entityId: task.id,
        before: { status: task.status, dedupeKeyPresent: task.dedupeKey !== null },
        after: {
          status: updated.status,
          dedupeState: updated.dedupeState,
          closedAt: updated.closedAt?.toISOString() ?? null,
        },
      },
    });

    return toTaskRow(updated, now);
  });
}
