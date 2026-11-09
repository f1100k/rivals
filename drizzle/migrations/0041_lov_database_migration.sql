create or replace function public.get_staff_ids() returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}'::uuid[]) from public.user_roles where role = 'admin'::app_role;
$$;
revoke execute on function public.get_staff_ids() from public;
revoke execute on function public.get_staff_ids() from anon;
grant execute on function public.get_staff_ids() to authenticated;
grant execute on function public.get_staff_ids() to service_role;