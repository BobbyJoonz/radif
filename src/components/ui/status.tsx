import type { Dictionary } from "@/i18n";
import type {
  OrderStatusValue,
  PaymentStatusValue,
  PriorityValue,
  ReviewStateValue,
  ShipmentStatusValue,
  TaskStatusValue,
} from "@/lib/dto";
import { Mark, type MarkShape, type MarkTone } from "./state-mark";

/**
 * The three state machines each keep their own word and their own shape.
 * Money is never reassuring before a human verified it: `claimed` is a muted
 * triangle, not a green anything. Orange is reserved for "needs you now".
 */
type Visual = { shape: MarkShape; tone: MarkTone };

export const ORDER_VISUAL: Record<OrderStatusValue, Visual> = {
  draft: { shape: "dash", tone: "muted" },
  needs_review: { shape: "triangle", tone: "accent" },
  confirmed: { shape: "dot", tone: "ink" },
  cancelled: { shape: "cross", tone: "muted" },
};

export const PAYMENT_VISUAL: Record<PaymentStatusValue, Visual> = {
  unknown: { shape: "ring", tone: "muted" },
  claimed: { shape: "triangle", tone: "ink" },
  verified: { shape: "dot", tone: "positive" },
  disputed: { shape: "cross", tone: "critical" },
  refunded: { shape: "dash", tone: "critical" },
};

export const SHIPMENT_VISUAL: Record<ShipmentStatusValue, Visual> = {
  not_ready: { shape: "ring", tone: "muted" },
  preparing: { shape: "dash", tone: "ink" },
  shipped: { shape: "dot", tone: "ink" },
  delivered: { shape: "dot", tone: "positive" },
  paused: { shape: "cross", tone: "critical" },
};

export const TASK_VISUAL: Record<TaskStatusValue, Visual> = {
  open: { shape: "ring", tone: "ink" },
  in_progress: { shape: "dash", tone: "ink" },
  waiting_customer: { shape: "ring", tone: "muted" },
  done: { shape: "dot", tone: "positive" },
};

export const REVIEW_VISUAL: Record<ReviewStateValue, Visual> = {
  proposed: { shape: "triangle", tone: "ink" },
  accepted: { shape: "dot", tone: "positive" },
  corrected: { shape: "dash", tone: "ink" },
  rejected: { shape: "cross", tone: "muted" },
};

export const PRIORITY_VISUAL: Record<PriorityValue, Visual> = {
  P0: { shape: "cross", tone: "critical" },
  P1: { shape: "triangle", tone: "accent" },
  P2: { shape: "dash", tone: "ink" },
  P3: { shape: "ring", tone: "muted" },
};

export type StatusKind = "order" | "payment" | "shipment" | "task" | "review" | "priority";

const VISUALS: Record<StatusKind, Record<string, Visual>> = {
  order: ORDER_VISUAL,
  payment: PAYMENT_VISUAL,
  shipment: SHIPMENT_VISUAL,
  task: TASK_VISUAL,
  review: REVIEW_VISUAL,
  priority: PRIORITY_VISUAL,
};

const WORDS: Record<Exclude<StatusKind, "priority">, keyof Dictionary> = {
  order: "orderStatus",
  payment: "paymentStatus",
  shipment: "shipmentStatus",
  task: "taskStatus",
  review: "reviewState",
};

export function visualFor(kind: StatusKind, value: string): Visual {
  return VISUALS[kind][value] ?? { shape: "ring", tone: "muted" };
}

export function wordFor(kind: StatusKind, value: string, dict: Dictionary): string {
  if (kind === "priority") {
    const priority = dict.priority as Record<string, string>;
    return priority[value] ?? value;
  }
  const table = dict[WORDS[kind]] as unknown as Record<string, string>;
  return table[value] ?? value;
}

/** The whole point: word first, shape beside it. */
export function StatusWord({
  kind,
  value,
  dict,
  className,
}: {
  kind: StatusKind;
  value: string;
  dict: Dictionary;
  className?: string;
}) {
  const visual = visualFor(kind, value);
  return (
    <Mark shape={visual.shape} tone={visual.tone} className={className}>
      {wordFor(kind, value, dict)}
    </Mark>
  );
}
