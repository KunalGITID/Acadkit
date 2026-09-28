# AcadKit

[![CI](https://github.com/KunalGITID/Acadkit/actions/workflows/ci.yml/badge.svg)](https://github.com/KunalGITID/Acadkit/actions/workflows/ci.yml)

A personal academic app for SRM KTR: attendance, marks and SGPA, the Day Order timetable,
deadlines, and study files. It's a PWA, so you install it to your phone's home screen or run it
on a Mac, and it syncs across devices when you sign in.

## Features

- **Attendance**: how many classes you can miss, and what it takes to get back above the
  minimum (75%, or 65% with medical leave).
- **Marks and Targets**: what each remaining test has to return for the grade you want, with
  your expected marks counted.
- **Timetable and calendar**: follows SRM's 5-day rotating Day Order.
- **Study**: your notes folder synced from the Mac, with an in-app viewer (PDF, Word,
  PowerPoint, spreadsheets, code) and search inside files.

## Quick start

```bash
npm install
npm run dev:mock    # runs with fake data, no setup needed
```

To use your own data, create a [Supabase](https://supabase.com) project, run the files in
`supabase/migrations/` in order, then add `.env.local`:

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

and start the app with `npm run dev`.

## Scripts

| Command              | What it does                                   |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Dev server at http://localhost:5173            |
| `npm run dev:mock`   | Dev server on a local mock backend             |
| `npm run build`      | Type-check and production build                |
| `npm run test`       | Unit tests                                     |
| `npm run sync:files` | Mirror the Mac's study folder to the app       |

`sync:files` needs `SUPABASE_SERVICE_ROLE_KEY` and `STUDY_PIN` in `.env.local`. Never give the
service key a `VITE_` prefix: anything prefixed `VITE_` is bundled into the app, where anyone
can read it.

## Stack

React · TypeScript · Vite · Tailwind · TanStack Query · Supabase
