-- Optional crash log written by the client ErrorBoundary. Safe to skip;
-- the app degrades gracefully if this table is absent.
create table if not exists error_log (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  message text,
  stack text,
  component_stack text,
  url text,
  user_agent text,
  created_at timestamptz default now()
);

alter table error_log enable row level security;
drop policy if exists "anon_insert_error_log" on error_log;
create policy "anon_insert_error_log" on error_log for insert to anon with check (true);
