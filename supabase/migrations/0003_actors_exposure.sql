-- 0003 — the two ways a client reads actors.
--
-- `actors_public` for browsing, `my_actors()` for the caller's own list. Both
-- are projections: 0001 revoked every client grant on the base table, and
-- neither of these gives it back.

-- Safe projection: the ownership columns are absent by construction.
--
-- **security_barrier is REQUIRED, not cosmetic.** This view runs with its
-- owner's privileges and its WHERE clause is the only thing between a caller
-- and every row in the table. Without the barrier, Postgres may push a
-- caller-supplied predicate (PostgREST exposes like/ilike/regex/full-text
-- operators) beneath the view's own filter, where it is evaluated against rows
-- the caller must never see. A leaky operator then discloses hidden data
-- through errors or timing.
--
-- The WHERE clause has three branches and each carries its own status rule:
--
--   * The **public/unlisted** branch requires `status = 'active'`. Without it, a
--     fursona a moderator had suspended but whose visibility was 'public' stayed
--     readable by every authenticated caller through PostgREST — a sanction that
--     publishing made routinely reachable could simply be ignored.
--   * The **owner** branches exclude only `deleted`. A blanket `status =
--     'active'` would be wrong: the hub's /me page renders from this view, so a
--     suspended PERSON would get a blank identity page — exactly the person who
--     most needs a truthful one. An owner keeps seeing their own suspended
--     fursona, because they must be able to see that it was sanctioned. They do
--     not keep seeing a deleted one, because they chose that.
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
  where (a.visibility in ('public', 'unlisted') and a.status = 'active')
     or ((a.identity_sub = auth.jwt() ->> 'sub'
          or a.owner_ref = public.current_person_ref())
         and a.status <> 'deleted');

-- Same revoke-then-grant discipline as the functions: never rely on a default
-- for the highest-stakes object in the schema.
revoke all on public.actors_public from public, anon, authenticated;
grant select on public.actors_public to authenticated;

-- `service_role` explicitly. A blanket `revoke ... from public` also strips the
-- default it would otherwise inherit, which was a real fault once — every
-- relation here grants it from the start now rather than needing a later fix.
grant select on public.actors_public to service_role;

-- The caller's own actors: their person row and the fursonas they own.
--
-- **Deliberately returns neither owner_ref nor identity_sub.** The caller
-- already knows they own these rows, so echoing the linkage back puts the
-- fursona → person mapping on the wire for no benefit — and this shape is what
-- `/api/actors/mine` serves to other applications, where that mapping must
-- never go.
--
-- Excludes `deleted` and nothing else. Ownership is the only other filter: a
-- suspended fursona still arrives, because its owner must be able to see it.
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
  where (a.identity_sub = auth.jwt() ->> 'sub'
         or a.owner_ref = public.current_person_ref())
    and a.status <> 'deleted'
  order by (a.kind = 'person') desc, lower(a.handle)
$$;

revoke all on function public.my_actors() from public;
