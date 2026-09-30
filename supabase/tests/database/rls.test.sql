-- Row-level security: one account can never read or change another's data.
--
-- Two accounts, A (PIN 1111) and B (PIN 2222), each get a row in every
-- table. Then, signed in as A, every table is asked for B's rows, and
-- every kind of write is aimed at B's data. Run with `supabase test db`
-- against a local stack built from supabase/migrations; it never touches
-- the hosted project. Everything happens in one transaction that is
-- rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(64);

-- ---------------------------------------------------------------------------
-- Seed, as the table owner (RLS does not apply)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@rls.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@rls.test');

insert into device_owners (device_id, user_id) values
  ('1111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('2222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into settings (device_id) select d from unnest(array['1111', '2222']) d;
insert into subjects (device_id, code, name, credits, type)
  select d, '21CSC202J', 'Operating Systems ' || d, 4, 'theory' from unnest(array['1111', '2222']) d;
insert into timetable_slots (device_id, day_order, start_time, end_time)
  select d, 1, '08:00', '08:50' from unnest(array['1111', '2222']) d;
insert into attendance (device_id, date, start_time, end_time, status)
  select d, '2026-10-07', '08:00', '08:50', 'present' from unnest(array['1111', '2222']) d;
insert into marks (device_id, component_type, label, marks_obtained, max_marks)
  select d, 'CT', 'CT-1 ' || d, 12, 15 from unnest(array['1111', '2222']) d;
insert into deadlines (device_id, title, type, due_date)
  select d, 'Lab record', 'lab', '2026-10-09' from unnest(array['1111', '2222']) d;
insert into semester_archives (device_id, label)
  select d, 'Semester 2' from unnest(array['1111', '2222']) d;
insert into portal_snapshots (device_id, subject_code, conducted, absent)
  select d, '21CSC202J', 40, 4 from unnest(array['1111', '2222']) d;
insert into portal_snapshot_history (device_id, subject_code, conducted, absent, as_of)
  select d, '21CSC202J', 40, 4, '2026-10-01' from unnest(array['1111', '2222']) d;
insert into push_subscriptions (device_id, endpoint, p256dh, auth)
  select d, 'https://push.test/' || d, 'key', 'secret' from unnest(array['1111', '2222']) d;
insert into error_log (device_id)
  select d from unnest(array['1111', '2222']) d;
insert into forecast_log (device_id, week_start, scope, model)
  select d, '2026-10-05', 'sgpa', 'v2' from unnest(array['1111', '2222']) d;
insert into sent_notifications (device_id, kind, ref)
  select d, 'quiz_due', '2026-10-07' from unnest(array['1111', '2222']) d;
insert into study_chunks (device_id, file_key, chunk_index, content, embedding)
  select d, d || '/blobs/1.pdf', 0, 'notes of ' || d, array_fill(0.1::real, array[384])::extensions.vector
  from unnest(array['1111', '2222']) d;
insert into study_file_deletions (device_id, path, key)
  select d, 'Operating_Systems/old.pdf', d || '/blobs/2.pdf' from unnest(array['1111', '2222']) d;
insert into study_uploads (device_id, path, key)
  select d, 'photo.jpg', d || '/inbox/photo.jpg' from unnest(array['1111', '2222']) d;
insert into suggestions (device_id, key, kind, payload)
  select d, 'deadline-1', 'deadline', '{}'::jsonb from unnest(array['1111', '2222']) d;
insert into syllabus_progress (device_id, course_code, unit, topic)
  select d, '21CSC202J', 1, 'Process states' from unnest(array['1111', '2222']) d;

insert into active_days (device_id, day)
  select d, '2026-10-07' from unnest(array['1111', '2222']) d;

insert into storage.buckets (id, name, public) values ('study-files', 'study-files', false)
  on conflict (id) do nothing;
insert into storage.objects (bucket_id, name)
  select 'study-files', d || '/manifest.json' from unnest(array['1111', '2222']) d;

-- ---------------------------------------------------------------------------
-- Structure: holds for tables added after these tests were written, too
-- ---------------------------------------------------------------------------

select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
  'every table in public has row-level security switched on'
);

select is_empty(
  $$select tablename || '.' || policyname from pg_policies
    where schemaname = 'public' and roles && array['anon', 'public']::name[]$$,
  'no policy in public grants anything to signed-out (anon) or public'
);

-- ---------------------------------------------------------------------------
-- Signed in as A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
-- Older auth.uid() reads this one instead.
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- A can read their own rows. Without this, "B's rows are invisible" could
-- pass only because the seed or the policy hides everything.
select isnt_empty(
  format('select 1 from public.%I where device_id = %L', t, '1111'),
  format('A can read their own %s', t)
)
from unnest(array[
  'settings', 'subjects', 'timetable_slots', 'attendance', 'marks', 'deadlines',
  'semester_archives', 'portal_snapshots', 'portal_snapshot_history',
  'push_subscriptions', 'forecast_log', 'study_chunks', 'study_file_deletions',
  'study_uploads', 'suggestions', 'syllabus_progress', 'device_owners'
]) t;

