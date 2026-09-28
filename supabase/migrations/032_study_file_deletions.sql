-- Deleting study files from the app.
--
-- The Files page is a read-only mirror of ~/Documents/SRM_Sem3 on the Mac
-- (migration 025): only the sync script writes the bucket. So the app
-- can't delete a file itself; it leaves a request here, and the Mac acts
-- on it (scripts/apply-study-deletions.mjs, run before every sync).
--
-- The Mac moves the file to its Trash, never deletes it outright, and only
-- if the file still has the content the app saw (`key` is the content
-- hash's storage key). A file edited on the Mac after you tapped delete is
-- left alone and the request is marked 'skipped' with a note saying why.
--
-- The app may add a request and take back one that is still pending;
-- only the service role (the Mac) marks one done or skipped.

create table if not exists study_file_deletions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  path text not null,
  key text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  note text,
  requested_at timestamptz not null default now(),
  done_at timestamptz
);

-- One open request per file.
create unique index if not exists idx_study_file_deletions_pending
  on study_file_deletions(device_id, path) where status = 'pending';

alter table study_file_deletions enable row level security;

drop policy if exists "study_file_deletions_owner_read" on study_file_deletions;
create policy "study_file_deletions_owner_read" on study_file_deletions
  for select to authenticated
  using (owns_device(device_id));

drop policy if exists "study_file_deletions_owner_request" on study_file_deletions;
create policy "study_file_deletions_owner_request" on study_file_deletions
  for insert to authenticated
  with check (owns_device(device_id) and status = 'pending' and done_at is null);

drop policy if exists "study_file_deletions_owner_undo" on study_file_deletions;
create policy "study_file_deletions_owner_undo" on study_file_deletions
  for delete to authenticated
  using (owns_device(device_id) and status = 'pending');
