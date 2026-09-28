# Architecture

Notes on how AcadKit is put together and the rules that keep it correct.

## Commands

```bash
npm run dev        # Vite dev server
npm run dev:mock   # dev server against a local mock backend (PIN 1234, seeded semester)
npm run build      # tsc -b over app, vite config, edge functions and scripts, then vite build
npm run test       # Vitest
npm run lint       # ESLint
```

`@/` maps to `src/`.

## Accounts and data

- Sign-in is email and password. Every row is scoped by a 4-digit `device_id` (the PIN), and
  row-level security checks it with `owns_device()` (migration 015). The PIN is not the security
  boundary; the database is.
- Policies are `to authenticated`, so anything using the anon key gets 42501. That's why the
  portal bookmarklet posts to the `portal-ingest` edge function.
- New PINs are claimed first (`claimFreshPin`), then seeded (`seedAccount`, which only fills in
  what's missing).
- Signing out clears the persisted query cache and the on-device file cache
  (`useAuthReset`), and removes the device's push subscription.

## Data flow

```
Supabase <- src/api/queries.ts <- src/hooks/useData.ts (React Query) <- pages
```

- Every write is named (`src/api/mutations.ts`) so a write made offline survives a restart and
  replays in order. The PIN travels inside the variables.
- Inserts get their id on the client, so an add followed by an edit made offline still works.
- `useSync` keeps tabs and devices in step (BroadcastChannel and Supabase realtime).
- The viewer's downloaded files and signed links are never persisted (`UNPERSISTED` in
  `App.tsx`); a Blob doesn't survive JSON.

## Calendar

SRM runs a 5-day rotating Day Order. `src/data/semester.ts` holds the semester window and the
official holidays; `src/lib/calendar.ts` resolves a date. Declared holidays shift the rotation
onto the remaining working days (`buildEffectiveMap`). After editing official holidays run
`node scripts/gen-edge-calendar.mjs` and redeploy `send-reminders`.

## Marks and grades

- Grades: O >= 91, A+ >= 81, A >= 71, B+ >= 61, B >= 56, C >= 50. Passing is 50 overall, nothing
  else.
- SGPA counts credit-bearing, graded courses only (`countsInSgpa`). UHV-II and the other LEM
  courses carry credits but are pass/fail.
- A subject is a budget of 100 marks (`solveSubjectPlan` in `src/lib/plan.ts`): what's banked,
  what's still to play, and the equal rate everything left must return for the target.
- The internal weight is per subject (`assessment.internal`); the component plan may be partial,
  and unclaimed weight stays as one "not announced" bucket.
- Components match by normalised label (`labelMatchKey`: CT-1 = FT-1 = FJ-1, FJ-II = FJ-2).
- A deadline you log with marks is adopted as a component if there's room; otherwise it only
  dates an existing one.
- Rounding: marks you need round up, marks you hold round down, totals floor.
- Attendance below the minimum bars the end-sem, and that outranks everything on a card.
- Grade odds (`src/lib/odds.ts`): empirical-Bayes prior over your subjects, 3,000 seeded
  simulations, SGPA read off the same draws.

**Marks page:** two tabs, Marks (entry) and Targets. Targets reads the expected solve
(`src/lib/expected.ts`): a test you've sat but haven't got back asks what you expect, and an
expectation counts in the plan without ever being saved as a mark.

## Attendance

- The bar is per subject: 75%, or 65% with medical leave, which is set for the whole semester
  in Settings. Everything asks `minAttendanceFor(subject)`.
- Arithmetic is integer, with the bar as a whole percentage.
- Every screen starts from the portal's totals (`computeSubjectAttendance`) and layers classes
  marked since.

## Study files

- `npm run sync:files` mirrors the Mac's study folder (`~/Documents/SRM_Sem3`) into the private
  `study-files` bucket. Blobs are named by content hash, and `manifest.json` lists the tree.
  Needs `SUPABASE_SERVICE_ROLE_KEY` and `STUDY_PIN` in `.env.local`; never prefix the service key
  with `VITE_`.
- The app never edits the mirror. Deletes and uploads are requests the Mac acts on
  (migrations 032, 033). The auto-sync runs every 3 minutes.
- Tags (`scripts/lib/tags.mjs`): subject from the top folder's code or course title, unit from
  the path, kind from folder and file name.
- Syllabus units are read from each course's syllabus PDF (`scripts/study-index/syllabus.mjs`).
- Past-paper topics are counted by the syllabus topic each question matches
  (`scripts/study-index/topics.mjs`).
- Search by meaning: the sync embeds passages through the `study-search` edge function
  (pgvector, migration 030).

## File viewer

`/view` opens a file in the app: PDF (pdf.js legacy build), Word, PowerPoint, spreadsheets,
code and images.

- It opens over the page it came from (`useViewerLinkState`), so closing it keeps the page's
  scroll position and open groups.
- Zoom follows a pinch with some resistance and springs back past 1x and 4x
  (`src/lib/zoom.ts`). PDFs redraw sharp at the settled zoom.
- Find in file uses the CSS Highlight API; PDFs get a pdf.js text layer.
- Files opened once are cached on the device (`src/lib/fileCache.ts`, 400 MB), and rows
  prefetch on touch.
- .doc, .ppt and .xls are converted on the Mac at sync (`scripts/lib/renditions.mjs`).

## Portal sync

A bookmarklet (`scripts/portal-sync/`) scrapes the SRM portal and posts to `portal-ingest`,
signed with `HMAC-SHA256(INGEST_SECRET, pin)`. The parser (`src/lib/portal/parse.ts`) matches
header text, never DOM paths, and also powers Settings, where you paste a portal page.

```bash
supabase secrets set INGEST_SECRET="<long random string>"
supabase functions deploy portal-ingest --no-verify-jwt
node scripts/portal-sync/build.mjs --pin <PIN> --secret "<INGEST_SECRET>"
```

## PWA and iOS

- Precache only; the viewer's chunks aren't precached.
- Launch screens for each iPhone size (`node scripts/generate-splash.mjs`); icons from
  `node scripts/generate-icons.mjs`.
- Form fields are 16px (iOS zooms smaller ones), overscroll is off, and safe areas come from
  `pt-safe-t` / `pb-safe-b`.
- After a deploy, a missing lazy chunk reloads the page once (`src/lib/staleChunk.ts`).

## Themes

Brutalist (default) and OLED, set on `[data-theme]` and synced with the account (migration
018). `src/lib/voice.ts` holds the app's copy in a plain and a brutal register.
