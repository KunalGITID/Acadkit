You are building "AcadKit" — a personal academic PWA for iOS for a B.Tech CSE 
student at SRM Institute of Science and Technology, Kattankulathur (SRM KTR).

Tech Stack:
- Frontend: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- State: Zustand + React Query (TanStack Query v5)
- Backend: Supabase (PostgreSQL, no auth — anonymous single-user)
- Charts: Recharts
- PWA: vite-plugin-pwa (Workbox)
- Routing: React Router v6

Key constraints:
- NO login/auth. Use a UUID stored in localStorage as device_id for all rows.
- SRM grading: O=10, A+=9, A=8, B+=7, B=6, C=5, F=0
- SGPA = Σ(grade_point × credits) / Σcredits
- Minimum attendance threshold = 75% per subject
- Target iOS PWA: must include apple-touch-icon, apple-mobile-web-app-capable meta tags

Supabase credentials:
- VITE_SUPABASE_URL = https://shkfgxqvzixvbigesxlo.supabase.co
- VITE_SUPABASE_ANON_KEY = [paste your anon key here]

Supabase tables: subjects, attendance, timetable_slots, marks, deadlines, settings
Always write TypeScript with strict types. Use kebab-case for filenames.
Always use Supabase client from src/lib/supabase.ts.
Never hardcode Supabase URL or key — use import.meta.env variables.