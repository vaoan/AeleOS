alter table public.actors enable row level security;

-- No client role touches the base table directly.
revoke all on public.actors from anon, authenticated;

-- Safe projection: ownership columns are absent by construction.
--
-- security_barrier is REQUIRED, not cosmetic. This view runs with its owner's
-- privileges and its WHERE clause is the only thing between a caller and every
-- row in the table. Without the barrier, Postgres may push a caller-supplied
-- predicate (PostgREST exposes like/ilike/regex/full-text operators) beneath the
-- view's own filter, where it is evaluated against rows the caller must never
-- see. A leaky operator then discloses hidden data through errors or timing.
create view public.actors_public with (security_barrier = true) as
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

-- Same revoke-then-grant discipline used for the security definer functions:
-- never rely on a default for the highest-stakes object in the schema.
revoke all on public.actors_public from public, anon, authenticated;
grant select on public.actors_public to authenticated;
