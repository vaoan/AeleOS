-- 0011 — two gaps the fursona work left open.
--
-- Migrations are append-only: 0001–0010 are applied elsewhere already, so both
-- fixes are expressed with `create or replace` rather than by editing 0003/0009.

-- ---------------------------------------------------------------------------
-- 1. A suspended fursona must stop being publicly listed.
--
-- 0003's WHERE clause filtered on `visibility` alone, so a fursona a moderator
-- had SUSPENDED but whose visibility was 'public' stayed readable by every
-- authenticated caller through PostgREST. 0007's whole premise is that a
-- sanction cannot be shed, and 0009 made publishing routinely reachable, so
-- this is a live hole rather than a theoretical one.
--
-- The filter goes on the public/unlisted branch ONLY. A blanket
-- `and a.status = 'active'` would be wrong: the hub's /me page renders from
-- this view, so a suspended PERSON would get a blank identity page — exactly
-- the person who most needs a truthful one. An owner keeps seeing their own
-- suspended fursona (they must, to know it was sanctioned); strangers do not.
--
-- security_barrier is restated because this is a replacement, not an edit: the
-- reason it is REQUIRED is unchanged from 0003 — this view's WHERE clause is
-- the only thing between a caller and every row of the table, and without the
-- barrier Postgres may push a caller-supplied PostgREST predicate beneath it.
--
-- The column list is byte-for-byte 0003's. `create or replace view` cannot add,
-- drop, rename or retype a column; only the WHERE clause changes here.
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
     or a.identity_sub = auth.jwt() ->> 'sub'
     or a.owner_ref = public.current_person_ref();

-- `create or replace view` preserves the relation's ACL, so 0003's
-- `grant select ... to authenticated` and 0007 §3's grant to `service_role`
-- both still stand. Restated as the assertion of intent, not as repair.
grant select on public.actors_public to authenticated;
grant select on public.actors_public to service_role;

-- ---------------------------------------------------------------------------
-- 2. `create_fursona` gets a quota.
--
-- It is the platform's first unbounded, client-reachable write, on a free-tier
-- database under a hard $0 constraint (CLAUDE.md), and every row it creates
-- permanently consumes a handle from a GLOBAL unique namespace. There is no
-- delete_fursona, so nothing reclaims them.
--
-- Everything below is 0009's body unchanged except the quota block; the whole
-- function is restated because `create or replace function` replaces it whole.
create or replace function public.create_fursona(
  p_handle       text,
  p_display_name text,
  p_avatar_url   text,
  p_visibility   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  -- PRODUCT KNOB, not a safety limit. 100 is generous enough that no real
  -- person reaches it — this is an identity app and people legitimately have
  -- many characters — and bounded enough that a script cannot exhaust the
  -- handle namespace. Raising or lowering it is a product decision; nothing
  -- else in the schema depends on the number.
  c_fursona_limit constant int := 100;

  v_owner uuid := public.require_active_person_ref();
  v_ref   uuid := gen_random_uuid();
  v_count int;
begin
  if p_handle is null or btrim(p_handle) = '' then
    raise exception 'handle is required' using errcode = '22023';
  end if;

  if p_handle ~* '^u-[0-9a-f]{32}$' then
    -- ensure_person_actor (0006) provisions a person's handle as
    -- 'u-' || replace(person_actor_ref(sub)::text, '-', ''), and actor_ref is
    -- the platform id designed to be the same in every Furry Colombia app
    -- (see CLAUDE.md) — so anyone who has seen a person's actor_ref (/me
    -- displays it) can compute their future handle before they ever sign in.
    -- ensure_person_actor's `on conflict (identity_sub) do nothing` does not
    -- cover the unique index on lower(handle), so a squatted handle makes the
    -- real owner's first sign-in fail permanently with no self-service
    -- repair. Reject the whole reserved namespace outright, case-insensitive
    -- to match the index.
    --
    -- Checked BEFORE the general charset/length rule below: a reserved
    -- handle is 34 characters ('u-' + 32 hex), which the 32-character cap
    -- would otherwise reject first, masking this specific reason with the
    -- generic one.
    raise exception 'handle is reserved' using errcode = '22023';
  end if;

  if p_handle !~ '^[a-zA-Z0-9_-]{1,32}$' then
    raise exception 'handle has invalid characters or length' using errcode = '22023';
  end if;

  if p_visibility is null
     or p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  -- Counts ALL fursonas this person owns, deliberately including SUSPENDED
  -- ones. Excluding them would hand a moderated person a fresh allowance for
  -- replacements the moment a sanction lands, which is the sanction-evasion
  -- path 0007 exists to close. A suspended fursona keeps occupying its slot;
  -- moderation is not a way to buy more room.
  select count(*) into v_count
    from public.actors
   where owner_ref = v_owner
     and kind = 'fursona';

  if v_count >= c_fursona_limit then
    -- A message distinct from every other failure this function raises
    -- ('handle already taken', 'handle is required', 'handle is reserved',
    -- 'handle has invalid characters or length', 'invalid visibility',
    -- 'no person actor for caller', 'person actor is suspended') so the hub
    -- can tell them apart. It names only the limit — never the owner_ref or
    -- the identity_sub, which stay off the wire.
    raise exception 'fursona limit reached' using errcode = '22023';
  end if;

  begin
    insert into public.actors
      (actor_ref, kind, owner_ref, handle, display_name, avatar_url, visibility)
    values
      (v_ref, 'fursona', v_owner, p_handle,
       nullif(btrim(coalesce(p_display_name, '')), ''),
       nullif(btrim(coalesce(p_avatar_url, '')), ''),
       p_visibility);
  exception when unique_violation then
    -- The unique index is on lower(handle), so this covers case variants too.
    raise exception 'handle already taken' using errcode = '23505';
  end;

  return v_ref;
end;
$$;

-- `create or replace function` preserves the function's ACL, so 0010's
-- `revoke execute on all functions in schema public from anon, authenticated`
-- is NOT undone here and `authenticated` keeps the grant 0010 restored. Both
-- restated so this migration reads as the complete intent for the function it
-- replaces rather than depending on the reader knowing that rule.
revoke all on function public.create_fursona(text, text, text, text)
  from public, anon;
grant execute on function public.create_fursona(text, text, text, text)
  to authenticated;
