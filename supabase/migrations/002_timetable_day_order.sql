-- Timetable: day_order instead of day_of_week / period_no
alter table timetable_slots drop column if exists day_of_week;
alter table timetable_slots drop column if exists period_no;

alter table timetable_slots
  add column if not exists day_order int2 check (day_order between 1 and 5);

alter table timetable_slots
  add column if not exists created_at timestamptz default now();

-- Attendance: remove period_no
alter table attendance drop column if exists period_no;

-- Settings: declared holidays + current day order
alter table settings
  add column if not exists declared_holidays jsonb default '[]'::jsonb;

alter table settings
  add column if not exists current_day_order int2 default 1;
