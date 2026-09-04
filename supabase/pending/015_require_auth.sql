-- THE CUTOVER. Apply only after 014 is in, you have signed in at least
-- once, and device_owners holds a row for your PIN. Running this first
-- locks you out of your own data until you claim it.
--
-- Verify before running:
--   select * from device_owners;      -- must show your PIN + user_id
--
-- Every table drops its `using (true)` anon policy and gains one that
-- asks whether the signed-in user owns the row's device_id. The app's
-- queries are unchanged — they still filter on device_id — but the
-- filter is now enforced by the database rather than trusted from the
-- client.
--
-- The service role bypasses RLS entirely, so the send-reminders edge
-- function keeps working untouched.

-- ---------- the six tables the app reads and writes ----------

do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'subjects', 'timetable_slots',
    'attendance', 'marks', 'deadlines',
    'semester_archives', 'portal_snapshots'
  ]
  loop
    -- Drop every anon-era policy on this table.
    execute format(
      'do $inner$ declare p record; begin
         for p in select policyname from pg_policies
                  where schemaname = ''public'' and tablename = %L
         loop execute format(''drop policy if exists %%I on %I'', p.policyname); end loop;
       end $inner$;', t, t);

    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy "owner_all_%s" on %I for all to authenticated
         using (owns_device(device_id))
         with check (owns_device(device_id))', t, t);
  end loop;
end $$;

-- ---------- push subscriptions ----------
-- Written by the client, read by the edge function under the service
-- role (which bypasses RLS), so owner-scoping the client side is enough.

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'push_subscriptions'
  loop execute format('drop policy if exists %I on push_subscriptions', p.policyname); end loop;
end $$;

create policy "owner_all_push_subscriptions" on push_subscriptions
  for all to authenticated
  using (owns_device(device_id))
  with check (owns_device(device_id));

-- ---------- error log ----------
-- Write-only from the client: you may file a crash report, you may not
-- read anyone's. Migration 009 is optional and may never have been
-- applied (the ErrorBoundary degrades gracefully without it), so this
-- whole block is conditional rather than assuming the table exists.

do $$
declare p record;
begin
  if to_regclass('public.error_log') is null then
    raise notice 'error_log absent (migration 009 not applied) — skipping';
    return;
  end if;

  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'error_log'
  loop execute format('drop policy if exists %I on error_log', p.policyname); end loop;

  execute 'create policy "insert_own_error_log" on error_log
             for insert to authenticated with check (true)';
end $$;

-- ---------- sanity ----------
-- After this runs, nothing is readable by the anon role. A signed-out
-- client gets empty results rather than everyone's data.
