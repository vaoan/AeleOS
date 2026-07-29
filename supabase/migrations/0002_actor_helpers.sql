-- The caller's person actor_ref, derived from the trusted token.
create or replace function public.current_person_ref()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select actor_ref
  from public.actors
  where identity_sub = auth.jwt() ->> 'sub'
    and kind = 'person'
$$;

-- May the caller act as this local actor row?
create or replace function public.can_act_as(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.actors a
    where a.id = target
      and a.status = 'active'
      and (
        a.identity_sub = auth.jwt() ->> 'sub'
        or a.owner_ref = public.current_person_ref()
      )
  )
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default. These are
-- `security definer`, so leaving that default in place lets ANY role — including
-- anon — invoke them with the definer's privileges. Revoke first, then grant
-- deliberately. Do this for every security definer function in this plan.
revoke all on function public.current_person_ref() from public;
revoke all on function public.can_act_as(uuid) from public;

grant execute on function public.current_person_ref() to authenticated;
grant execute on function public.can_act_as(uuid) to authenticated;
