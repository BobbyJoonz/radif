<p align="center">
  <img src="brand/source/radif-lockup-source.png" alt="Radif — ردیف" height="76">
</p>

# ردیف · Radif

![ردیف — Radif](docs/brand.png)

**میز سفارش فروشگاه‌های اینستاگرامی** — the order desk for Instagram sellers.
Persian-first (RTL), bilingual FA/EN, real PostgreSQL, no API key needed to run.

> «هر دایرکت، یک ردیف روشن.» — every DM becomes one clear row.

The product's whole claim is that **every value has a witness**. A message from a
customer arrives, the system proposes intents and fields *with the exact span of
the message that supports them*, a human confirms, and the reply is read back
from the confirmed state — never invented. A customer saying "I paid" produces a
**payment claim**, never a verified payment.

---

## What actually works (phases 1–2)

| Area | State |
|---|---|
| Persian RTL + English LTR UI, own fonts, own tokens | ✅ |
| PostgreSQL schema + real migration (24 tables, tenant-integrity FKs, CHECK guards) | ✅ |
| Demo seed: 2 isolated shops, 12+ conversations, `DEMO-*` ids | ✅ |
| Ingestion from JSON/CSV file and replay, with preview + rejected rows | ✅ |
| Durable queue on Postgres (`FOR UPDATE SKIP LOCKED` + lease), crash-safe worker | ✅ |
| Structured decision provider (`mock`, deterministic) + typed `TypeSafeDecisionProvider` seam | ✅ |
| Evidence-backed suggestions, accept/correct/reject, human edits win | ✅ |
| Independent order / payment / shipment state machines | ✅ |
| Today queue, Inbox (queue · thread · action sheet), Orders, Tasks, Customers, Import, Settings, Evaluation | ✅ |
| Reply preview from stored state (never marks anything as sent) | ✅ |
| Owner/operator authorization enforced server-side | ✅ |
| Phase 3–5 contracts, feature flags off, honest "not tested" labels | 📄 see `docs/PHASES.md` |

Not implemented on purpose: live Instagram connection, OTP identity, customer
portal, marketing automation. There is no fake "connected" badge anywhere.

---

## Run it

Requirements: Node 22+, pnpm 10+, and a PostgreSQL 17 database.

```bash
pnpm install

# 1. Database. Either your own server:
#      cp .env.example .env   → set DATABASE_URL
#    or the bundled Windows portable cluster (downloads PostgreSQL, no Docker):
pnpm db:init        # first time: initdb + create radif & radif_test, then start
pnpm db:start       # afterwards

# 2. Schema + demo data + client
pnpm db:deploy      # applies prisma/migrations
pnpm db:generate
pnpm db:seed        # DEMO-* data in two isolated shops

# 3. Run
pnpm dev            # http://localhost:3000 → redirects to /fa
pnpm worker         # in a second terminal: the queue worker
```

With Docker instead of the portable cluster:

```bash
docker compose up -d   # postgres 17 on 5435, database radif
```

### Demo accounts (demo mode only, created by the seed)

| Email | Role | Shop |
|---|---|---|
| `maryam@toranj.demo` | owner | آتلیهٔ ترنج |
| `saeed@toranj.demo` | operator | آتلیهٔ ترنج |
| `raha@raha.demo` | owner | کفش‌خانهٔ رها |

Password for all three: `radif-demo-1405`

The owner can verify payments and change settings; the operator visibly cannot
(the server returns 403, the button is not merely hidden).

---

## Modes and configuration

Everything lives in `.env` (see `.env.example`); no secret is ever shipped to
the client bundle or logged.

```dotenv
APP_MODE=demo                 # demo | production
INGESTION_MODE=replay         # replay | file | live
DECISION_PROVIDER=mock        # mock | typesafe
TYPESAFE_MODEL=jev-1.14.0
TYPESAFE_API_KEY=             # empty → the typesafe provider refuses to start
DRAFT_PROVIDER=none
OUTBOUND_MODE=preview         # preview | live
LIVE_AUTOMATION_ENABLED=false
```

