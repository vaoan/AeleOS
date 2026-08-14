-- 0007 — what a person may do to their own fursonas.
--
-- Every write to `actors` lives behind a `security definer` function, because
-- 0001 revoked all client grants on the table. This does not re-open it; it
-- exposes exactly three narrow operations.
--
-- All three raise the SAME `fursona not found` for a row that is missing,
-- somebody else's, or sanctioned. Distinguishing any of those would turn them
-- into an oracle for probing which actor_refs are real.

-- Creating a fursona.
--
-- The owner comes from the token, never from a parameter, so a caller cannot
-- create a fursona owned by someone else. There is deliberately no p_owner.
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
    -- `ensure_person_actor` provisions a person's handle as
    -- 'u-' || replace(person_actor_ref(sub)::text, '-', '').
    --
    -- **The original reason for this check is gone, and the check stays.** It
    -- existed because a squatted `u-…` handle collided on a GLOBAL unique index
    -- and made the real owner's first sign-in fail permanently. Person and
    -- fursona handles now live in separate partial indexes (0001), so that
    -- collision is impossible.
    --
    -- What keeps it: `docs/integrating.md` documents the `u-` prefix as how a
    -- consuming app recognises a person row in `/api/actors/mine`. A fursona
    -- wearing that shape would be read as somebody's account by an app
    -- following the contract. Reserving the namespace is cheaper than asking
    -- every app to distrust the prefix.
    --
    -- Checked BEFORE the general charset/length rule below: a reserved handle
    -- is 34 characters ('u-' + 32 hex), which the 32-character cap would
    -- otherwise reject first, masking this specific reason with the generic one.
    raise exception 'handle is reserved' using errcode = '22023';
  end if;

  if p_handle !~ '^[a-zA-Z0-9_-]{1,32}$' then
    raise exception 'handle has invalid characters or length' using errcode = '22023';
  end if;

  if p_visibility is null
     or p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  -- Counts ALL fursonas this person owns, deliberately including SUSPENDED and
  -- DELETED ones. Excluding either would hand a moderated person a fresh
  -- allowance for replacements the moment a sanction lands, and would make
  -- deleting a way to buy allowance back — both the sanction-evasion path the
  -- actor model exists to close.
  --
  -- This quota used to justify itself partly by handle scarcity: every row
  -- permanently consumed a name from a GLOBAL namespace that nothing reclaims.
  -- **That reason is gone** now handles are per-owner — one person's `luna`
  -- costs nobody else anything. The quota stays for the two reasons above, plus
  -- the plain one: an unbounded client-reachable write on a free-tier database
  -- under a hard $0 constraint.
  select count(*) into v_count
    from public.actors
   where owner_ref = v_owner
     and kind = 'fursona';

  if v_count >= c_fursona_limit then
    -- A message distinct from every other failure this function raises, so the
    -- hub can tell them apart. It names only the limit — never the owner_ref or
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
    -- The index is on (owner_ref, lower(handle)) for fursonas, so this covers
    -- case variants — and it can now only ever be the CALLER'S OWN clash.
    --
    -- The message says so. "already taken" was true under a global namespace
    -- and named nobody; saying it now would imply a stranger holds the handle,
    -- which is both false and a statement about somebody else's data.
    raise exception 'handle already yours' using errcode = '23505';
  end;

  return v_ref;
end;
$$;

-- Editing a fursona. The WHERE clause IS the authorization — ownership is
-- re-derived from the token here rather than trusted from the caller.
--
-- The handle is absent on purpose: it is how a fursona is addressed, and
-- renaming is a separate concern with its own collision and redirect problems.
create or replace function public.update_fursona(
  p_actor_ref    uuid,
  p_display_name text,
  p_avatar_url   text,
  p_visibility   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.require_active_person_ref();
  v_rows  int;
begin
  if p_visibility is null
     or p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  update public.actors
     set display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
         avatar_url   = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         visibility   = p_visibility
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

-- Deleting is SOFT. See `actors.status` in 0001 for why: a hard delete frees
-- the handle, and a freed handle lets somebody register the name a retired
-- character was known by.
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

revoke all on function public.create_fursona(text, text, text, text) from public;
revoke all on function public.update_fursona(uuid, text, text, text) from public;
revoke all on function public.delete_fursona(uuid) from public;
