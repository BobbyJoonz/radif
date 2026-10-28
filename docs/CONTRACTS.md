# CONTRACTS — Radif

*The agreement between the server and the UI. If a function or a route is not
listed here, it does not exist yet; add it here first.*

Read with `DIRECTION.md` (design), `mvp_implementation_prompt.md` (the brief),
`prisma/schema.prisma` (data).

---

## 1. Map

```
src/app/[locale]/layout.tsx        root html/body, lang+dir          (lead)
src/app/[locale]/(app)/layout.tsx  session gate + shell              (lead)
src/app/[locale]/(app)/page.tsx    Today                              (lead)
src/app/[locale]/(app)/*/page.tsx  Inbox, Orders, Tasks, Customers,
                                   Import, Settings, Evaluation      (ui)
src/app/[locale]/login/page.tsx    Login                              (ui)
src/app/[locale]/.../error.tsx     per-screen error boundaries        (ui)
src/app/api/**/route.ts            REST (thin: validate → service)    (server)
src/components/**                  UI primitives + screens            (ui)
src/components/shell/**            shell (lead wrote; ui may extend)
src/i18n/**                        config, format, dictionaries       (shared)
src/lib/dto.ts                     types crossing the boundary        (shared)
src/server/db.ts, auth.ts, session.ts, http.ts                        (lead)
src/server/domain/**               pure rules, no I/O                 (server)
src/server/providers/**            DecisionProvider + mock           (server)
src/server/channels/**             ChannelAdapter + file/replay      (server)
src/server/ingestion/**            validate → store → enqueue        (server)
src/server/services/**             reads/writes per screen           (server)
src/server/worker/**               durable queue loop                (server)
prisma/seed.ts                     DEMO data                         (lead)
tests/**                           vitest (server) + playwright      (server for unit/integration)
```

**Rule:** a page never imports `@/server/*` except the read services listed in
§4. A client component never imports `@/server/*` at all — it calls the REST
routes in §5 through `fetch`.

## 2. Modes

`APP_MODE=demo` (default): the seeded `DEMO-*` data, `mock` decision provider,
`replay` ingestion, outbound `preview`. Everything works without a key.
`APP_MODE=production`: no demo seed, no replay route, no mock provider, no reset.

## 3. Domain vocabulary (fixed in `src/lib/dto.ts`)

```ts
type IncomingMessage = {
  source: "file" | "replay" | "instagram" | "manual";
  accountRef: string;
  conversationRef: string;
  messageRef: string;            // provider id, or a deterministic import key
  senderRef: string;             // customer identity, lower-cased
  direction: "inbound" | "outbound";
  occurredAt: string;            // ISO, UTC
  text: string;
  attachments: Array<{ kind: string; externalRef?: string }>;
};

type IntentKey =
  | "product_question" | "new_order" | "repeat_order" | "payment_claim"
  | "order_status" | "tracking_request" | "address_change" | "cancellation"
  | "refund_or_return" | "complaint" | "other_unknown";

type Proposal = {
  field: string;                 // "intent.primary" | "order.amount" | "address" | ...
  value: string | number | null; // null means: not stated / cannot be inferred
  candidateId?: string | null;
  evidence?: { start: number; end: number } | null;
  confidence?: number | null;    // 0..1 from the provider, never a guarantee
  reviewState: "proposed" | "accepted" | "corrected" | "rejected";
};

type Priority = "P0" | "P1" | "P2" | "P3";
```

States are three independent machines (never one column):

```
order: draft → needs_review → confirmed | cancelled
payment: unknown → claimed → verified | disputed | refunded
shipment: not_ready → preparing → shipped → delivered | paused
```

## 4. Read services (server components may import these)

All take `SessionContext` first (`@/server/session`) and never accept a
`tenantId` from the caller.

