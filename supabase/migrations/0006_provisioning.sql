-- 0006 — first-login provisioning.

-- Idempotent: this runs on EVERY sign-in, not only the first.
--
-- **It returns the STORED actor_ref, never the derived one.** An earlier version
-- did `on conflict (identity_sub) do nothing` and then returned the locally
-- derived value without reading the row back. A person row that already exists
-- with a different `actor_ref` — an imported or backfilled user, which the
-- migration plan explicitly anticipates — made the function return a value that
-- disagreed with `current_person_ref()`: an actor_ref the caller cannot
-- actually act as.
-- **The only definition of this function.** It used to be redefined in `0011`
-- to append the address insert; that moved to a trigger there, so this body is
-- the whole of it again. Before adding anything here, check that no later
-- migration has grown a second definition — that arrangement is what the
-- consolidation exists to prevent.
create or replace function public.ensure_person_actor()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub     text := auth.jwt() ->> 'sub';
  v_derived uuid;
  v_ref     uuid;
begin
  if v_sub is null then
    raise exception 'no authenticated subject';
  end if;

  v_derived := public.person_actor_ref(v_sub);

  insert into public.actors (actor_ref, kind, identity_sub, handle)
  values (v_derived, 'person', v_sub, 'u-' || replace(v_derived::text, '-', ''))
  on conflict (identity_sub) do nothing
  returning actor_ref into v_ref;

  -- `do nothing` produces no RETURNING row, so on the conflict path read the
  -- row that actually exists. The stored value is authoritative; the derived
  -- one is only a default for rows we create ourselves.
  if v_ref is null then
    select a.actor_ref
      into v_ref
      from public.actors a
     where a.identity_sub = v_sub
       and a.kind = 'person';
  end if;

  return v_ref;
end;
$$;

revoke all on function public.ensure_person_actor() from public;
