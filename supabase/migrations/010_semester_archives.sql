-- Past-semester snapshots for history + CGPA. One row per archived
-- semester holding a computed summary (raw rows aren't kept across
-- semesters — the active tables always hold the current semester).
create table if not exists semester_archives (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  label text not null,
  sgpa numeric,
  credits numeric,
  summary jsonb not null default '[]'::jsonb,
  sem_start date,
  sem_end date,
  archived_at timestamptz default now()
);
create index if not exists idx_sem_archives_device on semester_archives(device_id);

alter table semester_archives enable row level security;
drop policy if exists "anon_all_semester_archives" on semester_archives;
create policy "anon_all_semester_archives" on semester_archives
  for all to anon using (true) with check (true);
