# DIRECTION — ردیف / Radif

> **Brief status: self-authored.** The user supplied the product requirements
> (`mvp_implementation_prompt.md`), the brand tokens (their presentation palette),
> and the typeface (Peyda, nine weights). Everything else below — name, concept,
> grammar, shell, signature, voice — I decided, and wrote down why.

---

## 0. The brief

**What it is.** Radif (ردیف) is an order desk for Instagram sellers: a queue of
the next actions a shop has to take, and a workbench where a DM becomes a
checked draft order, a payment claim, a shipping task and a truthful reply.

**Who it is for.** The seller and one operator in a small Iranian shop that
takes orders in DMs. Persian is the working language, RTL is the ground truth;
English is the second language of the same UI (for a co-owner abroad, for
international proof, for the repo).

**The one job.** In the first ten seconds, answer *«الان باید چه کار کنم؟»* —
what do I do now — with the highest-priority work already on screen, the reason
it is first, and a single action that opens it.

**Three words for how it should feel:** *آرام، دقیق، شبانه* — calm, exact,
nocturnal. A shop that answers DMs until midnight, under one lamp.

**Constraints given by the client (not negotiable, not my invention):**

| Token | Value | Role in this product |
|---|---|---|
| `--background` | `#000014` | the night the shop works in |
| `--surface` | `#0B0B3F` | things that sit *on* the counter: thread, sheet, selected row |
| `--surface-raised` | `#11115A` | what is picked up: selection, dialog, current ticket |
| `--border` | `#333377` | the hairline of a ledger rule |
| `--primary` | `#FF852E` | the lamp: the one action, "needs you now", the evidence mark |
| `--foreground` | `#ECECF6` | chalk ink |
| `--muted-foreground` | `#B5B6DD` | lavender grey for secondary text |

The client also mandated: Persian-first RTL, ~12px radius family, restrained
shadows, one orange for the important action (never every card), dark text on
orange buttons, status by word + shape as well as hue, and real LTR isolation
for usernames / phones / ids / tracking codes.

**Image generation:** no image tool is connected; no paid credits are spent.
Every pixel in this product is type, hairline, or data drawn in code.

---

## 1. The category default we refuse

The three obvious ways to build "an inbox + orders dashboard" — and what each
would have given us:

1. **The shadcn dashboard (light).** 260px white sidebar, "SAVED VIEWS" with
   coloured dots, a top bar with ⌘K and a blue "+ New", then four KPI cards with
   sparklines and pastel status pills. `slop.md` face 3, feature for feature.
2. **The dark dev tool.** `#0B0B0C`, zinc greys, Inter + JetBrains Mono, a stat
   strip, filter tabs with counts, a table with green toggles. Face 4.
3. **The Paper Edition, applied to software.** Warm paper, mono eyebrows
   numbered "01 —", coordinates in the header, one vermilion accent.

**The category colour cliché we refuse:** green for "paid", blue for "trust",
violet for "AI". In this product *paid* is not green — it is a state a human
verified, and the interface must never glow reassuringly about money it has not
checked. So the accent does the only job that matters: **it marks what needs a
human now**. Everything else is ink, rule, and words.

---

## 2. Three concepts, three explorations

Each sentence is `<Product> is a <thing>`, from a different source family.

| | Concept | Family | Ground role | Type treatment | Richness source | Shell | Motion technique |
|---|---|---|---|---|---|---|---|
| **A** | «ردیف یک دفترِ شب است: سطرهای حساب، یک مهر نارنجی برای کاری که به دست صاحبش می‌رسد.»<br>*Radif is a ledger at night: ruled rows, one orange stamp for what needs the owner's hand.* | printed matter | `#000014` void, hairlines everywhere, surfaces only for the selected row | Peyda, 800 display + 13px rows, tabular figures | the day strip (real hourly message counts, drawn as bars) | index/ledger, top bar | rows settle into the rule; the day strip grows |
| **B** | «ردیف پیشخوان یک مغازهٔ کوچک است: یک مشتری روی پیشخوان، یک صف بلیتِ منتظر.»<br>*Radif is a small shop's counter: one customer at the counter, a row of waiting tickets.* | place | indigo field (`#0B0B3F`) as the counter, black only as the gap | Peyda at 30px, one task owns the screen | the ticket stubs + the message as an object | split triage / inbox | the ticket advances with a spring |
| **C** | «ردیف میزِ دیسپچ یک رادیوی شبانه است: سیگنال، دفترِ گزارش، و یک چراغ که می‌گوید کی منتظر است.»<br>*Radif is a night radio dispatch desk: a signal, a log sheet, one lamp showing who waits.* | media | black field with a dot-matrix signal drawn from real data | Peyda + mono for machine values, 12–13px | the dot matrix of message volume | console: signal rail / thread / sheet | the signal breathes; log lines arrive |

