-- Suggestions: things the weekly scan found in the study folder (a test
-- date in a WhatsApp note, a due date in a Classroom post) that AcadKit
-- offers rather than applies. A wrong date on a real test is worse than
-- no date, so nothing here writes to deadlines by itself; the app shows
-- each one with where it came from, and Add or Dismiss decides it.
--
-- Written by scripts/sync-study-folder.mjs with the service role key.
-- `key` is a hash of what the suggestion says (kind, subject, what,
-- day), and the script inserts with on-conflict-do-nothing, so a scan
-- that finds the same thing again cannot resurrect one you dismissed or
-- overwrite one you accepted. A date that moves is a different key, and
-- so a new suggestion.

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  key text not null,
  kind text not null check (kind in ('deadline')),
  payload jsonb not null,
  -- The file it was read from, relative to the study folder, and the
  -- words that justify it — shown in the app so you can judge it.
  source text,
  evidence text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (device_id, key)
);

create index if not exists idx_suggestions_device on suggestions(device_id, status);

alter table suggestions enable row level security;

drop policy if exists "suggestions_owner_select" on suggestions;
create policy "suggestions_owner_select" on suggestions
  for select to authenticated
  using (owns_device(device_id));

-- The app only ever changes status. Inserts come from the sync script.
drop policy if exists "suggestions_owner_update" on suggestions;
create policy "suggestions_owner_update" on suggestions
  for update to authenticated
  using (owns_device(device_id))
  with check (owns_device(device_id));
