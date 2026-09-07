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
(this also writes `public/icons/mark.png`, the transparent mark the
in-app launch screen masks against). Then regenerate the iOS launch
screens too: `node scripts/generate-splash.mjs`
(writes `public/splash/` and the `<link>` tags to paste between the
`splash:start`/`splash:end` markers in `index.html`).

After editing the **official holidays** in `src/data/semester.ts`,
regenerate the edge function's copy and redeploy:
`node scripts/gen-edge-calendar.mjs`. `src/data/semester.test.ts` fails
the build if the two drift.

Semester **dates** are not shared that way. The app reads them live from
each device's `settings` row, and the edge function now does the same,
generating its own day-order map. It used to import a baked map instead,
which drifted the moment the dates were edited in the app — settings said
the term ran to 20 Nov, the baked map stopped at the 18th, and push
reminders were silently absent on the last two class days.

## Architecture (v2 rebuild)

AcadKit is a single-user academic PWA (React + Vite + TypeScript + Tailwind + framer-motion) for SRM KTR. Every row is scoped by a 4-digit `device_id` (`src/lib/pin.ts`), and entering the same PIN on another device loads the same data — that's the sync model.

The PIN is **not** the security boundary. It used to be: RLS granted the anon role full access and the scoping was client-side, so anyone could walk 0000–9999 and read every account. Migration 015 moved it into the database — a `device_owners` table maps each `device_id` to an `auth.uid()`, and an `owns_device()` SECURITY DEFINER function backs the policies, so all 47 `device_id` queries stayed as they were while the server began enforcing them. Sign-in is email + password (`src/lib/auth.ts`, `src/pages/SignIn.tsx`).

Two consequences worth knowing before touching either: policies are `to authenticated`, so anything still using the anon key gets 42501 (this is what broke the portal bookmarklet and forced the `portal-ingest` function); and signing out has to clear the persisted React Query cache, or the next account sees the last one's data (`src/hooks/useAuthReset.ts`). New PINs are seeded by `seedAccount` in `src/api/queries.ts`.

### Data flow

```
Supabase ← src/api/queries.ts ← src/hooks/useData.ts (React Query) ← pages
                                        ↑
                  src/store/app.ts (Zustand: pin + theme only)
```

