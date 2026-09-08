# AcadKit 2.0

A personal academic companion for SRM KTR — attendance, internal/external marks and SGPA,
the 5-day rotating **Day Order** timetable, the academic calendar, and deadlines. Installable
PWA, equally at home on a phone and a desktop, with everything synced across your devices by
signing in.

What separates it from a spreadsheet is that it answers forward-looking questions. Not "you're
at 78%" but *how many classes can I still miss*, *what does this test have to return for the
grade I want*, and *when am I actually going to prepare for it* — all counted off the real
day-order calendar and your real timetable.

## Stack

Vite + React 19 + TypeScript · Tailwind CSS · framer-motion · TanStack Query (optimistic,
offline-persisted mutations) · Zustand · vaul bottom sheets · sonner toasts · Supabase
(PostgreSQL + realtime + edge functions) · vite-plugin-pwa.

## Setup

### 1. Backend (Supabase)

Create a project at [supabase.com](https://supabase.com) — the free tier is plenty — then run
every file in `supabase/migrations/` **in order** (001 → 024) in the SQL editor. That creates
the tables (`subjects`, `timetable_slots`, `attendance`, `marks`, `deadlines`, `settings`,
plus `portal_snapshots`, `semester_archives`, `shared_cards`, `push_subscriptions`,
`device_owners` and `error_log`) and the row-level security policies.

Two settings in the dashboard matter:

- **Authentication → Providers → Email**: turn **"Confirm email" off**. Sign-up otherwise
  tries to send a confirmation, and the free SMTP allowance makes that a way to be locked out
  of your own app.
- **Database → Replication**: enable the `supabase_realtime` publication for the tables above
  if you want live cross-device sync. Without it devices still sync on every focus and
  refetch.

### 2. Environment

Create `.env.local`:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 3. Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run dev:mock   # no Supabase needed — a mock server with a seeded semester
npm run test       # Vitest, over the domain maths
npm run build      # type-check + production build (dist/)
npm run preview    # serve the production build
```

`npm run dev:mock` is the fastest way to look at the app: it stands up a fake Supabase
(auth included, any credentials work) with a full seeded semester behind it, so you can
explore every screen with realistic data and no backend of your own.

### 4. Install as a PWA

Serve the **production build** over HTTPS (or localhost), then:

- **iOS Safari**: Share → *Add to Home Screen*.
- **Android Chrome**: the install prompt, or ⋮ → *Install app*.
- **Desktop Chrome/Edge**: the install icon in the address bar.

Cached pages and previously-fetched data work offline. So do edits: a change made with no
connection is held and replayed when you're back, rather than being lost with the page.

## Signing in

Email and password, once per device — no code to wait for and no link to click, which is what
makes it survive being an installed PWA. Sign in on another device with the same account and
your whole semester is there.

Each account owns an internal 4-digit partition key that every row is scoped by. It is not
something you manage: there is no screen to type one, and the app reconciles it against what
your account owns on every sign-in. (Older builds asked for it directly — that flow is gone.)

## What's in it

- **Attendance** against the day-order calendar: skip budget, recovery date, the exact classes
  left, and a forecast heatmap costing out specific future days. A whole stretch can be marked
  in one go from the Calendar.
- **Marks as a budget, not a rate** — each subject's /100 is a floor plus what's left to play
  for, so every card answers what a component still has to return for the grade you're
  chasing, per subject. Sliding an ungraded component shows what a given mark would do to the
  subject and to your SGPA, without writing anything down.
- **Deadlines** that know when they're due: pick a subject, a type and a date, and the time
  fills itself in from the period the thing actually happens in. Each one lists the free
  periods you have before it.
- **Portal sync** — a desktop bookmarklet (`scripts/portal-sync/`) or, on a phone, copy the
  portal page and paste it into the app. Attendance, marks *and the timetable grid* come in
  that way; nothing ever asks for your portal password.
- **Push reminders** for tomorrow's classes, unmarked attendance, deadlines and a subject
  slipping under the bar, from a scheduled edge function.
- Semester archive and CGPA ladder, a Wrapped, shareable subject cards, iCalendar export,
  four themes, and a tone setting for the app's own voice.

## Per-subject marks structure

SRM's 60/40 internal/external split is a default, not a rule, and the component breakdown
behind the internal half arrives whenever your faculty get round to it. Both live on the
subject: **Subjects → edit → Marks structure** sets the split and lists the components you know
about (`FT-1 15`, `Assignment 5`, …). Anything undeclared stays an open bucket, so a subject
with no plan still works — Insights just answers in one lump instead of per test. Add a row the
day a test is announced and every number re-spreads.

Each subject also carries its own **target grade** (on its card in Insights → Grades). Leave it
alone and it follows your target SGPA; change it when one subject deserves a different ambition
from the rest.

## New semester checklist

Edit `src/data/semester.ts`: update `SEMESTER_START` / `SEMESTER_END`, the `OFFICIAL_HOLIDAYS`
list, and the `DAY_ORDER_MAP`. Then regenerate the edge function's copy of the holidays with
`node scripts/gen-edge-calendar.mjs` and redeploy it — `src/data/semester.test.ts` fails the
build if the two drift.

Semester *dates* need no code change: the app and the edge function both read them from your
settings row. Mid-semester surprise holidays need no code change either — declare one from the
Calendar page and the remaining day orders shift forward automatically.