`demo` seeds synthetic data and enables `/api/demo/replay` and `/api/demo/reset`.
`production` refuses to seed, refuses replay/reset, and refuses to boot with the
mock provider for live automation.

**Replacing the decision provider** is one file: implement `DecisionProvider`
(`src/server/providers/decision.ts`) and return it from the factory. Nothing in
the UI knows which provider ran; `AnalysisRun` records which one did.

---

## Architecture in one screen

```
Browser ── server components ──► src/server/services/*  (tenant from session only)
   │                                   │
   └── client mutations ──► /api/* ────┘
                                       ├── Prisma 7 (driver adapter, pg)
                                       └── Postgres 17
worker ── claim job (SKIP LOCKED + lease) ──► provider ──► suggestions + tasks
```

Boundaries that matter:

- `src/server/domain/**` — pure rules (Persian normalisation, candidate spans,
  priority, dedupe, state transitions). No I/O, unit-tested.
- `src/server/providers/**` — decision models behind one interface.
- `src/server/channels/**` — where messages come from (file, replay, later the
  official Instagram API). The `IncomingMessage` contract is source-independent.
- `src/server/services/**` — the only layer a page may read.
- `src/app/api/**` — thin: auth → zod → service → `{ ok, data }`.
- `src/lib/dto.ts` — the boundary types both sides compile against.

Read `docs/CONTRACTS.md` before adding a route or a service.

---

## Testing

```bash
pnpm typecheck
pnpm lint
pnpm test            # vitest: domain rules + integration against radif_test
pnpm worker:once     # drains the queue once, for CI and for demos
```

The suite is written against the real risk table (duplicate webhooks, payment
claims never auto-verified, confirm-draft not touching payment, multi-intent
messages, two open orders, missing tracking code, unit-less amounts, address
change after shipping, cross-tenant ids, operator without permission, prompt
injection, provider timeout, worker restart, concurrent edits, reply copy).

Database backup/restore: `pg_dump`/`pg_restore` notes and a verified restore drill
are in `docs/PHASES.md` §Backup.

---

## Design

The direction, palette, type scale, motion signature and copy voice are in
[`DIRECTION.md`](DIRECTION.md); the scanned/critiqued results are in
[`CRITIQUE.md`](CRITIQUE.md). Three explorations are in `explore/`, rendered
evidence in `shots/`.

Fonts: **Peyda** (پیدا) by [Behgraph](https://behgraph.ir), self-hosted as WOFF2
in `public/fonts/peyda/` — nine real weights, no request to any font service.
The files were supplied by the project owner; check Behgraph's current licence
terms before redistributing them outside this project. Latin letters and digits
come from Peyda itself; machine values use the system mono stack.

---

## Repository map

```
prisma/            schema, migration (with hand-written tenant guards), seed
src/app/[locale]/  FA/EN routes: Today, Inbox, Orders, Tasks, Customers…
src/app/api/       REST for client mutations and tests
src/components/    shell, primitives, screen bodies
src/server/        domain, providers, channels, ingestion, services, worker
src/i18n/          locale config, formatting, dictionaries (fa/en)
docs/              CONTRACTS.md, PHASES.md
explore/, shots/   design process evidence
scripts/           pg-local.ps1 (portable PostgreSQL), design shots
```

## Brand

The ribbon emblem and wordmarks in `brand/source/` are supplied brand files —
never recoloured or redrawn. All icons and UI lockups are generated:

```bash
python scripts/brand-assets.py     # icons, favicons, PWA tiles, UI lockups
```

The header shows the emblem plus a **localised** wordmark («ردیف» in Peyda 800
for Persian, "radif" for English) because the supplied wordmark is Latin-only;
the supplied lockup files are used as-is on the login panel, the social card and
the app icon. Brand orange is #F87820, the UI accent token is #FF852E — see
`DIRECTION.md` §3b.

## Licence

Source: private project. Demo data is synthetic; `DEMO-*` identifiers exist so it
can never be mistaken for a real shop's records.
