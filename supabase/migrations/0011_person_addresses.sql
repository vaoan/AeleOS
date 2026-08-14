-- 0011 — a person's public address.
--
-- The public pages address a person as `/{person_address}` and one of their
-- fursonas as `/{person_address}/{handle}`. This is the relation those
-- addresses come from.
--
-- A person has ONE PERMANENT NUMBER, written here at provisioning, and may
-- later be granted a VANITY — text, or a different number. Both resolve
-- forever: the number is what makes an address awardable (#7 is genuinely the
-- seventh person here, so it can be given out for events and participation),
-- and a link shared under it must never rot because somebody was later given a
-- nicer one.
--
-- **Why a relation and not two columns on `actors`.** A vanity is a SECOND
-- address for the same person, and a column cannot hold two values without
-- becoming a list that nothing can index uniquely. The uniqueness below is the
-- whole design, and it only works if both forms sit in one place.
--
-- The owner's handle and `actor_ref` stay out of the URL deliberately.
-- Publishing `owner_ref` in an address bar would leak, permanently and to
-- everybody, the exact column `/api/actors/mine` strips by name.
--
-- See `apps/hub/src/features/actors/CLAUDE.md`, which is authoritative for
-- addressing.

create sequence public.person_number_seq as bigint start 1;

-- Explicitly, and not only by the default privileges 0001 sets. USAGE here lets
-- a caller burn person numbers, and a number is supposed to mean something —
-- this one is worth two statements rather than a dependency on an earlier file
-- still being right. `ensure_person_actor` is `security definer`, so it reaches
-- the sequence as its owner and is unaffected.
revoke all on sequence public.person_number_seq from public, anon, authenticated;
grant usage, select on sequence public.person_number_seq to service_role;

create table public.person_addresses (
  address    text primary key
               check (address ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  actor_ref  uuid not null references public.actors (actor_ref)
               on delete cascade,
  kind       text not null check (kind in ('number', 'vanity')),
  created_at timestamptz not null default now()
);

-- ONE NAMESPACE ACROSS BOTH KINDS, and this is the constraint the whole design
-- turns on.
--
-- A vanity may BE a number. So a unique constraint per kind — or a column per
-- form, had these been two columns on `actors` — would let person #500 be
-- granted the vanity `7` while person #7 already exists, and `/7/luna` would
-- then address two different people with no rule for which. Two constraints
-- look correct here and are not.
--
-- **Two objects share the job, and it is worth knowing which does what.** The
-- PRIMARY KEY on `address` is what makes the namespace shared at all: it is one
-- column holding both kinds, so an exact repeat is refused whatever `kind`
-- says. This index adds the case-insensitivity the primary key does not have —
-- without it `Luna` and `luna` are two rows, and a URL cannot tell them apart.
--
-- Sabotage-verified, and the first attempt was misleading: splitting this index
-- by `kind` did NOT break the collision test, because the primary key still
-- caught it. If you are testing this property, break the right object.
create unique index person_addresses_lower_idx
  on public.person_addresses (lower(address));

-- At most one number each. A person's number is permanent, so a second would be
-- a second permanent address with nothing to say which one is theirs.
create unique index person_addresses_one_number_idx
  on public.person_addresses (actor_ref) where kind = 'number';

create index person_addresses_actor_idx on public.person_addresses (actor_ref);

-- Tie the sequence's lifetime to the table.
--
-- A standalone sequence is not dropped by anything that drops the table, so a
-- half-finished `supabase db reset --linked` left `person_number_seq` behind and
-- the next attempt failed on `create sequence` — with the migration stuck and
-- the schema in neither state. Found exactly that way. `owned by` makes the
-- sequence go when the table goes, so the migration is re-runnable.
alter sequence public.person_number_seq
  owned by public.person_addresses.address;

-- Client roles get NOTHING, and unlike most tables here that is not merely a
-- default left alone — it is load-bearing. Reads go through the public read
-- functions, which answer with one row for an address the caller already has. A
-- direct select would hand `anon` an enumerator over every person on the
-- platform, which is precisely what `unlisted` exists to prevent: a page
-- reachable by whoever holds the link, and invisible to whoever does not.
--
-- `service_role` is granted explicitly rather than left to inherit, because the
-- `revoke ... from public` above strips what it would otherwise rely on.
revoke all on public.person_addresses from public, anon, authenticated;
grant select, insert, update, delete on public.person_addresses to service_role;

-- ---------------------------------------------------------------------------
-- Provisioning writes the number.
--
-- This restates `0006_provisioning.sql`, which is the ONLY definition of
-- `ensure_person_actor` — the consolidation on 2026-08-13 exists so that
-- sentence can be true. Under the old layout the newest body sat in a file
-- named "suspension hardening" and copying from the file that created the
-- function would have silently reverted its fix. Check that property still
-- holds before you replace anything else.
--
-- Everything below is that body unchanged, plus the address insert.
--
-- The insert is guarded for the same reason the actor insert is `on conflict do
-- nothing`: this runs on EVERY sign-in, not only the first.
--
-- The guard is an `if not exists` rather than `on conflict do nothing` because
-- `nextval` in a values list is evaluated BEFORE the conflict is detected, so
-- the conflict form would burn a number on every sign-in anybody ever makes.
-- Gaps are harmless in a sequence nobody reads; they are not harmless when the
-- numbers are the point and #7 is supposed to mean the seventh person.
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

  if not exists (
    select 1
      from public.person_addresses
     where actor_ref = v_ref
       and kind = 'number'
  ) then
    insert into public.person_addresses (address, actor_ref, kind)
    values (nextval('public.person_number_seq')::text, v_ref, 'number');
  end if;

  return v_ref;
end;
$$;

-- No grant needed: `create or replace function` preserves the ACL, so the
-- `grant execute … to authenticated` in `0010_client_grants.sql` still stands.
-- Stated rather than left to be inferred, because the absence of a grant here
-- otherwise reads as an omission.
--
-- Nothing in this migration is reachable by `anon`, so `0010_client_grants.sql`
-- needs no edit — it remains the complete client surface, with `anon` absent.