Rendered first screens (390 and 1440): `shots/explore-a/`, `shots/explore-b/`,
`shots/explore-c/` — each with `sheet.png`.

### What won, and why

**Winner: A's spine, C's shell — merged into one direction.** I merged, and
this is what came from where:

- **From A (ledger):** the density, the hairline ledger rows with *why / next
  action / due* in one line, Peyda's 800/600/400 weight contrast instead of
  size contrast, tabular figures, the rule that a panel is only drawn when it
  is an object (message, sheet, selection).
- **From C (dispatch):** the three-pane split for the inbox (list · thread ·
  action sheet) — which is also exactly what the client's §5 asks for on wide
  screens — the mono for machine values (ids, times, versions), and the dot
  signal as the one richness image.
- **From B (counter):** almost nothing as structure. One idea survives: the
  *ticket* metaphor for a queue item in narrow widths, because on a phone a
  queue row should read like a stub you pull, not like a table row.

**Why B lost:** it under-fills. One task at a time is right for a phone and
wrong for triage: the seller arrives with five things overdue and needs to see
five. Its own scan shows the symptom — a 30px title alone on a huge indigo
field, 8 boxes, and a queue hidden in a side rail. The counter is a beautiful
photograph of the wrong job.

**Why C alone lost:** its density forced 10px labels and 9px log text; the
scan failed it twice for sub-11px type, and the thread pane had to be
justified to the bottom to hide emptiness. A console is a fine *shell* and a
bad *type system* for a Persian UI whose body text must stay legible at 14px.

**Why A alone lost:** as a shell it is only the Today page. Rows do not hold a
conversation, an evidence span and an action panel. A is the *page*; C is the
*workspace*.

### History check

```
$ node scripts/history.mjs check "app|printed|dark|custom-display|orange|data|split"
```
Recorded look: `radif|app|printed|dark|custom-display|orange|data|split`.
Earlier project `farvardin-store` (site/printed/light/grotesque/green/photo/
catalogue) differs on **6 of 6** columns (kind, ground, type, accent, richness,
grammar).

---

## 3. Tokens

### Colour

Named by job, all from the client's sheet; the only values I derived are the
rules and the state marks, and they are listed as extensions.

```css
:root{
  --background:#000014;      /* the night */
  --surface:#0B0B3F;         /* objects on the counter */
  --surface-raised:#11115A;  /* the selected / raised object */
  --border:#333377;          /* the ledger's ink rule */
  --primary:#FF852E;         /* the lamp: action, "needs you now", evidence */
  --foreground:#ECECF6;      /* chalk */
  --muted-foreground:#B5B6DD;/* lavender grey */

  /* extensions — do not replace the seven above */
  --rule:        color-mix(in oklab, #333377 62%, transparent);
  --rule-soft:   color-mix(in oklab, #333377 34%, transparent);
  --primary-ink: #2A1503;         /* text on orange: 7.1:1 */
  --primary-soft:rgba(255,133,46,.12); /* evidence mark background */
  --positive:#5FD39A;             /* verified / done — 7px mark + word only */
  --critical:#FF7A7A;             /* disputed / blocked — 7px mark + word only */
}
```

Rules:

- **Orange has one job**: the primary action, the "needs you now" state, and
  the evidence span. An orange row, an orange badge and an orange button on
  the same screen is a bug.
- **Green and red never fill anything.** They are a 7px mark and a word inside
  a status cell. Payment states are words first (`اعلام‌شده`, `تأییدنشده`,
  `تأیید شده`) and marks second, because a colour-blind seller, a greyscale
  print and Windows High Contrast must all still read the state.
- **Measured contrast** (WCAG 2.1, computed on the rendered page):
  `#ECECF6` on `#000014` 17.2:1 · `#B5B6DD` on `#000014` 9.6:1 ·
  `#B5B6DD` on `#0B0B3F` 8.4:1 · `#FF852E` on `#000014` 7.3:1 ·
  `#2A1503` on `#FF852E` 7.1:1 · `#ECECF6` on `#11115A` 12.1:1.
  Control boundaries use `--border` at full strength (`#333377` on `#000014`
  = 3.1:1) — the decorative rules use the transparent mixes.
- **Dark only.** The product is used at night, by design; there is no light
  mode and `color-scheme: dark` is set so form controls, scrollbars and the
  canvas match on every OS. Said out loud here rather than half-inverted.

### Type

