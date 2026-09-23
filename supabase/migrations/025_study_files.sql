-- Study files: the Mac's ~/Documents/SRM_Sem3 folder, readable from any
-- device signed in to the same account.
--
-- Objects live in a private bucket under `<device_id>/...`:
--   <device_id>/manifest.json         the folder tree (paths, sizes, keys)
--   <device_id>/blobs/<sha256>.<ext>  file contents, named by hash
--
-- Content-addressed names mean a renamed or moved file is not uploaded
-- again, and no display path (spaces, brackets, non-ASCII) ever has to
-- survive Storage's key rules.
--
-- Only the sync script writes, with the service role key, which bypasses
-- RLS. The app only reads, so the one policy is a select policy, gated by
-- the same owns_device() check every table uses since migration 015.

insert into storage.buckets (id, name, public, file_size_limit)
values ('study-files', 'study-files', false, 52428800)  -- 50 MB, the free-plan cap
on conflict (id) do nothing;

drop policy if exists "study_files_owner_read" on storage.objects;
create policy "study_files_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-files'
    and owns_device((storage.foldername(name))[1])
  );
