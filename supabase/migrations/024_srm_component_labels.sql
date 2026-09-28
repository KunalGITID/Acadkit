-- Rename the components that were auto-labelled before the app knew
-- SRM's own naming.
--
-- Theory courses run FT-n and LLT-n; lab-integrated ones run FJ-n and
-- LLJ-n. Anything created before this came out as "CT-1" or "Lab-1",
-- which had to be renamed by hand to match what faculty announce — and,
-- because deadlines are matched to components *by name*, a plan in the
-- wrong dialect could not be matched to the deadlines either. Renaming
-- the old rows is what makes that matching work retroactively.
--
-- Scope, deliberately narrow:
--
--   * Only labels that are exactly `CT-<n>` or `Lab-<n>`. A hand-typed
--     name is yours and is never touched — the same contract
--     AUTO_LABEL keeps in src/lib/componentLabel.ts.
--   * Only internal marks. External rows are the end-sem.
--   * Both places a label lives: `marks.label`, and the `label` inside
--     each entry of `subjects.assessment -> 'components'`. They move
--     together or a plan stops matching its own marks.
--
-- Which dialect a subject speaks is decided the way the app decides it:
-- the timetable first, since that is what you maintain, falling back to
-- the letter SRM already puts in the code for a subject whose slots
-- have not been entered yet.
--
-- Idempotent — a second run matches nothing, because FT-1 is not CT-1 —
-- and every statement stands alone, so it is safe to run them one at a
-- time in an editor that does not share a session between them.
--
-- Preview before running, to see exactly what it will touch:
--
--   select s.code, m.label
--   from marks m join subjects s on s.id = m.subject_id
--   where m.is_external = false and m.label ~ '^(CT|Lab)-[0-9]+$';

-- ---------- recorded marks ----------

with kind as (
  select
    s.id,
    case
      when exists (
        select 1 from timetable_slots t
        where t.subject_id = s.id and t.slot_type = 'lab'
      ) then true
      when exists (select 1 from timetable_slots t where t.subject_id = s.id) then false
      else btrim(coalesce(s.code, '')) ~* 'j$'
    end as joint
  from subjects s
)
update marks m
set label = regexp_replace(
      m.label,
      '^CT-([0-9]+)$',
      (case when k.joint then 'FJ' else 'FT' end) || '-\1'
    )
from kind k
where k.id = m.subject_id
  and m.is_external = false
  and m.label ~ '^CT-[0-9]+$';

with kind as (
  select
    s.id,
    case
      when exists (
        select 1 from timetable_slots t
        where t.subject_id = s.id and t.slot_type = 'lab'
      ) then true
      when exists (select 1 from timetable_slots t where t.subject_id = s.id) then false
      else btrim(coalesce(s.code, '')) ~* 'j$'
    end as joint
  from subjects s
)
update marks m
set label = regexp_replace(
      m.label,
      '^Lab-([0-9]+)$',
      (case when k.joint then 'LLJ' else 'LLT' end) || '-\1'
    )
from kind k
where k.id = m.subject_id
  and m.is_external = false
  and m.label ~ '^Lab-[0-9]+$';

-- ---------- planned components ----------

with kind as (
  select
    s.id,
    case
      when exists (
        select 1 from timetable_slots t
        where t.subject_id = s.id and t.slot_type = 'lab'
      ) then true
      when exists (select 1 from timetable_slots t where t.subject_id = s.id) then false
      else btrim(coalesce(s.code, '')) ~* 'j$'
    end as joint
  from subjects s
)
update subjects s
set assessment = jsonb_set(
      s.assessment,
      '{components}',
      (
        select coalesce(jsonb_agg(renamed order by ord), '[]'::jsonb)
        from (
          select
            case
              when c ->> 'label' ~ '^CT-[0-9]+$' then
                jsonb_set(c, '{label}', to_jsonb(regexp_replace(
                  c ->> 'label',
                  '^CT-([0-9]+)$',
                  (case when k.joint then 'FJ' else 'FT' end) || '-\1'
                )))
              when c ->> 'label' ~ '^Lab-[0-9]+$' then
                jsonb_set(c, '{label}', to_jsonb(regexp_replace(
                  c ->> 'label',
                  '^Lab-([0-9]+)$',
                  (case when k.joint then 'LLJ' else 'LLT' end) || '-\1'
                )))
              else c
            end as renamed,
            ord
          from jsonb_array_elements(s.assessment -> 'components')
               with ordinality as t(c, ord)
        ) x
      )
    )
from kind k
where k.id = s.id
  and s.assessment is not null
  and jsonb_typeof(s.assessment -> 'components') = 'array'
  and exists (
    select 1 from jsonb_array_elements(s.assessment -> 'components') e
    where e ->> 'label' ~ '^(CT|Lab)-[0-9]+$'
  );
