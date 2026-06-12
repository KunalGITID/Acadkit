# AcadKit 2.0

A personal academic companion for SRM KTR — attendance, internal/external marks + SGPA, the
5-day rotating "Day Order" timetable, academic calendar, and deadlines. Installable PWA,
excellent on both phone and desktop, with all data synced across devices by a single
**4-digit PIN** (no login).

## Stack

Vite + React 19 + TypeScript · Tailwind CSS · framer-motion · TanStack Query (optimistic
mutations) · Zustand · vaul bottom sheets · sonner toasts · Supabase (PostgreSQL + realtime) ·
vite-plugin-pwa.

## Setup

### 1. Backend (Supabase)

Create a project at [supabase.com](https://supabase.com) (free tier is plenty), then run the
SQL files in `supabase/migrations/` in order (001 → 008) in the SQL editor. That creates the
six tables (`subjects`, `timetable_slots`, `attendance`, `marks`, `deadlines`, `settings`)
and the RLS policies.

> Already have the AcadKit v1 Supabase project? Just run the two new one-liners —
> `007_settings_name.sql` (greeting name follows your PIN) and
> `008_slot_type_internal_only.sql` (lab/theory slot tags + internal-only subjects) — in the
> SQL editor. Everything else runs on the same schema and your existing PIN's data loads
> as-is. The app works without them too; it just can't save those particular fields.

For **live cross-device sync** (optional but nice): in the Supabase dashboard go to
*Database → Replication* and enable the `supabase_realtime` publication for the six tables.
Without it, devices still sync on every app focus/refetch.

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
npm run build      # type-check + production build (output in dist/)
npm run preview    # serve the production build
```

### 4. Install as a PWA

Serve the **production build** over HTTPS (or localhost), then:

- **iOS Safari**: Share → *Add to Home Screen*.
- **Android Chrome**: the install prompt, or ⋮ → *Install app*.
- **Desktop Chrome/Edge**: install icon in the address bar.

Cached pages and previously-fetched data work offline; mutations need a connection.

## The PIN

On first launch, **Start fresh** generates a random 4-digit PIN, seeds your subjects, and
stores the PIN locally. The PIN is the identity key for every row in the cloud. On any other
device, choose **I have a PIN** (or Settings → *Sync this device to another PIN*) and enter
the same digits — your entire AcadKit loads there. Your PIN is always visible in Settings.

## New semester checklist

Edit `src/data/semester.ts`: update `SEMESTER_START` / `SEMESTER_END`, the
`OFFICIAL_HOLIDAYS` list, and the `DAY_ORDER_MAP`. Mid-semester surprise holidays don't need
a code change — declare them from the Calendar page and the remaining day orders shift
forward automatically.