- **`src/lib/supabase.ts`** — single Supabase client; credentials from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env.local`).
- **`src/lib/plan.ts`** — the assessment-budget engine: per-subject split, component plan, `subjectOutlook` / `computeSgpa` / `solveSubjectPlan`. Everything that answers "what will I get" or "what do I need" comes from here.
- **`src/api/queries.ts`** — every raw Supabase call, all `.eq("device_id", pin)`-scoped.
- **`src/hooks/useData.ts`** — React Query hooks. All mutations go through a generic `useOptimistic` helper: cache updated immediately, rolled back on error, invalidated + broadcast on settle. Query keys are `[root, pin]` where root ∈ settings/subjects/timetable/attendance/marks/deadlines.

  Writes are **named**, not passed (`src/api/mutations.ts`). Offline,
  React Query pauses a mutation rather than failing it, so `onError`
  never fires and the optimistic value stays in a cache that is
  persisted to localStorage — but the mutation's function is a closure
  that dies with the page. Close the app and the edit was on screen, in
  storage, and never sent, and the next refetch quietly replaced it with
  the server's older truth. That is the app's most-used action failing
  in exactly the conditions it's used in, while the offline banner
  promised the opposite. A name survives serialisation, so
  `registerMutationDefaults` (called at module scope, before the cache
  is restored) gives a rehydrated mutation something to call. The pin
  rides inside the variables for the same reason: replay has no store
  to read it from, and it must land on the account that made the write.
  `src/api/mutations.test.ts` does the whole round trip — pause offline,
  dehydrate, rehydrate, resume — and fails if mutations stop being
  persisted.
- **`src/hooks/useSync.ts`** — cross-tab sync via BroadcastChannel (`src/lib/broadcast.ts`) + cross-device live sync via Supabase realtime `postgres_changes` filtered by device_id.
- If the PIN is absent, `App.tsx` renders `src/pages/Onboarding.tsx` instead of the router.

### Day order system

SRM uses a 5-day rotating schedule (Day 1–5), not weekdays. The canonical semester data (window, official holidays, date → day-order map) lives in **`src/data/semester.ts`** — edit that file each new semester. **`src/lib/calendar.ts`** resolves any date to a `DayInfo` (working/weekend/holiday/pre-/post-semester). User-declared holidays live in `settings.declared_holidays` (jsonb) and are auto-shifted: `buildEffectiveMap` removes declared dates and reassigns the day-order sequence onto the remaining working days. `useToday` (`src/hooks/useToday.ts`) derives today's day order + class slots.

### Marks & SGPA (SRM-specific) — `src/lib/grades.ts`, `src/lib/plan.ts`

- Grade thresholds: O≥91, A+≥81, A≥71, B+≥61, B≥56, C≥50, F<50; points O=10…C=5, F=0.
- SGPA = Σ(points × credits)/Σcredits over credit-bearing subjects with ≥1 mark; 0-credit (audit) subjects are excluded.

**A subject is a budget, not a rate** (`src/lib/plan.ts`). The original
model read a subject as the ratio of internal marks earned to internal
marks *entered*, scaled onto /100 — so one 5/5 assignment read as 100%
and predicted an O, and the same subject read F the moment a 2/15
landed. Both are artefacts of a denominator that only counts what has
already been marked.

`solveSubjectPlan(subject, marks, targetGrade)` treats the course as 100
marks that have each either been played or are still to come. 5/5 banks
5 of 100 and leaves 95 on the table, so a target is a number to cover
rather than a pace to hold: `needed = threshold − banked`, spread across
everything left at one equal rate (`requiredRate = needed / pool`). Each
result landing shrinks the pool and every remaining number is re-solved
against it. `plan.test.ts` walks the canonical case — 60/40, targeting
A, assignment 5/5 then CT-1 2/15 — and pins each step's spread.

Two SRM realities drive the shape, and both were previously unmodelled:

- **The split isn't fixed.** 60/40 is typical, not universal. The
  internal weight is per-subject (`subjects.assessment.internal`,
  migration 021); everything is written against `W`, not a literal 60.
  `internal_only` (migration 008) is now just `W = 100`, and is kept
  written in step so a device that hasn't run 021 still agrees.
- **The component plan arrives late, or never.** Some faculty hand out
  the breakdown in week one, others announce a test days before it
  happens. So `assessment.components` is **partial by design**: declared
  rows take their share of `W`, and whatever nobody has claimed stays a
  single unannounced bucket that shrinks as rows are added. A subject
  with no plan still solves — it answers in one lump instead of per
  test. `complete: true` says "this is the whole breakdown", which lets
  components recorded in their own units (the portal reports out of 5s
  and 50s) scale onto `W` rather than sprouting a phantom bucket.

Graded marks match declared rows on normalised label (`CT-1` ≡ `ct 1`),
and the declared weight wins over what the mark says it was out of — the
plan is the contract, the mark is one reading of it. A graded component
nobody declared still counts; it happened.

**The whole app reads this model, not just Insights.** `computeSgpa`
and `subjectOutlook` live in `plan.ts` now (they moved out of
`grades.ts`, which is the grade table and nothing else — plan.ts
imports it, so keeping them there would have been a cycle). Dashboard,
Marks, History and Wrapped call the same solver Insights does, and
`projections.limits.test.ts` asserts the two entry points return the
same SGPA for every target and the same banked/pool/grade per subject.
They previously ran different arithmetic over the same marks and could
disagree about the same semester.

Two consequences of the port worth knowing. A recorded end-sem now
counts toward the predicted total — `computeSubjectMarks` explicitly
discarded externals ("they arrive after the sem"), which was true and
wrong once the paper is marked. And `src/lib/targets.ts` is gone:
deadline targets (`deadlineTarget.ts`) read the plan's per-grade rate,
so a deadline row and the subject's card now answer with the same
number. That changed some answers — 25/25 on one CT used to report "O
is safe", and now reports what O costs across the 75 marks still
unplayed, which is the honest version.

**Passing is 50/100 overall and nothing else** — no separate minimum
in the end-sem, confirmed rather than assumed. So 60/60 internal with
5/40 external is a 65 and a B+, and the engine needs no second
constraint. Pinned in `grades.test.ts` because it is a regulation, not
a derivation: nothing in the code implies it, and if it ever changed a
minimum would have to be threaded through every solve.

**Components are named the way SRM names them**
(`src/lib/componentLabel.ts`). A theory course's internals are FT-n and
LLT-n; a lab-integrated one's are FJ-n and LLJ-n. Which a subject is
comes from the timetable — a lab slot makes it integrated — falling
back to the letter already in the course code (`21CSS202T` theory,
`21CSC202J` joint) for a subject whose slots aren't entered yet.
Generating "CT-1" meant every plan had to be renamed by hand to match
what faculty announce, and a plan whose labels don't match your
deadlines cannot be matched *to* them either. `inferType` reads the
same vocabulary in reverse, and `labelMatchKey` treats `CT-1`, `FT-1`
and `FJ-1` as one component — a mark recorded under the old naming
would otherwise stop matching the plan row it belongs to and become a
*second* component, so the same test would be reported twice, once
graded and once still owed, with the internal weight spent twice over.
Migration 024 renames the stored rows; the match key is what makes the
app right whether or not it has been run.

**A deadline can name a component instead of being one.** The sheet
offers the subject's declared components; picking one sets the
deadline's title to that label, which is what the matcher keys on, so
it dates a row the budget already has rather than looking for room to
add another. Without it the title is derived from the course code
("21CSS202T Exam"), which matches nothing by construction. The marks
are prefilled and stay editable, because a component is not always
assessed in one sitting — an LLJ worth 10 can arrive two marks at a
time, each instalment its own deadline against the same component, and
the date shown is the soonest of them. The plan's weight wins over the
instalment's for the *budget* — the plan is the contract — but the
deadline row quotes what that sitting owes, scaled by its share of the
component. FJ-1 worth 15 with a 10-mark test on the 10th reads "8/10",
not the component's "11.5/15": the same equal-effort rate against the
marks actually in front of you.

**A test logged in Deadlines is an announced component.** You already
record every exam there, and the optional "out of" field is exactly the
weight the budget wants, so a deadline the plan has never heard of is
adopted as a component rather than made to be typed twice — the
deadline *is* the announcement. Deadlines are matched to existing
components **by name only**. An earlier version also paired on weight
where it looked unambiguous; that stopped being worth it once leftovers
were adopted, because "Surprise quiz, 5 marks" and a planned
"Assignment, 5 marks" are not the same test, and guessing loses the
quiz *and* misdates the assignment. Adopting can only over-count, which
shows as two rows you merge by renaming one. Prefer the visible error.
Titles that mean the end-sem are never adopted — that paper is the
external weight already. Neither is anything that will not fit:
adoption spends the unannounced bucket and stops when it is empty. A
plan that already fills its weight (5+15+15+15+10 against a 60) has no
room for a sixth component, and adopting one anyway pushed the declared
total to 75 and scaled *every existing row down to fit* — a 5-mark
FT-1 reporting itself out of 4, one deadline silently rewriting the
whole plan. A deadline with nowhere to go falls back to dating an
existing component by weight, and only where that is unambiguous on
both sides.

The end-sem expectation is editable **on the Insights card itself** —
the End semester row is a field, not a number. Type what you expect the
paper to return and the internals above re-solve against what is left
of the target; clear it and the even spread comes back. The placeholder
is what the spread is currently asking, so the field shows the answer
it would give before you overrule it. Stored per subject in
`assessment.assumedExternalPct`, which overrides the semester-wide
setting — some papers are a formality and some are not, and one number
for all of them is a default rather than an answer. Committed on blur
or Enter, because it syncs across devices.

**`settings.assumed_external_pct` hands the end-sem a fixed score**
(migration 022). The even spread is the right default when you know
nothing about the exam and the wrong question at SRM, where the papers
are reckoned easy: nobody is deciding how hard to try in December, they
are deciding what the internals have to carry. With it set, the exam
contributes `pct% × externalWeight` and the remaining internals are
solved against what is left of the threshold — including `perGrade`, so
"achievable" means achievable *under the assumption*. The bracket
(banked / pace / ceiling) is deliberately untouched, so an optimistic
guess can redistribute the ask but never flatter the forecast. Ignored
once the real mark is in, and for wholly internal subjects.

**Attendance gates the whole plan** (`Eligibility` in
`projections.ts`). Below the minimum you are not permitted into the
end-sem, so a budget whose pool *is* that exam is fiction, not a
pessimistic forecast. The two halves of `projections.ts` — attendance
and marks — never spoke to each other; they are joined now, and
`barred` outranks everything else the card can say about a subject.
`at-risk` carries the streak of classes that clears the line and the
date it lands on.

**Components carry dates**, matched from the deadlines you already
keep: by name first, then by weight but only when unambiguous on both
sides. A wrong date on a real test is worse than no date, so a
near-miss yields nothing. `plan.next` is the soonest dated component
still to come.

**The pace line carries a band** (`ConfidenceBand`) — ±1 population SD
of your own graded components, needing at least three. A 14/15 and a
2/15 average to the same place as two 8/15s and mean something very
different about how much to trust the forecast; a bare pace line quietly
claims a certainty nobody has.

**`src/lib/effort.ts` allocates work across subjects.** It replaced
`sgpaTarget.planForSgpa`, which allowed each subject exactly one grade
step — so a target needing two grades from one subject came back as
"at least one has to climb twice" with no plan attached — and ranked by
distance rather than return. The allocator ranks by SGPA bought per
extra mark and lets a subject climb repeatedly, pricing each step from
where the previous ones left it.

The cost model is worth stating because it is not obvious: the extra
marks a grade costs is exactly `threshold − pace`. The pool cancels out
of `(rate − paceRate) × pool` entirely. How *many* more marks you need
does not depend on how many chances remain — what the pool decides is
whether the grade is reachable at all and at what rate, which is
`requiredRate`, carried alongside for exactly that reason. A lift above
your current pace always costs something, by definition, so there is no
such thing as a free one.

**Rounding has a direction.** A mark you must reach rounds up
(`ceilHalf` — 10.4 needed means 10.5); a mark you already hold rounds
down (`floorHalf` — banking 42.4 and printing 42.5 hands you half a
mark you did not earn). Totals out of 100 use `floorTotal`, because
grade thresholds are integers and `Math.floor(total) >= min` is true
exactly when `total >= min` — so a floored total can never contradict
the grade printed beside it, and a rounded one demonstrably can (70.6
rounds to 71 and sat next to a B+). `gradeForTotal` carries a 1e-9
boundary epsilon so an exact 81 arriving as 80.99999999999967 out of
the scaling maths is still an A+, and `floorTotal` absorbs the same
error by the same amount so the two always agree.

`subjects.target_grade` is the grade you're chasing *in that subject*,
which is not always what the target SGPA implies — being weak in one
subject and aiming A there while targeting 9.0 overall is the normal
case. Null means "derive it from `settings.target_sgpa`", so the two
can't silently disagree.

### Attendance — `src/lib/attendance.ts`

**The bar is per subject.** 75% by default, condoned to 65% where
medical leave has been granted (`subjects.medical_leave`, migration
023) — SRM grants ML per case, so one subject can sit at 65 while the
rest are held to 75. Every threshold asks `minAttendanceFor(subject)`
rather than assuming: skip budgets, recovery streaks, risk levels,
colour bands, the survival plan and whether you may sit the end-sem.
It matters most where it changes the instruction rather than the
number — 10 of 40 needs 80 consecutive attends to clear 75%, which is
more classes than remain, so the subject reads as lost; the same
subject needs 46 to clear 65%, which there is room for, so the answer
becomes "attend everything" instead.


75% minimum. Computes per-subject `canBunk` / `needToAttend`. Color signal: ≥75% `#4ade80`, 65–74% `#facc15`, <65% `#fb7185`. The DB status value `"holiday"` means "cancelled/no class" in the UI and is excluded from totals. Attendance upsert key: `(device_id, subject_id, date, start_time)`.

