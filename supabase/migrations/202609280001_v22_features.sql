-- =============================================================================
-- VIT PYQ v22 — SAFE additive SQL for EXISTING Supabase database
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- 
-- This script:
--   ✓ Does NOT drop tables
--   ✓ Does NOT delete rows
--   ✓ Does NOT alter existing columns in a breaking way
--   ✓ Uses IF NOT EXISTS / CREATE OR REPLACE only
--   ✓ Safe to run more than once (idempotent)
-- =============================================================================

-- 1) Optional normalized ratings table (app also stores ratings in papers.data JSON)
create table if not exists public.paper_ratings (
  paper_id text not null references public.papers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (paper_id, user_id)
);

alter table public.paper_ratings enable row level security;

drop policy if exists "paper ratings readable" on public.paper_ratings;
create policy "paper ratings readable" on public.paper_ratings
  for select to anon, authenticated
  using (true);

drop policy if exists "paper ratings upsert own" on public.paper_ratings;
create policy "paper ratings upsert own" on public.paper_ratings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "paper ratings update own" on public.paper_ratings;
create policy "paper ratings update own" on public.paper_ratings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "paper ratings delete own" on public.paper_ratings;
create policy "paper ratings delete own" on public.paper_ratings
  for delete to authenticated
  using (user_id = auth.uid());

-- 2) Username change with 15-day cooldown (optional RPC; client also enforces)
create or replace function public.change_username(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text;
  last_change timestamptz;
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  cleaned := lower(regexp_replace(coalesce(p_username, ''), '[^a-z0-9_]', '', 'g'));
  cleaned := left(cleaned, 20);

  if length(cleaned) < 3 then
    raise exception 'Username too short';
  end if;

  select (payload->>'usernameChangedAt')::timestamptz
    into last_change
  from public.user_state
  where user_id = auth.uid();

  if last_change is not null and last_change > now() - interval '15 days' then
    raise exception 'Username can only be changed once every 15 days';
  end if;

  if exists (
    select 1 from public.profiles
    where username = cleaned and id <> auth.uid()
  ) then
    raise exception 'Username taken';
  end if;

  update public.profiles
  set username = cleaned, updated_at = now()
  where id = auth.uid()
  returning * into result;

  insert into public.user_state (user_id, payload)
  values (auth.uid(), jsonb_build_object('usernameChangedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  on conflict (user_id) do update
    set payload = public.user_state.payload || jsonb_build_object(
      'usernameChangedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

  return result;
end;
$$;

grant execute on function public.change_username(text) to authenticated;

-- 3) Ensure verified defaults to false for any profile that somehow lacks the flag
--    (no mass unlock — only fills NULL if column ever nullable; column is NOT NULL already)
--    Safe no-op if already correct:
update public.profiles
set verified = false
where verified is null;

-- 4) Optional: rate paper via RPC (client can also write into papers.data)
create or replace function public.rate_paper(p_paper_id text, p_stars smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be 1–5';
  end if;
  if not exists (select 1 from public.papers where id = p_paper_id) then
    raise exception 'Paper not found';
  end if;

  insert into public.paper_ratings (paper_id, user_id, stars)
  values (p_paper_id, auth.uid(), p_stars)
  on conflict (paper_id, user_id) do update
    set stars = excluded.stars, created_at = now();
end;
$$;

grant execute on function public.rate_paper(text, smallint) to authenticated;

-- Done. Existing tables, RLS, auth, storage, and data are unchanged.
