-- Auto-marked attendance.
--
-- Marking every class by hand is the friction that kills a tracker like
-- this by week three. With auto-marking on, past scheduled classes that
-- were never touched are written as `present`, and the user only records
-- the exceptions.
--
-- The flag exists so those rows stay distinguishable forever: the UI can
-- label them, and "undo auto-marking" can delete exactly the rows the
-- app invented without disturbing a single hand-marked one. Anything
-- already recorded — present, absent, or cancelled — is never rewritten,
-- so this column only ever starts false for real user input.

alter table attendance
  add column if not exists auto_marked boolean not null default false;

create index if not exists idx_attendance_auto_marked
  on attendance(device_id, auto_marked) where auto_marked;

-- Opt-in, and off by default: silently inventing attendance for someone
-- who hasn't asked for it would be worse than the friction it removes.
alter table settings
  add column if not exists auto_mark_present boolean not null default false;
