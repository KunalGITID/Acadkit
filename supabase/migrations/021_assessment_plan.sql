-- Per-subject assessment structure, and a per-subject target.
--
-- Two things the app could not previously say.
--
-- **The split is not 60/40.** It was hardcoded — `internalScaled =
-- (internalPct / 100) * 60` in src/lib/projections.ts — with
-- `internal_only` (migration 008) as the single escape hatch, so a
-- 70/30 or 50/50 subject was simply mis-scored. `assessment.internal`
-- replaces both: 100 is what `internal_only` used to mean, 60 is the
-- default, anything else now works.
--
-- **Internal marks that haven't happened yet.** The old model read a
-- subject as a rate — earned over entered — so one 5/5 assignment read
-- as 100% and predicted an O. `assessment.components` lists what the
-- internal weight is actually made of, so 5/5 reads as 5 marks banked
-- of 60 with 55 still to play. Faculty announce these at their own
-- pace, so the list is partial by design: whatever weight nobody has
-- claimed stays an open bucket and shrinks as tests are declared.
--
-- Shape:
--   {"internal": 60, "complete": false,
--    "components": [{"key":"ct1","label":"CT-1","type":"CT","max":15}]}
--
-- `complete` means "this is the whole breakdown", which lets components
-- recorded in their own units (the portal reports out of 5s and 50s)
-- scale onto the weight instead of sprouting a phantom bucket.
--
-- Both columns are nullable with no default: a subject that predates
-- this reads through `assessmentFor` in src/lib/plan.ts, which falls
-- back to internal_only and then to 60/40. Nothing needs backfilling.

alter table subjects
  add column if not exists assessment jsonb,
  add column if not exists target_grade text;

-- The grade you're aiming for here, which is not always what the target
-- SGPA implies — a subject you're weak in gets its own number. Null
-- means "derive it from settings.target_sgpa".
alter table subjects
  drop constraint if exists subjects_target_grade_check;
alter table subjects
  add constraint subjects_target_grade_check
  check (target_grade is null or target_grade in ('O','A+','A','B+','B','C'));

-- Guard the parts of the jsonb the solver trusts. Everything else is
-- validated client-side, but a bad `internal` would silently mis-scale
-- every number on the Insights page, so it is checked here too.
alter table subjects
  drop constraint if exists subjects_assessment_check;
alter table subjects
  add constraint subjects_assessment_check
  check (
    assessment is null or (
      jsonb_typeof(assessment) = 'object'
      and jsonb_typeof(assessment -> 'components') = 'array'
      and (assessment ->> 'internal')::numeric between 0 and 100
    )
  );
