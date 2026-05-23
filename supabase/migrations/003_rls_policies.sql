-- AcadKit uses anonymous access (no auth). device_id is stored client-side.
-- These policies allow the anon key to read/write all rows.
-- For a personal single-user PWA this is acceptable.

alter table subjects enable row level security;
alter table timetable_slots enable row level security;
alter table attendance enable row level security;
alter table marks enable row level security;
alter table deadlines enable row level security;
alter table settings enable row level security;

-- SUBJECTS
drop policy if exists "anon_select_subjects" on subjects;
drop policy if exists "anon_insert_subjects" on subjects;
drop policy if exists "anon_update_subjects" on subjects;
drop policy if exists "anon_delete_subjects" on subjects;

create policy "anon_select_subjects" on subjects for select to anon using (true);
create policy "anon_insert_subjects" on subjects for insert to anon with check (true);
create policy "anon_update_subjects" on subjects for update to anon using (true) with check (true);
create policy "anon_delete_subjects" on subjects for delete to anon using (true);

-- TIMETABLE_SLOTS
drop policy if exists "anon_select_timetable_slots" on timetable_slots;
drop policy if exists "anon_insert_timetable_slots" on timetable_slots;
drop policy if exists "anon_update_timetable_slots" on timetable_slots;
drop policy if exists "anon_delete_timetable_slots" on timetable_slots;

create policy "anon_select_timetable_slots" on timetable_slots for select to anon using (true);
create policy "anon_insert_timetable_slots" on timetable_slots for insert to anon with check (true);
create policy "anon_update_timetable_slots" on timetable_slots for update to anon using (true) with check (true);
create policy "anon_delete_timetable_slots" on timetable_slots for delete to anon using (true);

-- ATTENDANCE
drop policy if exists "anon_select_attendance" on attendance;
drop policy if exists "anon_insert_attendance" on attendance;
drop policy if exists "anon_update_attendance" on attendance;
drop policy if exists "anon_delete_attendance" on attendance;

create policy "anon_select_attendance" on attendance for select to anon using (true);
create policy "anon_insert_attendance" on attendance for insert to anon with check (true);
create policy "anon_update_attendance" on attendance for update to anon using (true) with check (true);
create policy "anon_delete_attendance" on attendance for delete to anon using (true);

-- MARKS
drop policy if exists "anon_select_marks" on marks;
drop policy if exists "anon_insert_marks" on marks;
drop policy if exists "anon_update_marks" on marks;
drop policy if exists "anon_delete_marks" on marks;

create policy "anon_select_marks" on marks for select to anon using (true);
create policy "anon_insert_marks" on marks for insert to anon with check (true);
create policy "anon_update_marks" on marks for update to anon using (true) with check (true);
create policy "anon_delete_marks" on marks for delete to anon using (true);

-- DEADLINES
drop policy if exists "anon_select_deadlines" on deadlines;
drop policy if exists "anon_insert_deadlines" on deadlines;
drop policy if exists "anon_update_deadlines" on deadlines;
drop policy if exists "anon_delete_deadlines" on deadlines;

create policy "anon_select_deadlines" on deadlines for select to anon using (true);
create policy "anon_insert_deadlines" on deadlines for insert to anon with check (true);
create policy "anon_update_deadlines" on deadlines for update to anon using (true) with check (true);
create policy "anon_delete_deadlines" on deadlines for delete to anon using (true);

-- SETTINGS
drop policy if exists "anon_select_settings" on settings;
drop policy if exists "anon_insert_settings" on settings;
drop policy if exists "anon_update_settings" on settings;
drop policy if exists "anon_delete_settings" on settings;

create policy "anon_select_settings" on settings for select to anon using (true);
create policy "anon_insert_settings" on settings for insert to anon with check (true);
create policy "anon_update_settings" on settings for update to anon using (true) with check (true);
create policy "anon_delete_settings" on settings for delete to anon using (true);
