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
-- Every person actor gets a number.
--
-- **A person's number is assigned by a TRIGGER, not by the provisioning
-- function.** This file used to redefine `ensure_person_actor` to append an
-- address insert, which left that function defined in two migrations — the one
-- thing the consolidation exists to prevent, and the arrangement in which the
-- newest body of a function sits in a file named after something else.
--
-- The trigger is better than folding the two definitions together, for reasons
-- that have nothing to do with tidiness:
--
--   * **A number is burned exactly once per person, structurally.**
--     `ensure_person_actor` runs on EVERY sign-in and inserts `on conflict do
--     nothing`, so the address insert had to be guarded by `if not exists` —
--     because `nextval` in a values list is evaluated BEFORE the conflict is
--     detected and would otherwise spend a number on every sign-in anybody ever
--     made. An `after insert` trigger fires only when a row was actually
--     inserted, so the conflict path never reaches it and the guard becomes
--     unnecessary rather than merely correct. Gaps are harmless in a sequence
--     nobody reads; they are not harmless when #7 is supposed to mean the
--     seventh person here.
--
--   * **Every person actor gets a number, however it was made.** The guarded
--     version only ran for actors created through that one function, so any
--     other path — a service-role insert, a future admin tool, a fixture — made
--     a person with no address and therefore no public page. The invariant now
--     belongs to the table rather than to one of its writers.
--
-- `security definer` because the trigger writes `person_addresses`, which no
-- client role may write. That does not weaken the rule that only `service_role`
-- writes an address: a client cannot insert into `actors` at all, so the only
-- things that can fire this are the definer functions and `service_role`
-- itself.
create or replace function public.assign_person_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.person_addresses (address, actor_ref, kind)
  values (nextval('public.person_number_seq')::text, new.actor_ref, 'number');
  return new;
end;
$$;

revoke all on function public.assign_person_number() from public, anon;

-- `when (new.kind = 'person')` rather than a test inside the body: a fursona
-- insert then does not call the function at all, which is both cheaper and
-- clearer about what the rule is.
drop trigger if exists assign_person_number on public.actors;
create trigger assign_person_number
  after insert on public.actors
  for each row
  when (new.kind = 'person')
  execute function public.assign_person_number();

-- No grant needed: `create or replace function` preserves the ACL, so the
-- `grant execute … to authenticated` in `0010_client_grants.sql` still stands.
-- Stated rather than left to be inferred, because the absence of a grant here
-- otherwise reads as an omission.
--
-- Nothing in this migration is reachable by `anon`, so `0010_client_grants.sql`
-- needs no edit — it remains the complete client surface, with `anon` absent.
