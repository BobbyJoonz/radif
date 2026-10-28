/**
 * The boundary types. Everything that crosses from a server service to a page,
 * or from a route handler to a client component, is declared here — once.
 *
 * Rules:
 *   • no Prisma types, no `Date`, no `BigInt`: dates are ISO strings and money
 *     is a decimal string of minor units, because JSON has neither;
 *   • `null` means "the database has no value", never "zero" and never "fine";
 *   • nothing here is a UI concern (no colours, no labels) — those live in
 *     src/i18n and src/components.
 */

// ───────────────────────────── shared ─────────────────────────────

export type PriorityValue = "P0" | "P1" | "P2" | "P3";
export type OrderStatusValue = "draft" | "needs_review" | "confirmed" | "cancelled";
export type PaymentStatusValue = "unknown" | "claimed" | "verified" | "disputed" | "refunded";
export type ShipmentStatusValue = "not_ready" | "preparing" | "shipped" | "delivered" | "paused";
export type TaskStatusValue = "open" | "in_progress" | "waiting_customer" | "done";
export type ReviewStateValue = "proposed" | "accepted" | "corrected" | "rejected";
export type SourceValue = "file" | "replay" | "instagram" | "manual";
export type IntentKey =
  | "product_question"
  | "new_order"
  | "repeat_order"
  | "payment_claim"
  | "order_status"
  | "tracking_request"
  | "address_change"
  | "cancellation"
  | "refund_or_return"
  | "complaint"
  | "other_unknown";

export type Badge = { kind: "source" | "review" | "payment" | "shipment" | "order" | "task"; value: string };

// ───────────────────────────── ingestion boundary (CONTRACTS §3) ─────────────────────────────

/**
 * The one shape every channel produces, regardless of origin (file, replay,
 * instagram, manual). It is an *internal* contract, not an Instagram payload:
 * nothing here comes from the browser unchecked — the route re-validates it and
 * the tenant always comes from the server session, never from this object.
 */
export type IncomingMessage = {
  source: SourceValue;
  accountRef: string;
  conversationRef: string;
  messageRef: string;
  senderRef: string;
  direction: "inbound" | "outbound";
  occurredAt: string;
  text: string;
  attachments: { kind: string; externalRef?: string }[];
};

/** Result of one ingest call. `duplicate: true` means no new row and no new job. */
export type IngestResultDTO = {
  messageId: string;
  duplicate: boolean;
  jobId: string | null;
};

/**
 * A proposal is what the analysis *suggests*, never what it decides. `value:
 * null` is meaningful: "the message did not say it" (an amount without a unit, an
 * address that was said to have changed but was not written out).
 */
export type Proposal = {
  field: string;
  value: string | number | null;
  displayValue?: string | null;
  candidateId?: string | null;
  evidence?: { start: number; end: number } | null;
  confidence?: number | null;
  reviewState: ReviewStateValue;
};

/** What a review call answers, so a client can update one row without refetching. */
export type SuggestionReviewDTO = {
  id: string;
  reviewState: ReviewStateValue;
  correctedValue: unknown | null;
  reviewedAt: string | null;
};

// ───────────────────────────── today ─────────────────────────────

export type TodayRow = {
  taskId: string;
  priority: PriorityValue;
  reasonCode: string;
  reasonText: string;
  title: string;
  nextAction: string;
  subline: string | null;
  dueAt: string | null;
  dueLabel: "overdue" | "today" | "soon" | "none";
  customerName: string;
  orderRef: string | null;
  itemCount: number | null;
  source: SourceValue;
  conversationId: string | null;
  orderId: string | null;
};

export type TodayDTO = {
  counts: { open: number; overdue: number; needsReview: number };
  items: TodayRow[];
  dayStrip: { hour: number; count: number }[];
  stats: {
    inbound: number;
    replies: number;
    unanswered: number;
    avgReplyMinutes: number | null;
  };
  lastUpdatedAt: string | null;
  paused: boolean;
};

// ───────────────────────────── inbox ─────────────────────────────

export type ConversationRow = {
  id: string;
  customerName: string;
  handle: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unrepliedCount: number;
  source: SourceValue;
  pendingSuggestions: number;
  needsReview: boolean;
  orderRef: string | null;
};

export type MessageDTO = {
  id: string;
  direction: "inbound" | "outbound";
  source: SourceValue;
  senderLabel: string;
  text: string;
  occurredAt: string;
  analysisState: "pending" | "running" | "done" | "failed" | "needs_human";
  attachments: { kind: string; externalRef?: string }[];
};

export type SuggestionDTO = {
  id: string;
  field: string;
  /** what the system proposed; null = the message did not say it */
  value: string | number | null;
  displayValue: string | null;
  confidence: number | null;
  reviewState: ReviewStateValue;
  evidence: { start: number; end: number } | null;
  sourceMessageId: string;
  candidateId: string | null;
  group: "intent" | "order" | "field" | "risk";
};

