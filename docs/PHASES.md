# Phases 3–5 — contracts, flags, acceptance

Phases 1–2 are implemented. This file is the honest list of what is **not**
built, what it depends on, and what would have to be true to call it done. Every
feature below is off behind a flag and is labelled «فاز بعد» in the UI; there is
no dead button and no fake "connected" state anywhere in the product.

---

## Phase 3 — the official Instagram connection

**Depends on:** a Meta developer app, an Instagram professional account, App
Review for the chosen login path, and a public HTTPS callback. None of these
exist in this environment, so the connection is **«آمادهٔ پیکربندی؛ اتصال زنده
آزموده نشده»** — the wording the UI shows.

Already in place (so phase 3 is a connection, not a rewrite):

- `IncomingMessage` is source-independent; `source: "instagram"` is already a
  valid value and the ingestion path is the same one file/replay uses.
- `ChannelConnection` stores `sealedToken` (AES-256-GCM, key from
  `CHANNEL_TOKEN_ENC_KEY`, never selected into a page payload), `tokenExpiresAt`,
  `status ∈ not_configured|ready|connected|expired|revoked`.
- `OutboundMessage` already has the full state machine
  (`draft/queued/sending/sent/failed/delivery_unknown`), an `idempotencyKey`
  unique per tenant, and the rule that a copy or a timeout never becomes `sent`.

To build:

1. Pick **one** documented login path (Facebook Login *or* Instagram Login — do
   not mix permission sets) and record the Graph API version, the exact
   permissions, the messaging window and the send rules, with the date they were
   read, in this file.
2. `GET /api/channels/instagram/start` + `/callback`: state parameter, server-side
   callback validation, encrypted token storage, disconnect route.
3. `POST /api/webhooks/instagram`: verify `hub.challenge`, validate the signature
   on the raw body, enqueue async, dedupe on the provider message id, never log
   payloads.
4. Initial sync with pagination and a coverage report (say plainly what was not
   returned).
5. Send path: re-check order state + template version immediately before send;
   on timeout with no idempotency key, keep `delivery_unknown` and reconcile —
   never blind-resend.

**Acceptance:** a real message reaches the same `analyze_message` job; a replayed
webhook yields one message; an invalid signature is rejected; an expired token
flips the connection to `expired` and the UI says so; no token appears in any
response or log.

## Phase 4 — customer identity and limited self-service

**Depends on:** phase 3 identity, an OTP provider, and a rate-limited public route.

Slice 1 (smallest honest step): an unguessable, revocable **order status link**.
Random 32-byte token, only its hash stored, expiry, rate limit, minimal payload,
no address/phone, no list of orders, token never in logs/analytics/Referer.

Slice 2: bind an Instagram identity from inside the DM with a single-use
short-lived link → verify a phone with OTP (atomic challenge consumption) → show
that customer's own orders → allow chat limited to status / tracking / help.
An OTP proves the phone, **not** Instagram ownership; never merge identities
automatically.

Already in place: `CustomerIdentity` (unique per connection+kind+ref, no username
as primary key), `Customer.phoneVerifiedAt`, and the audit trail.

**Acceptance:** another customer's order id returns 404; a used/expired token is
refused; wrong OTP is refused and rate-limited; identity conflicts go to a human.

## Phase 5 — follow-up and repeat purchase

**Depends on:** phases 2–4 plus a compliant sending channel.

Internal seller reminders already work in phase 2 (tasks + due dates). What is
**not** built: sending anything to a customer automatically, marketing consent,
opt-out, quiet hours, scheduling, attribution.

Rules the implementation must keep: service notifications and marketing consent
are separate records; opt-out is honoured per channel; no "unlimited DMs" or
"guaranteed revenue" claim anywhere; every reminder is a task a human can see.

## Feature flags (all off)

| Flag | Where | Effect when on |
|---|---|---|
| `LIVE_AUTOMATION_ENABLED` | env | allows outbound sending; refuses to start in demo |
| `OUTBOUND_MODE=live` | env | `OutboundMessage` leaves `preview` |
| `INGESTION_MODE=live` | env | webhook ingestion active |
| `DECISION_PROVIDER=typesafe` | env | real provider; requires `TYPESAFE_API_KEY` |
| `APP_MODE=production` | env | disables seed, replay, reset, mock |

## Backup and restore (what was actually run)

Server-side, never the browser cache:

```bash
# dump (custom format, includes large objects)
pg_dump --format=custom --no-owner --dbname=radif --file=radif-$(date +%F).dump

# restore into a SEPARATE database, then point the app at it
createdb radif_restore
pg_restore --no-owner --dbname=radif_restore radif-2026-10-28.dump
```

With the bundled portable cluster the same commands run through
`scripts/pg-local.ps1 psql` and the binaries in `.work/pg/pgsql/bin`.

Restore drill: dump → restore into `radif_restore` → run `SELECT count(*)` on
`Message`, `Order`, `Task` and compare with the source → boot the app against
`radif_restore` with `DATABASE_URL` changed and confirm the Today queue renders.
The result of the drill that ran in this environment is recorded in
`CRITIQUE.md` (section "Verification log").

CSV export is formula-injection safe: any cell starting with `= + - @` or a tab
is prefixed so spreadsheets treat it as text.

## Data retention and deletion (documented, not guessed)

- Demo data is disposable; `POST /api/demo/reset` rebuilds it for one tenant.
- Disconnecting a channel should delete `sealedToken` and mark identities
  unverified rather than deleting customers.
- Conversation text should be retained only as long as the shop needs it; the
  product exposes no commercial retention promise, because none has been agreed.
