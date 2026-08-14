-- 0015 — a fursona's page is governed by the FURSONA's visibility.
--
-- `0012` required the owner's visibility to be `public` or `unlisted` before it
-- would serve a fursona's page. The reasoning was that a person who chose not
-- to have a public profile should not get their address turned into a directory
-- of their characters by another route.
--
-- **That reasoning was wrong, and an end-to-end test found it.** A person is
-- provisioned `private` — it is the column default and there is no interface
-- anywhere to change it — so the rule made a fursona's own `public` setting
-- mean nothing at all. Somebody could publish a character, share the link, and
-- get a 404 for a reason they could neither see nor fix. The first test that
-- created a fursona through the real editor and then read it as a stranger
-- failed on exactly that, which is what such a test is for.
--
-- The correct split, and it is a split about WHOSE resource is being asked for:
--
--   * A person's own profile page obeys the PERSON's visibility. That is the
--     resource they chose not to publish, and `public_person` still enforces it.
--   * A fursona's page obeys the FURSONA's visibility. Its owner set that
--     deliberately, per character, and nothing else should overrule it.
--
-- The owner's STATUS still governs both, and that is a different thing
-- entirely: a sanction is not a preference. A fursona whose owner is suspended
-- still serves nothing, because a person carries the sanction and must not shed
-- it by switching persona.
--
-- What this gives up is real and worth stating: a private person's address is
-- now a way to confirm that a particular handle under it is published. It
-- confirms nothing about the person, discloses no other character, and cannot
-- be walked — `public_fursona` takes a handle, so a caller must already know
-- the one they are asking about. Set against a visibility control that does not
-- exist making every published fursona unreachable, that is the better trade.
--
-- Everything below is 0012's body with the owner's visibility test removed.
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

-- `create or replace function` preserves the ACL, so 0012's grants stand.
-- Restated as the assertion of intent.
revoke all on function public.public_fursona(text, text) from public;
grant execute on function public.public_fursona(text, text) to anon;
grant execute on function public.public_fursona(text, text) to authenticated;
grant execute on function public.public_fursona(text, text) to service_role;