### Pages & layout

Eleven lazy-loaded pages under `src/pages/` (Dashboard `/`, `/attendance`, `/marks`, `/insights`, `/timetable`, `/calendar`, `/log`, `/history`, `/wrapped`, `/compare`, `/settings`) plus `Onboarding` and `SignIn`. `NAV_ITEMS` is exactly the five daily destinations — an iOS tab bar shows no more — and drives both the bottom bar and the top of the sidebar. `SECONDARY_NAV` (`/insights`, `/log`, `/history`, `/wrapped`, `/compare`) is listed inline in the sidebar on desktop and reached through the **More** sheet on mobile, which is the only way in for an installed iOS PWA: there's no browser UI to fall back on. `src/components/layout/app-shell.tsx` renders a sidebar on desktop (lg+) and a glass top bar + bottom nav on mobile, with framer-motion page transitions. Shared bottom sheets (vaul) live in `src/components/sheets/`; viz primitives (animated numbers, rings, SGPA dial, heatmap) in `src/components/viz/`.

Marks is now a single view — the segmented Marks/Calculator switcher,
its slide animation and the swipe between the two went with the
calculators themselves. A two-tab control whose second tab is empty is
worse than no control.

**Everything grade-shaped lives on `/insights`.** The Marks page used to
carry its own calculator strip (`components/marks/calculators.tsx`) —
"what do I need in the end-sem", a target-SGPA table, and a CGPA pad —
while Insights carried the projections: two screens answering
overlapping questions off two different models, which is how one page
came to say "on pace for O" while another said "you need 80% of what's
left". The first two are superseded by the per-subject budget cards
(`components/insights/subject-budget.tsx`), which answer the same
questions against a real assessment plan and a per-subject target; the
CGPA pad had no equivalent and moved to
`components/insights/cgpa-card.tsx`. Marks is now purely for entering
marks. The plan itself is edited in the subject sheet
(`components/sheets/assessment-editor.tsx`).