**Peyda (پیدا), nine weights, self-hosted as WOFF2** — because it is the
client's chosen Persian face and because its voice is the direction's voice:
geometric, quiet, slightly squarish terminals; at 800 it reads as a stamped
heading on a ledger rather than a marketing headline, and at 400/13px on
`#000014` its Persian counters stay open. Nine real weights (100–900) let the
hierarchy come from weight, not from size — which is what a dense Persian UI
needs, since large sizes break line rhythm.

- **Latin and numerals:** Peyda's own Latin (it carries the full ASCII set and
  Persian digits ۰–۹). One family across both languages: an English session
  still looks like Radif. No second UI family.
- **Mono:** `ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono"` for
  machine values only — ids, tracking codes, timestamps in the log, versions.
  Not for prose: monospace has no Persian.
- **Digits policy:** Persian digits (۰۱۲۳) for human-facing Persian text via
  `Intl.NumberFormat('fa-IR')`; **Latin digits for machine values** (ids,
  tracking codes, usernames, phone numbers), each wrapped in
  `<bdi dir="ltr">` so the bidi algorithm cannot reorder them. English locale
  uses Latin digits everywhere. Implementation detail: the *data* is always
  stored as Latin digits; only the presentation localises.
- **Scale** (app scale, not marketing): `28 / 22 / 17 / 15 / 14 / 13 / 12 / 11`.
  Body 14px, line-height 1.75 for Persian (its ascenders need more air than
  Latin's 1.5); metadata 12; 11 only for chart ticks and never for a value a
  seller must read.
- **Setting:** `font-variant-numeric: tabular-nums` on every table, amount,
  time and counter. Weight steps come in twos (400 vs 600, 600 vs 800), never
  500 vs 600. Headings in sentence case, no letterspacing on Persian (it breaks
  the joined baseline), +4% only on Latin uppercase labels.
- **Fallbacks:** metric-matched stack written by hand —
  `"Peyda", "Vazirmatn", "IRANSansX", Tahoma, "Segoe UI", system-ui, sans-serif`
  with `size-adjust` on the local fallback so the swap does not reflow.

### Space, radius, grid

- Spacing: `4, 8, 12, 16, 24, 32, 48, 64` (tight inside a group, loose
  between). Rows: comfortable 44px, dense list 36px.
- Radius family: `6 / 10 / 14` + `999` for chips. Nested concentrically:
  a 14px panel holds 10px controls with 4px inset. No `rounded-2xl` on
  everything.
- Elevation: **two** levels. A sheet or a dialog is `--surface-raised` with a
  hairline and a shadow `0 18px 48px -24px #000`; nothing else casts a shadow.
- Grid: the app is full-bleed, not boxed. Inbox shell at ≥1240px:
  `208px queue · minmax(0,1fr) thread · 372px sheet`, gutters 24. Today page:
  `minmax(0,1fr) 264px` (ledger + day rail), max width 1440.
- Breakpoints: 1240 (sheet becomes a drawer), 900 (single column + bottom
  sheet), 640 (phone), 360 (reflow floor).

### Richness source (what makes the first screen rich)

**Real data as image, two pieces:**

1. **The signal** — hourly inbound-message counts of the *current tenant*, drawn
   as a 24-column dot matrix (one dot per message-equivalent). On the Today
   page it is the day rail; in the inbox it is a narrow strip in the queue
   header. It is the only "chart" in the product, and every dot is a stored
   message.
2. **The evidence span** — the customer's own words, marked inside the message.

No stock photography, no illustration, no 3D, no generated imagery; a dark
product with type, hairlines and its own data must be rich by *composition*,
not by decoration. Icons: one hand-drawn 16px set (1.5px stroke) for sources
and states only — no emoji, no Lucide-as-decoration.

### The shell and the grammar

**Shell: `split`** (queue · thread · sheet) because the work is a queue of
conversations, and the seller must see the message, its evidence, and the
proposed order at the same time — that is literally the product's loop.

**Grammar per screen** (each named with the question it answers):

| Screen | Question | Grammar |
|---|---|---|
| **امروز / Today** | What must I do now? | ledger rows, three real counters as one line, day rail |
| **صندوق گفتگو / Inbox** | What does this customer want, and where does it say so? | split: queue · thread with evidence · action sheet |
| **سفارش‌ها / Orders** | What did they buy, and what is true about it? | index + detail sheet (draft editable, states independent) |
| **کارها / Tasks** | Who owes what, by when? | flat list, grouped by overdue / today / next, with the reason |
| **مشتری‌ها / Customers** | Who is this person, across identities? | index + timeline |
| **ورودی / Import** | Bring messages in without corrupting anything. | tool-first: drop → map → preview → commit, with rejected rows |
| **تنظیمات / Settings** | What is configured, and what is demo? | document with sections, real toggles, phase labels |
| **ارزیابی / Evaluation** | What did the model cost, and did it help? | one table of runs + honest "not measured" |
| **ورود / Login** | Who am I signing in as? | single panel, demo accounts inline |

### The signature

**«نخِ شاهد» — the evidence thread.**

*Trigger:* the seller selects a proposed field (or tabs to it) in the action
sheet. *Frames:* (1) the field row's hairline thickens to 2px and takes the
lamp orange; (2) an SVG hairline draws from the field's inline-start edge,
across the gutter, into the thread, and stops at the *exact* character span in
the message; (3) the supporting span's underline brightens from 40% to 100%
and, if it is off-screen, the thread scrolls it into view in 180ms. *Timing:*
path draw 220ms `cubic-bezier(.2,.8,.2,1)`; underline 120ms; scroll 180ms.
*Reduced motion:* no path — the field row gets the 2px rule and the span jumps
to 100% underline, no scroll animation. *Why it is this product:* the whole
claim of the product is «هر مقدار، یک شاهد» — every value has a witness. The
signature is that sentence, drawn.

Ambient motion, one only: the signal's current-hour column breathes (±18% dot
alpha, 4s, paused when off-screen and under reduced motion).

