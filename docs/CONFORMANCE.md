# CONFORMANCE — phases 0–2 against `mvp_implementation_prompt.md`

Status legend: ✅ implemented and verified · ⚠️ partial (what is missing is named)
· ❌ not implemented (in the backlog below).

Every ✅ has evidence in this repository; nothing here is asserted from memory.

## Phase 0 — foundation (§4)

| Requirement | Status | Evidence |
|---|---|---|
| Next.js + TypeScript, Tailwind, Prisma, PostgreSQL | ✅ | `package.json`, `prisma/schema.prisma`, `postcss.config.mjs` |
| A real PostgreSQL (not SQLite, not in-memory) | ✅ | `scripts/pg-local.ps1`, `docker-compose.yml`, 24 tables + migrations |
| Standard auth library, no hand-rolled sessions/crypto | ✅ | Better Auth 1.7.14, `src/server/auth.ts`; sign-in verified 200 against seeded users |
| Zod at every edge | ✅ | `src/lib/env.ts`, `src/server/ingestion/schemas.ts`, every route handler |
| Pinned versions + lockfile | ✅ | exact versions in `package.json`, `pnpm-lock.yaml`, `engines: node >=22` |
| `.env.example` without secrets, documented modes | ✅ | `.env.example`, `src/lib/env.ts` |
| Demo runs with **no** API key | ✅ | `DECISION_PROVIDER=mock`, deterministic fixtures; `worker:once` drains with zero keys |
| Business logic separated from UI | ✅ | `src/server/domain`, `providers`, `channels`, `services` vs `src/components` |
| One app + one worker; queue in PostgreSQL | ✅ | `src/server/worker/*`, `Job` table, `SKIP LOCKED` + lease |
| Production refuses demo/mock | ✅ | `src/server/providers/index.ts` throws on mock in production; demo routes 403 outside demo |

## Phase 1 — message → draft (§3, §6, §7, §9)

| Requirement | Status | Evidence |
|---|---|---|
| JSON and CSV ingestion | ✅ | `src/server/channels/{file,csv}.ts`, `/api/import/preview|commit`, tests |
| Replay of sample messages | ✅ | `src/server/channels/replay.ts`, `/api/demo/replay`, `DEMO-MSG-9001` |
| Store message + customer | ✅ | `Message`, `Customer`, `CustomerIdentity`; ingest in one transaction with the job |
| Structured decision via an adapter | ✅ | `DecisionProvider` interface, `MockDecisionProvider`, `TypeSafeDecisionProvider` stub |
| Evidence-backed extraction | ✅ | `Suggestion.evidenceStart/End` into the original text; spans module; UI underline |
| Incomplete-information detection | ✅ | `order.address` proposal with `value: null`; tasks for human input |
| Draft order or task creation | ✅ | worker `plan.ts` → tasks/claims; drafts for `new_order`/`repeat_order` |
| Duplicate delivery → one message | ✅ | unique `(tenantId, source, externalRef)`; tests |
| Persistence across reload | ✅ | PostgreSQL; verified via HTTP + tests |
| Manual entry as the fallback path | ❌ | backlog (needs resolve-or-create for an unknown handle) |

## Phase 2 — confirmation, today queue, evaluation (§3, §5, §8–§10, §13–§15, §18)

