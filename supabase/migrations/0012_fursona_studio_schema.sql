-- 0012 — the schema the studio-shaped fursona list needs.
--
-- Migrations are append-only: 0001–0011 are applied to a live database, so
-- everything here is new or expressed with `create or replace`.
--
-- `actors` deliberately gains NO column. It is the canonical actor-model schema
-- every app copies, and /api/actors/mine is a written contract in
-- docs/integrating.md; ordering and pinning are the hub's own concern, so they
-- live in a companion table instead of being pushed into that contract.

create table public.fursona_profiles (
  actor_ref  uuid primary key references public.actors (actor_ref) on delete cascade,
  sort_order int,
  featured   boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.fursona_profiles enable row level security;

-- The same revoke-then-grant discipline as `actors` (0003) and the functions
-- (0010): nothing reaches this table except through a policy below.
revoke all on public.fursona_profiles from public, anon, authenticated;
grant select, insert, update on public.fursona_profiles to authenticated;

-- `service_role` explicitly, and this is not boilerplate: the `revoke ... from
-- public` above strips the PUBLIC grant service_role would otherwise inherit,
-- which is precisely the fault 0007 §3 had to repair for `actors_public` after
-- 0003 did the same thing. That migration's own note says every relation in
-- this schema grants service_role explicitly — this one does too, from the
-- start, instead of needing a later fix.
grant select, insert, update, delete on public.fursona_profiles to service_role;

-- No delete grant, deliberately. A profile row is arrangement, not content —
-- there is nothing a person gains by removing one that setting its columns
-- does not already give them, and `on delete cascade` above ties its lifetime
-- to the actor's.

-- ---------------------------------------------------------------------------
-- The ownership test, as a function rather than inline in each policy.
--
-- It has to be SECURITY DEFINER, and the reason is not stylistic. An RLS policy
-- is evaluated as the CALLING role, and 0003 revoked every client grant on
-- `public.actors` — so a policy that reads that table directly fails with
-- `42501: permission denied for table actors` before it can decide anything.
-- The first draft of this migration did exactly that, and the conformance suite
-- caught it.
--
-- Ownership resolves through current_person_ref(), which 0007 filters to ACTIVE
-- people, so a suspended person cannot reorder or pin anything — the same
-- reason they cannot act as anybody. `status = 'active'` on the fursona itself
-- means a suspended or deleted one drops out of arrangement too: there is
-- nothing to arrange about a fursona nobody can see.
create or replace function public.owns_active_fursona(p_actor_ref uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.actors a
     where a.actor_ref = p_actor_ref
       and a.kind      = 'fursona'
       and a.status    = 'active'
       and a.owner_ref = public.current_person_ref()
  )
$$;

revoke all on function public.owns_active_fursona(uuid) from public, anon;
grant execute on function public.owns_active_fursona(uuid) to authenticated;
grant execute on function public.owns_active_fursona(uuid) to service_role;

-- Three policies rather than one `for all`, because the write cases need
-- `with check` and the read case would carry a clause it does not need.
create policy fursona_profiles_owner_select on public.fursona_profiles
  for select to authenticated
  using (public.owns_active_fursona(actor_ref));

create policy fursona_profiles_owner_insert on public.fursona_profiles
  for insert to authenticated
  with check (public.owns_active_fursona(actor_ref));

-- `using` and `with check` both, and they are not redundant: `using` decides
-- which rows may be updated, `with check` what they may become. Without the
-- second, a caller could move a row they own onto an actor_ref they do not.
create policy fursona_profiles_owner_update on public.fursona_profiles
  for update to authenticated
  using (public.owns_active_fursona(actor_ref))
  with check (public.owns_active_fursona(actor_ref));

-- ---------------------------------------------------------------------------
-- Soft delete.
--
-- A hard delete would free the handle, and handles come from a GLOBAL unique
-- namespace with no reclamation — so a retired fursona's name would become
-- available for somebody else to register and wear. In an identity product that
-- is the wrong default, so deleting sets a third status and keeps the row.
alter table public.actors
  drop constraint if exists actors_status_check;
alter table public.actors
  add constraint actors_status_check
  check (status in ('active', 'suspended', 'deleted'));

-- The same opacity as update_fursona (0009): one message whether the row is
-- missing, someone else's, or already gone. Distinguishing them would turn this
-- into an oracle for which actor_refs are real.
create or replace function public.delete_fursona(p_actor_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.require_active_person_ref();
  v_rows  int;
begin
  update public.actors
     set status = 'deleted'
   where actor_ref = p_actor_ref
     and kind      = 'fursona'
     and owner_ref = v_owner
     and status    = 'active';

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'fursona not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_fursona(uuid) from public, anon;
grant execute on function public.delete_fursona(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Consequence 1: actors_public.
--
-- 0011's public branch already requires status = 'active', so a deleted fursona
-- is hidden from strangers for free. The OWNER branches have no status test —
-- which is correct for 'suspended', because somebody must be able to see they
-- were sanctioned, and wrong for 'deleted', which they chose.
--
-- security_barrier is restated because this is a replacement, not an edit, and
-- the reason is unchanged from 0003: this view's WHERE clause is the only thing
-- between a caller and every row of the table, and without the barrier Postgres
-- may push a caller-supplied PostgREST predicate beneath it. The column list is
-- byte-for-byte 0003's; only the WHERE clause changes.
create or replace view public.actors_public with (security_barrier = true) as
  select
    a.id,
    a.actor_ref,
    a.kind,
    a.handle,
    a.display_name,
    a.avatar_url,
    a.visibility,
    a.status
  from public.actors a
  where (a.visibility in ('public', 'unlisted') and a.status = 'active')
     or ((a.identity_sub = auth.jwt() ->> 'sub'
          or a.owner_ref = public.current_person_ref())
         and a.status <> 'deleted');

grant select on public.actors_public to authenticated;
grant select on public.actors_public to service_role;

-- ---------------------------------------------------------------------------
-- Consequence 2: my_actors.
--
-- 0009 filtered on ownership alone, so a deleted fursona would keep arriving in
-- the owner's own list — and in /api/actors/mine, which is the one thing here a
-- consuming app can observe. docs/integrating.md says so. Everything else is
-- 0009's body unchanged.
create or replace function public.my_actors()
returns table (
  actor_ref    uuid,
  kind         text,
  handle       text,
  display_name text,
  avatar_url   text,
  visibility   text,
  status       text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.actor_ref, a.kind, a.handle, a.display_name, a.avatar_url,
         a.visibility, a.status
  from public.actors a
  where (a.identity_sub = auth.jwt() ->> 'sub'
         or a.owner_ref = public.current_person_ref())
    and a.status <> 'deleted'
  order by (a.kind = 'person') desc, lower(a.handle)
$$;

revoke all on function public.my_actors() from public, anon;
grant execute on function public.my_actors() to authenticated;

-- Consequence 3 is create_fursona's quota, which counts every fursona a person
-- owns regardless of status. That is ALREADY CORRECT and is deliberately not
-- touched here: a deleted fursona keeps its slot, or deleting becomes a way to
-- buy allowance back and the sanction-evasion path 0007 closed reopens. Do not
-- "fix" it.

-- ---------------------------------------------------------------------------
-- Ordering and pinning.
--
-- Both upsert, so a fursona needs no profile row until somebody arranges it.
-- Giving every fursona a row at birth would mean a second write on every create
-- and a row for the majority who never reorder anything.
--
-- Both reuse owns_active_fursona rather than repeating its subquery, so the
-- ownership rule has exactly one definition shared with the RLS policies above.
-- They are still SECURITY DEFINER: they write through the policies rather than
-- around them, and the definer context is what lets them raise a deliberate
-- error instead of silently affecting zero rows.
--
-- The error is the same `fursona not found` update_fursona and delete_fursona
-- raise, for the same reason — a distinct message is an oracle for which
-- actor_refs are real.
create or replace function public.set_fursona_order(
  p_actor_ref  uuid,
  p_sort_order int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_active_fursona(p_actor_ref) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  insert into public.fursona_profiles (actor_ref, sort_order)
  values (p_actor_ref, p_sort_order)
  on conflict (actor_ref)
  do update set sort_order = excluded.sort_order, updated_at = now();
end;
$$;

create or replace function public.set_fursona_featured(
  p_actor_ref uuid,
  p_featured  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_active_fursona(p_actor_ref) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  insert into public.fursona_profiles (actor_ref, featured)
  values (p_actor_ref, p_featured)
  on conflict (actor_ref)
  do update set featured = excluded.featured, updated_at = now();
end;
$$;

revoke all on function public.set_fursona_order(uuid, int) from public, anon;
revoke all on function public.set_fursona_featured(uuid, boolean) from public, anon;
grant execute on function public.set_fursona_order(uuid, int) to authenticated;
grant execute on function public.set_fursona_featured(uuid, boolean) to authenticated;