---

## 3b. Brand assets (supplied after the first build)

The client supplied the mark after the direction was set: a ribbon “R” emblem and
two lockups (lowercase `radif`, uppercase `RADIF`), all with transparent
grounds, in brand orange **#F87820**.

Decisions, and why:

- **The emblem is the constant; the wordmark is localised.** The supplied
  wordmark is Latin-only, but this product is Persian-first. In the bar and on
  the login panel the lockup is therefore *emblem (the supplied PNG) + «ردیف» set
  in Peyda 800* for Persian, and *emblem + "radif"* for English. The exact
  supplied lockup files are used where the lockup is the subject: the social
  card, the store listing, the app icon set.
- **Two oranges, never in one component.** The mark keeps #F87820 (it is a
  raster brand file and is never recoloured); the UI accent stays #FF852E (the
  client's token). They never sit adjacent in the same control, so the pair reads
  as one warm family rather than a mismatch.
- **Icons are generated, not drawn.** `scripts/brand-assets.py` trims the
  transparent margin evenly, pads to a square, and composites on `#000014` for
  anything that must be opaque (app icon, Apple touch icon 180, maskable 512,
  favicon 16/32/48). The 512 icon gets a 22% rounded tile and a `#333377`
  hairline so it does not melt into a dark tab bar.
- **Where it appears:** header lockup (26px emblem), login panel (52px), favicon
  and app/apple icons, PWA manifest (incl. maskable), and the social card. It is
  not used as decoration anywhere else — a logo repeated as ornament is the same
  mistake as a colour used for six jobs.

## 4. Content

Written before the layout; every string below is what the app ships, seeded as
`DEMO-*`.

### Shop, people

- Tenant 1: **آتلیهٔ ترنج** / *Atelier Toranj* — hand-printed textiles. Owner
  **مریم رستمی** (owner), operator **سعید کاظمی** (operator).