### iOS PWA

The app is installed to the home screen, so it has to behave like an app
rather than a page in a browser that happens to be hidden:

- **Launch screens.** `apple-touch-startup-image` for 12 iPhone sizes in
  both colour schemes (iOS honours `prefers-color-scheme` in the startup
  media query). Without them iOS shows a blank white screen between tap
  and first paint. A size that isn't listed gets no match and iOS
  substitutes its own screen — the app icon blown up on the manifest's
  `background_color` — so new phones need adding to `DEVICES`. The mark
  is keyed out of the opaque source art and refilled with the theme's
  `--ink`, because compositing the source directly drops a white card
  onto the dark screen. They are excluded from the Workbox precache via
  `globIgnores` — Safari fetches them itself, and precaching ~600 KB of
  images the service worker is never asked for would tax every install.
- **Opening animation.** `src/components/launch-screen.tsx` starts as a
  pixel copy of the iOS launch image — same mark, same `MARK_VMIN` of
  the shorter side, same background — and holds still for a beat before
  anything moves, so the handoff from the system's screen to the web
  view has nothing to give it away. `src/lib/launch.ts` owns the
  timings; `launch.test.ts` fails the build if `MARK_VMIN` and the
  generator's `MARK_SCALE` drift, because that seam is the whole trick.
  Two things that seam depends on and that are easy to undo:

  - The mark is centred on the **viewport**, not stacked in a column
    with the wordmark — a column centres the pair, which lifts the mark
    off the middle of the screen and makes it jump the instant the web
    view paints. The wordmark hangs off it absolutely for that reason.
  - Nothing animated carries the mask. Transforming a masked element
    makes WebKit re-apply the mask on the CPU every frame, which is what
    the logo stuttering on a 120Hz screen looks like; the mask sits on a
    static child and a wrapper moves it. Same reason the wordmark
    reveals with a transform instead of `clip-path`.

  Everything else is a theme token, so the whole sequence takes each
  theme's background, ink, accent and card shape — including the
  squircle, which is a real `.card` and so picks up brutalist's flat
  1.5px 28px squircle or OLED's shadowed 14px one. The one thing that
  can't follow the theme is iOS's own launch image: it's picked before
  any JS runs and varies only by `prefers-color-scheme`, so it's baked
  to brutalist (the default) and an OLED user gets a few hundred ms of
  `#0a0a0a` before the app paints `#000`.

  It always runs for `MIN_VISIBLE_MS` (a sequence cut off halfway reads
  as a bug, and a cached session resolves in single-digit ms), and a
  timer unmounts it even if the exit animation never finishes —
  `AnimatePresence` waits for completion, and animation clocks stop when
  the page isn't painted, which would otherwise leave a full-screen
  layer over an untappable app.
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

