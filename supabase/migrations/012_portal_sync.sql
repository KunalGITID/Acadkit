-- Portal sync: attendance snapshots + de-duplicated portal marks.
--
-- SRM Academia reports attendance as per-subject totals (hours conducted /
-- hours absent), not per-class rows, so it cannot be written into the
-- `attendance` table without inventing dates. Snapshots live beside it
-- instead: the portal totals act as the baseline and manually-marked
-- classes dated after `as_of` layer on top (see src/lib/attendance.ts).

create table if not exists portal_snapshots (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  subject_code text not null,
  conducted numeric not null,
  absent numeric not null,
  -- The portal's own percentage, kept for display so a parser bug that
  -- mangles conducted/absent is visible rather than silently averaged in.
  percentage numeric,
  as_of date not null default current_date,
  synced_at timestamptz not null default now(),
  unique (device_id, subject_code)
);
create index if not exists idx_portal_snapshots_device on portal_snapshots(device_id);

alter table portal_snapshots enable row level security;
drop policy if exists "anon_all_portal_snapshots" on portal_snapshots;
create policy "anon_all_portal_snapshots" on portal_snapshots
  for all to anon using (true) with check (true);

-- Marks need a provenance flag so a re-sync updates the rows the portal
-- owns and never touches ones typed in by hand.
alter table marks
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'portal'));

-- Partial unique index: portal marks are keyed by (subject, label) so a
-- re-sync upserts. Manual marks stay unconstrained — duplicate labels
-- there are the user's business.
create unique index if not exists idx_marks_portal_unique
  on marks(device_id, subject_id, label)
  where source = 'portal';
