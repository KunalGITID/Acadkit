-- Theory/lab tag per timetable slot (one subject can have both kinds
-- of classes), and an "internals only" flag for subjects with no
-- end-sem exam where internal marks make up the full /100.
-- The app works without this migration but can't save these fields.

alter table timetable_slots
  add column if not exists slot_type text not null default 'theory'
  check (slot_type in ('theory', 'lab'));

alter table subjects
  add column if not exists internal_only boolean not null default false;