```ts
// src/server/services/today.ts
getToday(ctx): Promise<TodayDTO>
  TodayDTO = {
    counts: { open: number; overdue: number; needsReview: number };
    items: TodayRow[];            // ordered: overdue first, then by dueAt
    dayStrip: { hour: number; count: number }[];   // 24 entries, real counts
    stats: { inbound: number; replies: number; unanswered: number; avgReplyMinutes: number | null };
    lastUpdatedAt: string | null;
    paused: boolean;
  }
  TodayRow = {
    taskId: string; priority: Priority; reasonCode: string; reasonText: string;
    title: string; nextAction: string; subline: string | null;
    dueAt: string | null; dueLabel: "overdue" | "today" | "soon" | "none";
    customerName: string; orderRef: string | null; itemCount: number | null;
    source: "file" | "replay" | "instagram" | "manual";
    conversationId: string | null; orderId: string | null;
  }

// src/server/services/inbox.ts
listConversations(ctx, opts: { filter?: "all"|"unanswered"|"payment"|"review"; q?: string }): Promise<ConversationRow[]>
getConversation(ctx, conversationId): Promise<ConversationDetailDTO | null>
previewReply(ctx, orderId): Promise<{ templateKey: string; templateVersion: string; body: string; allowed: boolean }>

// src/server/services/orders.ts
listOrders(ctx, opts?: { status?: OrderStatusValue }): Promise<OrderRow[]>
getOrder(ctx, orderId): Promise<OrderDetailDTO | null>
// src/server/services/tasks.ts
listTasks(ctx, opts?: { status?: TaskStatusValue; assigneeId?: string }): Promise<TaskRow[]>
// src/server/services/customers.ts
listCustomers(ctx, q?): Promise<CustomerRow[]>
getCustomer(ctx, customerId): Promise<CustomerDetailDTO | null>
// src/server/services/settings.ts
getSettings(ctx): Promise<SettingsDTO>
// src/server/services/evaluation.ts
listRuns(ctx): Promise<EvaluationRow[]>
```

DTO shapes are declared in `src/lib/dto.ts`; **whoever needs a new field adds it
there with a comment**, and the other side reads it. No `any` crosses this
boundary.

## 5. REST routes (client components + tests)

