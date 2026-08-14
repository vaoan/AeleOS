-- 0008 — introspection, used by the trust tests.
--
-- These expose only the caller's own identity as the database sees it, which is
-- exactly what the Supabase⇄Clerk trust has to prove. `tests/idp/` calls them
-- against the real project in the `idp-cloud` job.
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
