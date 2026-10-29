# OPTIMIZATION — what was measured, what changed, what is left

Measured on the production build (`next build` + `next start`), the real seeded
PostgreSQL, signed in as the demo owner. Nothing here is a guess; the numbers are
from the browser's own resource timings, `EXPLAIN (ANALYZE, BUFFERS)`, and ESLint.

## Baseline (before this pass)

| Metric | Value | Verdict |
|---|---|---|
| JS per route (compressed) | 167–189 KB | mostly the framework floor |
| CSS per route | 7–13 KB | fine |
| Fonts per first visit | 113 KB (3 weights) | ~40 KB recoverable by subsetting |
| Logo image at 26 px | 1.2 KB (128w WebP/PNG via the optimizer) | already healthy |
| LCP / TTFB | 456–660 ms / 15–50 ms | acceptable |
| API median | today **66 ms**, conversations **87 ms**, orders 53, tasks 39 | two routes worth work |
| Query planning vs execution | **5–9 ms planning** vs 0.03–0.11 ms execution | the cost is *number of statements*, not their size |
| `public/` payload | 2,714 KB | **1,773 KB of it unused TTFs** |
| ESLint | **38,908 problems** | only 1 real error + 7 warnings; the rest was `.work` (pgAdmin vendor JS) |
| `any` / `@ts-ignore` | 0 / 0 | clean |

## Done in this pass (P0 — no behaviour change)

| # | Change | Evidence it landed |
|---|---|---|
| 1 | ESLint now ignores `.work/**`, `src/generated/**`, `public/**`, `brand/**` | `pnpm lint` → **0 errors, 7 warnings** (was 38,908 problems) |
| 2 | The one real lint error (React 19: `setState` synchronously in an effect, the inbox connector) | connector is now derived at render (`activeId && path`); lint clean, Inbox renders at 1440/390 |
| 3 | Moved the nine unused TTFs out of `public/` to `brand/fonts-source/peyda/` (the app loads WOFF2 only) | `public/` **2,714 → 941 KB (−65 %)** |
| 4 | Removed `lucide-react` (0 imports in the codebase) | dependency gone, `pnpm install` clean |
| 5 | `engines: node >=22 <23` + `.nvmrc` | Next 16 refuses older Node at the door |
| 6 | Security headers on every route | verified live: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` |
| 7 | Image variants trimmed (`deviceSizes` max 1920, no 3840 for a 26 px logo), WebP only, 30-day cache | header HTML no longer advertises 2048/3840 variants |
| 8 | `output: "standalone"` | `.next/standalone/server.js` produced — a much smaller deploy artifact |

Verification after the pass: `tsc --noEmit` **0 errors** · `pnpm lint` 0 errors ·
`pnpm build` succeeds · `pnpm test` **70/70** · pages render at 1440/390.

## Next (P1 — measurable performance, ~half a day)

1. `getSessionContext` → wrap in `React.cache()`; today it runs twice per
   navigation (layout + page), each doing an auth lookup and a membership query.
2. The shell runs `getShellCounts` + `getLastSync` on **every** screen; merge into
   one statement and skip it where the numbers are not shown.
3. `src/server/services/today.ts` — 9 statements → ~4 (`groupBy` for the three
   counters, one for the 24-hour strip, one for rows, one for settings). Planning
   is 5–9 ms per statement, so this is roughly **−30 ms** on a 66 ms endpoint.
4. `src/server/services/inbox.ts` — 27 `prisma.` sites and two `findFirst` calls
   inside loops (lines 383, 635); hoist them. Target: 87 ms → <50 ms.
5. Subset Peyda (Persian + Latin + digits) → 113 KB → ~65–70 KB per first visit.
6. `app/[locale]/loading.tsx` streams a skeleton into every page; scope it to
   `(app)` or drop it (each screen already has its own skeleton).
7. Header lockup: ship a pre-sized 3× WebP and skip the runtime optimizer for a
   26 px image; keep the optimizer for the 44 px login panel.

## Then (P2 — production hardening)

- **Rate limiting is per-process, in memory** (`src/app/api/_lib/rate-limit.ts`).
  With two instances it is not a limit. Move the bucket into PostgreSQL (or
  Redis) and key it by tenant + route.
- **Server-generated Persian prose bypasses i18n**: task `reasonText`, reply
  bodies, customer-timeline summaries are built in the services, so the English
  locale shows Persian there. Fix: keys + a locale in `SessionContext`.
- **Indexes for scale** (plans are sequential scans today, correct at 16 rows):
  `Message(tenantId, direction, occurredAt)`, a partial
  `Task(tenantId, dueAt) WHERE status IN ('open','in_progress')`,
  `Suggestion(tenantId, reviewState, createdAt)`.
- **No CI**: add `.github/workflows/ci.yml` with a Postgres service running
  typecheck, lint, tests, build.
- **No HTTP-level route tests**: 401/403/404/409 and Zod errors are only covered
  through the services.

## Known defects (not optimizations)

1. Persian ledger, due column: the first line («۲ روز پیش», «۱۴:۳۰») collides at
   1440. The DOM text and the 132 px column are correct, so it is a paint issue in
   that cell — needs the font inspector, not a layout guess.
2. Settings renders `type="time"` as `09:00 PM` on a Persian screen (browser
   control); replace with a 24-hour text field.
3. `public/og.html` (the source of `og.png`) belongs in `brand/`.
4. `inbox-screen.tsx` is 716 lines; split into queue / thread / sheet once the
   defects above are closed.

## Deliberately not done

Data caching (the queue is live; a cache would lie), a state manager, forcing more
RSC into the queue screen (it must be fresh), collapsing the three state machines
into one column, and trimming the status vocabulary for the sake of a smaller
bundle.
