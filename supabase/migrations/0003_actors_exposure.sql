alter table public.actors enable row level security;

-- No client role touches the base table directly.
revoke all on public.actors from anon, authenticated;

-- Safe projection: ownership columns are absent by construction.
create view public.actors_public as
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
  where a.visibility in ('public', 'unlisted')
     or a.identity_sub = auth.jwt() ->> 'sub'
     or a.owner_ref = public.current_person_ref();

grant select on public.actors_public to authenticated;
