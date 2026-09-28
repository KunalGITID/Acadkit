-- The study log (031) was removed from the app: the daily "how long did
-- you study?" check-in on Home, /study-log and its day sheet. This drops
-- its table; dropping it also takes it out of the realtime publication.

drop policy if exists "study_log_owner" on study_log;
drop table if exists study_log;