-- ...and none of B's, in any table.
select is_empty(
  format('select 1 from public.%I where device_id = %L', t, '2222'),
  format('A cannot read B''s %s', t)
)
from unnest(array[
  'settings', 'subjects', 'timetable_slots', 'attendance', 'marks', 'deadlines',
  'semester_archives', 'portal_snapshots', 'portal_snapshot_history',
  'push_subscriptions', 'error_log', 'forecast_log', 'sent_notifications',
  'study_chunks', 'study_file_deletions', 'study_uploads', 'suggestions',
  'syllabus_progress', 'device_owners', 'active_days'
]) t;

-- Activity is write-only from the app: not even your own days come back.
select is_empty(
  $$select 1 from active_days where device_id = '1111'$$,
  'A cannot read even their own active days'
);
select lives_ok(
  $$insert into active_days (device_id, day) values ('1111', '2026-10-08')$$,
  'A can record their own active day'
);
select throws_ok(
  $$insert into active_days (device_id, day) values ('2222', '2026-10-08')$$,
  '42501', null, 'A cannot record a day under B''s PIN'
);

-- Writing into B's PIN is refused outright.
select throws_ok(
  $$insert into marks (device_id, component_type, label, marks_obtained, max_marks)
    values ('2222', 'CT', 'planted', 15, 15)$$,
  '42501', null, 'A cannot add marks under B''s PIN'
);
select throws_ok(
  $$insert into attendance (device_id, date, start_time, end_time, status) values ('2222', '2026-10-08', '08:00', '08:50', 'absent')$$,
  '42501', null, 'A cannot mark attendance under B''s PIN'
);
select throws_ok(
  $$insert into subjects (device_id, code, name, credits, type)
    values ('2222', 'X', 'planted', 1, 'theory')$$,
  '42501', null, 'A cannot add a subject under B''s PIN'
);
select throws_ok(
  $$insert into study_uploads (device_id, path, key) values ('2222', 'x.jpg', '2222/inbox/x.jpg')$$,
  '42501', null, 'A cannot queue an upload into B''s folder'
);
select throws_ok(
  $$update marks set device_id = '2222' where device_id = '1111'$$,
  '42501', null, 'A cannot move their own marks into B''s PIN'
);

-- Updating or deleting B's rows matches nothing. The last section checks
-- they are all still there, unchanged.
update marks set marks_obtained = 0 where device_id = '2222';
update suggestions set status = 'dismissed' where device_id = '2222';
delete from attendance where device_id = '2222';
delete from device_owners where device_id = '2222';

-- The PIN itself.
select throws_ok(
  $$insert into device_owners (device_id, user_id)
    values ('2222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '23505', null, 'A cannot claim B''s PIN'
);
select throws_ok(
  $$insert into device_owners (device_id, user_id)
    values ('3333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  '42501', null, 'A cannot claim a PIN in B''s name'
);

-- Functions.
select ok(owns_device('1111'), 'owns_device: A owns 1111');
select ok(not owns_device('2222'), 'owns_device: A does not own 2222');
select is_empty(
  $$select * from match_study_chunks('2222', array_fill(0.1::real, array[384])::extensions.vector, 5)$$,
  'searching B''s notes returns nothing'
);

-- Storage: the study-files bucket.
select results_eq(
  $$select name from storage.objects where bucket_id = 'study-files' order by name$$,
  $$values ('1111/manifest.json'::text)$$,
  'A sees only their own study files'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('study-files', '2222/inbox/x.jpg')$$,
  '42501', null, 'A cannot upload into B''s inbox'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('study-files', '1111/blobs/x.pdf')$$,
  '42501', null, 'A cannot write outside their own inbox'
);

-- ---------------------------------------------------------------------------
-- Signed out
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
set local request.jwt.claim.sub to '';

select is_empty(format('select 1 from public.%I', t), format('signed out, %s is empty', t))
from unnest(array['settings', 'marks', 'attendance', 'device_owners']) t;

select throws_ok(
  $$insert into marks (device_id, component_type, label, marks_obtained, max_marks)
    values ('1111', 'CT', 'planted', 15, 15)$$,
  '42501', null, 'signed out, nothing can be written'
);

-- ---------------------------------------------------------------------------
-- Back as the owner: B's data survived everything above
-- ---------------------------------------------------------------------------

reset role;

select is((select marks_obtained from marks where device_id = '2222'), 12::numeric, 'B''s marks are unchanged');
select is((select status from suggestions where device_id = '2222'), 'pending', 'B''s suggestion is unchanged');
select is((select count(*) from attendance where device_id = '2222'), 1::bigint, 'B''s attendance was not deleted');
select is(
  (select user_id from device_owners where device_id = '2222'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'B still owns 2222'
);

select * from finish();
rollback;
