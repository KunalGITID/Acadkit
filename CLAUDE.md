# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build locally
npm run test       # Vitest (unit tests for the domain math)
```

Unit tests (Vitest, `src/lib/*.test.ts`) cover the pure domain logic:
grades/SGPA, attendance (canBunk/needToAttend), the day-order calendar +
declared-holiday shifting, and the projection engine. UI/data-layer code
is verified manually via the preview. `vitest.config.ts` runs them in a
node environment with the `@/` alias.

To regenerate PWA icons after changing the logo: `node scripts/generate-icons.mjs`
Then regenerate the iOS launch screens too: `node scripts/generate-splash.mjs`
(writes `public/splash/` and the `<link>` tags to paste between the
`splash:start`/`splash:end` markers in `index.html`).

After editing `src/data/semester.ts` for a new semester, regenerate the
edge function's mirror of the calendar and redeploy:
`node scripts/gen-edge-calendar.mjs`. `src/data/semester.test.ts` fails
the build if the two drift.

## Architecture (v2 rebuild)

AcadKit is a single-user academic PWA (React + Vite + TypeScript + Tailwind + framer-motion) for SRM KTR. There is no authentication — all data is scoped by a 4-digit PIN stored in `localStorage` (`src/lib/pin.ts`) and used as the `device_id` column on every Supabase row. Entering the same PIN on another device loads the same data; that's the entire sync model. New PINs are seeded (settings row + starter subjects) by `seedAccount` in `src/api/queries.ts`.

### Data flow

```
Supabase ← src/api/queries.ts ← src/hooks/useData.ts (React Query) ← pages
                                        ↑
                  src/store/app.ts (Zustand: pin + theme only)
```

- **`src/lib/supabase.ts`** — single Supabase client; credentials from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env.local`).
- **`src/api/queries.ts`** — every raw Supabase call, all `.eq("device_id", pin)`-scoped.
- **`src/hooks/useData.ts`** — React Query hooks. All mutations go through a generic `useOptimistic` helper: cache updated immediately, rolled back on error, invalidated + broadcast on settle. Query keys are `[root, pin]` where root ∈ settings/subjects/timetable/attendance/marks/deadlines.
- **`src/hooks/useSync.ts`** — cross-tab sync via BroadcastChannel (`src/lib/broadcast.ts`) + cross-device live sync via Supabase realtime `postgres_changes` filtered by device_id.
- If the PIN is absent, `App.tsx` renders `src/pages/Onboarding.tsx` instead of the router.

### Day order system

SRM uses a 5-day rotating schedule (Day 1–5), not weekdays. The canonical semester data (window, official holidays, date → day-order map) lives in **`src/data/semester.ts`** — edit that file each new semester. **`src/lib/calendar.ts`** resolves any date to a `DayInfo` (working/weekend/holiday/pre-/post-semester). User-declared holidays live in `settings.declared_holidays` (jsonb) and are auto-shifted: `buildEffectiveMap` removes declared dates and reassigns the day-order sequence onto the remaining working days. `useToday` (`src/hooks/useToday.ts`) derives today's day order + class slots.

### Marks & SGPA (SRM-specific) — `src/lib/grades.ts`

- Internal components scale to /60 (`Σobtained/Σmax × 60`), the single external mark scales to /40; total /100.
- Grade thresholds: O≥91, A+≥81, A≥71, B+≥61, B≥56, C≥50, F<50; points O=10…C=5, F=0.
- SGPA = Σ(points × credits)/Σcredits over credit-bearing subjects with ≥1 mark; 0-credit (audit) subjects are excluded.

### Attendance — `src/lib/attendance.ts`

75% minimum. Computes per-subject `canBunk` / `needToAttend`. Color signal: ≥75% `#4ade80`, 65–74% `#facc15`, <65% `#fb7185`. The DB status value `"holiday"` means "cancelled/no class" in the UI and is excluded from totals. Attendance upsert key: `(device_id, subject_id, date, start_time)`.

### Pages & layout

Nine lazy-loaded pages under `src/pages/` (Dashboard `/`, `/attendance`, `/marks`, `/insights`, `/timetable`, `/calendar`, `/log`, `/history`, `/settings`) plus `Onboarding`. `NAV_ITEMS` is exactly the five daily destinations — an iOS tab bar shows no more — and drives both the bottom bar and the top of the sidebar. `SECONDARY_NAV` (`/insights`, `/log`, `/history`) is listed inline in the sidebar on desktop and reached through the **More** sheet on mobile, which is the only way in for an installed iOS PWA: there's no browser UI to fall back on. `src/components/layout/app-shell.tsx` renders a sidebar on desktop (lg+) and a glass top bar + bottom nav on mobile, with framer-motion page transitions. Shared bottom sheets (vaul) live in `src/components/sheets/`; viz primitives (animated numbers, rings, SGPA dial, heatmap) in `src/components/viz/`.

### iOS PWA

The app is installed to the home screen, so it has to behave like an app
rather than a page in a browser that happens to be hidden:

- **Launch screens.** `apple-touch-startup-image` for 11 iPhone sizes in
  both colour schemes (iOS honours `prefers-color-scheme` in the startup
  media query). Without them iOS shows a blank white screen between tap
  and first paint. They are excluded from the Workbox precache via
  `globIgnores` — Safari fetches them itself, and precaching ~600 KB of
  images the service worker is never asked for would tax every install.
- **16px form fields.** iOS zooms the viewport when a focused input is
  under 16px. Every field is 16px, with a `@supports` backstop.
- **No rubber-banding.** `overscroll-behavior: none` — standalone iOS has
  no browser chrome to bounce against, so the bounce just exposes the
  page background.
- **Chrome isn't content.** Buttons, links and navs set
  `-webkit-touch-callout: none`, `user-select: none` and
  `touch-action: manipulation`; page content stays selectable.
- Safe areas come from the `pt-safe-t` / `pb-safe-b` Tailwind spacing
  tokens (`env(safe-area-inset-*)`), with `viewport-fit=cover` and a
  `black-translucent` status bar.

### Themes and voice

Two themes, `[data-theme]` on `<html>` with `.dark` for mode
(`src/store/app.ts`). **Brutalist** is the default and changes the design
language, not just the palette: Chakra Petch display numerals, oversized
lowercase page titles, 28px squircles with a real border and no shadow, a
floating pill bottom bar, wide-tracked lowercase labels. **OLED** is the
quiet true-black option. All of it rides per-theme tokens plus a
`@layer components` block — no component is forked for a theme.

Brutalist also changes how the app *talks*. `src/lib/voice.ts` holds every
opinionated sentence in two registers, `plain` and `brutal`, resolved by
`useTone()` from the active theme. The brutal copy roasts the numbers,
never the person, and never lies to be funny — unrecoverable attendance
still reads as unrecoverable.

`src/lib/themes.ts` is deliberately side-effect free and owns
`resolveTheme`. A stored theme name that no longer exists lands on
`[data-theme]`, matches no rule, and paints the app with no tokens at
all — so retiring a theme means migrating everyone still carrying it.
Both the store and the pre-paint script in `index.html` validate.

### Design system

Tokens are HSL CSS variables in `src/index.css` (light "paper" / dark "ink", `.dark` class strategy — applied pre-paint by an inline script in `index.html`), mapped in `tailwind.config.js` (`bg`, `surface`, `ink`, `muted`, `accent`, `good/warn/bad`…). Fonts: Plus Jakarta Sans + JetBrains Mono.

### Supabase

Tables: `subjects`, `attendance`, `timetable_slots`, `marks`, `deadlines`, `settings`. Migrations in `supabase/migrations/`; RLS allows the anon role full access (device_id scoping is client-side). The v2 app runs on the v1 schema unchanged — no new migrations were needed.

### Derived-decision libraries

These pure modules turn stored data into answers, all unit-tested and all
free of React:

- **`src/lib/autoMark.ts`** — `pendingAutoMarks` lists past scheduled
  classes with no attendance row. Only the past (today stays open) and
  never an overwrite (any existing record wins). Rows written carry
  `auto_marked` (migration 013) so `deleteAutoMarks` can undo exactly
  the app's guesses. Opt-in via `settings.auto_mark_present`; the runner
  lives in `src/hooks/useAutoMark.ts` and fires once per app load.
- **`src/lib/targets.ts`** — the reverse of the grade table: what the
  next component must return for a target grade. Adding a component
  grows the denominator too, so this is not "the gap".
- **`src/lib/deadlines.ts`** — deadlines are named by what they are.
  There is no title field: a row leads with its subject (falling back to
  the type when unassigned) and carries a type badge. The `title` column
  is still NOT NULL and still in the JSON export, so writes fill it with
  a derived `"<code> <Type>"` string via `derivedTitle`; older rows keep
  whatever was typed, but the UI no longer shows it.
- **`src/lib/ics.ts`** — timetable → iCalendar. A day-order rotation
  can't be an RRULE, so every class is its own VEVENT; UIDs are stable
  so re-import updates rather than duplicates.
- **`src/lib/shareCard.ts`** — `buildShareData` (pure, tested) feeds
  `renderShareCard` (canvas, verified in-browser).

### Portal sync (bookmarklet)

`scripts/portal-sync/` builds a bookmarklet that scrapes SRM Academia and
writes into Supabase directly over PostgREST — it runs inside the page you
already logged into, so no SRM credentials are stored anywhere.

```bash
node scripts/portal-sync/build.mjs --pin 1234   # → scripts/portal-sync/dist/install.html
```

The output embeds the anon key + PIN and is gitignored. `portal-sync.js` is
the readable source; the build inlines credentials, minifies with esbuild,
and emits a drag-to-bookmarks install page.

```bash
node scripts/portal-sync/build.mjs --diagnostics   # → dist/diagnostics.html
```

`--diagnostics` builds the same script with `DIAG_ONLY` set: no credentials
are inlined, the sync button is gone, and the panel opens straight to the
dump. It is the first step on a portal the parser hasn't been taught, since
it can be run without handling any secrets. The dump also lists **`grids`** —
repeating non-`<table>` structures — so a report laid out in divs describes
itself instead of coming back as an empty `tables: []`.

Parsing matches on **header text**, never DOM paths, because these portals
regenerate class names between deploys. Attendance needs a code column, a
conducted column, and either an absent or a present/attended column
(absences are then `conducted − present`). Marks need a code column and a
performance column, and any table carrying attendance columns is rejected as
a marks table. It walks table children explicitly rather than using
`table.rows`, so a nested per-test table can't be mistaken for a report row.
Ambiguous markup yields nothing rather than a guess. Tests live in
`scripts/portal-sync/portal-sync.test.ts` (happy-dom) against synthetic
fixtures — swap in real saved markup when the portal shape is confirmed.

The `academia.srmist.edu.in` (Zoho Creator) fixtures are still synthetic.
The student portal at `sp.srmist.edu.in` — a different JSP app with a `#!`
hash router — **is** verified: `scripts/portal-sync/sp-portal.test.ts` holds
verbatim markup captured from it, and the panel's "Copy diagnostics" button
remains the way to teach the parser a portal it doesn't yet recognise.

On `sp.srmist.edu.in`:

- **Attendance** needed no changes. Its "Max. hours / Att. hours / Absent
  hours" headers already satisfy the conducted/absent matching, and the
  month-wise summary below it is correctly ignored for having no code column.
- **Marks are split across two views.** "Internal Mark Details" lists one
  combined `2.00 / 5.00` total per subject — a total is not a test, so it is
  deliberately not written — and the labelled components ("Entered on |
  Component | Mark / Max. Mark") live in a modal behind a per-row "View
  Details" button. `collectComponentMarks` opens each row's modal in turn,
  reads it with the code from the summary row, and closes it. The subject is
  the row that opened the modal, not a column, so `scrapeComponents` takes
  the code as an argument.
- **Clicking the button is the only way in.** Calling the portal's own
  `funViewComponentWiseMarks` directly throws on its jQuery build
  (`$.post(...).error is not a function`). A synthetic `btn.click()` works.
- **Detect an open modal by its `.show` class, not `offsetParent`**, which
  reads null on this portal even while the modal is on screen.

**Attendance is a snapshot, not per-class rows.** The portal only reports
per-subject totals, which can't go in `attendance` without inventing dates.
Migration 012 adds `portal_snapshots` (unique on `device_id, subject_code`);
`computeSubjectAttendance` uses the portal totals as the baseline and layers
records dated after `as_of` on top, so the number stays live between syncs.
Manual per-class history is never overwritten. Marks carry a `source` column
so a re-sync reconciles only the rows it owns — `'portal'` rows are matched
client-side on `(subject_id, label)` and PATCHed, and hand-typed marks are
left alone.

### Offline preview — `npm run dev:mock`

`scripts/dev-mock/server.mjs` speaks enough PostgREST for the app and seeds
a full semester under PIN **1234** (6 subjects, a week of hand-marked
classes, portal snapshots on 4 of them dated a week back so the "portal
totals as of…" badge shows). It starts Vite pointed at itself, so the UI
runs with no `.env.local` and never touches the real project. Realtime is
not implemented — supabase-js retries a websocket in the background and the
UI carries on without it.

### PWA

`vite.config.ts` via `vite-plugin-pwa`: Supabase calls cached NetworkFirst (5s timeout), Google Fonts CacheFirst. On Node 18 the service worker is intentionally built unminified (workbox `mode` switch) because workbox's terser worker needs global webcrypto.

### Path alias

`@/` maps to `src/`. Use it for all internal imports.
