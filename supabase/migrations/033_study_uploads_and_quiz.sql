-- Two additions to the study area.
--
-- 1. Uploading from the app. The Files page is a mirror of the Mac's study
--    folder that only the Mac writes (025), so the app can't add a file to
--    it directly. It puts the bytes in the same bucket under
--    <device_id>/inbox/<uuid>/<name>, and a row here says which folder path
--    it should land at. The Mac saves it there before its next sync and
--    removes the inbox copy (scripts/apply-study-uploads.mjs).
--
-- 2. Self-test progress. Cards come from the "Test yourself" sections of the
--    study guides (<device_id>/quiz.json, written by the sync). This keeps
--    one row per card: its Leitner box and when it is next due.

create table if not exists study_uploads (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  path text not null,             -- where it should land, relative to the study folder
  key text not null,              -- the inbox object: <device_id>/inbox/<uuid>/<name>
  size bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  note text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  check (key like device_id || '/inbox/%')
);

create index if not exists idx_study_uploads_pending on study_uploads(device_id) where status = 'pending';

alter table study_uploads enable row level security;

drop policy if exists "study_uploads_owner_read" on study_uploads;
create policy "study_uploads_owner_read" on study_uploads
  for select to authenticated
  using (owns_device(device_id));

drop policy if exists "study_uploads_owner_add" on study_uploads;
create policy "study_uploads_owner_add" on study_uploads
  for insert to authenticated
  with check (owns_device(device_id) and status = 'pending' and done_at is null);

drop policy if exists "study_uploads_owner_cancel" on study_uploads;
create policy "study_uploads_owner_cancel" on study_uploads
  for delete to authenticated
  using (owns_device(device_id) and status = 'pending');

-- The app may write (and take back) objects in its own inbox, nowhere else
-- in the bucket. Reading is already allowed by 025's owner policy.
drop policy if exists "study_files_owner_inbox_write" on storage.objects;
create policy "study_files_owner_inbox_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-files'
    and (storage.foldername(name))[2] = 'inbox'
    and owns_device((storage.foldername(name))[1])
  );

drop policy if exists "study_files_owner_inbox_remove" on storage.objects;
create policy "study_files_owner_inbox_remove" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'study-files'
    and (storage.foldername(name))[2] = 'inbox'
    and owns_device((storage.foldername(name))[1])
  );

create table if not exists quiz_reviews (
  device_id text not null,
  card_id text not null,
  box smallint not null default 1 check (box between 1 and 5),
  due_on date not null,
  last_result text not null check (last_result in ('right', 'wrong')),
  reviews integer not null default 1,
  lapses integer not null default 0,
  reviewed_at timestamptz not null default now(),
  primary key (device_id, card_id)
);

alter table quiz_reviews enable row level security;

drop policy if exists "quiz_reviews_owner" on quiz_reviews;
create policy "quiz_reviews_owner" on quiz_reviews
  for all to authenticated
  using (owns_device(device_id))
  with check (owns_device(device_id));
