

-- 5) Chat, notifications, friend restore, inventory, username persistence, and announcements.
-- This mirrors supabase/migrations/202609280002_chat_store_notifications.sql.

create table if not exists public.user_notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null default 'info',
  text text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists user_notifications_inbox_idx on public.user_notifications(user_id, created_at desc);
alter table public.user_notifications enable row level security;
drop policy if exists "notifications owner read" on public.user_notifications;
drop policy if exists "notifications owner update" on public.user_notifications;
drop policy if exists "notifications owner delete" on public.user_notifications;
create policy "notifications owner read" on public.user_notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications owner update" on public.user_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications owner delete" on public.user_notifications for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.user_notifications to authenticated;
revoke update on public.user_notifications from authenticated;
grant update (read_at) on public.user_notifications to authenticated;

create table if not exists public.user_push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, fcm_token)
);
alter table public.user_push_tokens enable row level security;
drop policy if exists "push tokens owner manage" on public.user_push_tokens;
create policy "push tokens owner manage" on public.user_push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select,insert,update,delete on public.user_push_tokens to authenticated;

create or replace function public.create_user_notification(p_user_id uuid, p_id text, p_kind text, p_text text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.uid() <> p_user_id and not public.is_app_admin()
    and not exists (select 1 from public.private_messages where (sender_id=auth.uid() and recipient_id=p_user_id) or (sender_id=p_user_id and recipient_id=auth.uid()))
    and not exists (select 1 from public.friend_requests where (from_id=auth.uid() and to_id=p_user_id) or (from_id=p_user_id and to_id=auth.uid()))) then
    raise exception 'Not authorized';
  end if;
  insert into public.user_notifications(id,user_id,actor_id,kind,text,data)
  values(p_id,p_user_id,auth.uid(),coalesce(nullif(p_kind,''),'info'),p_text,coalesce(p_data,'{}'::jsonb))
  on conflict(id) do nothing;
end;
$$;
grant execute on function public.create_user_notification(uuid,text,text,text,jsonb) to authenticated;

create or replace function public.clear_my_notifications()
returns void language sql security definer set search_path = '' as $$
  delete from public.user_notifications where user_id=auth.uid();
$$;
grant execute on function public.clear_my_notifications() to authenticated;

alter table public.private_messages add column if not exists read_at timestamptz;
drop policy if exists "private chat owner delete" on public.private_messages;
drop policy if exists "private chat recipient mark read" on public.private_messages;
create policy "private chat owner delete" on public.private_messages for delete to authenticated using (sender_id=auth.uid() or public.is_app_admin());
create policy "private chat recipient mark read" on public.private_messages for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
revoke update on public.private_messages from authenticated;
grant update (read_at) on public.private_messages to authenticated;

create or replace function public.clear_private_chat(p_other_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_other_id=auth.uid() then raise exception 'Invalid chat'; end if;
  if not public.is_app_admin() and not public.are_app_friends(auth.uid(),p_other_id)
    and not exists (select 1 from public.private_messages where (sender_id=auth.uid() and recipient_id=p_other_id) or (sender_id=p_other_id and recipient_id=auth.uid())) then
    raise exception 'Chat not found';
  end if;
  delete from public.private_messages where (sender_id=auth.uid() and recipient_id=p_other_id) or (sender_id=p_other_id and recipient_id=auth.uid());
  delete from public.user_notifications where kind='chat' and ((user_id=auth.uid() and actor_id=p_other_id) or (user_id=p_other_id and actor_id=auth.uid()));
end;
$$;
grant execute on function public.clear_private_chat(uuid) to authenticated;

drop policy if exists "chat owner delete" on public.global_messages;
create policy "chat owner delete" on public.global_messages for delete to authenticated using (user_id=auth.uid() or public.is_app_admin());

create or replace function public.record_purchased_badge()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reason='purchase' and new.metadata->>'kind'='badge' then
    insert into public.user_inventory(user_id,item_id) values(new.user_id,'badge_' || (new.metadata->>'item')) on conflict(user_id,item_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists purchased_badge_inventory on public.wallet_transactions;
create trigger purchased_badge_inventory after insert on public.wallet_transactions for each row execute function public.record_purchased_badge();
insert into public.user_inventory(user_id,item_id)
select user_id,'badge_' || (metadata->>'item') from public.wallet_transactions
where reason='purchase' and metadata->>'kind'='badge' on conflict(user_id,item_id) do nothing;

create or replace function public.change_username(p_username text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare cleaned text; last_change timestamptz; result public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  cleaned := left(lower(regexp_replace(coalesce(p_username,''),'[^a-z0-9_]','','g')),20);
  if length(cleaned)<3 then raise exception 'Username must be 3-20 characters'; end if;
  select coalesce((payload->'user'->>'usernameChangedAt')::timestamptz,(payload->>'usernameChangedAt')::timestamptz)
    into last_change from public.user_state where user_id=auth.uid();
  if last_change is not null and last_change>now()-interval '15 days' then raise exception 'Username can only be changed once every 15 days'; end if;
  update public.profiles set username=cleaned,updated_at=now() where id=auth.uid() returning * into result;
  if result.id is null then raise exception 'Profile not found'; end if;
  insert into public.user_state(user_id,payload) values(auth.uid(),jsonb_build_object('user',jsonb_build_object('usernameChangedAt',now())))
  on conflict(user_id) do update set payload=jsonb_set(coalesce(public.user_state.payload,'{}'::jsonb),'{user}',
    coalesce(public.user_state.payload->'user','{}'::jsonb) || jsonb_build_object('usernameChangedAt',now()),true),updated_at=now();
  return result;
end;
$$;
grant execute on function public.change_username(text) to authenticated;

insert into public.friend_requests(from_id,to_id,accepted)
select distinct legacy.from_id,legacy.to_id,true from (
  select state.user_id as from_id,
    case when friend_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then friend_id::uuid end as to_id
  from public.user_state as state
  cross join lateral jsonb_array_elements_text(coalesce(state.payload->'user'->'friends','[]'::jsonb)) as friends(friend_id)
) as legacy
where legacy.to_id is not null and legacy.from_id<>legacy.to_id and exists(select 1 from public.profiles where id=legacy.to_id)
on conflict(from_id,to_id) do nothing;

create or replace function public.request_friend(p_to_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_to_id=auth.uid() then raise exception 'Invalid friend request'; end if;
  if exists (select 1 from public.friend_requests where accepted=true
    and ((from_id=auth.uid() and to_id=p_to_id) or (from_id=p_to_id and to_id=auth.uid()))) then
    raise exception 'Already friends';
  end if;
  insert into public.friend_requests(from_id,to_id) values(auth.uid(),p_to_id)
  on conflict(from_id,to_id) do update set accepted=false,created_at=now()
  where public.friend_requests.accepted=false;
end;
$$;
grant execute on function public.request_friend(uuid) to authenticated;

create table if not exists public.announcements (
  id text primary key, title text not null, body text not null,
  author_id uuid not null references auth.users(id), active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "announcements public read" on public.announcements;
drop policy if exists "announcements admin manage" on public.announcements;
create policy "announcements public read" on public.announcements for select to anon,authenticated using (active or public.is_app_admin());
create policy "announcements admin manage" on public.announcements for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
grant select on public.announcements to anon,authenticated;
grant insert,update,delete on public.announcements to authenticated;

-- Existing tables and data are retained. Clear/disappear actions delete only the explicitly selected conversation.
