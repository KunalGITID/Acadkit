-- What to expect of the end-sem.
--
-- The budget engine spreads a target evenly over everything still to
-- come, the end-sem included. That is the right default when you know
-- nothing about the exam, and the wrong question to ask at SRM, where
-- the end-sem papers are widely reckoned easy and generously marked.
-- Nobody is deciding how hard to try in December. They are deciding
-- what the internals have to carry, given the exam will probably go
-- fine.
--
-- Setting this hands the end-sem a fixed contribution — 80 means "assume
-- I take 80% of it" — and solves the remaining internal components
-- against whatever is left of the threshold. The bracket underneath
-- (banked / pace / ceiling) is untouched: it stays the true range, so an
-- optimistic assumption cannot flatter the forecast, only redistribute
-- the ask.
--
-- Nullable, and null means the old behaviour. It only applies while the
-- exam is ungraded; once the real mark is in, an assumption about it is
-- worth nothing.

alter table settings
  add column if not exists assumed_external_pct numeric;

alter table settings
  drop constraint if exists settings_assumed_external_pct_check;
alter table settings
  add constraint settings_assumed_external_pct_check
  check (assumed_external_pct is null or assumed_external_pct between 0 and 100);
