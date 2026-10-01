-- VIT PYQ new-features schema
-- Safe to run in Supabase SQL editor.
-- This script is additive: it adds a profile field and creates feature tables and indexes.
-- Existing tables and data remain intact.

create extension if not exists pgcrypto;

-- Store each student's selected campus without changing existing profile rows.
alter table public.profiles add column if not exists campus text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_campus_allowed'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_campus_allowed
      check (campus is null or campus in ('Amaravati', 'Vellore', 'Chennai', 'Bhopal', 'Bangalore'));
  end if;
end;
$$;

create index if not exists profiles_campus_idx on public.profiles(campus);

create table if not exists public.study_resources (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null default 'paper' check (resource_type in ('paper', 'note')),
  subject text not null,
  course_code text,
  year text not null,
  semester text not null,
  campus text not null default 'Vellore',
  exam_type text,
  slot text,
  file_name text,
  file_url text,
  file_data text,
  likes integer not null default 0,
  views integer not null default 0,
  downloads integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_resources_type_idx on public.study_resources(resource_type, created_at desc);
create index if not exists study_resources_uploader_idx on public.study_resources(uploader_id, created_at desc);
create index if not exists study_resources_search_idx on public.study_resources(subject, course_code, campus, semester, year);

alter table public.study_resources enable row level security;

drop policy if exists "study_resources_public_read" on public.study_resources;
drop policy if exists "study_resources_owner_insert" on public.study_resources;
drop policy if exists "study_resources_owner_update" on public.study_resources;

drop policy if exists "study_resources_admin_manage" on public.study_resources;

create policy "study_resources_public_read" on public.study_resources
  for select to authenticated, anon using (true);

create policy "study_resources_owner_insert" on public.study_resources
  for insert to authenticated with check (uploader_id = auth.uid());

create policy "study_resources_owner_update" on public.study_resources
  for update to authenticated using (uploader_id = auth.uid()) with check (uploader_id = auth.uid());

create policy "study_resources_admin_manage" on public.study_resources
  for delete to authenticated using (exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ));

grant select on public.study_resources to anon, authenticated;
grant insert, update, delete on public.study_resources to authenticated;

create table if not exists public.user_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, resource_id)
);

alter table public.user_bookmarks
  alter column resource_id type text using resource_id::text;

create index if not exists user_bookmarks_resource_idx on public.user_bookmarks(resource_id, user_id);
alter table public.user_bookmarks enable row level security;

drop policy if exists "user_bookmarks_user_manage" on public.user_bookmarks;
create policy "user_bookmarks_user_manage" on public.user_bookmarks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_bookmarks to authenticated;

create table if not exists public.user_timetables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timetable_name text not null default 'My VIT timetable',
  payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, timetable_name)
);

create index if not exists user_timetables_user_idx on public.user_timetables(user_id, updated_at desc);
alter table public.user_timetables enable row level security;

drop policy if exists "user_timetables_user_manage" on public.user_timetables;
create policy "user_timetables_user_manage" on public.user_timetables
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_timetables to authenticated;

create table if not exists public.user_note_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, resource_id)
);

alter table public.user_note_likes
  alter column resource_id type text using resource_id::text;

create index if not exists user_note_likes_resource_idx on public.user_note_likes(resource_id, user_id);
alter table public.user_note_likes enable row level security;

drop policy if exists "user_note_likes_user_manage" on public.user_note_likes;
create policy "user_note_likes_user_manage" on public.user_note_likes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_note_likes to authenticated;

create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_updates_active_idx on public.app_updates(is_active, created_at desc);
alter table public.app_updates enable row level security;

drop policy if exists "app_updates_public_read" on public.app_updates;
drop policy if exists "app_updates_admin_manage" on public.app_updates;

create policy "app_updates_public_read" on public.app_updates
  for select to anon, authenticated using (is_active = true);

create policy "app_updates_admin_manage" on public.app_updates
  for all to authenticated using (exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  )) with check (exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ));

grant select on public.app_updates to anon, authenticated;
grant insert, update, delete on public.app_updates to authenticated;

-- Award notes and papers once, when their resource row is first inserted.
create or replace function public.pay_paper_upload_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.allow_profile_economy', 'on', true);
  if coalesce(new.data->>'resourceType', 'paper') = 'note' then
    update public.profiles set vcash = vcash + 2000 where id = new.uploader_id;
    insert into public.wallet_transactions(user_id, amount, reason, metadata)
      values (new.uploader_id, 2000, 'study notes upload', jsonb_build_object('paper_id', new.id, 'resource_type', 'note'));
  else
    update public.profiles set uploads = uploads + 1, vcash = vcash + 1000 where id = new.uploader_id;
    insert into public.wallet_transactions(user_id, amount, reason, metadata)
      values (new.uploader_id, 1000, 'paper upload', jsonb_build_object('paper_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists paper_upload_reward on public.papers;
create trigger paper_upload_reward after insert on public.papers
for each row execute function public.pay_paper_upload_reward();

create or replace function public.touch_new_feature_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_resources_touch_updated_at on public.study_resources;
create trigger study_resources_touch_updated_at
before update on public.study_resources
for each row execute function public.touch_new_feature_updated_at();

drop trigger if exists user_timetables_touch_updated_at on public.user_timetables;
create trigger user_timetables_touch_updated_at
before update on public.user_timetables
for each row execute function public.touch_new_feature_updated_at();

drop trigger if exists app_updates_touch_updated_at on public.app_updates;
create trigger app_updates_touch_updated_at
before update on public.app_updates
for each row execute function public.touch_new_feature_updated_at();

-- Optional seed example:
-- insert into public.app_updates (title, body) values
-- ('Semester prep tips', 'Keep your notes and timetable synced before exams.');
