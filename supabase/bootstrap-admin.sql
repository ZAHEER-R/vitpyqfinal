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

do $$
declare
  admin_user_id uuid;
begin
  perform set_config('app.allow_admin_promotion', 'on', true);

  select id
  into admin_user_id
  from auth.users
  where lower(email) = 'admin@vitstudent.ac.in'
    and email_confirmed_at is not null;

  if admin_user_id is null then
    raise exception 'Create and confirm admin@vitstudent.ac.in in Supabase Auth before running this script.';
  end if;

  insert into public.admin_members (user_id)
  values (admin_user_id)
  on conflict (user_id) do nothing;

  update public.profiles
  set is_admin = true, badge = 'ruby', verified = true
  where id = admin_user_id;

  if not found then
    raise exception 'Admin profile is missing. Run the Supabase migration after creating the Auth account, then retry.';
  end if;

  insert into public.user_inventory (user_id, item_id)
  select admin_user_id, item_id
  from unnest(array[
    'frame_rainbow','glow','dark_pack','title','neon_ring','star_pad','fire_frame','frost',
    'heart_pad','pulse','aurora_frame','glass_pad','crown','wave_glow','pixel_border',
    'sparkle','midnight','lightning'
  ]) as item_id
  on conflict (user_id, item_id) do nothing;
end;
$$;