The theme follows the **account**, not the device (migration 018,
`src/hooks/useThemeSync.ts`). localStorage still drives the first paint —
the pre-paint script in `index.html` runs before React and is what stops
the palette flashing — and the settings row reconciles once it lands. The
account wins, unless it has never stored a theme (then the device
publishes its own), or the user picked one during this session (a live
choice outranks a stored one). It waits for `isFetchedAfterMount` rather
than the first `data`: the query cache is persisted and `staleTime` is
30s, so on reload the first row comes off disk and can predate what
another device wrote.

`src/lib/themes.ts` is deliberately side-effect free and owns
`resolveTheme`. A stored theme name that no longer exists lands on
`[data-theme]`, matches no rule, and paints the app with no tokens at
all — so retiring a theme means migrating everyone still carrying it.
Both the store and the pre-paint script in `index.html` validate.

### Design system

Tokens are HSL CSS variables in `src/index.css` (light "paper" / dark "ink", `.dark` class strategy — applied pre-paint by an inline script in `index.html`), mapped in `tailwind.config.js` (`bg`, `surface`, `ink`, `muted`, `accent`, `good/warn/bad`…). Fonts: Plus Jakarta Sans + JetBrains Mono.

### Supabase

Tables: `subjects`, `attendance`, `timetable_slots`, `marks`, `deadlines`, `settings`, `portal_snapshots`, `device_owners`. Migrations in `supabase/migrations/`; RLS is owner-scoped via `owns_device()` — see the auth note above.

