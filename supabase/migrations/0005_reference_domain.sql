-- 0005 — the reference domain table.
--
-- `comments` exists to be copied: it is the worked example of how an app-local
-- table keys to the actor model. Nothing in the hub uses it, and the
-- conformance suite exercises it precisely because a consuming app will imitate
-- it rather than read the spec.
--
-- Two columns, and the pair is the whole lesson. `author_actor_id` is who the
-- post appears as; `author_person_ref` is who is accountable for it. They are
-- separate because a fursona can be transferred and accountability cannot.

create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  body              text not null,
  author_actor_id   uuid not null references public.actors (id) on delete restrict,
  author_person_ref uuid not null,
  created_at        timestamptz not null default now()
);

create index comments_author_actor_idx on public.comments (author_actor_id);

alter table public.comments enable row level security;

grant select, insert, update, delete on public.comments to service_role;

-- Column-level grants. `author_person_ref` is never readable by a client, and
-- never writable either — the trigger below derives it.
revoke all on public.comments from anon, authenticated;
grant select (id, body, author_actor_id, created_at) on public.comments to authenticated;
grant insert (id, body, author_actor_id) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
grant delete on public.comments to authenticated;

create policy comments_select on public.comments
  for select to authenticated
  using (true);

-- May only author as an actor you control. The accountability snapshot is not
-- checked here because it is no longer client-supplied.
create policy comments_insert on public.comments
  for insert to authenticated
  with check (public.can_act_as(author_actor_id));

-- Editing and deleting resolve to the person who acted, not the current owner.
create policy comments_update on public.comments
  for update to authenticated
  using (author_person_ref = public.current_person_ref())
  with check (author_person_ref = public.current_person_ref());

create policy comments_delete on public.comments
  for delete to authenticated
  using (author_person_ref = public.current_person_ref());

-- The snapshot is SERVER-DERIVED, and that is the point of this table.
--
-- An earlier version let the client send `author_person_ref` and had the insert
-- policy verify it. Correct, but FRAGILE AS A COPIED PATTERN: an app that
-- copies the policy and drops the `and author_person_ref = …` conjunct still
-- passes the "cannot post as another person's fursona" test — that is
-- `can_act_as` — and fails only the forged-snapshot test, which is the test
-- most likely to be dropped when a team adapts the suite to its own table.
-- Deriving it in a trigger makes the safe behaviour the default: there is no
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
    -- can never reach this branch — INSERT on the column is not granted — so it
    -- only leaves the deliberate `service_role` path open for imports and
    -- backfills, which is the same trust level that can write the table at all.
    raise exception 'author_person_ref cannot be derived: no active person for the caller';
  end if;

  return new;
end;
$$;

create trigger comments_derive_author_person_ref
before insert on public.comments
for each row execute function public.comments_derive_author_person_ref();

create or replace function public.comments_guard_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.author_person_ref is distinct from old.author_person_ref then
    raise exception 'author_person_ref is immutable';
  end if;
  if new.author_actor_id is distinct from old.author_actor_id then
    raise exception 'author_actor_id is immutable';
  end if;
  return new;
end;
$$;

create trigger comments_author_snapshot_immutable
before update on public.comments
for each row execute function public.comments_guard_snapshot();

revoke all on function public.comments_derive_author_person_ref() from public;
revoke all on function public.comments_guard_snapshot() from public;
