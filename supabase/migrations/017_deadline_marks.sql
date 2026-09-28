-- What an upcoming test is worth.
--
-- Deadlines are used to set a target and practise toward it, but a date
-- alone can't answer "what do I need on this one". src/lib/targets.ts
-- already solves that — it just had no idea a test was coming, so you
-- had to retype the same number into the Marks calculator.
--
-- Nullable: plenty of deadlines are a lab record or a submission with no
-- marks attached, and those should stay as they are rather than being
-- forced to invent a denominator.

alter table deadlines
  add column if not exists max_marks numeric;
