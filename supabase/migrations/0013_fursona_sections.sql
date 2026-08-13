-- 0013 — composable, bilingual content for a fursona.
--
-- Migrations are append-only: 0001–0012 are applied to the live database.
--
-- The shape is Libra's `products.sections`, adopted unchanged, because
-- divergence here is what would make a future port from that repository stop
-- being mechanical:
--
--   section: { name_en, name_es, type, sort_order, items[] }
--   item:    { title_en, title_es, description_en, description_es,
--              icon?, image_url?, sort_order }
--   type:    cards | accordion | two-column | gallery
--
-- This is NOT next-intl. Those catalogues are the app's own chrome, owned by
-- the repository. These are a person's own words about their own character,
-- stored as data — so a missing `*_es` is somebody who has not written the
-- Spanish yet, which is an ordinary state and never an error.
--
-- The column lands on `fursona_profiles`, not on `actors`. `actors` is the
-- canonical schema every app copies and /api/actors/mine is a written contract;
-- a fursona's art page has no business in either.
alter table public.fursona_profiles
  add column sections jsonb not null default '[]'::jsonb;

comment on column public.fursona_profiles.sections is
  'Fursona sections: [{name_en, name_es?, type, sort_order, items: [{title_en, title_es?, description_en, description_es?, icon?, image_url?, sort_order}]}]. Validated by set_fursona_sections.';

-- No new RLS policy, deliberately. `sections` is a column on a table 0012
-- already covers with three policies resolving ownership through
-- owns_active_fursona, and a new column inherits them. A `create policy` here
-- would mean the column landed on the wrong table.

-- ---------------------------------------------------------------------------
-- The validated write.
--
-- Validation lives here rather than in a check constraint for two reasons. The
-- ownership rule already lives in owns_active_fursona and must not be
-- duplicated; and the errors have to be legible, because phase 4's editor has
-- to tell somebody which section is wrong and how.
--
-- That is deliberately the OPPOSITE judgement from the ownership error below,
-- which stays opaque. The shape of a person's own submission is not a secret.
-- Whose fursona an actor_ref belongs to is.
--
-- Every required-field test uses `is distinct from`, not `<>`: jsonb_typeof of
-- a missing key returns NULL, and `NULL <> 'string'` is NULL rather than true,
-- so `<>` would wave every missing field straight through.
create or replace function public.set_fursona_sections(
  p_actor_ref uuid,
  p_sections  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- PRODUCT KNOBS, not safety laws — the same framing 0011 used for the
  -- fursona quota. Nothing else in the schema depends on these numbers, and
  -- raising or lowering any of them is a product decision.
  --
  -- They exist because an unbounded jsonb reachable by any signed-in caller is
  -- the same hazard 0011 closed, and worse: a fursona row costs one handle,
  -- a sections blob costs storage on every save with no natural ceiling.
  c_max_sections constant int := 20;   -- past this it is a document, not a profile
  c_max_items    constant int := 50;   -- a gallery of fifty is already a lot to scroll
  c_max_text     constant int := 2000; -- long enough for a real description
  c_max_bytes    constant int := 65536;-- the backstop; see the end of this function

  v_section jsonb;
  v_item    jsonb;
  i         int := 0;
  j         int;
begin
  if not public.owns_active_fursona(p_actor_ref) then
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

    -- name_es is deliberately not required. See the header.
    if v_section ->> 'type' is null
       or v_section ->> 'type' not in
          ('cards', 'accordion', 'two-column', 'gallery') then
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
      -- limit that skipped icon and image_url would leave two unbounded
      -- strings on every item.
      if length(coalesce(v_item ->> 'title_en', '')) > c_max_text
         or length(coalesce(v_item ->> 'title_es', '')) > c_max_text
         or length(coalesce(v_item ->> 'description_en', '')) > c_max_text
         or length(coalesce(v_item ->> 'description_es', '')) > c_max_text
         or length(coalesce(v_item ->> 'icon', '')) > c_max_text
         or length(coalesce(v_item ->> 'image_url', '')) > c_max_text then
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
  insert into public.fursona_profiles (actor_ref, sections)
  values (p_actor_ref, p_sections)
  on conflict (actor_ref)
  do update set sections = excluded.sections, updated_at = now();
end;
$$;

revoke all on function public.set_fursona_sections(uuid, jsonb) from public, anon;
grant execute on function public.set_fursona_sections(uuid, jsonb) to authenticated;
