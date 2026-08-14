-- 0002 — resolving who the caller is, and what they may act as.
--
-- Every one of these is `security definer`, because 0001 revoked all client
-- grants on `public.actors`. They are the only way a policy or a view learns
-- anything about the caller.

-- Derives a person's `actor_ref` from their IdP subject.
--
-- The namespace UUID is fixed and **must stay byte-identical in every app that
-- copies this schema**, or the same human would get different platform ids in
-- different apps — which is the one thing the actor model exists to prevent.
create or replace function public.person_actor_ref(p_identity_sub text)
returns uuid
language sql
immutable
as $$
  -- Schema-qualified: Supabase installs uuid-ossp into `extensions`, which is
  -- not on the search_path for the `authenticated`/`anon` roles PostgREST
  -- executes as, so an unqualified call fails for them.
  select extensions.uuid_generate_v5(
    'd1f1a0c6-6b3e-5f7a-9c2d-3e4f5a6b7c8d'::uuid,
    p_identity_sub
  )
$$;

-- The caller's person actor_ref, or null.
--
-- **`status = 'active'` is load-bearing and must never be removed.** Without it
-- a SUSPENDED person acting as their ACTIVE fursona passes every ownership
-- check in the schema — the sanction-evasion the actor model exists to prevent,
-- because a person carries the sanction and switching persona must not shed it.
--
-- Filtering here rather than in each caller fixes every caller at once: the
-- policies on authored tables, `actors_public`, and the self-service writes all
-- resolve ownership through this one function.
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
    and status = 'active'
$$;

-- May the caller act as this local actor row?
--
-- The `identity_sub` branch can only ever match the caller's own person row,
-- which `current_person_ref` already requires to be active — so a suspended
-- person fails both branches.
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

-- Resolves the caller's active person actor, or raises the reason it cannot.
--
-- `current_person_ref()` filters to active, so its null cannot tell "never
-- signed in" apart from "signed in but suspended". The write functions need to
-- tell a suspended caller the true reason rather than implying they have no
-- account at all, so this resolves both branches once.
create or replace function public.require_active_person_ref()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.current_person_ref();
begin
  if v_owner is not null then
    return v_owner;
  end if;

  if exists (
    select 1 from public.actors
    where identity_sub = auth.jwt() ->> 'sub'
      and kind = 'person'
  ) then
    raise exception 'person actor is suspended' using errcode = '42501';
  end if;

  raise exception 'no person actor for caller' using errcode = '42501';
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, and these are
-- `security definer` — leaving that in place lets any role invoke them with the
-- definer's privileges. Revoke first; the final migration grants deliberately.
revoke all on function public.person_actor_ref(text) from public;
revoke all on function public.current_person_ref() from public;
revoke all on function public.can_act_as(uuid) from public;
revoke all on function public.require_active_person_ref() from public;
