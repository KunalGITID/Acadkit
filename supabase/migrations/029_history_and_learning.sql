-- History the app can learn from, instead of overwriting it.
--
-- Until now every portal sync upserted over the last one and no forecast
-- was ever kept, so there was no time series to learn from and no way to
-- check a prediction against what happened. Everything here is append-
-- only from the app's side.

-- ---------- portal snapshot history ----------
-- One row per subject per sync. portal_snapshots stays the current
-- baseline; this is the record of how it got there, which is what the
-- anomaly checks compare against.

create table if not exists portal_snapshot_history (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  subject_code text not null,
  conducted numeric not null,
  absent numeric not null,
  percentage numeric,
  as_of date not null,
  synced_at timestamptz not null default now(),
  source text not null default 'bookmarklet'
    check (source in ('bookmarklet', 'paste', 'restore', 'backfill'))
);

create index if not exists idx_snapshot_history_device
  on portal_snapshot_history(device_id, subject_code, synced_at);

alter table portal_snapshot_history enable row level security;

drop policy if exists "snapshot_history_owner_select" on portal_snapshot_history;
create policy "snapshot_history_owner_select" on portal_snapshot_history
  for select to authenticated using (owns_device(device_id));

-- The paste route writes under your own session; the bookmarklet's
-- writes go through portal-ingest with the service role.
drop policy if exists "snapshot_history_owner_insert" on portal_snapshot_history;
create policy "snapshot_history_owner_insert" on portal_snapshot_history
  for insert to authenticated with check (owns_device(device_id));

-- The snapshots you have now are the first entries.
insert into portal_snapshot_history
  (device_id, subject_code, conducted, absent, percentage, as_of, synced_at, source)
select s.device_id, s.subject_code, s.conducted, s.absent, s.percentage, s.as_of, s.synced_at, 'backfill'
from portal_snapshots s
where not exists (
  select 1 from portal_snapshot_history h
  where h.device_id = s.device_id and h.subject_code = s.subject_code
);

-- ---------- forecast log ----------
-- What the grade forecaster said, once a week, so it can be scored
-- against the grades that actually arrive. `scope` is a subject id, or
-- 'sgpa' for the semester. `model` names the forecaster, so a changed
-- model is never scored against an old one's calls.

create table if not exists forecast_log (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  week_start date not null,
  scope text not null,
  target text,
  p_target numeric,
  p_pass numeric,
  median numeric,
  p10 numeric,
  p90 numeric,
  distribution jsonb,
  evidence int,
  model text not null,
  created_at timestamptz not null default now(),
  unique (device_id, week_start, scope)
);

alter table forecast_log enable row level security;

drop policy if exists "forecast_log_owner_select" on forecast_log;
create policy "forecast_log_owner_select" on forecast_log
  for select to authenticated using (owns_device(device_id));

-- Insert only: the first forecast of the week stands.
drop policy if exists "forecast_log_owner_insert" on forecast_log;
create policy "forecast_log_owner_insert" on forecast_log
  for insert to authenticated with check (owns_device(device_id));

-- ---------- suggestions: your decisions, not the scan's ----------
-- The sync script used to mark a suggestion the scan no longer contains
-- as 'dismissed', which is indistinguishable from you pressing Dismiss.
-- The suggestion ranker learns from your Add/Dismiss choices, so the
-- scan's clean-up gets its own status, and a decision its own time.

alter table suggestions drop constraint if exists suggestions_status_check;
alter table suggestions add constraint suggestions_status_check
  check (status in ('pending', 'accepted', 'dismissed', 'withdrawn'));
alter table suggestions add column if not exists decided_at timestamptz;

-- ---------- settings: evening study time ----------
-- How much of each evening the study planner may use. Zero keeps it to
-- the free periods between classes, which is all it knew before.

alter table settings add column if not exists study_evening_minutes int not null default 0;
alter table settings drop constraint if exists settings_study_evening_minutes_check;
alter table settings add constraint settings_study_evening_minutes_check
  check (study_evening_minutes between 0 and 600);
