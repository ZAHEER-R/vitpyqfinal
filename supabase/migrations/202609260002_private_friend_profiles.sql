create or replace function public.are_app_friends(first_user uuid, second_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friend_requests
    where accepted = true
      and ((from_id = first_user and to_id = second_user)
        or (from_id = second_user and to_id = first_user))
  );
$$;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to anon, authenticated using (true);

create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base_username text;
  desired_username text;
  desired_name text;
  suffix text;
  attempt integer := 1;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-z0-9_]', '', 'g'));
  base_username := trim(both '_' from base_username);
  if length(base_username) < 3 then base_username := 'student'; end if;
  base_username := left(base_username, 30);
  desired_username := base_username;
  while exists (select 1 from public.profiles where username = desired_username) loop
    attempt := attempt + 1;
    suffix := '_' || attempt::text;
    desired_username := left(base_username, 30 - length(suffix)) || suffix;
  end loop;
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
