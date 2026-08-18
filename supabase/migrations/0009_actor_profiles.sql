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
  -- A page is a TREE OF BLOCKS, not a flat list of sections. The column keeps
  -- its name because renaming it would be a table rewrite for no behaviour, and
  -- because a section still exists — it is a container at depth 0 that carries
  -- a name:
  --
  --   block:     { kind, span?, style?, … }, discriminated on `kind`
  --   kind:      whatever is_block_kind() accepts — `container`, or one leaf
  --              kind
  --   container: { kind: "container", mode, columns?, span?, name_en?,
  --                name_es?, children[], style? }
  --   mode:      whatever is_container_mode() accepts. A mode decides
  --              ARRANGEMENT and nothing else, which is the whole point of
  --              the model: the layouts it replaces welded an arrangement to a
  --              content kind, so "a player beside a paragraph" was not merely
  --              unsupported but unrepresentable.
  --   leaf:      { kind, span?, title_en, title_es?, description_en?,
  --                description_es?, icon?, image_url?, link_url?, rows?,
  --                style? }
  --   rows:      the rows of cells a `table` leaf carries — an array of rows,
  --              each an array of { text_en?, text_es? }
  --   style:     { skin?, background_url?, background_fit?, card_size?,
  --                border? } — how the BLOCK chooses to look, form only and
  --              never colour. Every key is optional and absence means
  --              "inherit the page", exactly as the theme's own keys work.
  --              `skin` is not checked against a list of skins, for the same
  --              reason `set_actor_theme`'s page-level skin is not: the
  --              renderer falls back for a name it does not know. `card_size`
  --              (s/m/l) is STORED AND READ BY NO RENDERER today — it named a
  --              minimum card width for a grid that chose its own column
  --              count, and a container declares its tracks explicitly now;
  --              the `comment on column` below says the same thing and this
  --              line contradicted it for a while.
  --              `border` (solid/dashed/dotted/double/none) sets
  --              `--skin-border-style` for the block; `none` is a CHOICE and
  --              absence is INHERITANCE of whatever the page already set — the
  --              two are different states, not the same one spelled two ways.
  --
  -- **Depth is capped and the cap is counted, not inferred.** A container at
  -- the cap is refused by name; see `validate_block` below, which is the guard
  -- this whole model rests on because `sections` is user-controlled `jsonb`
  -- written by any signed-in caller.
  --
  -- That sentence is only true because the write grant above names its
  -- columns. It did not, for a while: `authenticated` held `update` on the
  -- whole table and PostgREST exposes it, so this column was reachable with
  -- `validate_block` never invoked and every cap below was a convention rather
  -- than a guarantee. `tests/db/blocks.test.ts` asserts the direct write is
  -- refused, so the sentence cannot quietly become false again.
  --
  -- This is NOT next-intl. Those catalogues are the app's own chrome, owned by
  -- the repository. These are a person's own words about their own character,
  -- stored as data — so a missing `*_es` is somebody who has not written the
  -- Spanish yet, which is an ordinary state and never an error.
  sections   jsonb not null default '[]'::jsonb,
  -- How the owner chose their page to look: {background?, accent?,
  -- canvasColours?, cursor?, canvas?, backgroundUrl?, backgroundFit?}. `accent`
  -- is an `#rrggbb` string; `background` is a gradient — {angle, stops:
  -- [{color, at}]} — and `canvasColours` is one colour per part the chosen
  -- canvas paints with. Both are lists because a fursona can carry more
  -- colours than any fixed set of fields would allow.
  --
  -- `backgroundUrl` is a picture behind the whole page, an address like
  -- `cursor` — nothing is stored — and `backgroundFit` is `cover` or `tile`.
  -- It sits OVER `background`, the gradient, never in place of it: see
  -- `bodyBackgroundVars` in the hub, which layers both into one
  -- `background-image` on `body` — the element the gradient itself paints on,
  -- not the `:root` rule the rest of the theme's colours reach.
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
  'An actor page as a TREE OF BLOCKS, not a flat list of sections. Each element is a block discriminated on kind, which is one of is_block_kind(). A container arranges: {kind: "container", mode, columns?, span?, name_en?, name_es?, children[], style?}, where mode is one of is_container_mode() and decides arrangement only. A leaf holds one piece of content: {kind, span?, title_en, title_es?, description_en?, description_es?, icon?, image_url?, link_url?, rows?, style?}, where rows is the rows of cells a table leaf carries, each cell {text_en?, text_es?}. A section is a container at depth 0 carrying a name; depth is capped and the cap is counted explicitly rather than inferred from shape. columns is a container own track count and span is a block share of the tracks of whatever contains it; a span wider than its parent is stored as typed and narrowed at render, never rewritten here. style is form only, never colour, every key optional meaning "inherit the page", and skin is not checked against a list for the same reason the page-level skin is not. card_size (s/m/l) is stored and read by no renderer today; it named a minimum card width for a grid that chose its own column count, and a container declares its tracks explicitly now. border (solid/dashed/dotted/double/none) sets --skin-border-style for the block; none is a choice and absence is inheritance of whatever the page already set. Validated by set_actor_sections, which walks the tree through validate_block.';