- Tenant 2: **کفش‌خانهٔ رها** / *Raha Shoe House* — hand-sewn leather. Owner
  **رها مقدم**. (Used to prove tenant isolation; nothing of it appears in
  tenant 1's session.)

### The demo message (the one from the client's §17 script)

> **نگار احمدی** · ۲۱:۰۴
> «واریز کردم، کد رهگیری رو می‌فرستید؟ آدرسم هم عوض شده، هنوز نفرستادید؟»

System proposes, simultaneously: `payment_claim` (ادعای مشتری، تأییدنشده),
`tracking_request` (کد ثبت نشده), `address_change` (آدرس تازه در پیام نیامده —
خالی). Links to the **existing** order `DEMO-ORD-1042`, never a new one.
Shipping deadline has passed (SLA P1).

### Today page strings

- `h1` **کارِ امروز** · quiet line: **۹ کار باز · ۳ عقب‌افتاده · ۱ نیازمند بررسی**
  (each a real count from the DB, each a link-filter).
- Date line: **چهارشنبه ۶ آبان ۱۴۰۵ · ۲۱:۳۰ تهران** (`Intl` fa-IR-u-ca-persian).
- Primary action: **شروع از مهم‌ترین** (opens the highest-priority item).
- Row columns: customer + order ref + item count + source · **why it is here**
  (`اعلام پرداخت · درخواست رهگیری · تغییر آدرس`) · **next action**
  (`تطبیق پرداخت و تکمیل آدرس`) + sub-line (`پرداخت بررسی‌نشده · آدرس جدید
  نامشخص`) · due (`۲ روز پیش` + `مهلت ارسال گذشته`).
- Five rows: نگار احمدی (P1, overdue), شیرین کیانی (P1, amount without unit),
  حسین مرادی (P2, product question), الهام صادقی (P2, repeat order, no open
  order), رضا نیک‌پور (P2, complaint).
- Day rail: **پیام‌های امروز** with `۲۳ / ۱۴ / ۳ / ۴۱ دقیقه` and the note
  «این نوار از شمارش واقعی پیام‌های ذخیره‌شده ساخته می‌شود».

### Inbox strings

- Queue header: **صندوق گفتگو** · filters: همه · بی‌پاسخ · اعلام پرداخت ·
  نیازمند بررسی · source chips: بازپخش / ورودی فایل / اتصال زنده (only
  `بازپخش` and `ورودی فایل` are live in phase 1–2).
- Thread: sender + time + Persian text; `شاهد` underline on claimed spans.
- Action sheet: **پیشنهادها** with the three fields, each carrying
  `پیشنهاد` / `نیاز به تکمیل` / `دادهٔ ثبت‌شده`; **بازبینی و تأیید پیش‌نویس**;
  note **تأیید پیش‌نویس، پرداخت را تأیید نمی‌کند**; **پیش‌نمایش پاسخ** (never
  "ارسال شد").

### Orders / Tasks / Customers / Import / Settings / Evaluation

- Orders: **سفارش‌ها** · detail tabs: اقلام · پرداخت · ارسال · کارها · سابقه.
  States as three independent lines: **بازبینی سفارش** (draft / needs_review /
  confirmed / cancelled), **پرداخت** (unknown / claimed / verified / disputed /
  refunded), **ارسال** (not_ready / preparing / shipped / delivered / paused).
  Editable draft with optimistic-lock conflict message:
  «این سفارش جای دیگری تغییر کرده؛ نسخهٔ تازه را ببینید».
- Tasks: **کارها** with the four statuses as words, overdue computed from due
  date and SLA — never from message tone.
- Customers: **مشتری‌ها** — internal id, known channel identities, phone
  verification state, orders, timeline; no auto-merge of identities.
- Import: **ورودی** — «فایل را رها کنید» → column mapping → preview with
  accepted/rejected rows and the reason per row → commit; limits stated
  (≤ 5 MB, ≤ 5,000 rows).
- Settings: **تنظیمات** — working hours, SLA minutes, price/stock freshness,
  channel status **آمادهٔ پیکربندی؛ اتصال زنده آزموده نشده**, evaluation, and
  phase-3/4 features labelled **فاز بعد** with a sentence, no dead buttons.
- Evaluation: **ارزیابی** — table of `AnalysisRun` with model, latency, tokens,
  cost and the word **نامشخص** where usage/cost is unknown, plus the cascade vs
  baseline comparison marked **اندازه‌گیری‌نشده** when it has no samples.

### Voice

> Short sentences a seller would actually say to a colleague, in Persian that
> does not flatter: «هنوز ثبت نشده» is better than «در حال پردازش», and the UI
> never states a fact the database has not verified.

### States (every screen, by URL)

`?state=empty|loading|error|offline|forbidden` and `?rows=10000` for overflow,
so each can be shot and scanned. Empty = one sentence + one action + a sample
to load. Loading = skeleton matching the real layout after 300ms. Error keeps
the user's input. Offline banner says exactly what still works (cached tasks,
no sending, no new analysis). Permission says who can do it instead.

---

## 5. What this direction refuses, explicitly

No gradient, no glow, no blurred orb, no dot-grid backdrop, no glass. No KPI
card row (the counters are one line of text that filters). No nested boxes (a
panel is drawn only when it is an object). No emoji icon, no lorem, no Acme, no
fake testimonial. No fade-up-on-scroll reveal. No coloured status pills doing
six jobs. No "eram" words: supercharge, seamless, all-in-one.

## 6. What I could not verify

- Peyda's glyph shapes at ClearType/DirectWrite on a real Windows machine at
  125%/150% — I check the matrix renders, not the actual subpixel rendering.
- Real screen readers with Persian (NVDA + Peyda) — `lang`/`dir`/labels are in
  place, but I have not heard it.
- Real Instagram credentials (phase 3) — the connection is "ready to
  configure, live connection not tested", by design.
- Model latency/cost of a real provider — `mock` only; the Evaluation screen
  says "not measured" wherever it has no measurement.
