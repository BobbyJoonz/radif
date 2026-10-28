# Demo — three minutes, no slides

Everything below is synthetic (`DEMO-*`) and reproducible: `POST /api/demo/reset`
(or the button in Settings) rebuilds this tenant's demo data and nothing else.
The whole run uses the real pipeline — store → queue → analysis → suggestion →
human confirm → reply preview.

## Before you start

```bash
pnpm db:start && pnpm dev &     # http://localhost:3000
pnpm worker                    # second terminal, the queue must be running
```

Sign in as `maryam@toranj.demo` / `radif-demo-1405` → today's queue (`/fa`).

## The run

**0:00 — 0:20 · Today.** The badge «دادهٔ نمایشی» is visible in the header. The
queue opens on a customer with a confirmed order, an unverified payment claim and
a **passed shipping deadline** (row one, orange, «۲ روز پیش»). Say the one line:
*«این صفحه جواب یک سؤال است: الان باید چه کار کنم؟»* Point at the reason column —
it is why the row is first, not a colour.

**0:20 — 0:50 · The message arrives.** Open the row (Inbox). Press «بازپخش یک
پیام نمونه» in the queue header: the scripted message goes through the *same*
ingestion path a file import uses — one Message, one Job, one analysis run.

> نگار احمدی: «واریز کردم، کد رهگیری رو می‌فرستید؟ آدرسم هم عوض شده، هنوز
> نفرستادید؟»

**0:50 — 1:20 · What the system proposes.** The action sheet shows three intents
at once — payment claim (unverified), tracking request (no code on file), address
change (no new address in the message) — all linked to the **existing** order
1042. No new order is created. The address field is deliberately empty: the
message never stated one.

**1:20 — 1:50 · The witness.** Click each proposed field: a hairline runs from
the field to the exact span in the message that supports it («واریز کردم»,
«آدرسم هم عوض شده»). This is the product's claim, drawn: every value has a
witness. Accept the payment claim and the tracking request — the sheet says
«تأیید پیش‌نویس، پرداخت را تأیید نمی‌کند» and it means it: order → needs review,
payment still `claimed`, shipment untouched.

**1:50 — 2:20 · Human work.** In Orders → 1042: confirm the draft, then (as
owner) verify the payment, then record shipment `preparing` + a demo tracking
code. The three state machines move independently and each strip shows who did
it and when (audit trail at the bottom of the order).

**2:20 — 2:45 · The reply is read back.** Open the reply preview: it is built
from the stored state — payment «در حال بررسی» wording until verified, and the
tracking line only because a code now exists. Copy it. The status stays
`draft`: copying is not sending, and phase 2 does not send.

**2:45 — 3:00 · Cost and speed, honestly.** Evaluation shows the run: provider
`mock`, latency measured from `queuedAt` to `finishedAt`, tokens and cost shown
as **نامشخص** because the mock reports none. No invented savings percentage.

## Alternative scenario (30 seconds, besides the main run)

Address change **after** shipping: the shipment is `shipped`; a new message asks
to change the address. The system must **not** touch the shipment — it opens a
`human_review` task «تغییر آدرس بعد از ارسال» and the reply says the request was
recorded for review.

## Reset

```bash
curl -X POST http://localhost:3000/api/demo/reset -b cookies.txt   # owner only, demo only
```

or Settings → «بازنشانی دادهٔ نمایشی». It deletes only rows with the demo tenant
and re-runs the seed for it; production mode returns 403.

## What to point out if someone asks "is this real?"

- Reload the page mid-run: everything is still there (PostgreSQL, not state).
- Stop the worker, send the message again: it is stored, queued, and analysed
  when the worker returns — nothing is lost and nothing is duplicated.
- Open `/fa/inbox` as `saeed@toranj.demo` (operator): the verify-payment control
  is absent, and `POST /api/orders/:id/payment-claims/:id/verify` answers 403.
- `SELECT count(*) FROM "Message"` in psql matches what the UI shows.
