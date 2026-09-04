-- Short names for subjects.
--
-- "Transforms & Boundary Value Problems" and "UNIVERSAL HUMAN VALUES -
-- II: UNDERSTANDING HARMONY AND ETHICAL HUMAN CONDUCT" are the names the
-- portal gives, and they truncate in every list the app has: the
-- dashboard, deadlines, the survival plan, the widget, the timetable.
--
-- Nullable on purpose. A subject without one falls back to an
-- abbreviation derived from its name, so this only exists for the cases
-- where the automatic answer is wrong.

alter table subjects
  add column if not exists short_name text;
