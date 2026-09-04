-- Comparing attendance with a friend, without handing over an account.
--
-- This is the only feature in AcadKit that shows one person's data to
-- another, so the shape is chosen to make over-sharing hard rather than
-- to make the feature easy.
--
-- **A snapshot, not a link.** The row stores the numbers as they were
-- when you pressed share. A live join would keep exposing the account
-- for as long as the code existed — every future absence, every slipped
-- subject — and nobody re-reads a permission they granted in September.
-- What you shared is what they see, forever, and it goes stale visibly.
--
-- **Attendance only.** Percentages and subject names. No marks, no SGPA,
-- no dates, no per-class records, no email. A friend comparing bunk
-- budgets does not need your grades, and the cheapest way to guarantee
-- that is for the grades never to enter the row.
--
-- **Unguessable, and short-lived.** The code is 10 random base32-ish
-- characters, not a 4-digit PIN — that mistake is what migration 015
-- exists to fix. Codes expire on their own so an abandoned share stops
-- working without anyone remembering to revoke it.

create table if not exists public.shared_cards (
  code text primary key,
  device_id text not null,
  owner_id uuid not null default auth.uid(),
  -- The frozen numbers. See src/lib/compare.ts for the shape.
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked boolean not null default false
);

create index if not exists shared_cards_device_idx on public.shared_cards (device_id);

alter table public.shared_cards enable row level security;

-- Owners manage their own shares. Note what is absent: there is no
-- policy letting anyone select someone else's row. That is deliberate —
-- a policy permissive enough to allow "select where code = $1" is also
-- permissive enough to allow "select *", and RLS cannot require a
-- caller to filter. Reading someone else's card goes through the
-- function below instead, which takes the code as an argument.
drop policy if exists "own shares" on public.shared_cards;
create policy "own shares" on public.shared_cards
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- The only way to read a card you do not own: present its code.
--
-- SECURITY DEFINER so it can see past RLS, with the lookup pinned to an
-- exact code match. It returns the payload alone — never the device_id
-- or owner_id, which would turn a shared card into a way to learn who
-- someone is.
create or replace function public.get_shared_card(p_code text)
returns table (payload jsonb, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.payload, s.created_at
  from public.shared_cards s
  where s.code = p_code
    and s.revoked = false
    and s.expires_at > now();
$$;

revoke all on function public.get_shared_card(text) from public;
grant execute on function public.get_shared_card(text) to authenticated;