alter table public.actor_profiles enable row level security;

revoke all on public.actor_profiles from public, anon, authenticated;
grant select on public.actor_profiles to authenticated;

-- **The write grant names its COLUMNS, and that is what makes `validate_block`
-- a guarantee rather than a convention.**
--
-- It was `grant insert, update` with no column list. PostgREST exposes this
-- table, and the owner policies below permit any row the caller owns — so a
-- signed-in person could `PATCH /rest/v1/actor_profiles?actor_ref=eq.<their
-- own>` and set `sections` to arbitrary `jsonb` with `set_actor_sections` never
-- invoked: no depth cap, no byte cap, no block count, no vocabulary. Five
-- places in this repository call that function's caps "the guard this whole
-- model rests on", and a sentence like that is worse wrong than absent.
--
-- `sort_order` and `featured` are the whole of what a client legitimately
-- writes directly — checked against every `.from("actor_profiles")` in the app,
-- of which there are exactly two and both are reads. `actor_ref` is here
-- because an insert must name the row it creates. `sections` and `theme` are
-- reachable only through `set_actor_sections` and `set_actor_theme`, which are
-- `security definer` and therefore unaffected by what `authenticated` may do.
--
-- The blast radius of the old grant was smaller than the sentence implied and
-- that is worth recording rather than leaving to be rediscovered: the READ path
-- re-enforces depth, block count and bytes through `lenientBlocksSchema`, and
-- that recursion is bounded by construction, so a hostile tree blanked its own
-- page rather than reaching a renderer. What was genuinely unbounded was
-- storage on a $0 free tier, which is the hazard `validate_block`'s own comment
-- names.
grant insert (actor_ref, sort_order, featured),
      update (sort_order, featured)
  on public.actor_profiles to authenticated;

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

-- What a block may BE.
--
-- Its own function rather than an `in (...)` inlined in the validator below:
-- adding a kind would otherwise mean restating the whole of `validate_block`
-- to change one line of it, and restating a long function to edit one line is
-- how the rest of it acquires a typo.
--
-- `immutable` because it is a constant set — the same answer for the same input
-- forever, which is what lets it be called once per block for free.
--
-- **Adding a kind is this function and nothing else in SQL.** Keep it in step
-- with `BLOCK_KINDS` in `apps/hub/src/features/actors/domain/block-schema.ts`
-- — `block-limits-match-migration.test.ts` reads this list out of this file
-- and fails the build when the two disagree, so the drift cannot ship quietly.
--
-- Revoked from the client roles even though it reads nothing and could leak
-- nothing — the kind names are in the client bundle already. The reason is
-- `0010_client_grants.sql`, which is the readable index of what `anon` may
-- execute and says `0012` is the only exception. A second one that is merely
-- harmless makes that sentence false, and the next person to read it learns
-- something untrue about the client surface. `set_actor_sections` is
-- `security definer`, so it calls this as the owner and never as the caller.
create or replace function public.is_block_kind(p_kind text)
returns boolean
language sql
immutable
as $$
  select p_kind in (
    -- A block that ARRANGES rather than holds content. A section is one of
    -- these at depth 0 carrying a name, which is what collapses two parallel
    -- models into one: one style bag, one renderer, one validator.
    'container',
    -- The plain leaves: a heading with prose, an anchor, a pasted picture.
    'text', 'link', 'picture',
    -- The embedded leaves. Each resolves through the provider table rather
    -- than framing whatever somebody pasted.
    'player', 'post', 'social',
    -- The leaves that invert the title/description pair when they render —
    -- the description is the big text and the title is its label. That
    -- inversion is a rendering fact rather than a schema one, so the fields
    -- are named the same here for every kind.
    'stat', 'quote', 'progress',
    -- The only kind that reads `rows`. Every other kind ignores it and stores
    -- it regardless, so switching a block kind to look at it and switching
    -- back finds what was typed still there.
    'table'
  )
