-- On-Duty attendance.
--
-- SRM marks a student On Duty when the department itself pulls them out
-- of class — sport, a symposium, NSS, a paper presentation — and the
-- portal counts those hours as attended. The app had no way to say so.
-- The workaround was logging OD as "present", which produced the right
-- percentage while making the absence log claim you were in a room you
-- demonstrably weren't, and left no way to answer "how much of my
-- attendance is OD?" — the question that matters when a department
-- later disallows some of it.
--
-- 'od' counts toward attended and toward conducted, exactly like
-- 'present'. 'holiday' (a cancelled slot) still counts toward neither.

alter table attendance drop constraint if exists attendance_status_check;

alter table attendance
  add constraint attendance_status_check
  check (status in ('present', 'absent', 'holiday', 'od'));
