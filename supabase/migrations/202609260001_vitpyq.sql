create extension if not exists pgcrypto;

create table if not exists public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_members where user_id = auth.uid());
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  branch text not null default 'VIT',
  avatar_url text not null default '',
  badge text not null default 'bronze',
  is_public boolean not null default true,
  verified boolean not null default false,
  is_admin boolean not null default false,
  terminated boolean not null default false,
  vcash integer not null default 30000 check (vcash >= 0),
  uploads integer not null default 0 check (uploads >= 0),
  downloads integer not null default 0 check (downloads >= 0),
  visits integer not null default 0 check (visits >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_app_admin() then
    return new;
  end if;
  if current_setting('app.allow_admin_promotion', true) = 'on' and tg_op = 'UPDATE' then
    new.terminated := old.terminated;
    new.vcash := old.vcash;
    new.uploads := old.uploads;
    new.downloads := old.downloads;
    new.visits := old.visits;
    return new;
  end if;
  if current_setting('app.allow_profile_economy', true) = 'on' then
    new.is_admin := old.is_admin;
    new.terminated := old.terminated;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.terminated := false;
    new.vcash := 30000;
    new.uploads := 0;
    new.downloads := 0;
    new.visits := 1;
    new.verified := false;
  else
    new.is_admin := old.is_admin;
    new.terminated := old.terminated;
    new.vcash := old.vcash;
    new.uploads := old.uploads;
    new.downloads := old.downloads;
    new.visits := old.visits;
    new.verified := old.verified;
    new.badge := old.badge;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before insert or update on public.profiles
for each row execute function public.protect_profile_fields();

create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  desired_username text;
  desired_name text;
begin
  desired_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-z0-9_]', '', 'g'));
  if length(desired_username) < 3 then desired_username := 'student'; end if;
  desired_username := left(desired_username, 18) || '_' || left(replace(new.id::text,'-',''),6);
  desired_name := coalesce(nullif(new.raw_user_meta_data->>'displayName',''), nullif(trim(concat_ws(' ',new.raw_user_meta_data->>'firstName',new.raw_user_meta_data->>'lastName')),''), desired_username);
  insert into public.profiles(id,username,display_name,branch)
    values(new.id,desired_username,desired_name,coalesce(nullif(new.raw_user_meta_data->>'branch',''),'VIT'))
    on conflict(id) do nothing;
  insert into public.user_state(user_id,payload) values(new.id,'{}'::jsonb) on conflict(user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists create_profile_after_auth_signup on auth.users;
create trigger create_profile_after_auth_signup after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.papers (
  id text primary key,
  uploader_id uuid not null references auth.users(id),
  data jsonb not null default '{}'::jsonb,
  file_path text,
  created_at timestamptz not null default now()
);
create index if not exists papers_created_at_idx on public.papers (created_at desc);

create or replace function public.protect_paper_metrics()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.allow_paper_metrics', true) is distinct from 'on' and not public.is_app_admin() then
    if tg_op = 'INSERT' then
      new.data := jsonb_set(new.data, '{views}', '0'::jsonb, true);
      new.data := jsonb_set(new.data, '{downloads}', '0'::jsonb, true);
    else
    new.data := jsonb_set(new.data, '{views}', coalesce(old.data->'views','0'::jsonb), true);
    new.data := jsonb_set(new.data, '{downloads}', coalesce(old.data->'downloads','0'::jsonb), true);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_paper_metrics on public.papers;
create trigger protect_paper_metrics before update on public.papers
for each row execute function public.protect_paper_metrics();

create table if not exists public.paper_likes (
  paper_id text not null references public.papers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (paper_id, user_id)
);

create table if not exists public.paper_events (
  id bigint generated always as identity primary key,
  paper_id text not null references public.papers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('view','download')),
  created_at timestamptz not null default now()
);

