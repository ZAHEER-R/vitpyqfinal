create or replace function public.clear_my_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_notifications
  where user_id = auth.uid()
    and not (
      kind = 'info'
      and lower(text) like '%signed in%'
    );
$$;

grant execute on function public.clear_my_notifications() to authenticated;
