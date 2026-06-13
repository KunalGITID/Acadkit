-- Web Push: device subscriptions + a dedupe log so the scheduler
-- doesn't send the same reminder twice.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz default now()
);
create index if not exists idx_push_device on push_subscriptions(device_id);

create table if not exists sent_notifications (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  kind text not null,      -- class | deadline | mark | low_attendance
  ref text not null,       -- stable key for the thing (e.g. slot id + date)
  sent_at timestamptz default now(),
  unique (device_id, kind, ref)
);

alter table push_subscriptions enable row level security;
alter table sent_notifications enable row level security;

drop policy if exists "anon_all_push_subscriptions" on push_subscriptions;
create policy "anon_all_push_subscriptions" on push_subscriptions
  for all to anon using (true) with check (true);

-- sent_notifications is written by the Edge Function (service role,
-- which bypasses RLS); no anon policy needed.
