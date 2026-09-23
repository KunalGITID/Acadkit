-- Suggestions can now carry a subject's marks plan, read from its course
-- assessment plan by the weekly scan. Like a deadline suggestion it is
-- offered, not applied: Apply on the Home page writes subjects.assessment.

alter table suggestions drop constraint if exists suggestions_kind_check;
alter table suggestions add constraint suggestions_kind_check check (kind in ('deadline', 'plan'));
