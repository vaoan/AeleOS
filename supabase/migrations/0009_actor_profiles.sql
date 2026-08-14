-- 0009 — what is on an actor's page, and how a person's fursonas are arranged.
--
-- `actors` deliberately gains NO column for any of this. It is the canonical
-- actor-model schema every app copies and `/api/actors/mine` is a written
-- contract; ordering, pinning and an actor's page are the hub's own concern, so
-- they live in a companion table.
--
-- **The table is `actor_profiles`, not `fursona_profiles`.** A person has a
-- public profile page too, with the same sections a fursona's page has, so
-- content belongs to ACTORS. Two tables to say that would give one concept two
-- schemas. Arrangement — `sort_order` and `featured` — stays a fursona concept
-- even so: a person has nothing to be ordered among, and the functions below
-- keep the narrower ownership test for exactly that reason.

create table public.actor_profiles (
  actor_ref  uuid primary key references public.actors (actor_ref) on delete cascade,
  sort_order int,
  featured   boolean not null default false,
  -- The shape is Libra's `products.sections`, adopted unchanged, because
  -- divergence here is what would make a future port from that repository stop
  -- being mechanical:
  --
  --   section: { name_en, name_es, type, sort_order, items[] }
  --   item:    { title_en, title_es, description_en, description_es,
  --              icon?, image_url?, sort_order }
  --   type:    whatever is_section_type() accepts
  --
  -- This is NOT next-intl. Those catalogues are the app's own chrome, owned by
  -- the repository. These are a person's own words about their own character,
  -- stored as data — so a missing `*_es` is somebody who has not written the
  -- Spanish yet, which is an ordinary state and never an error.
  sections   jsonb not null default '[]'::jsonb,
  -- How the owner chose their page to look: {background?, accent?, backdropA?,
  -- canvasColours?, cursor?, canvas?}. `accent` is an `#rrggbb` string; `background` is
  -- a gradient — {angle, stops: [{color, at}]} — and `canvasColours` is one
  -- colour per part the chosen canvas paints with. Both are lists because a
  -- fursona can carry more colours than any fixed set of fields would allow.
  --
  -- The background is the one every other colour is solved against, which is
  -- what makes a custom theme one palette rather than a light and a dark
  -- variant. See `derivePalette` in the hub.
  --
  -- **An empty object means "override nothing", and that is not the same as a
  -- default.** `globals.css` uses different accent HUES for light and dark
  -- deliberately, so no single stored colour reproduces both — a theme that
  -- always carried an accent would restyle every unthemed page in one of the
  -- two modes. Absence is therefore the correct resting state, not a gap.
  --
  -- Deliberately NOT validated beyond its shape and size. The database has no
  -- business deciding whether a colour is legible; that is decided where it is
  -- rendered, by `legibleAccent` in `apps/hub/src/shared/domain/color.ts`, which
  -- keeps the hue somebody chose and solves the lightness against the surface.
  -- A check constraint here would be a migration every time the design moved.
  theme      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on column public.actor_profiles.sections is
  'Actor sections: [{name_en, name_es?, type, sort_order, items: [{title_en, title_es?, description_en, description_es?, icon?, image_url?, link_url?, sort_order}]}]. Validated by set_actor_sections.';

alter table public.actor_profiles enable row level security;

revoke all on public.actor_profiles from public, anon, authenticated;
grant select, insert, update on public.actor_profiles to authenticated;
grant select, insert, update, delete on public.actor_profiles to service_role;

-- No client delete grant, deliberately. A profile row is arrangement, not
-- content — there is nothing a person gains by removing one that setting its
-- columns does not already give them, and `on delete cascade` ties its lifetime
-- to the actor's.

-- ---------------------------------------------------------------------------
-- The ownership test, as a function rather than inline in each policy.
--
-- **It has to be SECURITY DEFINER, and the reason is not stylistic.** An RLS
-- policy is evaluated as the CALLING role, and 0001 revoked every client grant
-- on `public.actors` — so a policy that reads that table directly fails with
-- `42501: permission denied for table actors` before it can decide anything.
-- The first draft of this did exactly that, and the conformance suite caught it.
--
-- Ownership resolves through `current_person_ref()`, which filters to ACTIVE
-- people, so a suspended person cannot reorder or pin anything — the same
-- reason they cannot act as anybody. `status = 'active'` on the fursona itself
-- means a suspended or deleted one drops out of arrangement too: there is
-- nothing to arrange about a fursona nobody can see.
-- Sections belong to any actor the caller controls: their own person row, or a
-- fursona they own. The person branch compares against `current_person_ref()`
-- directly rather than re-deriving from `identity_sub`, so it inherits that
-- function's `status = 'active'` filter — a suspended person writing their own
-- page would otherwise be a door around their sanction.
create or replace function public.owns_active_actor(p_actor_ref uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.actors a
     where a.actor_ref = p_actor_ref
       and a.status    = 'active'
       and (a.actor_ref = public.current_person_ref()
            or a.owner_ref = public.current_person_ref())
  )
$$;

-- The narrower test, kept for ARRANGEMENT only. Ordering and pinning are about
-- a person's set of fursonas; there is exactly one person row, so applying them
-- to it would be meaningless rather than merely harmless.
create or replace function public.owns_active_fursona(p_actor_ref uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.actors a
     where a.actor_ref = p_actor_ref
       and a.kind      = 'fursona'
       and a.status    = 'active'
       and a.owner_ref = public.current_person_ref()
  )
$$;

revoke all on function public.owns_active_actor(uuid) from public;
revoke all on function public.owns_active_fursona(uuid) from public;
grant execute on function public.owns_active_actor(uuid) to service_role;
grant execute on function public.owns_active_fursona(uuid) to service_role;

-- Three policies rather than one `for all`, because the write cases need
-- `with check` and the read case would carry a clause it does not need.
create policy actor_profiles_owner_select on public.actor_profiles
  for select to authenticated
  using (public.owns_active_actor(actor_ref));

create policy actor_profiles_owner_insert on public.actor_profiles
  for insert to authenticated
  with check (public.owns_active_actor(actor_ref));

-- `using` and `with check` both, and they are not redundant: `using` decides
-- which rows may be updated, `with check` what they may become. Without the
-- second, a caller could move a row they own onto an actor_ref they do not.
create policy actor_profiles_owner_update on public.actor_profiles
  for update to authenticated
  using (public.owns_active_actor(actor_ref))
  with check (public.owns_active_actor(actor_ref));

-- ---------------------------------------------------------------------------
-- Ordering and pinning.
--
-- Both upsert, so a fursona needs no profile row until somebody arranges it.
-- Giving every fursona a row at birth would mean a second write on every create
-- and a row for the majority who never reorder anything.
--
-- Both reuse `owns_active_fursona` rather than repeating its subquery, so the
-- ownership rule has exactly one definition shared with the policies above.
-- They are still SECURITY DEFINER: they write through the policies rather than
-- around them, and the definer context is what lets them raise a deliberate
-- error instead of silently affecting zero rows.
create or replace function public.set_fursona_order(
  p_actor_ref  uuid,
  p_sort_order int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_active_fursona(p_actor_ref) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  insert into public.actor_profiles (actor_ref, sort_order)
  values (p_actor_ref, p_sort_order)
  on conflict (actor_ref)
  do update set sort_order = excluded.sort_order, updated_at = now();
end;
$$;

create or replace function public.set_fursona_featured(
  p_actor_ref uuid,
  p_featured  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_active_fursona(p_actor_ref) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  insert into public.actor_profiles (actor_ref, featured)
  values (p_actor_ref, p_featured)
  on conflict (actor_ref)
  do update set featured = excluded.featured, updated_at = now();
end;
$$;

-- The layouts a section may use.
--
-- Its own function rather than an `in (...)` inlined in the validator below:
-- adding a layout would otherwise mean restating a hundred and fifty lines of
-- validation to change one of them, and restating a long function to edit one
-- line is how the other hundred and forty-nine acquire a typo.
--
-- `immutable` because it is a constant set — the same answer for the same input
-- forever, which is what lets it be called once per section for free.
--
-- **Adding a layout is this function and nothing else in SQL.** Keep it in step
-- with `SECTION_TYPES` in `apps/hub/src/features/actors/domain/section-schema.ts`
-- — `section-limits-match-migration.test.ts` reads this list out of this file
-- and fails the build when the two disagree, so the drift cannot ship quietly.
--
-- Revoked from the client roles even though it reads nothing and could leak
-- nothing — the layout names are in the client bundle already. The reason is
-- `0010_client_grants.sql`, which is the readable index of what `anon` may
-- execute and says `0012` is the only exception. A second one that is merely
-- harmless makes that sentence false, and the next person to read it learns
-- something untrue about the client surface. `set_actor_sections` is
-- `security definer`, so it calls this as the owner and never as the caller.
create or replace function public.is_section_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    -- The four this started with, taken from Libra so a port stays mechanical.
    'cards', 'accordion', 'two-column', 'gallery',
    -- The expressive ones. A fursona page is somebody's character rather than
    -- a product listing, and the layouts that serve a catalogue do not stretch
    -- to a page whose whole job is to be theirs.
    'video', 'music', 'carousel', 'links', 'stats', 'quote', 'timeline'
  )
$$;

revoke all on function public.is_section_type(text) from public, anon;


-- ---------------------------------------------------------------------------
-- The validated content write.
--
-- Validation lives here rather than in a check constraint for two reasons. The
-- ownership rule already lives in `owns_active_fursona` and must not be
-- duplicated; and the errors have to be legible, because the editor has to tell
-- somebody which section is wrong and how.
--
-- That is deliberately the OPPOSITE judgement from the ownership error above,
-- which stays opaque. The shape of a person's own submission is not a secret.
-- Whose fursona an actor_ref belongs to is.
--
-- **Every required-field test uses `is distinct from`, not `<>`.** `jsonb_typeof`
-- of a missing key returns NULL, and `NULL <> 'string'` is NULL rather than
-- true, so `<>` would wave every missing field straight through.
create or replace function public.set_actor_sections(
  p_actor_ref uuid,
  p_sections  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- PRODUCT KNOBS, not safety laws — the same framing as the fursona quota.
  -- Nothing else in the schema depends on these numbers, and raising or
  -- lowering any of them is a product decision.
  --
  -- They exist because an unbounded jsonb reachable by any signed-in caller is
  -- the same hazard the quota closed, and worse: a fursona row costs one
  -- handle, a sections blob costs storage on every save with no natural ceiling.
  --
  -- `apps/hub/tests/section-limits-match-migration.test.ts` reads these four
  -- constants out of this file and fails if the client's copy stops matching.
  -- Renaming them or moving them to another file breaks that guard.
  c_max_sections constant int := 20;   -- past this it is a document, not a profile
  c_max_items    constant int := 50;   -- a gallery of fifty is already a lot to scroll
  c_max_text     constant int := 2000; -- long enough for a real description
  c_max_bytes    constant int := 65536;-- the backstop; see the end of this function

  v_section jsonb;
  v_item    jsonb;
  i         int := 0;
  j         int;
begin
  -- The GENERALISED test: a person's own page, or a fursona they own.
  if not public.owns_active_actor(p_actor_ref) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  if p_sections is null or jsonb_typeof(p_sections) is distinct from 'array' then
    raise exception 'sections must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_sections) > c_max_sections then
    raise exception 'too many sections (limit %)', c_max_sections
      using errcode = '22023';
  end if;

  for v_section in select * from jsonb_array_elements(p_sections) loop
    i := i + 1;

    if jsonb_typeof(v_section) is distinct from 'object' then
      raise exception 'section %: must be an object', i using errcode = '22023';
    end if;

    if jsonb_typeof(v_section -> 'name_en') is distinct from 'string' then
      raise exception 'section %: name_en is required', i using errcode = '22023';
    end if;

    -- name_es is deliberately not required. See the column comment.
    if not public.is_section_type(v_section ->> 'type') then
      raise exception 'section %: unknown type', i using errcode = '22023';
    end if;

    if jsonb_typeof(v_section -> 'sort_order') is distinct from 'number' then
      raise exception 'section %: sort_order is required', i
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_section -> 'items') is distinct from 'array' then
      raise exception 'section %: items must be an array', i
        using errcode = '22023';
    end if;

    if jsonb_array_length(v_section -> 'items') > c_max_items then
      raise exception 'section %: too many items (limit %)', i, c_max_items
        using errcode = '22023';
    end if;

    if length(coalesce(v_section ->> 'name_en', '')) > c_max_text
       or length(coalesce(v_section ->> 'name_es', '')) > c_max_text then
      raise exception 'section %: name is too long (limit %)', i, c_max_text
        using errcode = '22023';
    end if;

    j := 0;
    for v_item in select * from jsonb_array_elements(v_section -> 'items') loop
      j := j + 1;

      if jsonb_typeof(v_item) is distinct from 'object' then
        raise exception 'section %, item %: must be an object', i, j
          using errcode = '22023';
      end if;

      if jsonb_typeof(v_item -> 'title_en') is distinct from 'string' then
        raise exception 'section %, item %: title_en is required', i, j
          using errcode = '22023';
      end if;

      if jsonb_typeof(v_item -> 'description_en') is distinct from 'string' then
        raise exception 'section %, item %: description_en is required', i, j
          using errcode = '22023';
      end if;

      if jsonb_typeof(v_item -> 'sort_order') is distinct from 'number' then
        raise exception 'section %, item %: sort_order is required', i, j
          using errcode = '22023';
      end if;

      -- Every text field an item can carry, including the optional ones: a
      -- limit that skipped icon and image_url would leave two unbounded strings
      -- on every item.
      if length(coalesce(v_item ->> 'title_en', '')) > c_max_text
         or length(coalesce(v_item ->> 'title_es', '')) > c_max_text
         or length(coalesce(v_item ->> 'description_en', '')) > c_max_text
         or length(coalesce(v_item ->> 'description_es', '')) > c_max_text
         or length(coalesce(v_item ->> 'icon', '')) > c_max_text
         or length(coalesce(v_item ->> 'image_url', '')) > c_max_text
         or length(coalesce(v_item ->> 'link_url', '')) > c_max_text then
        raise exception 'section %, item %: text is too long (limit %)',
          i, j, c_max_text using errcode = '22023';
      end if;
    end loop;
  end loop;

  -- Checked LAST, on the serialised value, so it catches whatever the
  -- field-by-field rules above miss — including a shape that is legal in every
  -- individual field and ruinous in total.
  if octet_length(p_sections::text) > c_max_bytes then
    raise exception 'sections are too large (limit % bytes)', c_max_bytes
      using errcode = '22023';
  end if;

  -- Replaces rather than merges. The editor sends the whole document on every
  -- save, so merging would double it on the second one.
  insert into public.actor_profiles (actor_ref, sections)
  values (p_actor_ref, p_sections)
  on conflict (actor_ref)
  do update set sections = excluded.sections, updated_at = now();
end;
$$;

revoke all on function public.set_fursona_order(uuid, int) from public;
revoke all on function public.set_fursona_featured(uuid, boolean) from public;

-- Writes how somebody chose their own page to look.
--
-- Separate from `set_actor_sections` because the two are written by different
-- controls at different moments: the theme changes while somebody drags a
-- colour slider, and sending the whole section document on every frame of that
-- would be absurd. They share `owns_active_actor()` and nothing else.
--
-- **Validation is shape and size only.** Which colours exist is not a question
-- the database can answer — `#rrggbb` is checked because a value that is not a
-- colour cannot be rendered, and the total is capped because an unbounded
-- client-reachable write on a free-tier database is the actual risk here. The
-- legibility rule lives where the colour is rendered, not here.
--
-- An absent key means "override nothing", which is why nothing is required.
create or replace function public.set_actor_theme(
  p_actor_ref uuid,
  p_theme     jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_bytes constant int := 2048; -- a twelve-stop gradient, generously
  v_key   text;
  v_value text;
begin
  if not public.owns_active_actor(p_actor_ref) then
    -- The same wording and code as every other writer here: a caller must not
    -- learn whether an actor they do not own exists.
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  if p_theme is null or jsonb_typeof(p_theme) is distinct from 'object' then
    raise exception 'theme must be an object' using errcode = '22023';
  end if;

  if octet_length(p_theme::text) > c_max_bytes then
    raise exception 'theme is too large (limit % bytes)', c_max_bytes
      using errcode = '22023';
  end if;

  for v_key, v_value in select * from jsonb_each_text(p_theme) loop
    if v_key = 'background' then
      -- A gradient: {angle?, stops: [{color, at}]}. Shape and size only — which
      -- colours exist is not a question the database can answer, and the client
      -- drops any stop it cannot read rather than rendering one nobody picked.
      if jsonb_typeof(p_theme -> 'background' -> 'stops') is distinct from 'array'
         or jsonb_array_length(p_theme -> 'background' -> 'stops') = 0
         or jsonb_array_length(p_theme -> 'background' -> 'stops') > 12 then
        raise exception 'background: needs 1 to 12 stops' using errcode = '22023';
      end if;
    elsif v_key = 'canvasColours' then
      -- One colour per part the chosen canvas paints with — three cloud
      -- layers, three star layers, four aurora curtains. A list rather than
      -- named fields, because how many a canvas takes is the canvas's
      -- business; shape and length only, for the same reason the gradient is.
      if jsonb_typeof(p_theme -> 'canvasColours') is distinct from 'array'
         or jsonb_array_length(p_theme -> 'canvasColours') > 8 then
        raise exception 'canvasColours: at most 8' using errcode = '22023';
      end if;
    elsif v_key = 'accent' then
      if v_value !~ '^#[0-9a-fA-F]{6}$' then
        raise exception '%: must be #rrggbb', v_key using errcode = '22023';
      end if;
    elsif v_key = 'cursor' then
      -- A link to a picture, like every other picture here. Length only: which
      -- addresses exist is not a question the database answers, and the rule
      -- that matters — what may be written into a stylesheet — is enforced
      -- where it is written, by `cursorUrl` in the hub.
      if length(v_value) > 500 then
        raise exception 'cursor: address is too long' using errcode = '22023';
      end if;
    elsif v_key = 'skin' then
      -- The style the page's surfaces are built in — corners, border weight,
      -- shadow, the body's face. Not checked against a list, for the same
      -- reason the canvas is not: a skin is a set of CSS the app either
      -- implements or does not, the renderer falls back to the default for a
      -- name it does not know, and a list here would be a migration every time
      -- a style is added.
      if length(v_value) > 32 then
        raise exception 'skin: name is too long' using errcode = '22023';
      end if;
    elsif v_key = 'canvas' then
      -- Not checked against a list of canvases on purpose. A canvas is an
      -- animation the app either implements or does not, and the renderer
      -- already falls back for a name it does not know — so a list here would
      -- be a migration every time a canvas is added, guarding nothing the
      -- client does not guard already.
      if length(v_value) > 32 then
        raise exception 'canvas: name is too long' using errcode = '22023';
      end if;
    else
      raise exception 'unknown theme key %', v_key using errcode = '22023';
    end if;
  end loop;

  insert into public.actor_profiles (actor_ref, theme)
  values (p_actor_ref, p_theme)
  on conflict (actor_ref)
  do update set theme = excluded.theme, updated_at = now();
end;
$$;

revoke all on function public.set_actor_sections(uuid, jsonb) from public;
revoke all on function public.set_actor_theme(uuid, jsonb) from public, anon;
