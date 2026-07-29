create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  body              text not null,
  author_actor_id   uuid not null references public.actors (id) on delete restrict,
  author_person_ref uuid not null,
  created_at        timestamptz not null default now()
);

create index comments_author_actor_idx on public.comments (author_actor_id);

alter table public.comments enable row level security;

-- The service role drives migrations, seeding and tests.
grant select, insert, update, delete on public.comments to service_role;

-- Column-level grants: author_person_ref is writable on insert (the policy
-- forces it to be truthful) but never readable by a client (spec §8).
revoke all on public.comments from anon, authenticated;
grant select (id, body, author_actor_id, created_at) on public.comments to authenticated;
grant insert (id, body, author_actor_id, author_person_ref) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
grant delete on public.comments to authenticated;

create policy comments_select on public.comments
  for select to authenticated
  using (true);

-- May only author as an actor you control, and the snapshot must be truthful.
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    public.can_act_as(author_actor_id)
    and author_person_ref = public.current_person_ref()
  );

-- Editing and deleting resolve to the person who acted, not the current owner.
create policy comments_update on public.comments
  for update to authenticated
  using (author_person_ref = public.current_person_ref())
  with check (author_person_ref = public.current_person_ref());

create policy comments_delete on public.comments
  for delete to authenticated
  using (author_person_ref = public.current_person_ref());

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
