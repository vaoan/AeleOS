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

  -- A handle this person has retired is out of circulation for good — see
  -- `retired_handles`. Without this, renaming away from a handle and creating a
  -- new fursona under it would put every link shared to the old character onto
  -- the new one, which is the whole thing retiring exists to prevent.
  if exists (
    select 1 from public.retired_handles
     where owner_ref = v_owner and lower(handle) = lower(p_handle)
  ) then
    raise exception 'handle was retired' using errcode = '23505';
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
-- **Handles a fursona has worn and given up.**
--
-- Renaming is allowed, and the old handle is kept here rather than released.
-- That is what makes `/{address}/{old}` answer 404 FOREVER rather than
-- until somebody reuses the name: a freed handle is available again, so the
-- first new fursona to take it makes every link anybody shared to the old
-- character resolve to a different one, silently and under the same address.
--
-- The row is not read to resolve anything. Nothing routes through it — its only
-- job is to be in the way of `create_fursona` and `update_fursona`. A page for
-- a retired handle is gone, which is what its owner asked for by renaming.
--
-- Scoped by owner, because handles are unique per owner: `luna` retired under
-- one person says nothing about `luna` under another.
create table if not exists public.retired_handles (
  owner_ref  uuid        not null references public.actors(actor_ref) on delete cascade,
  handle     text        not null,
  actor_ref  uuid        not null references public.actors(actor_ref) on delete cascade,
  retired_at timestamptz not null default now()
);

-- The same shape as the live index in `0001`, so a retired handle blocks a new
-- one exactly as a live one does — case-insensitively included.
create unique index if not exists retired_handles_owner_handle_idx
  on public.retired_handles (owner_ref, lower(handle));

alter table public.retired_handles enable row level security;

-- **No client policy at all, deliberately.** RLS with no policy denies
-- everything, and the only writer is `update_fursona`, which is `security
-- definer`. Nobody needs to read this: it is not an index of anything, it is a
-- list of names that may not be taken again.

-- `service_role` explicitly, the same as every other table here — this was the
-- one that was left to inherit it. Inheriting works on the hosted project,
-- whose default privileges grant new tables to `service_role`, and does not
-- work on the local CLI stack, which applies no such default. So the two
-- disagreed about this table and only this table, and the `schema-drift` job
-- reported it the first time it was run. Stating it closes the gap on the side
-- that was wrong: the hosted project already held the privileges below, so
-- this changes nothing there.
grant select, insert, update, delete on public.retired_handles to service_role;

create or replace function public.update_fursona(
  p_actor_ref    uuid,
  p_display_name text,
  p_avatar_url   text,
  p_visibility   text,
  p_handle       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.require_active_person_ref();
  v_old   text;
  v_rows  int;
begin
  if p_visibility is null
     or p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  -- The handle the fursona wears now, and the ownership check in one read: a
  -- caller who does not own an active fursona by that reference gets nothing
  -- back, and the same "not found" every other writer here answers.
  select handle into v_old
    from public.actors
   where actor_ref = p_actor_ref
     and kind      = 'fursona'
     and owner_ref = v_owner
     and status    = 'active';

  if v_old is null then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  -- `null` means "leave it", which is what every caller that does not offer a
  -- handle sends. A rename is only a rename when the value actually differs,
  -- case included — re-saving a form without touching the field must not retire
  -- the handle it already has.
  if p_handle is not null and lower(p_handle) is distinct from lower(v_old) then
    if p_handle ~* '^u-[0-9a-f]{32}$' then
      -- The reserved namespace, for the reason `create_fursona` gives: an app
      -- following `docs/integrating.md` reads that prefix as a person's row.
      raise exception 'handle is reserved' using errcode = '22023';
    end if;

    if p_handle !~ '^[a-zA-Z0-9_-]{1,32}$' then
      raise exception 'handle has invalid characters or length'
        using errcode = '22023';
    end if;

    if exists (
      select 1 from public.retired_handles
       where owner_ref = v_owner and lower(handle) = lower(p_handle)
    ) then
      -- **A handle this person has already given up.** Not "taken": they held
      -- it, and it is being kept out of circulation so the links they shared
      -- under it keep answering 404 rather than resolving to a new character.
      raise exception 'handle was retired' using errcode = '23505';
    end if;

    -- Retired BEFORE the rename, so a unique violation on the new handle rolls
    -- the whole statement back and the old one is not lost.
    insert into public.retired_handles (owner_ref, handle, actor_ref)
    values (v_owner, v_old, p_actor_ref);
  end if;

  begin
    update public.actors
       set display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
           avatar_url   = nullif(btrim(coalesce(p_avatar_url, '')), ''),
           visibility   = p_visibility,
           handle       = coalesce(p_handle, handle)
     where actor_ref = p_actor_ref
       and kind      = 'fursona'
       and owner_ref = v_owner
       and status    = 'active';
  exception when unique_violation then
    -- The live index, same as on create, and the same wording: the only clash
    -- a caller can reach is their own.
    raise exception 'handle already yours' using errcode = '23505';
  end;

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
revoke all on function public.update_fursona(uuid, text, text, text, text) from public;
revoke all on function public.delete_fursona(uuid) from public;
