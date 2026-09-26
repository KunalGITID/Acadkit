-- Daily study log.
--
-- The app asks once a day how long you studied and, if it wasn't zero,
-- which subjects it went on. One row per subject per day; a day answered
-- "nothing" is a single row with no subject and zero minutes, so a rest
-- day is recorded instead of looking like a day nobody asked about.
--
-- The app saves a day by deleting that date's rows and inserting the new
-- ones, so editing a day never leaves the old split behind.

create table if not exists study_log (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  date date not null,
  subject_id uuid references subjects(id) on delete cascade,
  minutes integer not null check (minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  -- Zero only as the "didn't study" marker, never against a subject.
  check ((subject_id is null) = (minutes = 0))
);

create index if not exists idx_study_log_device_date on study_log(device_id, date);

alter table study_log enable row level security;

drop policy if exists "study_log_owner" on study_log;
create policy "study_log_owner" on study_log
  for all to authenticated
  using (owns_device(device_id))
  with check (owns_device(device_id));

-- Live updates across devices, like the other tables the app watches.
do $$
begin
  alter publication supabase_realtime add table study_log;
exception when duplicate_object then null;
end $$;
