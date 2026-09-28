-- Remove the Compare feature's storage (migration 019).
--
-- The Compare page was taken out of the app, and nothing has written or
-- read these since. Left in place, get_shared_card stays a SECURITY
-- DEFINER function any signed-in user can call, and whatever codes were
-- ever shared keep serving their frozen attendance until they expire —
-- surface with no feature behind it.
--
-- Safe to run whether or not 019 was applied.

drop function if exists public.get_shared_card(text);
drop table if exists public.shared_cards;
