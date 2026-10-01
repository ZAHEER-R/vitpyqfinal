create or replace function public.respond_friend_request(p_from_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_accept then
    update public.friend_requests
      set accepted=true
      where from_id=p_from_id and to_id=auth.uid() and accepted=false;
    if not found then raise exception 'Friend request not found or already accepted'; end if;
  else
    delete from public.friend_requests where from_id=p_from_id and to_id=auth.uid();
  end if;
end;
$$;
