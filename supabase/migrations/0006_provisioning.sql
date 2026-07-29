create extension if not exists "uuid-ossp";

-- Fixed namespace for deriving person actor_refs. Every app that copies this
-- migration MUST keep this namespace byte-identical, or the same human would
-- get different platform ids in different apps.
create or replace function public.person_actor_ref(p_identity_sub text)
returns uuid
language sql
immutable
as $$
  -- Schema-qualified: Supabase installs uuid-ossp into the `extensions`
  -- schema, which is not on the search_path for the `authenticated`/`anon`
  -- roles PostgREST executes as, so an unqualified call fails for them.
  select extensions.uuid_generate_v5(
    'd1f1a0c6-6b3e-5f7a-9c2d-3e4f5a6b7c8d'::uuid,
    p_identity_sub
  )
$$;

-- Idempotent first-login provisioning: ensures the caller has a person actor.
create or replace function public.ensure_person_actor()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text := auth.jwt() ->> 'sub';
  v_ref uuid;
begin
  if v_sub is null then
    raise exception 'no authenticated subject';
  end if;

  v_ref := public.person_actor_ref(v_sub);

  insert into public.actors (actor_ref, kind, identity_sub, handle)
  values (v_ref, 'person', v_sub, 'u-' || replace(v_ref::text, '-', ''))
  on conflict (identity_sub) do nothing;

  return v_ref;
end;
$$;

-- ensure_person_actor is security definer; strip the default PUBLIC grant on
-- both before granting deliberately.
revoke all on function public.person_actor_ref(text) from public;
revoke all on function public.ensure_person_actor() from public;

grant execute on function public.person_actor_ref(text) to authenticated;
grant execute on function public.ensure_person_actor() to authenticated;