| Requirement | Status | Evidence |
|---|---|---|
| Seller review + correction of proposals | ✅ | `Suggestion.reviewState`, `/api/suggestions/:id/review`, tests |
| Today queue with real counters | ✅ | `getToday`, three counters from the DB |
| **Filter by assignee and due** | ✅ | `getToday(ctx, { assignee, due })`, URL filters, verified: 9 → overdue 3 / unassigned 7 / next7d 6 |
| Customer history | ✅ | `getCustomer` merged timeline, tests |
| Independent order/payment/shipment states | ✅ | three enums + CHECK constraints; confirm-draft test proves payment untouched |
| Tracking code recording | ✅ | `PATCH /api/orders/:id/shipment`; no code is ever invented (test) |
| Reply prepared from confirmed state | ✅ | `previewReply`; claimed payment never reads as verified (test) |
| Change history (audit) | ✅ | `AuditEvent`, written by services; order page shows it |
| Model cost/time recording | ✅ | `AnalysisRun` fields; null usage stays null (test) |
| Internal reminders for the seller | ✅ | tasks with `dueAt`, overdue computed in code |
| Fixture reference labels + expected results (kept apart) | ✅ | `src/server/providers/fixture-labels.ts` + `tests/fixtures-reference.test.ts` (16 tests) |
| Limited offline mode (opt-in, last sync, clear on sign-out) | ❌ | backlog |
| Editable pricing rates (brief §15) | ⚠️ | rates are recorded per run; no editable default in the UI |
| Shipping-disruption switch (brief §13) | ⚠️ | `postingPaused` stops new orders; no separate "pause shipping" state |
| Catalogue price/stock with last confirmation shown in Settings | ⚠️ | stored on `Product` (`infoConfirmedAt/ValidUntil`), not surfaced |
| Every page has loading/empty/error/offline/permission states | ⚠️ | designed states exist and are reachable by `?state=`; "offline" is a picture, not a working offline mode |

## Risk table (§18)

| Case | Status |
|---|---|
| Same webhook/import twice → one message, one task set | ✅ tests |
| Customer payment talk → claimed, never auto-verified | ✅ tests |
| Confirm draft → payment/shipment untouched | ✅ test |
| Multi-intent message keeps all three intents | ✅ fixtures + worker plan |
| Two open orders → needs review, no random association | ✅ fixtures (`ambiguous`) + test |
| No tracking code → no invented code, follow-up task | ✅ test |
| Amount without unit → ambiguous, no conversion | ✅ fixture label `unit_missing`, worker rule |
| Address change after shipping → human, shipment untouched | ✅ test |
| Another tenant's username/id → no existence leak | ✅ 404 tests + composite FKs |
| Operator without financial permission → server refuses | ✅ service-level 403 test |
| Prompt injection inside a DM | ✅ test (`other_unknown`, no state change) |
| Provider timeout / broken output → message kept, manual review | ✅ ingest side; worker retry/backoff covered by recover tests |
| Worker restart after storing → recoverable, no duplication | ✅ `recover.ts`, `worker:once` re-run shows 0 recovered |
| Two concurrent edits → visible conflict | ✅ optimistic lock test |
| Copy reply / timeout → no fake `sent`, no blind resend | ✅ preview writes nothing (test) |
| Reload / sign-out / offline | ⚠️ reload + sign-out verified; offline honesty is designed but not functional |

## Verification commands (last run)

```
npx tsc --noEmit            → 0 errors
pnpm lint                   → 0 errors (4 warnings, all named)
pnpm build                  → succeeds
pnpm test                   → 10 files, 86 tests, all pass
pnpm worker:once            → drains, 0 dead; re-run recovers 0
```

## Backlog, in the order it should be done

1. **Manual entry** (brief §3, phase 1): a small form on Import that takes a
   handle + text, resolves or creates the customer/conversation inside the
   tenant, and then uses the *same* ingest path. Needs a `manual` channel adapter
   and tests for "unknown handle creates a customer once, never twice".
2. **Limited offline mode** (brief §13, §18): explicit opt-in on the device,
   cache only the minimal task list + previously synced states + last-sync time,
   never contact/address fields, clear on sign-out, show "not synced" for any
   local note, and no service worker caching of private API responses.
3. **Shipping-disruption switch** (brief §13): a second paused flag that stops
   sending and stamps replies with the reason; surface it in Settings and in the
   reply preview's `allowed`.
4. **Catalogue freshness in Settings** (brief §5): list products with
   `infoConfirmedAt` and a "stale" mark past `priceFreshnessMin`.
5. **Editable default pricing rates** (brief §15): a settings field that writes
   the rate used for new `AnalysisRun` rows, with the date it was read.
6. Lint warnings (4) — unused imports in two screens and one adapter seam.