$$;

revoke all on function public.is_block_kind(text) from public, anon;

-- How a container arranges what is inside it.
--
-- A separate list from the kinds above, and that separation is the model: a
-- mode decides ARRANGEMENT and a kind decides CONTENT, where the layouts this
-- replaces welded the two together — `gallery` was a grid _of pictures_ — so
-- every new idea had to become another welded pair.
--
-- Kept in step with `CONTAINER_MODES` in `block-schema.ts` by the same guard,
-- and revoked from the client roles for the same reason.
create or replace function public.is_container_mode(p_mode text)
returns boolean
language sql
immutable
as $$
  select p_mode in (
    -- The resting state. It lays out nothing at all.
    'stack',
    -- Uniform tracks, at the container's own `columns` count.
    --
    -- A `columns` MODE sat beside this one and was removed before anything
    -- could store one: this comment claimed it filled the tracks downward,
    -- `block-schema.ts` claimed it was identical to `grid`, and the renderer
    -- shipped a third thing. A track count is already a parameter of `grid`,
    -- so a second mode for it welds a dial to an arrangement.
    'grid',
    -- Packs by height through CSS multi-column layout, where the uniform
    -- tracks above leave a ragged gap between a long entry and a short one.
    'masonry',
    -- Scrolls sideways at every width, which is the honest difference from a
    -- grid rather than a setting on one.
    'carousel',
    -- One panel at a time, where `accordion` may have every one open at once.
    'tabs', 'accordion',
    -- A sequence, read in order.
    'timeline'
  )
$$;

revoke all on function public.is_container_mode(text) from public, anon;

-- A container's own track count, or a block's share of its parent's.
--
-- One function for both, because a span is a count of its parent's tracks and
-- a vocabulary wider than the widest container could never be satisfied.
--
-- **Absent is legal and means one.** The client materialises that default on
-- the way through, so a payload it wrote always carries the key; a payload
-- written by hand may not, and refusing it would make the two disagree about a
-- value neither of them had.
--
-- **A `case` rather than a chain of `and`s.** SQL does not promise to evaluate
-- a conjunction left to right, so `jsonb_typeof(p_value) = 'number' and
-- (p_value::text)::numeric between …` may cast a string and raise instead of
-- answering false. `case` is the only construct here that guarantees the
-- order.
create or replace function public.is_track_count(p_value jsonb, p_max int)
returns boolean
language sql
immutable
as $$
  select case
    when p_value is null then true
    when jsonb_typeof(p_value) <> 'number' then false
    else (p_value::text)::numeric between 1 and p_max
         and (p_value::text)::numeric = trunc((p_value::text)::numeric)
  end
$$;

revoke all on function public.is_track_count(jsonb, int) from public, anon;


