-- Weekly active users, without tracking anyone.
--
-- One row per account per day it was opened: the PIN, the date, whether it
-- ran as the installed app or in a browser tab, and the release. No times,
-- pages, IPs or device details. The app writes its own row once a day
-- (src/lib/activity.ts) and can never read any back; `npm run stats`
-- reads them with the service key.

create table if not exists active_days (
  device_id text not null,
  day date not null,
  installed boolean not null default false,
  release text,
  primary key (device_id, day)
);

alter table active_days enable row level security;

drop policy if exists "active_days_owner_insert" on active_days;
create policy "active_days_owner_insert" on active_days
  for insert to authenticated
  with check (owns_device(device_id));
