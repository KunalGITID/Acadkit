-- Ownership for PIN namespaces. Safe to apply on its own: it adds a
-- table and changes no existing policy. The cutover is migration 015.
--
-- Today every table is scoped by `device_id` (the 4-digit PIN) and RLS
-- grants the anon role unrestricted access — `using (true)`. Scoping is
-- enforced only in client-side JavaScript, and the anon key ships in the
-- bundle, so anyone can walk all 10,000 PINs from a browser console and
-- read or overwrite any user's marks and attendance.
--
-- Rather than re-key 47 queries onto auth.uid(), this keeps device_id as
-- the partition key and makes RLS ask a different question: not "is this
-- row's device_id the one you claimed in JS?" but "do you actually own
-- this device_id?". The app's queries stay exactly as they are.

create table if not exists device_owners (
  device_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

create index if not exists idx_device_owners_user on device_owners(user_id);

alter table device_owners enable row level security;

-- You can only see your own claims.
drop policy if exists "own_device_select" on device_owners;
create policy "own_device_select" on device_owners
  for select to authenticated
  using (user_id = auth.uid());

-- You may claim a PIN for yourself. The primary key makes claiming an
-- already-owned PIN fail, so this is first-come-first-served on a free
-- namespace and cannot take one that's taken.
drop policy if exists "own_device_insert" on device_owners;
create policy "own_device_insert" on device_owners
  for insert to authenticated
  with check (user_id = auth.uid());

-- Releasing a PIN is allowed; reassigning one is not.
drop policy if exists "own_device_delete" on device_owners;
create policy "own_device_delete" on device_owners
  for delete to authenticated
  using (user_id = auth.uid());

/**
 * True when the signed-in user owns this PIN. Used by every table
 * policy in 015.
 *
 * SECURITY DEFINER with a pinned search_path so the lookup isn't itself
 * subject to RLS (which would recurse) and can't be redirected by a
 * caller-controlled search_path.
 */
create or replace function owns_device(device text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from device_owners
    where device_id = device and user_id = auth.uid()
  );
$$;

revoke all on function owns_device(text) from public;
grant execute on function owns_device(text) to authenticated;