-- ---------------------------------------------------------------------------
-- One block, and everything beneath it.
--
-- **The depth guard is a hard counter passed explicitly, and that is the whole
-- reason this function takes a depth at all.** `sections` is user-controlled
-- `jsonb` reachable by any signed-in caller, and a recursive walk over it with
-- no counter is the shape that exhausts its own stack — inferring depth from
-- the shape of what is being walked is exactly the fault the guard exists to
-- prevent, because the shape is the attacker's. A container AT the cap is
-- refused before its children are read, so the recursion is bounded by the cap
-- and not by anything in the payload.
--
-- **It returns how many blocks the subtree holds** rather than nothing, so the
-- page-level count is accumulated by the same walk that validates. A second
-- pass to count would be a second place to get the recursion right.
--
-- **The message carries a PATH, `1.2.3`, not an index.** The editor has to say
-- which block is wrong and a bare ordinal cannot name one inside a tree. That
-- is the same judgement the flat validator made and the opposite of the
-- ownership error above, which stays opaque: the shape of a person's own
-- submission is not a secret, and whose actor a ref belongs to is.
--
-- **Every required-field test uses `is distinct from`, not `<>`.** `jsonb_typeof`
-- of a missing key returns NULL, and `NULL <> 'string'` is NULL rather than
-- true, so `<>` would wave every missing field straight through. The same trap
-- caught the list lookups: `not is_block_kind(NULL)` is NULL and raises
-- nothing, so each is paired with a `jsonb_typeof` test that is true — never
-- NULL — when the key is absent. The flat validator this replaces had exactly
-- that hole in it: a section carrying no `type` at all was accepted.
create or replace function public.validate_block(
  p_block jsonb,
  p_depth int,
  p_path  text
)
returns int
language plpgsql
immutable
as $$
declare
  -- PRODUCT KNOBS, not safety laws — the same framing as the fursona quota.
  -- Nothing else in the schema depends on these numbers, and raising or
  -- lowering any of them is a product decision.
  --
  -- They exist because an unbounded jsonb reachable by any signed-in caller is
  -- the same hazard the quota closed, and worse: a fursona row costs one
  -- handle, a page costs storage on every save with no natural ceiling.
  --
  -- `apps/hub/tests/block-limits-match-migration.test.ts` reads these
  -- constants out of this file and fails if the client's copy stops matching.
  -- Renaming them or moving them to another file breaks that guard.
  --
  -- The depth cap is set where independent costs bite: past it, "where am I"
  -- stops being answerable at a glance on a phone, and style recalculation
  -- grows with the node count nesting multiplies.
  c_max_depth    constant int := 3;    -- a container at this depth is refused
  c_max_children constant int := 50;   -- children one container may hold
  c_max_tracks   constant int := 4;    -- both `columns` and `span`
  c_max_rows     constant int := 50;   -- rows one `table` leaf may hold
  c_max_cells    constant int := 8;    -- a wider table cannot be read on a phone
  c_max_text     constant int := 2000; -- long enough for a real description

  v_kind  text;
  v_child jsonb;
  v_row   jsonb;
  v_cell  jsonb;
  v_key   text;
  v_value text;
  v_count int := 1; -- this block; children add themselves below
  n       int;
  m       int;