### Crash reporting

`src/lib/crashLog.ts`. The ErrorBoundary used to insert into `error_log`
directly and swallow the result, which lost the two kinds of report
worth having.

- **Signed out.** The policy is `to authenticated` (migration 015) and
  the boundary wraps SignIn and Onboarding, so a crash before sign-in
  returned 42501 and vanished — the report you most want, because
  someone is looking at an app they can't get into. Those are held in
  localStorage and filed by `useSession` once a session lands.
- **Not a render error.** Boundaries only catch render. Unhandled
  rejections and uncaught errors bypassed all of it, so the table
  described one narrow class of failure and implied the rest didn't
  happen. `installGlobalErrorHandlers` runs in `main.tsx` before render.

Nothing on this path may throw: `buildReport` tolerates a non-Error
(rejections usually carry a string) and storage being disabled, which
makes `localStorage` throw rather than return null.

Nothing reads the table yet — worth remembering before trusting silence.

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
  `renderShareCard` (canvas, verified in-browser). `renderWrappedCard`
  is a separate renderer, not a variant: one is a report (a grade per
  subject, uniform rows), the other a boast (one enormous number and a
  2×2 grid). The hero number is measured and shrunk to fit.
- **`src/lib/liveClass.ts`** — which class is running right now, from
  minutes-since-midnight, so it's testable without mocking a clock. The
  case that needs the test is the handover: 08:50 both ends one class
  and starts the next, and treating the end minute as still-inside
  matches both.
- **`src/lib/bunkWallet.ts`** — `canBunk` reshaped as a balance. No new
  maths; it sorts, sums, and keeps subjects below 75% out of the
  spendable total, since you can't skip your way out of 65%.
- **`src/lib/examCountdown.ts`** — the next exam inside a 21-day
  horizon. Exams only, because they're the one type entered by hand (the
  portal never publishes their dates) and the reason to enter one is to
  aim at a number.
- **`src/lib/forecast.ts`** — the cost of skipping *specific* future
  days, for the heatmap. Baselines on "attend everything from here", not
  today's percentage: measuring against today credits the plan with
  every class you're still going to sit, making each skip look cheaper
  than it is.
- **`src/lib/extraClasses.ts`** — classes that happened but aren't on
  the timetable (a makeup, an extra lab, a swapped slot). Needed no
  schema: an `attendance` row is keyed by (subject, date, start_time)
  and never had to match a `timetable_slots` row, so an extra class is
  *derived* — a recorded class the timetable doesn't schedule is the
  extra class. One source of truth, survives a timetable edit, and
  clearing the row removes it. Matching is on subject **and** time,
  because a makeup for a class that already met that day is the common
  case. Cancellation was always there: it's what marking a slot Off does.
- **`src/lib/reconcile.ts`** — why a subject's percentage isn't the one
  the portal printed. The app's figure is the portal's brought up to
  date, which is the right answer and the most alarming one: two numbers
  for one subject reads as a broken app. This lays out the arithmetic —
  what the portal said and when, what's been marked since, the sum. Its
  key test asserts agreement with `computeSubjectAttendance`, since an
  explanation that disagrees with the number it explains is just a
  second opinion.
- **`src/lib/sgpaTarget.ts`** — `cgpa.ts` says which SGPA this semester
  needs; this says which subjects have to move to produce it. A target
  without that second step isn't advice. Everything is read off
  `projectSubjectGrade` rather than re-derived, so it can't disagree
  with the cards beneath it. Lifts are single grade steps ordered by
  **how far above current pace** the required end-sem mark is, not by
  the mark itself — needing 32 while tracking 30 is a cheaper ask than
  needing 28 while tracking 18. When the ceiling allows the target but
  one-grade steps don't reach it, the status says so instead of listing
  a plan that falls short. `settings.target_sgpa` had been a column
  since migration 001 that nothing ever read; this is what reads it.
