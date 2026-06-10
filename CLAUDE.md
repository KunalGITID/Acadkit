# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

There are no automated tests in this project.

To regenerate PWA icons after changing the logo: `node scripts/generate-icons.mjs`

## Architecture

AcadKit is a single-user academic PWA (React + Vite + TypeScript) for SRM KTR. There is no authentication — all data is scoped by a `device_id` (a 4-digit PIN stored in `localStorage`, generated on first launch via `src/lib/device.ts`). This PIN doubles as a sync code: entering the same PIN on another device shares all data.

### Data flow

```
Supabase (PostgreSQL) ← src/lib/queries.ts ← React Query hooks ← pages/components
                                                      ↕
                                              Zustand (useAppStore)
```

- **`src/lib/supabase.ts`** — single Supabase client; always import from here. Credentials come from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars.
- **`src/lib/queries.ts`** — all raw Supabase fetches. Every query is device-scoped (`.eq("device_id", deviceId)`).
- **`src/store/useAppStore.ts`** — Zustand store holding `deviceId`, `subjects`, `settings`, and `todayDayOrder`. Subjects and settings are loaded once at app startup by `AppDataProvider` in `App.tsx` and pushed into this store.
- **`src/hooks/`** — React Query wrappers that combine data from the store + Supabase. Mutations use optimistic updates (`onMutate`/`onError`/`onSettled`).

### Multi-tab sync

`useBroadcastSync` (mounted in `AppDataProvider`) uses the browser's `BroadcastChannel` API: any successful mutation in one tab broadcasts an invalidate signal to all other tabs of the same origin, which then refetch.

### Day order system

SRM uses a 5-day rotating schedule (Day 1–5) instead of day-of-week. The mapping of calendar dates to day orders is hardcoded in `src/lib/academicCalendar.ts` (`ACADEMIC_CALENDAR`). `useDayOrderSync` reads today's date, consults this map (accounting for weekends, official holidays, declared holidays), and writes the result to `useAppStore.todayDayOrder`. Pages derive today's timetable slots from this value.

### Pages & routing

Six pages under `src/pages/`, all lazy-loaded. Bottom nav (`src/components/ui/bottom-nav.tsx`) handles navigation. The `log` page is for viewing/managing past attendance. Route: `/` → Dashboard, `/marks`, `/attendance`, `/timetable`, `/calendar`, `/settings`.

### Marks & SGPA (SRM-specific)

- Internal marks scale to 60; external marks scale to 40; total out of 100.
- Grade thresholds in `src/lib/sgpa.ts`: O≥91, A+≥81, A≥71, B+≥61, B≥56, C≥50, F<50.
- Grade points: O=10, A+=9, A=8, B+=7, B=6, C=5, F=0.
- SGPA = Σ(grade_points × credits) / Σcredits.

### Attendance thresholds

Hardcoded at 75% minimum. `src/lib/attendance.ts` computes per-subject stats including `canBunk` (classes you can skip and stay ≥75%) and `needToAttend` (classes needed to recover to 75%).

### Supabase tables

`subjects`, `attendance`, `timetable_slots`, `marks`, `deadlines`, `settings`. Migrations are in `supabase/migrations/`. RLS policies are device_id-based (see `003_rls_policies.sql`). Attendance upsert key: `(device_id, subject_id, date, start_time)`.

### PWA

Configured in `vite.config.ts` via `vite-plugin-pwa`. Supabase API calls are cached with a `NetworkFirst` strategy (5s timeout, 24h max age). Targets iOS home screen install (`apple-touch-icon`, `apple-mobile-web-app-capable` meta tags in `index.html`).

### Path alias

`@/` maps to `src/`. Use it for all internal imports.