begin
  if jsonb_typeof(p_block) is distinct from 'object' then
    raise exception 'block %: must be an object', p_path using errcode = '22023';
  end if;

  v_kind := p_block ->> 'kind';
  if jsonb_typeof(p_block -> 'kind') is distinct from 'string'
     or not public.is_block_kind(v_kind) then
    raise exception 'block %: unknown kind', p_path using errcode = '22023';
  end if;

  -- **A span is checked against the vocabulary, NEVER against the parent's
  -- `columns`.** An in-range span wider than the container it currently sits
  -- in is accepted and stored as typed. Refusing it would make a page
  -- unsavable because of a value nobody can see; rewriting it would destroy
  -- what somebody typed, so dragging the block back out could not restore it.
  -- The renderer narrows instead — see `effectiveSpan` in the hub. Gate the
  -- field, never the value, exactly as `card_size` is handled.
  if not public.is_track_count(p_block -> 'span', c_max_tracks) then
    raise exception 'block %: span must be a whole number from 1 to %',
      p_path, c_max_tracks using errcode = '22023';
  end if;

  -- Every text field a block can carry, whatever its kind, including the
  -- optional ones: a limit that skipped `icon`, `image_url` or `link_url`
  -- would leave an unbounded string on every block. Checked across the
  -- container's keys and the leaf's together rather than per branch, because
  -- the cap is the same one and splitting it is how one half stops being
  -- updated.
  --
  -- `length()` counts CHARACTERS where the client's `z.string().max()` counts
  -- UTF-16 code units, so an astral character costs the client two and this
  -- one. The database is therefore the more permissive of the two, which is
  -- the safe direction: the editor never promises a save this refuses.
  if length(coalesce(p_block ->> 'name_en', '')) > c_max_text
     or length(coalesce(p_block ->> 'name_es', '')) > c_max_text
     or length(coalesce(p_block ->> 'title_en', '')) > c_max_text
     or length(coalesce(p_block ->> 'title_es', '')) > c_max_text
     or length(coalesce(p_block ->> 'description_en', '')) > c_max_text
     or length(coalesce(p_block ->> 'description_es', '')) > c_max_text
     or length(coalesce(p_block ->> 'icon', '')) > c_max_text
     or length(coalesce(p_block ->> 'image_url', '')) > c_max_text
     or length(coalesce(p_block ->> 'link_url', '')) > c_max_text then
    raise exception 'block %: text is too long (limit %)', p_path, c_max_text
      using errcode = '22023';
  end if;

  -- `rows` is read only by a `table` leaf, and it is validated for EVERY block
  -- that carries one, container included. **Not because a container may
  -- legitimately hold one — it may not; `ContainerBlock` has no such field and
  -- the strict schema refuses it — but because this function is not the strict
  -- schema.** It accepts a stray key it has no opinion about, so a `rows` on a
  -- container is a shape that CAN arrive here, and an array reached by no cap
  -- at all is the thing this block exists to prevent. Checking it once for
  -- every block is also one rule rather than two that could disagree about
  -- which branch owns it.
  if p_block ? 'rows' then
    if jsonb_typeof(p_block -> 'rows') is distinct from 'array' then
      raise exception 'block %: rows must be an array', p_path
        using errcode = '22023';
    end if;

    if jsonb_array_length(p_block -> 'rows') > c_max_rows then
      raise exception 'block %: too many rows (limit %)', p_path, c_max_rows
        using errcode = '22023';
    end if;

    m := 0;
    for v_row in select * from jsonb_array_elements(p_block -> 'rows') loop
      m := m + 1;

      if jsonb_typeof(v_row) is distinct from 'array' then
        raise exception 'block %, row %: must be an array', p_path, m
          using errcode = '22023';
      end if;

      if jsonb_array_length(v_row) > c_max_cells then
        raise exception 'block %, row %: too many cells (limit %)',
          p_path, m, c_max_cells using errcode = '22023';
      end if;

      for v_cell in select * from jsonb_array_elements(v_row) loop
        if jsonb_typeof(v_cell) is distinct from 'object' then
          raise exception 'block %, row %: a cell must be an object', p_path, m
            using errcode = '22023';
        end if;

        if length(coalesce(v_cell ->> 'text_en', '')) > c_max_text
           or length(coalesce(v_cell ->> 'text_es', '')) > c_max_text then
          raise exception 'block %, row %: cell text is too long (limit %)',
            p_path, m, c_max_text using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;

  -- A block's own style: {skin?, background_url?, background_fit?,
  -- card_size?, border?}. Form only, never colour — see the column comment.
  -- Optional and absent as a whole, exactly like every other key here, and
  -- identical at every depth: a nested container styles itself the same way a
  -- section does, because a section IS a container.
  if p_block ? 'style' then
    if jsonb_typeof(p_block -> 'style') is distinct from 'object' then
      raise exception 'block %: style must be an object', p_path
        using errcode = '22023';
    end if;

    -- Key by key with an unknown-key fallthrough, exactly as
    -- set_actor_theme does: a typo is refused at the write rather than
    -- stored and silently ignored.
    for v_key, v_value in select * from jsonb_each_text(p_block -> 'style') loop
      -- jsonb_each_text yields SQL NULL, not the string "null", for a JSON
      -- null value — so length(v_value) > 32 and v_value not in (…) below
      -- are themselves NULL and neither raises. None of the style bag's
      -- keys accepts null in the client's schema (each is an optional
      -- STRING, never a nullable one), so without this check
      -- {"skin": null} and {"background_fit": null} were silently stored,
      -- a live divergence from the validator this SQL is supposed to agree
      -- with.
      if v_value is null then
        raise exception 'block %: style key % must not be null', p_path, v_key
          using errcode = '22023';
      end if;

      if v_key = 'skin' then
        -- Not checked against a list of skins, for the same reason the
        -- page-level skin is not: a skin is a set of CSS the app either
        -- implements or does not, the renderer falls back for a name it
        -- does not know, and a list here would be a migration every time a
        -- skin is added.
        if length(v_value) > 32 then
          raise exception 'block %: skin name is too long', p_path using errcode = '22023';
        end if;
      elsif v_key = 'background_url' then
        if length(v_value) > 500 then
          raise exception 'block %: background address is too long', p_path using errcode = '22023';
        end if;
      elsif v_key = 'background_fit' then
        if v_value not in ('cover', 'tile') then
          raise exception 'block %: unknown background fit', p_path using errcode = '22023';
        end if;
      elsif v_key = 'card_size' then
        if v_value not in ('s', 'm', 'l') then
          raise exception 'block %: unknown card size', p_path using errcode = '22023';
        end if;
      elsif v_key = 'border' then
        if v_value not in ('solid', 'dashed', 'dotted', 'double', 'none') then
          raise exception 'block %: unknown border style', p_path using errcode = '22023';
        end if;
      else
        raise exception 'block %: unknown style key %', p_path, v_key using errcode = '22023';
      end if;
    end loop;
  end if;

  if v_kind = 'container' then
    -- **Before anything below it is read.** The cap bounds the recursion, so
    -- it has to fire on the container itself rather than on what it holds.
    -- The wording matches `TOO_DEEP_MESSAGE` in the client's schema, so the
    -- app and the database say one thing about one payload.
    if p_depth >= c_max_depth then
      raise exception 'block %: too deep', p_path using errcode = '22023';
    end if;

    if jsonb_typeof(p_block -> 'mode') is distinct from 'string'
       or not public.is_container_mode(p_block ->> 'mode') then
      raise exception 'block %: unknown mode', p_path using errcode = '22023';
    end if;

    if not public.is_track_count(p_block -> 'columns', c_max_tracks) then
      raise exception 'block %: columns must be a whole number from 1 to %',
        p_path, c_max_tracks using errcode = '22023';
    end if;

    if p_block ? 'children' then
      if jsonb_typeof(p_block -> 'children') is distinct from 'array' then
        raise exception 'block %: children must be an array', p_path
          using errcode = '22023';
      end if;

      -- Checked BEFORE the loop, so a container claiming a million children
      -- is refused without any of them being walked.
      if jsonb_array_length(p_block -> 'children') > c_max_children then
        raise exception 'block %: too many children (limit %)',
          p_path, c_max_children using errcode = '22023';
      end if;

      n := 0;
      for v_child in select * from jsonb_array_elements(p_block -> 'children') loop
        n := n + 1;
        v_count := v_count
          + public.validate_block(v_child, p_depth + 1, p_path || '.' || n);
      end loop;
    end if;
  else
    -- **A leaf holding children is refused rather than ignored**, and this is
    -- the one unknown-key rule here that earns its place. Every other stray
    -- key costs only the bytes it occupies, which the total cap already
    -- bounds; a `children` array on a leaf is a subtree the depth counter
    -- never descends into and no cap above ever sees.
    if p_block ? 'children' then
      raise exception 'block %: a leaf holds no children', p_path
        using errcode = '22023';
    end if;

    -- **A title is required and a description is not.** A leaf is a heading
    -- with something under it: without the heading there is a blank box and
    -- nothing to render, while without the description there is a perfectly
    -- good card — which is exactly what a template hands somebody to fill in.
    --
    -- **The length test is not redundant beside the type test, and leaving it
    -- out cost a page.** `jsonb_typeof` answers 'string' for `""`, so a leaf
    -- carrying an empty title was accepted here while the client's read schema
    -- refused it — and a failed read answers with an EMPTY PAGE, so one such
    -- leaf anywhere in the tree showed a stranger "nothing here yet" over a
    -- page full of content. The read is a floor now and this is the rule; a
    -- write that accepts a shape the model calls illegal is how the two get to
    -- disagree in the first place.
    if jsonb_typeof(p_block -> 'title_en') is distinct from 'string'
       or length(p_block ->> 'title_en') = 0 then
      raise exception 'block %: title_en is required', p_path
        using errcode = '22023';
    end if;
  end if;

  return v_count;