- **`src/lib/cgpa.ts`** — `targets.ts` one level up. CGPA is
  credit-weighted, so `target = (priorPoints + sgpa x currentCredits) /
  (priorCredits + currentCredits)` rearranged for the unknown gives what
  this semester must return. "Secured" is a strong claim and means
  scoring **zero** still clears the target, which is rarer than it
  sounds. The ladder is hidden until a semester is archived: with no
  prior record CGPA is just this semester's SGPA and every rung reads
  "need 8.5 for 8.5".
- **`src/lib/wrapped.ts`** — the semester counted up. Everything is a
  count of something recorded and anything unknowable comes back null
  for the UI to drop, because one invented superlative discredits the
  rest. Hours round down.

### Portal sync (bookmarklet)

`scripts/portal-sync/` builds a bookmarklet that scrapes the SRM portal
and posts the rows to the **portal-ingest** edge function — it runs inside
the page you already logged into, so no SRM credentials are stored
anywhere.

**The parser lives in `src/lib/portal/parse.ts`, not in the bookmarklet.**
It was extracted because the bookmarklet only runs on a desktop browser,
which is not the device the app lives on — so a phone had no way to pull
fresh figures, which is the root of every "why doesn't this match the
portal" moment. Two callers now share one parser: the bookmarklet
(scraping a live page, with the modal-opening and panel code it still
owns) and **Settings → paste a portal page**, which reads `text/html`
off a paste event and runs the same scrapers over it. `build.mjs`
bundles rather than just minifying so the import resolves, and both test
files import the module instead of `eval`-ing the built script.

The paste route needs no OCR, no scraping service and no new credential,
and the portal password stays uninvolved. Its limits are real and stated
in the UI: a plain-text clipboard loses the table structure (the sheet
says so rather than blaming the portal), and sp.srmist.edu.in's
per-component marks live behind a modal per subject, so pasting that
summary page yields attendance but no marks.

It used to write straight to PostgREST with the anon key. Owner-scoped
RLS (migration 015) left anon with no policies, so those writes began
failing with 42501. Embedding a Supabase refresh token instead would put
a full-account credential in a bookmarklet URL — visible in the browser's
bookmark manager, and synced across devices — so the write moved
server-side. The built file carries `INGEST_SECRET`, which grants exactly
one thing: submit portal data for one `device_id`.

```bash
supabase secrets set INGEST_SECRET="<long random string>"
supabase functions deploy portal-ingest --no-verify-jwt
```

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

`scripts/dev-mock/server.mjs` speaks enough PostgREST **and Supabase
auth** for the app, and seeds
a full semester under PIN **1234** (6 subjects, a week of hand-marked
classes, portal snapshots on 4 of them dated a week back so the "portal
totals as of…" badge shows). It starts Vite pointed at itself, so the UI
runs with no `.env.local` and never touches the real project. Realtime is
not implemented — supabase-js retries a websocket in the background and the
UI carries on without it.

### Deploying under a running app — `src/lib/staleChunk.ts`

Every page is `lazy()`-loaded, so the running app fetches a chunk by
its hashed filename at the moment you navigate. Deploy in between and
that filename is gone: the open document asks for the old name and the
server no longer has it. `vercel.json` used to rewrite *every* miss to
`index.html`, so the browser was handed HTML where it expected a module
and reported `'text/html' is not a valid JavaScript MIME type` — a
confusing way to say 404, and a crash screen for something that is not
a crash. The rewrite now excludes `/assets/`, so a missing chunk fails
as a plain 404.

Either way the app self-heals: the error boundary and the global
handlers recognise the stale-chunk signatures and reload instead of
showing the crash screen. There is no state to preserve and no decision
to make — reloading is what the user would have been told to do. Once
only, guarded in `sessionStorage`: a second identical failure is a
broken deploy rather than a stale one, and someone should see that.

### PWA

`vite.config.ts` via `vite-plugin-pwa`: Supabase calls cached NetworkFirst (5s timeout), Google Fonts CacheFirst. On Node 18 the service worker is intentionally built unminified (workbox `mode` switch) because workbox's terser worker needs global webcrypto.

### Path alias

`@/` maps to `src/`. Use it for all internal imports.
