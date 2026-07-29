-- 0007 — post-review hardening.
--
-- Migrations are append-only: 0001–0006 have already been applied in other
-- databases, so every fix here is expressed with `create or replace` /
-- `drop policy` + `create policy` rather than by editing an earlier file.

-- ---------------------------------------------------------------------------
-- 1. A suspended person must be able to act as NOTHING — not even their own
--    fursona.
--
-- `can_act_as` only checked `status = 'active'` on the TARGET row. Its owner
-- branch resolves through `current_person_ref()`, which had no status filter,
-- so a SUSPENDED person acting as their ACTIVE fursona passed the check. That
-- is exactly the sanction-evasion the actor model exists to prevent: a person
-- carries the sanction, and switching persona must not shed it.
--
-- Filtering here rather than in `can_act_as` fixes every caller at once —
-- the insert/update/delete policies on authored tables and the `actors_public`
-- view all resolve ownership through this one function. The other branch of
-- `can_act_as` (`a.identity_sub = auth.jwt() ->> 'sub'`) can only ever match
-- the caller's own person row, which is already required to be active, so a
-- suspended person now fails both branches.
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

-- ---------------------------------------------------------------------------
-- 2. `ensure_person_actor()` must return the STORED actor_ref, never the
--    derived one.
--
-- The previous body did `on conflict (identity_sub) do nothing` and then
-- returned the locally derived value without reading the row back. A person
-- row that already exists with a different `actor_ref` — an imported or
-- backfilled user, which the migration plan explicitly anticipates — made the
-- function return a value that disagreed with `current_person_ref()`, i.e. an
-- actor_ref the caller cannot actually act as.
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

-- ---------------------------------------------------------------------------
-- 3. `service_role` lost SELECT on `actors_public`.
--
-- 0003 revoked from `public, anon, authenticated` and granted only
-- `authenticated`; the blanket `revoke ... from public` also stripped the
-- default that `service_role` was relying on. Every other relation in this
-- schema grants `service_role` explicitly, so make this one match.
grant select on public.actors_public to service_role;

-- The view is not `security_invoker`, so the base table is read as the view's
-- owner — but the `current_person_ref()` call in its WHERE clause is still
-- resolved with the CALLER's privileges, so SELECT alone is not enough.
-- service_role carries no `sub`, so the call returns null and the view degrades
-- to the public/unlisted rows; the grant does not widen what it can see.
grant execute on function public.current_person_ref() to service_role;

-- ---------------------------------------------------------------------------
-- 4. `author_person_ref` becomes server-derived instead of client-asserted.
--
-- 0005 let the client send `author_person_ref` and had the insert policy
-- verify it. That is correct but FRAGILE AS A COPIED PATTERN: an app that
-- copies the policy and drops the `and author_person_ref = ...` conjunct still
-- passes the "cannot post as another person's fursona" test (that is
-- `can_act_as`) and fails only the forged-snapshot test — the test most likely
-- to be dropped when a team adapts the suite to its own table. Deriving the
-- snapshot in a trigger makes the safe behaviour the default: there is no
-- longer a conjunct to forget.
create or replace function public.comments_derive_author_person_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid := public.current_person_ref();
begin
  if v_ref is not null then
    -- Authoritative: whatever the row carried is discarded.
    new.author_person_ref := v_ref;
  elsif new.author_person_ref is null then
    -- No authenticated person AND no explicit value: fail closed. Client roles
    -- can never reach the second branch — INSERT on the column is revoked
    -- below — so this only leaves the deliberate `service_role` path open for
    -- imports and backfills, which is the same trust level that can write the
    -- table at all.
    raise exception 'author_person_ref cannot be derived: no active person for the caller';
  end if;

  return new;
end;
$$;

create trigger comments_derive_author_person_ref
before insert on public.comments
for each row execute function public.comments_derive_author_person_ref();

-- The client can no longer name the column at all, so a forged snapshot is
-- rejected by privilege before it is corrected by the trigger.
revoke insert (author_person_ref) on public.comments from authenticated;

-- With the value server-derived, the truthfulness conjunct is dead weight.
-- Keep `can_act_as` — that is the separate "may I speak as this actor?" check.
drop policy comments_insert on public.comments;

create policy comments_insert on public.comments
  for insert to authenticated
  with check (public.can_act_as(author_actor_id));

-- ---------------------------------------------------------------------------
-- 5. `updated_at` was decorative.
--
-- 0001 gave it a default and no trigger, so it permanently equalled
-- `created_at`. Maintain it.
create or replace function public.actors_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger actors_set_updated_at
before update on public.actors
for each row execute function public.actors_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Apply the revoke-then-grant discipline to the trigger functions.
--
-- Postgres grants EXECUTE to PUBLIC on every new function. Trigger functions
-- were the one place in this schema where that default was left in place.
-- EXECUTE on a trigger function is checked when the trigger is CREATED, not
-- when it fires, so revoking after the fact is safe — and the triggers above
-- are already created.
revoke all on function public.actors_guard_identity() from public;
revoke all on function public.actors_touch_updated_at() from public;
revoke all on function public.comments_guard_snapshot() from public;
revoke all on function public.comments_derive_author_person_ref() from public;

-- ---------------------------------------------------------------------------
-- 7. `person_actor_ref(text)` is not a client function.
--
-- 0006 granted it to `authenticated`, but no client flow calls it: provisioning
-- goes through `ensure_person_actor()`. Left exposed it is a confirmation
-- oracle — anyone holding a candidate `identity_sub` could turn it into that
-- person's `actor_ref` and correlate it against `actors_public`. It stays
-- available to the migration/seed path and to `ensure_person_actor()`, which
-- calls it as a security definer owned by the same role.
revoke execute on function public.person_actor_ref(text) from authenticated;
