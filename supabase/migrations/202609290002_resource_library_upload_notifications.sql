create table if not exists public.resource_bookmarks (
  resource_id text not null references public.papers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, user_id)
);

alter table public.resource_bookmarks enable row level security;
drop policy if exists "resource bookmarks owner read" on public.resource_bookmarks;
drop policy if exists "resource bookmarks owner insert" on public.resource_bookmarks;
drop policy if exists "resource bookmarks owner delete" on public.resource_bookmarks;
create policy "resource bookmarks owner read" on public.resource_bookmarks
  for select to authenticated using (user_id = auth.uid());
create policy "resource bookmarks owner insert" on public.resource_bookmarks
  for insert to authenticated with check (user_id = auth.uid());
create policy "resource bookmarks owner delete" on public.resource_bookmarks
  for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.resource_bookmarks to authenticated;

insert into public.resource_bookmarks(user_id, resource_id)
select saved.user_id, bookmark.resource_id
from public.user_state as saved
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(saved.payload #> '{user,bookmarks}') = 'array' then saved.payload #> '{user,bookmarks}'
    else '[]'::jsonb
  end
) as bookmark(resource_id)
join public.papers as resource on resource.id = bookmark.resource_id
on conflict (resource_id, user_id) do nothing;

create or replace function public.toggle_resource_bookmark(p_resource_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.papers where id = p_resource_id) then
    raise exception 'Resource not found';
  end if;
  delete from public.resource_bookmarks
    where resource_id = p_resource_id and user_id = auth.uid();
  if found then return false; end if;
  insert into public.resource_bookmarks(resource_id, user_id)
    values (p_resource_id, auth.uid());
  return true;
end;
$$;
grant execute on function public.toggle_resource_bookmark(text) to authenticated;

create or replace function public.notify_resource_upload_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource_type text;
  resource_title text;
begin
  resource_type := case when coalesce(new.data->>'resourceType', '') = 'note' then 'notes' else 'paper' end;
  resource_title := coalesce(nullif(new.data->>'subject', ''), nullif(new.data->>'code', ''), 'New ' || resource_type);
  insert into public.user_notifications(id, user_id, actor_id, kind, text, data)
  select
    'upload_' || new.id || '_' || recipient.id::text,
    recipient.id,
    new.uploader_id,
    'upload',
    'New ' || resource_type || ' uploaded: ' || resource_title,
    jsonb_build_object(
      'resourceId', new.id,
      'resourceType', resource_type,
      'actorId', new.uploader_id
    )
  from auth.users as recipient
  where recipient.id <> new.uploader_id
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists notify_users_after_resource_upload on public.papers;
create trigger notify_users_after_resource_upload
after insert on public.papers
for each row execute function public.notify_resource_upload_insert();