end;
$$;

revoke all on function public.validate_block(jsonb, int, text) from public, anon;


-- ---------------------------------------------------------------------------
-- The validated content write.
--
-- Validation lives here rather than in a check constraint for two reasons. The
-- ownership rule already lives in `owns_active_actor` and must not be
-- duplicated; and the errors have to be legible, because the editor has to tell
-- somebody which block is wrong and how.
--
-- That is deliberately the OPPOSITE judgement from the ownership error above,
-- which stays opaque. The shape of a person's own submission is not a secret.
-- Whose fursona an actor_ref belongs to is.
--
-- **This function walks nothing itself.** The per-block rules live in
-- `validate_block`, which recurses; what is left here is the two rules that are
-- about the PAGE rather than about any block in it — how many blocks it holds
-- in total, and how large it is serialised.
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
  -- The page-level knobs. The per-block ones live in `validate_block`, where
  -- they are used; the same drift guard reads them wherever they sit, so each
  -- is declared once rather than restated in whichever function reads it
  -- second.
  c_max_blocks constant int := 500;   -- counted at every depth, not at the top
  c_max_bytes  constant int := 65536; -- the backstop; see below

  v_block jsonb;
  v_count int := 0;
  i       int := 0;
begin
  -- The GENERALISED test: a person's own page, or a fursona they own.
  if not public.owns_active_actor(p_actor_ref) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  if p_sections is null or jsonb_typeof(p_sections) is distinct from 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  -- **Checked FIRST, and it used to be checked last.** The reason it moved is
  -- that the walk below is now recursive over user-controlled `jsonb`, and a
  -- payload bounded before it is walked is a walk that cannot be made
  -- expensive. It still catches everything the field-by-field rules miss —
  -- a shape legal in every individual field and ruinous in total — which was
  -- the whole reason for having it; that property never depended on being
  -- last, only on being measured over the serialised value.
  --
  -- `octet_length` is UTF-8 BYTES, and the client measures the same thing with
  -- `TextEncoder`. It once counted UTF-16 code units and called them bytes,
  -- which on one legal leaf of accented text differed by a factor of two — in
  -- the direction where the editor promises a save this function then refuses,
  -- after somebody has written the whole page. Spanish is this app's fallback
  -- language, so accented text is the ordinary case rather than the edge one.
  if octet_length(p_sections::text) > c_max_bytes then
    raise exception 'blocks are too large (limit % bytes)', c_max_bytes
      using errcode = '22023';
  end if;

  for v_block in select * from jsonb_array_elements(p_sections) loop
    i := i + 1;
    v_count := v_count + public.validate_block(v_block, 0, i::text);
  end loop;

  -- Counted at EVERY depth rather than at the top, which is the only count
  -- that means anything about a tree: ten containers of fifty leaves each is
  -- ten at the top and five hundred and ten on the page.
  if v_count > c_max_blocks then
    raise exception 'too many blocks (limit %)', c_max_blocks
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
--
-- **A JSON null is refused for every key, up front.** `jsonb_each_text`
-- yields SQL NULL, not the string "null", for one — so `length(v_value) >
-- 500` and `v_value !~ '^#...'` below are themselves NULL and neither raises.
-- The hub never sends one (`setActorTheme` omits a key rather than writing
-- null, per the column comment), so without this a `{"accent": null}` or
-- `{"cursor": null}` sent directly against this function was silently
-- stored — a live divergence from the client this SQL is supposed to agree
-- with, exactly the fault `validate_block`'s style block was given this
-- same guard for.
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
    if v_value is null then
      raise exception 'theme key % must not be null', v_key using errcode = '22023';
    end if;

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
    elsif v_key in ('density', 'speed', 'scale') then
      -- How busy the canvas is, and how fast. Numbers, and bounded loosely:
      -- the client clamps to its own range and a page renders whatever it
      -- finds, so this only has to keep a hostile value from being stored.
      if jsonb_typeof(p_theme -> v_key) is distinct from 'number'
         or (p_theme ->> v_key)::numeric <= 0
         or (p_theme ->> v_key)::numeric > 100 then
        raise exception '%: must be a positive number', v_key using errcode = '22023';
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
    elsif v_key = 'backgroundUrl' then
      -- A picture behind the whole page, like every other picture here.
      -- Length only, for the same reason `cursor` is: which addresses exist
      -- is not a question the database answers, and what may be written into
      -- a stylesheet is enforced where it is written, by `backgroundImageValue`
      -- in the hub.
      if length(v_value) > 500 then
        raise exception 'backgroundUrl: address is too long' using errcode = '22023';
      end if;
    elsif v_key = 'backgroundFit' then
      -- Tiled or covering the page. Checked against this fixed pair, unlike
      -- `skin` and `canvas`, for the same reason the block style bag in
      -- `validate_block` checks `card_size`: it is a closed, two-value
      -- choice rather than an open set of renderer names that grows with no
      -- migration here, so there is nothing lost by refusing a third value
      -- at the write.
      if v_value not in ('cover', 'tile') then
        raise exception 'backgroundFit: unknown fit' using errcode = '22023';
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
