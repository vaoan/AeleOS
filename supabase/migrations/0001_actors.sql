create extension if not exists pgcrypto;

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
  status        text not null default 'active'
                  check (status in ('active', 'suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint actors_person_shape check (
    kind <> 'person' or (identity_sub is not null and owner_ref is null)
  ),
  constraint actors_fursona_shape check (
    kind <> 'fursona' or (identity_sub is null and owner_ref is not null)
  )
);

grant select, insert, update, delete on public.actors to service_role;
grant select, insert, update, delete on public.actors to authenticated;
grant select on public.actors to anon;

create unique index actors_handle_lower_idx on public.actors (lower(handle));
create index actors_owner_ref_idx on public.actors (owner_ref);
create index actors_identity_sub_idx on public.actors (identity_sub);

-- kind and identity_sub are immutable; person actors are never transferable.
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
