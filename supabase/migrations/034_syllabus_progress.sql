-- Syllabus topics you've ticked as studied.
--
-- The units and their topics come from <pin>/units.json (the sync reads the
-- university's syllabus books), so a row only names a topic by its course,
-- unit and text as the syllabus prints it. Ticking inserts a row, unticking
-- deletes it; a topic whose wording changes in a new syllabus simply stops
-- matching, which is the honest outcome.

create table if not exists syllabus_progress (
  device_id text not null,
  course_code text not null,
  unit smallint not null,
  topic text not null,
  done_at timestamptz not null default now(),
  primary key (device_id, course_code, unit, topic)
);

alter table syllabus_progress enable row level security;

drop policy if exists "syllabus_progress_owner" on syllabus_progress;
create policy "syllabus_progress_owner" on syllabus_progress
  for all to authenticated
  using (owns_device(device_id))
  with check (owns_device(device_id));

-- Live across devices, like the other tables the app watches.
do $$
begin
  alter publication supabase_realtime add table syllabus_progress;
exception when duplicate_object then null;
end $$;
