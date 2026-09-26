-- Search the study folder by meaning.
--
-- scripts/sync-study-folder.mjs reads the text out of every file (OCR for
-- scans and photos), cuts it into passages and stores each one here with
-- a 384-dimension embedding from gte-small — Supabase's built-in model,
-- run by the study-search edge function. The same model embeds your
-- query, and this table returns the nearest passages.
--
-- Free-tier sized: a semester of notes is a few thousand passages at
-- about 1.5 KB of vector each.

create extension if not exists vector with schema extensions;

create table if not exists study_chunks (
  id bigint generated always as identity primary key,
  device_id text not null,
  -- The blob's storage key (content hash), so a renamed or moved file
  -- keeps its passages; the manifest maps keys to paths.
  file_key text not null,
  chunk_index int not null,
  -- PDF page or slide number, 1-based; null for plain text.
  page int,
  content text not null,
  embedding extensions.vector(384) not null,
  model text not null default 'gte-small',
  unique (device_id, file_key, chunk_index)
);

create index if not exists idx_study_chunks_file on study_chunks(device_id, file_key);
create index if not exists idx_study_chunks_embedding
  on study_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table study_chunks enable row level security;

-- The app only reads. Writes come from the sync script (service role).
drop policy if exists "study_chunks_owner_select" on study_chunks;
create policy "study_chunks_owner_select" on study_chunks
  for select to authenticated using (owns_device(device_id));

-- Nearest passages to a query embedding. SECURITY INVOKER, so the
-- select policy above applies: asking for another PIN's passages
-- returns nothing.
create or replace function match_study_chunks(
  p_device text,
  query_embedding extensions.vector(384),
  match_count int default 12
)
returns table (file_key text, chunk_index int, page int, content text, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.file_key, c.chunk_index, c.page, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from study_chunks c
  where c.device_id = p_device
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;

revoke all on function match_study_chunks(text, extensions.vector, int) from public;
grant execute on function match_study_chunks(text, extensions.vector, int) to authenticated;
