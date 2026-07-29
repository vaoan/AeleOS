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

grant execute on function public.current_person_ref() to authenticated;
grant execute on function public.can_act_as(uuid) to authenticated;