export type ConversationDetailDTO = {
  conversation: ConversationRow & { orderId: string | null; customerId: string };
  messages: MessageDTO[];
  suggestions: SuggestionDTO[];
  order: OrderSummaryDTO | null;
  tasks: TaskRow[];
  analysis: { runId: string; provider: string; model: string; status: string; latencyMs: number | null; createdAt: string } | null;
};

// ───────────────────────────── orders ─────────────────────────────

export type OrderSummaryDTO = {
  id: string;
  publicRef: string;
  customerName: string;
  status: OrderStatusValue;
  paymentStatus: PaymentStatusValue;
  shipmentStatus: ShipmentStatusValue;
  totalMinor: string;
  currency: string;
  itemCount: number;
  dueAt: string | null;
  createdAt: string;
  version: number;
};

export type OrderRow = OrderSummaryDTO & { needsReview: boolean };

export type OrderItemDTO = {
  id: string;
  title: string;
  qty: number;
  unitPriceMinor: string;
  currency: string;
  sku: string | null;
};

export type PaymentClaimDTO = {
  id: string;
  status: PaymentStatusValue;
  amountMinor: string | null;
  currency: string;
  claimedAt: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
  disputeReason: string | null;
  sourceMessageId: string | null;
};

export type ShipmentDTO = {
  id: string;
  status: ShipmentStatusValue;
  carrier: string | null;
  trackingCode: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  pausedReason: string | null;
};

export type AuditEntryDTO = {
  id: string;
  action: string;
  actorType: "system" | "user" | "demo";
  actorName: string | null;
  entityType: string;
  entityId: string;
  at: string;
  summary: string | null;
};

export type OrderDetailDTO = {
  order: OrderSummaryDTO & { notes: string | null; confirmedAt: string | null };
  customer: { id: string; displayName: string; phone: string | null; phoneVerified: boolean; handles: string[] };
  items: OrderItemDTO[];
  paymentClaims: PaymentClaimDTO[];
  shipment: ShipmentDTO | null;
  tasks: TaskRow[];
  audit: AuditEntryDTO[];
  suggestions: SuggestionDTO[];
  replyPreview: { templateKey: string; templateVersion: string; body: string; allowed: boolean } | null;
};

// ───────────────────────────── tasks ─────────────────────────────

export type TaskRow = {
  id: string;
  type: string;
  status: TaskStatusValue;
  priority: PriorityValue;
  title: string;
  detail: string | null;
  reasonCode: string;
  reasonText: string;
  dueAt: string | null;
  overdue: boolean;
  assigneeName: string | null;
  customerName: string | null;
  orderRef: string | null;
  orderId: string | null;
  conversationId: string | null;
  createdAt: string;
};

// ───────────────────────────── customers ─────────────────────────────

export type CustomerRow = {
  id: string;
  displayName: string;
  phone: string | null;
  phoneVerified: boolean;
  handles: string[];
  ordersCount: number;
  openTasks: number;
  lastSeenAt: string | null;
};

export type CustomerDetailDTO = {
  customer: CustomerRow;
  orders: OrderRow[];
  timeline: {
    at: string;
    kind: "message" | "order" | "payment" | "shipment" | "task" | "audit";
    summary: string;
    conversationId: string | null;
    orderId: string | null;
  }[];
};

// ───────────────────────────── import ─────────────────────────────

export type ImportPreviewDTO = {
  columns: { key: string; label: string; mappedTo: string | null }[];
  accepted: number;
  rejected: number;
  duplicateRisk: number;
  sample: { row: number; text: string; customer: string; occurredAt: string }[];
  rejections: { row: number; reason: string }[];
  limits: { maxBytes: number; maxRows: number };
};

export type ImportCommitDTO = {
  imported: number;
  duplicates: number;
  rejected: number;
  jobIds: string[];
  conversationIds: string[];
};

// ───────────────────────────── settings & evaluation ─────────────────────────────

export type SettingsDTO = {
  tenant: { id: string; nameFa: string; nameEn: string; timezone: string; currency: string; isDemo: boolean };
  workday: { startMin: number; endMin: number };
  sla: { firstReplyMin: number; shipMin: number };
  priceFreshnessMin: number;
  postingPaused: boolean;
  connections: {
    id: string;
    channel: string;
    accountRef: string;
    displayName: string;
    status: string;
    lastSyncAt: string | null;
    live: boolean;
  }[];
  modes: { appMode: string; ingestion: string; decisionProvider: string; outbound: string; liveAutomation: boolean };
  rateLimits: { loginPerMin: number; importPerMin: number };
};

export type EvaluationRow = {
  id: string;
  messageId: string;
  provider: string;
  model: string;
  promptVersion: string;
  rulesVersion: string;
  status: string;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicroUsd: string | null;
  attempts: number;
  createdAt: string;
  intents: string[];
};

export type EvaluationComparison = {
  mode: "measured" | "simulated" | "assumption" | "not_measured";
  samples: number;
  baselineCostMicroUsd: string | null;
  cascadeCostMicroUsd: string | null;
  savingsPercent: number | null;
  note: string;
};
