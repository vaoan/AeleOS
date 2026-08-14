-- 0016 — a person may edit and publish their own profile.
--
-- `0012` serves `/{address}` from `public_person`, and `0015` made a fursona's
-- page obey its own visibility. Both left the same hole: **a person is
-- provisioned `private` and had no way to change it**, so their profile page
-- 404'd for everybody, permanently, including themselves.
--
-- Publishing needs more than a flag. Provisioning sets a person's handle to
-- `u-<actor_ref>` and no display name, and `public_person` falls back to the
-- handle — so a profile published as it stands would put a machine string at
-- the top of somebody's page. `docs/integrating.md` tells every consuming app
-- never to show that string to a person; the hub must not either. So this
-- writes the name and the picture as well as the visibility.
--
-- **The handle is deliberately absent.** A person's handle is derived from
-- their `actor_ref`, `create_fursona` reserves the whole `u-…` namespace
-- against squatting, and the ADDRESS is what somebody shares — a number or a
-- granted vanity, not this. Letting a person edit it would break the
-- reservation and change nothing they can see.
create or replace function public.update_my_profile(
  p_display_name text,
  p_avatar_url   text,
  p_visibility   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Raises 'person actor is suspended' or 'no person actor for caller', which
  -- is the whole reason it exists: current_person_ref() alone returns null for
  -- both and could not tell them apart.
  v_person uuid := public.require_active_person_ref();
begin
  if p_visibility is null
     or p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  update public.actors
     set display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
         avatar_url   = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         visibility   = p_visibility
   where actor_ref = v_person
     and kind      = 'person';
end;
$$;

-- No row count check, unlike update_fursona. That function has to tell a
-- missing row from somebody else's; this one can only ever address the caller's
-- own person row, which require_active_person_ref has already proven exists.
revoke all on function public.update_my_profile(text, text, text)
  from public, anon;
grant execute on function public.update_my_profile(text, text, text)
  to authenticated;
