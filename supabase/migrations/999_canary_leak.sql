-- TEMPORARY canary: proves the RLS tests catch a leak. Removed before merge.
create policy "canary_leak" on marks for select to authenticated using (true);