create table if not exists public.global_messages (
  id text primary key,
  user_id uuid not null references auth.users(id),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists global_messages_created_at_idx on public.global_messages (created_at desc);

create or replace function public.mark_admin_chat_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.data := jsonb_set(new.data,'{isAdmin}',to_jsonb(public.is_app_admin()),true);
  new.data := jsonb_set(new.data,'{pinned}',to_jsonb(public.is_app_admin()),true);
  return new;
end;
$$;
drop trigger if exists mark_global_admin_message on public.global_messages;
create trigger mark_global_admin_message before insert or update on public.global_messages
for each row execute function public.mark_admin_chat_message();

create table if not exists public.private_messages (
  id text primary key,
  sender_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists private_messages_participants_idx on public.private_messages (sender_id, recipient_id, created_at);
drop trigger if exists mark_private_admin_message on public.private_messages;
create trigger mark_private_admin_message before insert or update on public.private_messages
for each row execute function public.mark_admin_chat_message();

create table if not exists public.friend_requests (
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (from_id,to_id),
  check (from_id <> to_id)
);

create table if not exists public.feedbacks (
  id text primary key,
  user_id uuid not null references auth.users(id),
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id text primary key,
  user_id uuid not null references auth.users(id),
  data jsonb not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.highlights (
  id text primary key,
  user_id uuid not null references auth.users(id),
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  amount integer not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id,item_id)
);

alter table public.admin_members enable row level security;
alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.papers enable row level security;
alter table public.paper_likes enable row level security;
alter table public.paper_events enable row level security;
alter table public.global_messages enable row level security;
alter table public.private_messages enable row level security;
alter table public.friend_requests enable row level security;
alter table public.feedbacks enable row level security;
alter table public.reports enable row level security;
alter table public.highlights enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.user_inventory enable row level security;

create policy "admin membership private" on public.admin_members for select to authenticated using (user_id = auth.uid());
create policy "profiles readable" on public.profiles for select to anon, authenticated using (is_public or id = auth.uid() or public.is_app_admin());
create policy "profile owner create" on public.profiles for insert to authenticated with check (id = auth.uid() or public.is_app_admin());
create policy "profile owner update" on public.profiles for update to authenticated using (id = auth.uid() or public.is_app_admin()) with check (id = auth.uid() or public.is_app_admin());
create policy "profile admin delete" on public.profiles for delete to authenticated using (public.is_app_admin());

create policy "state owner or admin read" on public.user_state for select to authenticated using (user_id = auth.uid() or public.is_app_admin());
create policy "state owner or admin write" on public.user_state for all to authenticated using (user_id = auth.uid() or public.is_app_admin()) with check (user_id = auth.uid() or public.is_app_admin());

create policy "papers public read" on public.papers for select to anon, authenticated using (true);
create policy "paper uploader create" on public.papers for insert to authenticated with check (uploader_id = auth.uid() or public.is_app_admin());
create policy "paper uploader update" on public.papers for update to authenticated using (uploader_id = auth.uid() or public.is_app_admin()) with check (uploader_id = auth.uid() or public.is_app_admin());
create policy "paper uploader delete" on public.papers for delete to authenticated using (uploader_id = auth.uid() or public.is_app_admin());

create policy "likes readable" on public.paper_likes for select to anon, authenticated using (true);
create policy "like owner add" on public.paper_likes for insert to authenticated with check (user_id = auth.uid());
create policy "like owner remove" on public.paper_likes for delete to authenticated using (user_id = auth.uid() or public.is_app_admin());
create policy "events insert" on public.paper_events for insert to authenticated with check (user_id = auth.uid());
create policy "events admin read" on public.paper_events for select to authenticated using (user_id = auth.uid() or public.is_app_admin());

create policy "chat readable" on public.global_messages for select to authenticated using (true);
create policy "chat send own" on public.global_messages for insert to authenticated with check (user_id = auth.uid());
create policy "chat admin delete" on public.global_messages for delete to authenticated using (public.is_app_admin());

create policy "private chat participants read" on public.private_messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_app_admin());
create policy "private chat send own" on public.private_messages for insert to authenticated with check (sender_id = auth.uid());
create policy "private chat admin delete" on public.private_messages for delete to authenticated using (public.is_app_admin());
create policy "friend request participants read" on public.friend_requests for select to authenticated using (from_id=auth.uid() or to_id=auth.uid() or public.is_app_admin());
create policy "friend request target or admin update" on public.friend_requests for update to authenticated using (to_id=auth.uid() or public.is_app_admin()) with check (to_id=auth.uid() or public.is_app_admin());
create policy "friend request participant delete" on public.friend_requests for delete to authenticated using (from_id=auth.uid() or to_id=auth.uid() or public.is_app_admin());

create or replace function public.request_friend(p_to_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_to_id=auth.uid() then raise exception 'Invalid friend request'; end if;
  insert into public.friend_requests(from_id,to_id) values(auth.uid(),p_to_id)
    on conflict(from_id,to_id) do update set accepted=false,created_at=now();
end;
$$;

create or replace function public.respond_friend_request(p_from_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_accept then
    update public.friend_requests set accepted=true where from_id=p_from_id and to_id=auth.uid();
    if not found then raise exception 'Friend request not found'; end if;
  else
    delete from public.friend_requests where from_id=p_from_id and to_id=auth.uid();
  end if;
end;
$$;

create policy "feedback public read" on public.feedbacks for select to anon, authenticated using (true);
create policy "feedback own insert" on public.feedbacks for insert to authenticated with check (user_id = auth.uid());
create policy "feedback owner or admin delete" on public.feedbacks for delete to authenticated using (user_id = auth.uid() or public.is_app_admin());

create policy "reports owner or admin read" on public.reports for select to authenticated using (user_id = auth.uid() or public.is_app_admin());
create policy "reports own insert" on public.reports for insert to authenticated with check (user_id = auth.uid());
create policy "reports admin update" on public.reports for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "reports admin delete" on public.reports for delete to authenticated using (public.is_app_admin());

create policy "highlights public read" on public.highlights for select to anon, authenticated using (true);
create policy "highlights admin manage" on public.highlights for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "wallet owner or admin read" on public.wallet_transactions for select to authenticated using (user_id = auth.uid() or public.is_app_admin());
create policy "inventory owner or admin read" on public.user_inventory for select to authenticated using (user_id = auth.uid() or public.is_app_admin());

create or replace function public.record_paper_event(p_paper_id text, p_event_type text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  field_name text;
begin
  if auth.uid() is null or p_event_type not in ('view','download') then raise exception 'Not authorized'; end if;
  perform set_config('app.allow_paper_metrics','on',true);
  perform set_config('app.allow_profile_economy','on',true);
  field_name := case when p_event_type = 'view' then 'views' else 'downloads' end;
  update public.papers set data = jsonb_set(data, array[field_name], to_jsonb(coalesce((data->>field_name)::integer,0)+1), true)
    where id = p_paper_id;
  if not found then raise exception 'Paper not found'; end if;
  insert into public.paper_events(paper_id,user_id,event_type) values (p_paper_id,auth.uid(),p_event_type);
  if p_event_type = 'download' then
    update public.profiles set downloads = downloads + 1 where id = auth.uid();
  end if;
end;
$$;

create or replace function public.toggle_paper_like(p_paper_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare did_like boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.paper_likes where paper_id=p_paper_id and user_id=auth.uid();
  if found then return false; end if;
  insert into public.paper_likes(paper_id,user_id) values (p_paper_id,auth.uid());
  return true;
end;
$$;

create or replace function public.purchase_store_item(p_item_id text, p_kind text)
returns integer language plpgsql security definer set search_path = '' as $$
declare cost integer; current_badge text; already_verified boolean; admin_user boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_kind = 'verified' then cost := 50000;
  elsif p_kind = 'badge' then
    cost := case p_item_id when 'silver' then 15000 when 'gold' then 30000 when 'platinum' then 35000 when 'diamond' then 45000 when 'ruby' then 55000 else null end;
  elsif p_kind = 'item' then
    cost := case p_item_id when 'frame_rainbow' then 8000 when 'glow' then 12000 when 'dark_pack' then 10000 when 'title' then 20000 when 'neon_ring' then 9500 when 'star_pad' then 7000 when 'fire_frame' then 14000 when 'frost' then 11000 when 'heart_pad' then 6500 when 'pulse' then 13000 when 'aurora_frame' then 16000 when 'glass_pad' then 8500 when 'crown' then 22000 when 'wave_glow' then 11500 when 'pixel_border' then 9000 when 'sparkle' then 10500 when 'midnight' then 12500 when 'lightning' then 15000 else null end;
  else raise exception 'Invalid purchase'; end if;
  if cost is null then raise exception 'Invalid item'; end if;
  admin_user := public.is_app_admin();
  if admin_user then
    if p_kind = 'badge' then
      select badge into current_badge from public.profiles where id=auth.uid() for update;
      if array_position(array['bronze','silver','gold','platinum','diamond','ruby'],p_item_id) > array_position(array['bronze','silver','gold','platinum','diamond','ruby'],current_badge) then
        update public.profiles set badge=p_item_id where id=auth.uid();
      end if;
    elsif p_kind = 'item' then
      insert into public.user_inventory(user_id,item_id) values(auth.uid(),p_item_id) on conflict do nothing;
    elsif p_kind = 'verified' then
      update public.profiles set verified=true where id=auth.uid();
    end if;
    insert into public.wallet_transactions(user_id,amount,reason,metadata) values (auth.uid(),0,'admin unlock',jsonb_build_object('item',p_item_id,'kind',p_kind));
    return 0;
  end if;
  perform set_config('app.allow_profile_economy','on',true);
  if p_kind = 'badge' then
    select badge into current_badge from public.profiles where id=auth.uid() for update;
    if array_position(array['bronze','silver','gold','platinum','diamond','ruby'],p_item_id) <= array_position(array['bronze','silver','gold','platinum','diamond','ruby'],current_badge) then raise exception 'Already owned'; end if;
  end if;
  if p_kind = 'item' and exists (select 1 from public.user_inventory where user_id=auth.uid() and item_id=p_item_id) then raise exception 'Already owned'; end if;
  if p_kind = 'verified' then
    select verified into already_verified from public.profiles where id=auth.uid() for update;
    if already_verified then raise exception 'Already verified'; end if;
  end if;
  update public.profiles set vcash=vcash-cost, badge=case when p_kind='badge' then p_item_id else badge end, verified=case when p_kind='verified' then true else verified end
    where id=auth.uid() and vcash >= cost;
  if not found then raise exception 'Insufficient ZX'; end if;
  insert into public.wallet_transactions(user_id,amount,reason,metadata) values (auth.uid(),-cost,'purchase',jsonb_build_object('item',p_item_id,'kind',p_kind));
  if p_kind = 'item' then insert into public.user_inventory(user_id,item_id) values(auth.uid(),p_item_id); end if;
  return cost;
end;
$$;

create or replace function public.admin_adjust_wallet(p_user_id uuid,p_amount integer,p_reason text default 'admin reward')
returns integer language plpgsql security definer set search_path = '' as $$
declare new_balance integer;
begin
  if not public.is_app_admin() then raise exception 'Admin only'; end if;
  perform set_config('app.allow_profile_economy','on',true);
  update public.profiles set vcash=greatest(0,vcash+p_amount) where id=p_user_id returning vcash into new_balance;
  if new_balance is null then raise exception 'User not found'; end if;
  insert into public.wallet_transactions(user_id,amount,reason) values (p_user_id,p_amount,p_reason);
  return new_balance;
end;
$$;

create or replace function public.pay_paper_upload_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.allow_profile_economy','on',true);
  update public.profiles set uploads=uploads+1,vcash=vcash+1000 where id=new.uploader_id;
  insert into public.wallet_transactions(user_id,amount,reason,metadata) values (new.uploader_id,1000,'paper upload',jsonb_build_object('paper_id',new.id));
  return new;
end;
$$;
drop trigger if exists paper_upload_reward on public.papers;
create trigger paper_upload_reward after insert on public.papers for each row execute function public.pay_paper_upload_reward();

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.papers, public.paper_likes, public.feedbacks, public.highlights to anon, authenticated;
grant insert, update, delete on public.profiles, public.user_state, public.papers, public.paper_likes, public.global_messages, public.private_messages, public.friend_requests, public.feedbacks, public.reports, public.highlights to authenticated;
grant select, insert, update, delete on public.user_state, public.global_messages, public.private_messages, public.friend_requests, public.reports, public.highlights, public.admin_members to authenticated;
grant select on public.paper_events, public.wallet_transactions, public.user_inventory to authenticated;
grant execute on function public.record_paper_event(text,text), public.toggle_paper_like(text), public.purchase_store_item(text,text), public.admin_adjust_wallet(uuid,integer,text), public.request_friend(uuid), public.respond_friend_request(uuid,boolean) to authenticated;

insert into storage.buckets (id,name,public) values ('users_data','users_data',true)
on conflict (id) do update set public=true;
create policy "public app assets read" on storage.objects for select to anon, authenticated using (bucket_id='users_data' and (storage.foldername(name))[1] in ('papers','avatars'));
create policy "user upload own assets" on storage.objects for insert to authenticated with check (
  bucket_id='users_data' and (
    ((storage.foldername(name))[1]='papers' and (storage.foldername(name))[2]=auth.uid()::text)
    or ((storage.foldername(name))[1]='avatars' and (storage.foldername(name))[2]=auth.uid()::text)
  )
);
create policy "user update own assets" on storage.objects for update to authenticated using (
  bucket_id='users_data' and ((storage.foldername(name))[2]=auth.uid()::text or public.is_app_admin())
) with check (bucket_id='users_data' and ((storage.foldername(name))[2]=auth.uid()::text or public.is_app_admin()));
create policy "user delete own assets" on storage.objects for delete to authenticated using (
  bucket_id='users_data' and ((storage.foldername(name))[2]=auth.uid()::text or public.is_app_admin())
);

-- After creating and confirming the admin account, run supabase/bootstrap-admin.sql.