Every handler: `requireSession()` (or `requireRole("owner")`), validate with Zod,
call a service, `ok(data)` / `fail(error)`. Body shape `{ ok, data }` /
`{ ok:false, error:{ code, message, details? } }`.

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| GET | `/api/health` | — | `{ db: "up", demo: boolean }` |
| GET | `/api/today` | session | → `TodayDTO` |
| GET | `/api/conversations?filter=&q=` | session | → `ConversationRow[]` |
| GET | `/api/conversations/:id` | session | → `ConversationDetailDTO` |
| POST | `/api/messages/ingest` | session | `IncomingMessage` → `{ messageId, duplicate: boolean, jobId }` |
| POST | `/api/messages/:id/analyze` | session | → `{ runId, state }` (retry; rate-limited) |
| POST | `/api/suggestions/:id/review` | session | `{ action: "accept"\|"correct"\|"reject", value?: unknown }` → `{ reviewState }` |
| GET | `/api/orders?status=` | session | → `OrderRow[]` |
| GET | `/api/orders/:id` | session | → `OrderDetailDTO` |
| PATCH | `/api/orders/:id` | session | `{ version: number; patch: { items?, notes? } }` → `{ version }` (409 on stale) |
| POST | `/api/orders/:id/confirm` | session | `{ version }` → `{ order }` (never verifies payment) |
| POST | `/api/orders/:id/payment-claims` | session | `{ amountMinor?, currency?, sourceMessageId? }` → `{ claim }` (status=claimed) |
| POST | `/api/orders/:id/payment-claims/:claimId/verify` | **owner** | `{ decision: "verified"\|"disputed", reason? }` → `{ claim }` |
| PATCH | `/api/orders/:id/shipment` | session | `{ status?, trackingCode?, carrier? }` → `{ shipment }` |
| GET | `/api/orders/:id/reply-preview` | session | → reply preview (never sets `sent`) |
| GET | `/api/tasks?status=` | session | → `TaskRow[]` |
| PATCH | `/api/tasks/:id` | session | `{ status, assigneeId?, closeNote? }` → `{ task }` |
| GET | `/api/customers?q=` | session | → `CustomerRow[]` |
| GET | `/api/customers/:id` | session | → `CustomerDetailDTO` |
| POST | `/api/import/preview` | session | `{ format: "json"\|"csv", filename, content }` → `{ columns, accepted, rejected, sample }` |
| POST | `/api/import/commit` | session | `{ format, filename, content }` → `{ imported, duplicates, rejected, jobIds }` |
| GET | `/api/settings` | session | → `SettingsDTO` |
| PATCH | `/api/settings` | **owner** | `SettingsPatch` → `SettingsDTO` |
| GET | `/api/evaluation/runs` | session | → `EvaluationRow[]` |
| POST | `/api/demo/replay` | session, demo only | → `{ messageId }` (ingests the scripted sample) |
| POST | `/api/demo/reset` | **owner**, demo only | → `{ ok }` (wipes and re-seeds this tenant's DEMO data) |

`/api/demo/*` returns 403 in production mode. `/api/health` is the only
unauthenticated route.

## 6. Rules the server must enforce (the brief's §18 table)

1. Same webhook/import twice → one message, one active task set.
2. A customer talking about payment → `claimed`; never `verified` automatically.
3. Confirming a draft changes order state only — payment and shipment untouched.
4. Several intents in one message → all of them kept as separate proposals.
5. Two open orders + "send tracking" → no random association; `needs_review`.
6. No tracking code → never invent one; open a `tracking_followup` task.
7. Amount without a unit → proposal with `value: null` + `needs_review`.
8. Address change after shipping → task for a human; shipment untouched.
9. Another tenant's username/id → 404, no existence leak.
10. Operator trying to verify payment → 403 from the server.
11. Prompt injection inside a DM → no permission or state change.
12. Provider timeout / invalid output → message stored, `analysisState=failed`,
    manual review task, controlled retry.
13. Worker restart after storing a message → job recoverable, no duplicate tasks.
14. Two concurrent edits → 409, never a silent overwrite.
15. Copying a reply or an outbound timeout → no `sent`, no blind resend.
16. Reload / sign-out / offline → DB stays, private cache cleared, offline honest.

## 7. Mock provider contract

`MockDecisionProvider` is deterministic: same `(message text, context hash)` →
same output. It reads `src/server/providers/fixtures.ts`, keyed by the *fixture
id embedded in the demo messages* (`DEMO-MSG-*`), and falls back to a small
rule-based classifier for unknown text. It always returns `usage: null` and
`cost: null` (never 0) so the Evaluation screen can say "not measured".

`TypeSafeDecisionProvider` exists, reads `TYPESAFE_API_KEY`, and throws a typed
`ProviderUnavailable` when it is missing — the factory then refuses to start in
production settings (documented, not silently mocked).

## 8. Seed ids (fixed, referenced by tests and the demo script)

Tenants: `tenant_toranj` (آتلیهٔ ترنج, demo), `tenant_raha` (کفش‌خانهٔ رها, demo).
Users: `user_maryam` (owner, maryam@toranj.demo), `user_saeed` (operator,
saeed@toranj.demo), `user_raha` (owner, raha@raha.demo). Password for all demo
accounts: `radif-demo-1405` (documented in README, demo mode only).
Connection: `conn_toranj_replay` (channel `replay`, status `ready`).
Customers: `cust_negar`, `cust_shirin`, `cust_hossein`, `cust_elham`, `cust_reza`
(+ 8 more in tenant_toranj, + 3 in tenant_raha — 12 conversations minimum).
Orders: `DEMO-ORD-1042` (نگار, confirmed, payment claimed, shipment preparing,
overdue), `DEMO-ORD-1039`, `DEMO-ORD-1031`, `DEMO-ORD-1027`.
The scripted demo message: `DEMO-MSG-9001` in `DEMO-CONV-114`, text
«واریز کردم، کد رهگیری رو می‌فرستید؟ آدرسم هم عوض شده، هنوز نفرستادید؟».

## 9. Acceptance for "done"

`pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm test` (all green) and
`pnpm worker:once` drains the seeded queue without error. Every FAIL from
`shoot.mjs`/`matrix.mjs` either fixed or answered in `CRITIQUE.md`.
