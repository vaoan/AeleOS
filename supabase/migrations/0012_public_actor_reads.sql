-- 0012 — the entire anonymous read surface.
--
-- Two functions. Everything a stranger can see comes through them and nothing
-- else does.
--
-- **These are the FIRST functions in this schema granted to `anon`**, and
-- `0010_client_grants.sql` says so where somebody looking for the client
-- surface will read it. Every other function is revoked from `anon` and the
-- default privileges in `0001` keep it that way, so this grant is an exception
-- somebody made on purpose rather than a habit.
--
-- **Why functions and not a grant on `actors_public`.** Adding `anon` to that
-- view's grants would be one line and wrong four times over:
--
--   * It is reachable through PostgREST, so `anon` could LIST every public and
--     unlisted handle on the platform. "Unlisted" would then mean nothing: the
--     whole point is a page reachable by whoever holds the link and invisible
--     to whoever does not. A function taking an address cannot be walked.
--   * It exposes `visibility` and `status`, telling a stranger how somebody
--     configured their account and whether it has been sanctioned.
--   * It cannot reach `actor_profiles`, whose RLS is owner-only — and the page
--     is mostly sections.
--   * The owner-status rule below would have to go into a relation `/me`
--     renders from, blanking the identity page of the suspended person who most
--     needs a truthful one.

-- ---------------------------------------------------------------------------
-- A person's public profile, and the fursonas they have published.
create or replace function public.public_person(p_address text)
returns table (
  handle       text,
  display_name text,
  avatar_url   text,
  address      text,
  listed       boolean,
  sections     jsonb,
  fursonas     jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.handle,
    a.display_name,
    a.avatar_url,
    -- The CANONICAL address: the vanity when there is one, else the number.
    -- Returned so a page can emit rel="canonical" without a second query, and
    -- one profile does not accumulate two indexed addresses. Both keep
    -- resolving; a link shared under the number must never rot because somebody
    -- was later granted a nicer one.
    (
      select pa.address
        from public.person_addresses pa
       where pa.actor_ref = a.actor_ref
       order by (pa.kind = 'vanity') desc, pa.created_at
       limit 1
    ) as address,
    (a.visibility = 'public') as listed,
    coalesce(pr.sections, '[]'::jsonb) as sections,
    -- **ONLY THE PUBLIC ONES.** "The fursonas they own" is the natural
    -- implementation and it destroys what `unlisted` means: a link somebody
    -- chose not to publish would appear on a page anybody can read. This filter
    -- is deliberately NARROWER than public_fursona's below, which serves an
    -- unlisted fursona's own page — that difference IS the distinction between
    -- the two visibilities, not an inconsistency.
    coalesce(
      (
        select jsonb_agg(f order by f.featured desc, f.sort_order, f.handle)
          from (
            select s.handle,
                   s.display_name,
                   s.avatar_url,
                   coalesce(sp.featured, false)  as featured,
                   coalesce(sp.sort_order, 2147483647) as sort_order
              from public.actors s
              left join public.actor_profiles sp on sp.actor_ref = s.actor_ref
             where s.owner_ref  = a.actor_ref
               and s.kind       = 'fursona'
               and s.status     = 'active'
               and s.visibility = 'public'
          ) f
      ),
      '[]'::jsonb
    ) as fursonas
  from public.person_addresses pa
  join public.actors a on a.actor_ref = pa.actor_ref
  left join public.actor_profiles pr on pr.actor_ref = a.actor_ref
  where lower(pa.address) = lower(p_address)
    and a.kind       = 'person'
    and a.status     = 'active'
    and a.visibility in ('public', 'unlisted')
$$;

-- ---------------------------------------------------------------------------
-- One fursona's page, addressed under its owner.
-- **A fursona's page is governed by the FURSONA's visibility, not its owner's.**
-- The first version of this required the owner to be `public` or `unlisted`
-- too, reasoning that somebody who chose not to publish a profile should not
-- have their address turned into a directory of their characters by another
-- route. That reasoning was wrong and an end-to-end test found it: a person is
-- provisioned `private`, so the rule made a fursona's own `public` setting mean
-- nothing at all — somebody could publish a character, share the link, and get
-- a 404 for a reason they could neither see nor fix.
--
-- The correct split is about WHOSE resource is being asked for. A person's own
-- profile obeys the person's visibility, and `public_person` still enforces
-- that. A fursona's page obeys the fursona's, which its owner set deliberately,
-- per character.
--
-- The owner's STATUS still governs both, and that is a different thing: a
-- sanction is not a preference. A suspended person's fursonas serve nothing,
-- because a person carries the sanction and must not shed it by switching
-- persona.
--
-- What this gives up is real: a private person's address can confirm that a
-- particular handle under it is published. It confirms nothing about the
-- person, discloses no other character, and cannot be walked — this takes a
-- handle, so a caller must already know the one they are asking about.
create or replace function public.public_fursona(
  p_address text,
  p_handle  text
)
returns table (
  handle        text,
  display_name  text,
  avatar_url    text,
  owner_address text,
  listed        boolean,
  sections      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.handle,
    s.display_name,
    s.avatar_url,
    (
      select pa2.address
        from public.person_addresses pa2
       where pa2.actor_ref = o.actor_ref
       order by (pa2.kind = 'vanity') desc, pa2.created_at
       limit 1
    ) as owner_address,
    (s.visibility = 'public') as listed,
    coalesce(pr.sections, '[]'::jsonb) as sections
  from public.person_addresses pa
  join public.actors o on o.actor_ref = pa.actor_ref
  -- The handle resolves WITHIN THIS OWNER. Handles are unique per owner, so the
  -- same one under two addresses is two different characters; joining on the
  -- handle alone would serve a stranger's fursona from somebody else's address.
  join public.actors s
    on s.owner_ref = o.actor_ref
   and lower(s.handle) = lower(p_handle)
  left join public.actor_profiles pr on pr.actor_ref = s.actor_ref
  where lower(pa.address) = lower(p_address)
    and o.kind       = 'person'
    -- The owner's STATUS gates the page and their VISIBILITY does not. A
    -- sanction is not a preference: a person carries it and must not shed it by
    -- switching persona, and a public page is the one place strangers look.
    and o.status     = 'active'
    and s.kind       = 'fursona'
    and s.status     = 'active'
    -- Serves `unlisted` too — reachable by whoever holds the link, invisible to
    -- whoever does not.
    and s.visibility in ('public', 'unlisted')
$$;

-- ---------------------------------------------------------------------------
-- The grants.
--
-- Neither function returns `identity_sub`, `owner_ref`, `actor_ref`, or the raw
-- `visibility` and `status`. The column lists are written out rather than
-- selected with `*` so that a column added to `actors` later cannot start
-- reaching strangers because nobody revisited this file — the same rule
-- `/api/actors/mine` follows.
revoke all on function public.public_person(text) from public;
revoke all on function public.public_fursona(text, text) from public;

grant execute on function public.public_person(text) to anon;
grant execute on function public.public_person(text) to authenticated;
grant execute on function public.public_person(text) to service_role;

grant execute on function public.public_fursona(text, text) to anon;
grant execute on function public.public_fursona(text, text) to authenticated;
grant execute on function public.public_fursona(text, text) to service_role;
