-- 0001 — the actor model.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ This schema was consolidated on 2026-08-13. It replaces fourteen         │
-- │ migrations in which six objects had been redefined by `create or        │
-- │ replace` — `actors_public` four times, `ensure_person_actor` three.      │
-- │                                                                         │
-- │ EVERY OBJECT IS NOW DEFINED EXACTLY ONCE. That is the invariant worth    │
-- │ keeping: the old layout meant the current body of a function could live  │
-- │ in a migration named after something unrelated, and restating the wrong  │
-- │ ancestor silently reverted a fix. It nearly happened while writing the   │
-- │ public-page work — the live `ensure_person_actor` was in a migration     │
-- │ called "suspension hardening", and nothing in the one that created it    │
-- │ said so.                                                                 │
-- │                                                                         │
-- │ The reasoning from those migrations is preserved in place, because it is │
-- │ what stops somebody re-introducing the fault it describes. Where a       │
-- │ comment says "0007 §2" it means the migration that first made the point, │
-- │ not a file you can still open.                                           │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- One person = one identity across every Furry Colombia app. `actor_ref` is the
-- platform id every consuming app stores; `identity_sub` is the IdP's subject
-- and is sacred — swapping the token issuer must stay a one-column backfill.

create extension if not exists pgcrypto;

-- Pinned to the `extensions` schema explicitly. `person_actor_ref` (0002) calls
-- `extensions.uuid_generate_v5`, and this schema is meant to be copied into
-- other apps' databases — on a differently-configured Postgres the extension
-- could otherwise land in `public` and that qualified call would not resolve.
create extension if not exists "uuid-ossp" with schema extensions;

-- Stop `anon` and `authenticated` being granted anything on what this schema
-- creates.
--
-- A Supabase project ships with
--
--   alter default privileges in schema public
--     grant all on functions to anon, authenticated, service_role;
--
-- so a `revoke ... from public` is NOT enough: PUBLIC is a pseudo-role, and
-- revoking it does not touch a grant held by a named role. Measured on the
-- hosted project before this was added: every function in `public` carried
-- `anon=X`, including `person_actor_ref`, the confirmation oracle that turns a
-- candidate `identity_sub` into that person's `actor_ref`.
--
-- This runs FIRST so no function is ever created with the grant, rather than
-- having it taken away afterwards. The final migration re-grants exactly what
-- each client role is meant to reach, and is the readable list of that surface.
--
-- **The conformance suite cannot catch a regression here.** The local CLI stack
-- does not apply those default privileges, so `anon` is correctly refused there
-- whether or not this exists, and a test asserting the refusal passes locally
-- while production stays open. The assertion lives in `tests/idp/`, which runs
-- against the real project in the `idp-cloud` job.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- **Sequences and tables too, and the first draft of this covered only
-- functions.** Supabase's defaults grant all three. Tables happened to be safe
-- because every migration here revokes them by name — sequences were not, and
-- the first sequence this schema created (`person_number_seq`, 0011) shipped to
-- the live project with `anon=rwU`. Measured, not theorised: `nextval()` as
-- `anon` succeeded and returned 4.
--
-- That is not cosmetic. USAGE on that sequence lets a caller BURN person
-- numbers, and the numbers are meant to mean something — #7 is the seventh
-- person here, and they are given out for events. A script advancing it a
-- million times would make every later signup meaningless. SELECT alone would
-- also publish the signup count.
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

create table public.actors (
  id            uuid primary key default gen_random_uuid(),
  actor_ref     uuid not null unique,
  kind          text not null check (kind in ('person', 'fursona')),
  owner_ref     uuid references public.actors (actor_ref) on delete restrict,
  identity_sub  text unique,
  handle        text not null,
  display_name  text,
  avatar_url    text,
  visibility    text not null default 'private'
                  check (visibility in ('private', 'unlisted', 'public')),
  -- `deleted` is a soft delete, and it is a status rather than a `deleted_at`
  -- column so its consequences are checkable.
  --
  -- **The reason narrowed when handles became per-owner**, and the old one is
  -- recorded because it is the one people remember: a hard delete freed a name
  -- from a GLOBAL namespace, so a stranger could register a retired character's
  -- handle and wear it. That is no longer possible — a freed handle returns
  -- only to its own owner, who could always have had it.
  --
  -- Two reasons survive and are enough. Deleting must not buy quota allowance
  -- back, or moderation becomes a way to make room. And the handle is now part
  -- of a public ADDRESS: recycling `luna` onto a different character would
  -- silently repoint every link anybody had bookmarked to `/{address}/luna`.
  status        text not null default 'active'
                  check (status in ('active', 'suspended', 'deleted')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint actors_person_shape check (
    kind <> 'person' or (identity_sub is not null and owner_ref is null)
  ),
  constraint actors_fursona_shape check (
    kind <> 'fursona' or (identity_sub is null and owner_ref is not null)
  )
);

-- A fursona handle is unique PER OWNER; a person handle is unique globally.
--
-- Two people may each have a `luna`. That is the point of addressing a fursona
-- as `/{person_address}/{handle}` — the person is already in the path, so the
-- handle does not have to carry global uniqueness, and furry character names
-- collide constantly.
--
-- **TWO PARTIAL INDEXES, NOT ONE COMPOSITE, and the difference is a silent
-- data-integrity bug.** A person has `owner_ref IS NULL`, and Postgres treats
-- NULLs as DISTINCT in a unique index by default — so
-- `unique (owner_ref, lower(handle))` alone would let two people share a person
-- handle and nothing would complain. Postgres 17 offers `nulls not distinct`,
-- but a modifier somebody has to notice is worse than two indexes that say what
-- they mean. `tests/db/per-owner-handles.test.ts` asserts the person case
-- specifically, because it is the one that fails quietly.
create unique index actors_person_handle_idx
  on public.actors (lower(handle)) where kind = 'person';

create unique index actors_fursona_handle_idx
  on public.actors (owner_ref, lower(handle)) where kind = 'fursona';

create index actors_owner_ref_idx on public.actors (owner_ref);
create index actors_identity_sub_idx on public.actors (identity_sub);

-- The service role drives migrations, seeding and tests, and needs explicit
-- grants on new tables. Client roles get NOTHING here: 0003 is the single place
-- where client exposure of `actors` is defined, and it exposes a view.
grant select, insert, update, delete on public.actors to service_role;

alter table public.actors enable row level security;

-- Named roles, not PUBLIC. The tables were never affected by the default-grant
-- problem above precisely because this names them.
revoke all on public.actors from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers.
--
-- `kind` and `identity_sub` are immutable, and a person actor is never
-- transferable.
create or replace function public.actors_guard_identity()
returns trigger
language plpgsql
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'actor kind is immutable';
  end if;
  if new.identity_sub is distinct from old.identity_sub then
    raise exception 'identity_sub is immutable';
  end if;
  if old.kind = 'person' and new.owner_ref is not null then
    raise exception 'person actors are not transferable';
  end if;
  return new;
end;
$$;

create trigger actors_immutable_identity
before update on public.actors
for each row execute function public.actors_guard_identity();

-- `updated_at` had a default and no trigger for six migrations, so it
-- permanently equalled `created_at`. Maintain it.
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

-- EXECUTE on a trigger function is checked when the trigger is CREATED, not
-- when it fires, so revoking here is safe and the triggers above keep working.
revoke all on function public.actors_guard_identity() from public;
revoke all on function public.actors_touch_updated_at() from public;
