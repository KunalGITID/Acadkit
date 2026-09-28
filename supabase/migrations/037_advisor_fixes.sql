-- What Supabase's database advisors flagged on 28 Sep 2026.

-- owns_device() is SECURITY DEFINER and backs every owner policy. Those
-- policies are all `to authenticated`, so a signed-out caller never needs
-- it; revoke it from anon (and PUBLIC, which anon inherits from) so it
-- can't be called through /rest/v1/rpc/owns_device without signing in.
revoke execute on function public.owns_device(text) from public, anon;
grant execute on function public.owns_device(text) to authenticated, service_role;

-- auth.uid() inside a policy is re-evaluated per row; wrapped in a
-- sub-select it is evaluated once per statement. Same rules otherwise.
alter policy own_device_select on public.device_owners using (user_id = (select auth.uid()));
alter policy own_device_insert on public.device_owners with check (user_id = (select auth.uid()));
alter policy own_device_delete on public.device_owners using (user_id = (select auth.uid()));

-- Foreign keys without a covering index: deleting a subject scanned both
-- tables to cascade.
create index if not exists idx_deadlines_subject on public.deadlines(subject_id);
create index if not exists idx_timetable_slots_subject on public.timetable_slots(subject_id);
