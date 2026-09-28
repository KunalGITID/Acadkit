-- Per-slot attendance (subject + date + start_time)
alter table attendance add column if not exists start_time text;
alter table attendance add column if not exists end_time text;

-- Unique constraint for upsert (drop old PK-only upsert attempts if any)
alter table attendance drop constraint if exists attendance_unique;
alter table attendance add constraint attendance_unique
  unique (device_id, subject_id, date, start_time);
