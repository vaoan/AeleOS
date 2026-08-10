-- Phase 0 validation helpers. They expose only the caller's own identity as
-- the database sees it, which is exactly what has to be proven.
create or replace function public.whoami_sub()
returns text
language sql
stable
set search_path = public
as $$
  select auth.jwt() ->> 'sub'
$$;

create or replace function public.whoami_role()
returns text
language sql
stable
set search_path = public
as $$
  select current_user::text
$$;

revoke all on function public.whoami_sub() from public;
revoke all on function public.whoami_role() from public;
grant execute on function public.whoami_sub() to authenticated;
grant execute on function public.whoami_role() to authenticated;
