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

Six lazy-loaded pages under `src/pages/` (Dashboard `/`, `/attendance`, `/marks`, `/timetable`, `/calendar`, `/settings`) plus `Onboarding`. `src/components/layout/app-shell.tsx` renders a sidebar on desktop (lg+) and a glass top bar + bottom nav on mobile, with framer-motion page transitions. Shared bottom sheets (vaul) live in `src/components/sheets/`; viz primitives (animated numbers, rings, SGPA dial, heatmap) in `src/components/viz/`.

### Design system

Tokens are HSL CSS variables in `src/index.css` (light "paper" / dark "ink", `.dark` class strategy — applied pre-paint by an inline script in `index.html`), mapped in `tailwind.config.js` (`bg`, `surface`, `ink`, `muted`, `accent`, `good/warn/bad`…). Fonts: Plus Jakarta Sans + JetBrains Mono.

### Supabase

Tables: `subjects`, `attendance`, `timetable_slots`, `marks`, `deadlines`, `settings`. Migrations in `supabase/migrations/`; RLS allows the anon role full access (device_id scoping is client-side). The v2 app runs on the v1 schema unchanged — no new migrations were needed.

### PWA

`vite.config.ts` via `vite-plugin-pwa`: Supabase calls cached NetworkFirst (5s timeout), Google Fonts CacheFirst. On Node 18 the service worker is intentionally built unminified (workbox `mode` switch) because workbox's terser worker needs global webcrypto.

### Path alias

`@/` maps to `src/`. Use it for all internal imports.
