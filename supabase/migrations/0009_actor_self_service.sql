-- 0009 — the operations a person performs on their own actors.
--
-- Every write to `actors` lives behind a security definer function because 0003
-- revokes all client grants on the table. This migration does not re-open it;
-- it exposes exactly four narrow operations instead.

-- The caller's own actors: their person row and the fursonas they own.
--
-- Deliberately returns neither owner_ref nor identity_sub. The caller already
-- knows they own these rows, so echoing the linkage back puts the
-- fursona -> person mapping on the wire for no benefit — and this shape is the
-- one other applications will eventually read.
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
  where a.identity_sub = auth.jwt() ->> 'sub'
     or a.owner_ref = public.current_person_ref()
  order by (a.kind = 'person') desc, lower(a.handle)
$$;

revoke all on function public.my_actors() from public;
grant execute on function public.my_actors() to authenticated;

-- Resolves the caller's active person actor, or raises the reason it cannot.
--
-- current_person_ref() (0007) already filters status = 'active', so its
-- return value alone cannot tell "never signed in" apart from "signed in but
-- suspended" — both come back null. The write RPCs below need to tell a
-- suspended caller the true reason rather than implying they have no account
-- at all, so this resolves both branches once and raises the right message.
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

-- Revoked from PUBLIC and granted to nobody. No client flow calls this: it
-- exists for create_fursona and update_fursona, which are security definer
-- functions owned by the same role and so already carry EXECUTE on it. This
-- follows the precedent 0007 §7 set for person_actor_ref(text), which was
-- granted to `authenticated` in 0006 and revoked once it turned out no client
-- called it either — an unused grant on a definer function is reachable
-- surface that nothing needs.
revoke all on function public.require_active_person_ref() from public;

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
  v_owner uuid := public.require_active_person_ref();
  v_ref   uuid := gen_random_uuid();
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
    -- The SAME error whether the row does not exist, belongs to someone
    -- else, or is suspended. Distinguishing any of those would turn this
    -- into an oracle for probing which actor_refs are real (or sanctioned).
    raise exception 'fursona not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_fursona(text, text, text, text) from public;
revoke all on function public.update_fursona(uuid, text, text, text) from public;
grant execute on function public.create_fursona(text, text, text, text) to authenticated;
grant execute on function public.update_fursona(uuid, text, text, text) to authenticated;
