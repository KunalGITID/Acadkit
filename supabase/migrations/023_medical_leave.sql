-- Medical leave, per subject.
--
-- SRM requires 75% attendance to sit the end-sem, but condones down to
-- 65% where medical leave is granted. That is per case rather than per
-- student — one subject can be on ML while the rest are held to the
-- usual bar — so it belongs on the subject, not on settings.
--
-- It matters most in exactly the situation nobody wants to be in. A
-- subject sitting below 75% with too few classes left to climb back is
-- reported as lost: the end-sem is off the table and every mark
-- projection under it is fiction. At 65% the same subject is often
-- still reachable by attending everything from here — which is a
-- completely different instruction, and the one worth acting on.
--
-- Nullable, defaulting to nothing, so every existing subject keeps the
-- 75% bar until told otherwise.

alter table subjects
  add column if not exists medical_leave boolean;
