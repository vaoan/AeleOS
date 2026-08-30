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
  --   block:     { kind, style?, … }, discriminated on `kind`
  --   kind:      whatever is_block_kind() accepts — `container`, or one leaf
  --              kind
  --   container: { kind: "container", mode, spaces?, weights?, name_en?,
  --                name_es?, children[], style? }
  --   spaces:    how many places the container lays out ACROSS, 1 to
  --              c_max_spaces. Absent means one. It is a WIDTH and never a
  --              total: `children` fills the places row by row and the
  --              section grows downward, so a part-filled last row is the
  --              ordinary state and the two counts are unrelated. weights is
  --              one whole share per place, 1 to c_max_weight, deciding how
  --              wide each place is relative to its siblings; absent means
  --              uniform, a list whose length is not `spaces` is refused on
  --              the write and ignored on the read, and it is stored for
  --              every mode though only `grid` lays tracks to spend it on. An
  --              entry may be JSON `null` — an empty place, which keeps its
  --              width on the page and draws nothing. The entries are
  --              POSITIONAL, because a merely shorter list cannot say that
  --              the middle place is empty; nothing may collapse or trim
  --              them, a trailing `null` included. `columns` and `span` are
  --              what this replaces and are refused by name.
  --   mode:      whatever is_container_mode() accepts. A mode decides
  --              ARRANGEMENT and nothing else, which is the whole point of
  --              the model: the layouts it replaces welded an arrangement to a
  --              content kind, so "a player beside a paragraph" was not merely
  --              unsupported but unrepresentable.
  --   leaf:      { kind, title_en, title_es?, description_en?,
  --                description_es?, icon?, image_url?, link_url?, rows?,
  --                style? }
  --   rows:      the rows of cells a `table` leaf carries — an array of rows,
  --              each an array of { text_en?, text_es?, icon? }
  --   style:     { skin?, background_url?, background_fit?, card_size?,
  --                border?, chrome?, label?, heading?, text_align?, image_fit?,
  --                radius?, heading_pad?, heading_image?, heading_fit?,
  --                heading_gap?, corners?, heading_corners? } — how the BLOCK
  --                chooses to look, form only and
  --              never colour. Every key is optional and absence means
  --              "inherit the page", exactly as the theme's own keys work.
  --              `skin` is not checked against a list of skins, for the same
  --              reason `set_actor_theme`'s page-level skin is not: the
  --              renderer falls back for a name it does not know. `card_size`
  --              (s/m/l) is STORED AND READ BY NO RENDERER today — it named a
  --              minimum card width for a grid that chose its own column
  --              count, and a container declares its spaces explicitly now;
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
  -- canvasColours?, cursor?, canvas?, backgroundUrl?, backgroundFit?,
  -- measure?}. `measure` is how wide the page lays its own sections — one of
  -- six named stops, checked against that closed list on the write, and absent
  -- meaning the design's own. `accent`
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
  'An actor page as a TREE OF BLOCKS, not a flat list of sections. Each element is a block discriminated on kind, which is one of is_block_kind(). A container arranges: {kind: "container", mode, spaces?, weights?, name_en?, name_es?, children[], style?}, where mode is one of is_container_mode() and decides arrangement only. A leaf holds one piece of content: {kind, title_en, title_es?, description_en?, description_es?, icon?, image_url?, link_url?, rows?, style?}, where rows is the rows of cells a table leaf carries, each cell {text_en?, text_es?, icon?}, the icon being a mark drawn beside the row and read from the row''s first cell only. A section is a container at depth 0 carrying a name; depth is capped and the cap is counted explicitly rather than inferred from shape. spaces is how many places the container lays out ACROSS, absent meaning one. It is a width and never a total: children fill the places row by row and the section grows downward, so a part-filled last row is the ordinary state and the two counts are unrelated. weights is one whole share per place, 1 to 6, deciding how wide each place is relative to its siblings; absent means uniform, a list whose length is not spaces is refused on the write and ignored on the read, and it is stored for every mode though only grid lays tracks to spend it on. A children entry may be JSON null, an empty place that keeps its width on the page and draws nothing; the entries are positional, because a merely shorter list cannot say that the middle place is empty, and nothing may collapse or trim them, a trailing null included. columns and span are what spaces replaces and are refused by name, so a stale writer hears about it rather than having the page come back a shape nobody chose. style is form only, never colour, every key optional meaning "inherit the page", and skin is not checked against a list for the same reason the page-level skin is not. card_size (s/m/l) is stored and read by no renderer today; it named a minimum card width for a grid that chose its own column count, and a container declares its spaces explicitly now. border (solid/dashed/dotted/double/none) sets --skin-border-style for the block; none is a choice and absence is inheritance of whatever the page already set. chrome (card/bare) decides whether the block''s content sits in a card at all: bare drops the fill, the edge, the shadow and the padding together, which border=none cannot do because it removes the border style alone. label (show/hidden) decides whether the block draws its own title as a label, composing with whatever the enclosing mode already decided rather than overriding it: hidden can only narrow that decision, absence and show never widen it, and absence is exactly what the mode''s own decision alone always meant. heading (plain/bar/gradient/soft) is how a NAMED container draws its name, plain floating it above the content, bar making it a solid strip with the content squared off beneath, gradient the same strip with a symmetric vertical sheen, and soft that strip in a quieter tone derived from the accent rather than a second colour anybody picks; it is read only where a name exists. heading_image is a picture painted ON that strip and heading_fit (cover/tile) is how it lies, both read only where a bar is drawn; the picture goes over the fill rather than instead of it, so one that fails to load leaves the author''s own colour behind the bar, and it is separate from background_url, which paints behind the CONTENT. heading_gap (none/snug/roomy) is the room between the name and what it names, and its absence is not one value: a bar welds to its content and a plain name floats above it, so absent means whichever of those applies and the key is how an author says something else. text_align (start/center/end) sets the edge the block''s own text is set against, inherited by the surfaces beneath it. image_fit (cover/contain) is how a picture fills its box: cover crops and contain does not, absent being cover. radius (square/soft/round) overrides the skin''s own corner, absent inheriting it. heading_pad (snug/roomy) is how much room a named block''s name is given and is read only where heading draws a bar, absent being the ordinary strip. bleed is a boolean read at depth 0 only: true takes the section out of the measure its page chose so it reaches both edges of the window, absent means it sits inside that measure. It is stored at any depth, because a key that means nothing where it sits costs nothing and refusing it would make moving a section into another one fail on a style it carried legitimately a moment before. margins is a boolean read at depth 0 only and independent of bleed, which decides width alone: absent or true keeps the page chrome around that section, meaning its side gutter, the gap to its neighbour, and the space under the bar or above the floor when it is first or last, while false removes all of it, which is what makes a first section a banner and a last one a footer. Absence is what every page written before this key was added carries, so the editor stores false alone and never true. It is stored at any depth for the same reason bleed is. Validated by set_actor_sections, which walks the tree through validate_block.';

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
-- THE SET IS THE DEFINITION, AND THE PREDICATE IS DERIVED FROM IT.
--
-- `owns_active_actor` is a `security definer` function, which Postgres cannot
-- inline — so a policy written as `using (owns_active_actor(actor_ref))` calls
-- it ONCE PER ROW of the table being scanned. `readArrangement` selects
-- `actor_profiles` with no filter of its own, because RLS is what narrows it,
-- and that combination is a sequential scan with a non-inlinable function call
-- on every row. Measured on the live project at 6,206 rows, returning nine of
-- them:
--
--   Seq Scan on actor_profiles (actual time=542..1383 rows=9 loops=1)
--     Filter: owns_active_actor(actor_ref)
--     Rows Removed by Filter: 6206
--     Buffers: shared hit=56748
--   Execution Time: 1383.579 ms
--
-- Asking for MEMBERSHIP of a set instead lets the planner evaluate the set once
-- as a hashed subplan: the same read is 2.5ms over 767 buffers. So the owned
-- set is the primary definition here and the boolean is written in terms of it,
-- rather than the two being separate pieces of SQL that have to be kept saying
-- the same thing.
--
-- **Inlining the subquery into the policy instead does not work, and the reason
-- is worth knowing before trying it again.** A policy expression is evaluated
-- as the CALLING role, and `authenticated` has no `select` on `public.actors`
-- by design — `0010_client_grants.sql` is the readable index of what a client
-- may touch. It fails with `permission denied for table actors`. A definer
-- function is what crosses that boundary, which is why one is kept.
create or replace function public.owned_active_actor_refs()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.actor_ref
    from public.actors a
   where a.status = 'active'
     and (a.actor_ref = public.current_person_ref()
          or a.owner_ref = public.current_person_ref())
$$;

create or replace function public.owns_active_actor(p_actor_ref uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_actor_ref in (select public.owned_active_actor_refs())
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

revoke all on function public.owned_active_actor_refs() from public;
revoke all on function public.owns_active_actor(uuid) from public;
revoke all on function public.owns_active_fursona(uuid) from public;
-- `authenticated` also needs EXECUTE on the set function, because the SELECT
-- policy below names it and a policy expression runs as the calling role — but
-- that grant lives in `0010_client_grants.sql`, which revokes execute on every
-- function in the schema and grants back an allowlist. A grant written here is
-- silently undone by that revoke, which is exactly what happened first.
grant execute on function public.owned_active_actor_refs() to service_role;
grant execute on function public.owns_active_actor(uuid) to service_role;
grant execute on function public.owns_active_fursona(uuid) to service_role;

-- Three policies rather than one `for all`, because the write cases need
-- `with check` and the read case would carry a clause it does not need.
-- Membership rather than a predicate, so the owned set is computed once for the
-- whole scan instead of once per row. See the note above the functions for the
-- measurement; the visible rows are identical, checked across 61 callers.
create policy actor_profiles_owner_select on public.actor_profiles
  for select to authenticated
  using (actor_ref in (select public.owned_active_actor_refs()));

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
    -- The embedded leaf. `embed` frames ANY provider the table recognises, and
    -- it resolves through that table rather than framing whatever somebody
    -- pasted. It absorbed what `player` used to mean: the two were one leaf
    -- under two names, with byte-identical field sets and one renderer, and
    -- they differed only in a fallback and in an undocumented bug where one
    -- passed Twitch's `parent=` and the other did not.
    'embed', 'social',
    -- The retro players, which are OURS rather than a provider's. `player` has
    -- a video pane and `jukebox` does not, and that line is LICENSING rather
    -- than technical: YouTube's terms forbid hiding its player, so only a
    -- chrome with somewhere to show one may offer a YouTube address. Both read
    -- `rows` as a playlist and `icon` as which chrome to wear.
    'player', 'jukebox',
    -- The leaves that invert the title/description pair when they render —
    -- the description is the big text and the title is its label. That
    -- inversion is a rendering fact rather than a schema one, so the fields
    -- are named the same here for every kind.
    'stat', 'quote', 'progress',
    -- Reads `rows` as its cells, and is NOT the only kind that does:
    -- `player` and `jukebox` above read the same field as their
    -- playlist. This comment asserted that exclusivity until
    -- 2026-08-28, contradicting the `player`/`jukebox` line sixteen
    -- lines above it in this same list. What IS true of every kind
    -- that reads none of them is that it stores `rows` anyway, so
    -- switching a block kind to look at the field and switching back
    -- finds what was typed still there.
    'table',
    -- The identity leaves. Their content is the ACTOR's — resolved by the
    -- renderer from the row, not typed into the block — so there is nothing
    -- kind-specific for `validate_block` to check: the generic field rules
    -- cover the title that `owner` and `fursonas` read, and the other three
    -- read no field at all.
    --
    -- This says which names EXIST. Which of them a page must carry is
    -- `set_actor_sections`' business and depends on `actors.kind`, because
    -- `owner` has nothing to render on a person's page and `fursonas` nothing
    -- on a fursona's.
    'avatar', 'handle', 'name', 'owner', 'fursonas'
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
    -- A stack with a hairline between its children and no gap: the shape every
    -- modern feed has and the one `stack` cannot make, because a gap between
    -- cards is not a divided list. Arrangement only — it draws the rule and
    -- says nothing about whether the children are cards; `chrome` decides that.
    'list',
    -- Uniform tracks, one for each of the container's own `spaces`.
    --
    -- A `columns` MODE sat beside this one and was removed before anything
    -- could store one: this comment claimed it filled the tracks downward,
    -- `block-schema.ts` claimed it was identical to `grid`, and the renderer
    -- shipped a third thing. How many places a container offers is already a
    -- parameter of every mode, so a second mode for it welds a dial to an
    -- arrangement.
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

-- The function this one replaced, removed rather than left behind.
--
-- **A rename under `create or replace` creates a SECOND function**, and a
-- fresh database built from these files is therefore correct while a database
-- that ran the earlier file keeps the old one forever — grantless, unreferenced
-- and invisible to `pnpm test:db`, which resets to a fresh database where drift
-- cannot exist. `check:schema-drift` is the only check that can see it, and it
-- is the reason this line exists rather than a tidy-up.
--
-- `if exists` because a fresh database has never had one.
drop function if exists public.is_track_count(jsonb, int);

-- How many places ACROSS a container lays out.
--
-- **It replaces `is_track_count`, which measured `columns` and `span`.** Those
-- were the flow model: a container declared a track count and its children
-- streamed into it, so a place with nothing in it did not exist and the shape
-- an author chose vanished whenever their content did not fill it. A container
-- declares its width now and its children fill the places row by row, any one
-- of which may be an explicit nothing.
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
create or replace function public.is_space_count(p_value jsonb, p_max int)
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

revoke all on function public.is_space_count(jsonb, int) from public, anon;

-- ---------------------------------------------------------------------------
-- Whether a container's weight list is the right SHAPE — absent, or one share
-- per place.
--
-- **Absent is legal and means uniform**, which is what every page written
-- before weights existed means.
--
-- **The length is checked against the container's own `spaces`**, which is why
-- this takes a second argument where `is_space_count` takes one: a weight list
-- that is not one share per place is ignored on the read, so storing one would
-- silently drop an author's proportions at the moment they changed the count.
--
-- **This checks the SHAPE only — how many shares there are, not what each is
-- worth.** `validate_block` raises a different message for a wrong length
-- than for an out-of-range share, because they are not the same mistake:
-- telling somebody their fifth share is a "wrong length" problem names a
-- field they got right. The range is checked separately, inline in
-- `validate_block`, once this has already confirmed `p_value` is a non-null
-- array — which is also why that check may call `jsonb_array_elements`
-- directly without settling the type itself first.
create or replace function public.is_weight_list(
  p_value jsonb, p_length int
)
returns boolean
language sql
immutable
as $$
  select case
    when p_value is null then true
    when jsonb_typeof(p_value) <> 'array' then false
    else jsonb_array_length(p_value) = p_length
  end
$$;

revoke all on function public.is_weight_list(jsonb, int) from public, anon;

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
  -- Places a container lays out ACROSS, which is the authoring vocabulary
  -- somebody picks a shape from. It replaces `c_max_tracks`, and it is NOT a
  -- total: children fill the places row by row and the section grows
  -- downward, so a fifty-picture gallery is a three-space section with
  -- seventeen rows. A cap of six with a cap of fifty children is therefore
  -- two numbers on purpose.
  c_max_spaces   constant int := 6;
  -- The largest share one place may take of its container's width — the same
  -- ceiling as c_max_spaces and not by coincidence: both are "how lopsided may
  -- one container be", counted from opposite ends.
  c_max_weight   constant int := 6;
  c_max_children constant int := 50;   -- children one container may hold
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

  -- **`columns` and `span` are refused BY NAME rather than ignored as stray
  -- keys.** They are the flow model this replaces, and every other unknown key
  -- here costs only the bytes it occupies — but these two carried meaning that
  -- is gone. A stale editor writing one would have it silently dropped and the
  -- page would come back a shape nobody chose, which is the failure this whole
  -- model exists to end.
  if p_block ? 'columns' or p_block ? 'span' then
    raise exception 'block %: columns and span were replaced by spaces', p_path
      using errcode = '22023';
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

        -- A mark beside the row, read from the row's FIRST cell only. Named
        -- rather than checked against a list, exactly like a leaf's own icon:
        -- the renderer falls back when it does not know the name.
        if length(coalesce(v_cell ->> 'icon', '')) > c_max_text then
          raise exception 'block %, row %: cell icon is too long (limit %)',
            p_path, m, c_max_text using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;

  -- A block's own style: {skin?, background_url?, background_fit?,
  -- card_size?, border?, bleed?, margins?}. Form only, never colour — see the
  -- column comment.
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
      elsif v_key = 'chrome' then
        -- Whether the block's content sits in a card or on the page itself.
        -- `bare` drops the fill, the edge, the shadow and the padding
        -- together, which is what `border = 'none'` could not do: that removes
        -- the border STYLE alone. Absence is inheritance, as everywhere in
        -- this bag.
        if v_value not in ('card', 'bare') then
          raise exception 'block %: unknown chrome', p_path using errcode = '22023';
        end if;
      elsif v_key = 'label' then
        -- Whether the block draws its own title as a label, composing with
        -- whatever the enclosing mode already decided. `hidden` can only
        -- narrow that decision, never widen it: a mode that already
        -- suppressed the title keeps doing so. Absence is exactly what
        -- `labelled` alone always meant.
        if v_value not in ('show', 'hidden') then
          raise exception 'block %: unknown label style', p_path using errcode = '22023';
        end if;
      elsif v_key = 'heading' then
        -- How a NAMED container draws its name: `plain` floats it above the
        -- content, `bar` is a solid strip with the content squared off
        -- beneath. Read only where a name exists, and stored at any depth for
        -- the reason `bleed` is.
        if v_value not in ('plain', 'bar', 'gradient', 'soft') then
          raise exception 'block %: unknown heading style', p_path using errcode = '22023';
        end if;
      elsif v_key = 'text_align' then
        if v_value not in ('start', 'center', 'end') then
          raise exception 'block %: unknown text alignment', p_path using errcode = '22023';
        end if;
      elsif v_key = 'heading_pad' then
        -- How much room a named block's own name is given, read only where
        -- `heading` draws a bar. Absent is what every barred page had.
        if v_value not in ('snug', 'roomy') then
          raise exception 'block %: unknown heading padding', p_path using errcode = '22023';
        end if;
      elsif v_key = 'heading_image' then
        -- A picture painted ON the bar, read only where `heading` draws one.
        -- Independent of `background_url`: a block may carry one picture
        -- behind its content and a different one on its bar.
        if length(v_value) > 500 then
          raise exception 'block %: heading picture address is too long', p_path using errcode = '22023';
        end if;
      elsif v_key = 'heading_fit' then
        -- How that picture is laid down. Same vocabulary as
        -- `background_fit`, because it is the same question about the same
        -- kind of value.
        if v_value not in ('cover', 'tile') then
          raise exception 'block %: unknown heading fit', p_path using errcode = '22023';
        end if;
      elsif v_key in ('corners', 'heading_corners') then
        -- WHICH of a block's corners are rounded, as a comma-separated list of
        -- tl, tr, br and bl; `corners` is the block's own box and
        -- `heading_corners` its bar. `radius` says how MUCH and this says
        -- where, so the two compose: soft across the top with a square foot is
        -- the window shape a single radius could not draw. Absent means every
        -- corner, and there is deliberately no spelling for none — radius
        -- square already says that.
        if v_value !~ '^(tl|tr|br|bl)(,(tl|tr|br|bl))*$' then
          raise exception 'block %: unknown corner list', p_path using errcode = '22023';
        end if;
      elsif v_key = 'heading_gap' then
        -- The room between a named block's name and the content under it.
        -- Absence is not one value: a bar welds to its content and a plain
        -- name floats above it, so absent means whichever of those applies
        -- and this key is how an author says something else.
        if v_value not in ('none', 'snug', 'roomy') then
          raise exception 'block %: unknown heading gap', p_path using errcode = '22023';
        end if;
      elsif v_key = 'radius' then
        -- How round this block's corners are, independent of its skin. The
        -- corner used to come welded to a whole aesthetic; absent still
        -- inherits, so an existing page keeps the corner its skin chose.
        if v_value not in ('square', 'soft', 'round') then
          raise exception 'block %: unknown corner radius', p_path using errcode = '22023';
        end if;
      elsif v_key = 'image_fit' then
        -- How a picture fills its box. `cover` crops and `contain` does not;
        -- absent is `cover`, which is what every page carried before this key.
        -- A wide image — a logo, a banner — is unreadable cropped to a circle.
        if v_value not in ('cover', 'contain') then
          raise exception 'block %: unknown image fit', p_path using errcode = '22023';
        end if;
      elsif v_key = 'bleed' then
        -- **Checked as a JSON BOOLEAN, never as the text this loop yields.**
        -- `jsonb_each_text` renders true as the string 'true', which is
        -- precisely the value the client schema refuses — it is what a form
        -- control hands back when somebody forgets to convert it. Comparing
        -- `v_value` would accept the string and the boolean alike, so the two
        -- validators would disagree while appearing to say the same thing.
        --
        -- Meaningful at depth 0 only; a nested block cannot escape the section
        -- around it. Not enforced here, because a key that means nothing where
        -- it sits costs a page nothing, and refusing it would make moving a
        -- section INTO another one fail on a style it had every right to carry
        -- a moment earlier.
        if jsonb_typeof(p_block -> 'style' -> 'bleed') <> 'boolean' then
          raise exception 'block %: bleed must be true or false', p_path
            using errcode = '22023';
        end if;
      elsif v_key = 'margins' then
        -- **A JSON BOOLEAN, checked the same way and for the same reason as
        -- `bleed` above**, one polarity over: absent means the page's ordinary
        -- chrome, so the string 'false' — what a checkbox hands back when
        -- somebody forgets to convert it, and what `jsonb_each_text` would
        -- render the boolean as either way — would strip the chrome from a page
        -- whose author never chose that.
        --
        -- Read at depth 0 only and stored at any depth, again as `bleed` is:
        -- refusing it deeper would make moving a section INTO another one fail
        -- on a style it carried legitimately a moment earlier.
        if jsonb_typeof(p_block -> 'style' -> 'margins') <> 'boolean' then
          raise exception 'block %: margins must be true or false', p_path
            using errcode = '22023';
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

    if not public.is_space_count(p_block -> 'spaces', c_max_spaces) then
      raise exception 'block %: spaces must be a whole number from 1 to %',
        p_path, c_max_spaces using errcode = '22023';
    end if;

    if not public.is_weight_list(
         p_block -> 'weights',
         coalesce((p_block ->> 'spaces')::int, 1)
       ) then
      raise exception 'block %: weights must have one share per space',
        p_path using errcode = '22023';
    end if;

    -- A share out of range is not the same mistake as the wrong COUNT of
    -- them, and gets its own message naming the real cause: telling somebody
    -- their fifth share is a "wrong length" problem names a field they got
    -- right. Reached only once `is_weight_list` above has already confirmed
    -- `weights` is a non-null array, which is why `jsonb_array_elements` may
    -- be called directly here without settling the type itself.
    if p_block -> 'weights' is not null and exists (
         select 1
         from jsonb_array_elements(p_block -> 'weights') as e(v)
         where jsonb_typeof(v) <> 'number'
            or (v::text)::numeric not between 1 and c_max_weight
            or (v::text)::numeric <> trunc((v::text)::numeric)
       ) then
      raise exception 'block %: a share must be a whole number from 1 to %',
        p_path, c_max_weight using errcode = '22023';
    end if;

    -- **`children` is NOT tied to `spaces`, and a length that is not a
    -- multiple of it is the ordinary state**, not a fault: the places are a
    -- WIDTH, children fill them row by row, and the last row is usually part
    -- filled. An equality rule between the two was written here once and made
    -- a section of fifty pictures unrepresentable.
    if p_block ? 'children' then
      if jsonb_typeof(p_block -> 'children') is distinct from 'array' then
        raise exception 'block %: children must be an array', p_path
          using errcode = '22023';
      end if;

      -- Checked BEFORE the loop, so a container claiming a million children
      -- is refused without any of them being walked. This is where the bound
      -- on the recursion actually is: the client's own cap cannot do it,
      -- because zod parses an array's elements before applying its `.max()`.
      if jsonb_array_length(p_block -> 'children') > c_max_children then
        raise exception 'block %: too many children (limit %)',
          p_path, c_max_children using errcode = '22023';
      end if;

      n := 0;
      for v_child in select * from jsonb_array_elements(p_block -> 'children') loop
        n := n + 1;
        -- **An empty space is a JSON `null` and is not a block.** A space is
        -- positional: a merely shorter list cannot say that the middle one
        -- is empty, and an empty space keeps its width on the page. It adds
        -- nothing to the count, because there is nothing there to render.
        if jsonb_typeof(v_child) <> 'null' then
          v_count := v_count
            + public.validate_block(v_child, p_depth + 1, p_path || '.' || n);
        end if;
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
-- Every block kind present anywhere in a page, at any depth.
--
-- **A separate walk rather than a tally threaded through `validate_block`.**
-- That function is what every block passes through, it is immutable, it is
-- revoked from `public` and `anon`, and
-- `apps/hub/tests/block-limits-match-migration.test.ts` reads its constants out
-- of this file. Changing its signature to carry a two-line feature spreads the
-- feature across all of that. A second walk over a tree already capped at 500
-- blocks costs nothing worth saving.
--
-- **It descends only through `children`.** `jsonb_path_query(p_blocks,
-- '$.**.kind')` is the one-liner and it is WRONG: it would find a `kind` key
-- anywhere in the payload, so a crafted object under a key nothing validates
-- could satisfy a requirement without ever being a block. Descending through
-- `children` from the top-level array guarantees every node counted is a node
-- `validate_block` also checked.
--
-- Unbounded recursion is safe here only because `set_actor_sections` calls this
-- AFTER `validate_block`, which refuses a tree deeper than its own cap with an
-- explicit counter. Do not call this on unvalidated input.
create or replace function public.block_kinds_present(p_blocks jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  v_kinds text[] := '{}';
  v_block jsonb;
  v_kind  text;
begin
  if jsonb_typeof(p_blocks) is distinct from 'array' then
    return v_kinds;
  end if;

  for v_block in select * from jsonb_array_elements(p_blocks) loop
    -- An empty place is JSON null and is not a block. Anything else that is
    -- not an object is not one either; `validate_block` has already refused
    -- it, and skipping keeps this function honest if it is ever called alone.
    if jsonb_typeof(v_block) is distinct from 'object' then
      continue;
    end if;

    v_kind := v_block ->> 'kind';
    if v_kind is not null then
      v_kinds := v_kinds || v_kind;
    end if;

    if jsonb_typeof(v_block -> 'children') = 'array' then
      v_kinds := v_kinds || public.block_kinds_present(v_block -> 'children');
    end if;
  end loop;

  return v_kinds;
end;
$$;

-- Called only by `set_actor_sections`, which is `security definer`. No client
-- role has any reason to reach it.
revoke all on function public.block_kinds_present(jsonb) from public, anon;


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

  -- **Which kinds a page must carry depends on the ACTOR's kind**, because
  -- `owner` has nothing to render on a person's page and `fursonas` nothing on
  -- a fursona's. `actors.kind` is immutable, so this is a stable fact about the
  -- row rather than anything a caller can influence.
  v_actor_kind text;
  v_required   text[];
  v_refused    text;
  v_present    text[];
  v_missing    text[];
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

  select kind into v_actor_kind
    from public.actors
   where actor_ref = p_actor_ref;

  if v_actor_kind = 'person' then
    v_required := array['avatar', 'handle', 'fursonas'];
    v_refused  := 'owner';
  else
    v_required := array['avatar', 'handle', 'owner'];
    v_refused  := 'fursonas';
  end if;

  v_present := public.block_kinds_present(p_sections);

  -- **At least one of each, at any depth, in any container.** The guarantee is
  -- that the block EXISTS IN THE TREE, not that a visitor sees it: `accordion`
  -- renders its children collapsed and `tabs` shows one at a time, so a
  -- required block inside either satisfies this while showing a stranger
  -- nothing. That hole is known and accepted — see `REQUIRED_KINDS` in
  -- `domain/required-blocks.ts` and the spec, and do not read this rule as
  -- stronger than it is.
  --
  -- Every missing kind is named rather than the first, because somebody who
  -- removed two blocks should be told about two.
  v_missing := array(
    select k from unnest(v_required) as k where not (k = any(v_present))
  );
  if array_length(v_missing, 1) is not null then
    raise exception 'page is missing required blocks: %',
      array_to_string(v_missing, ', ')
      using errcode = '22023';
  end if;

  -- The opposite half of the same rule. A block with nothing to render is the
  -- control-that-does-nothing failure, and refusing it at the write is what
  -- keeps the editor from having to explain an empty one.
  if v_refused = any(v_present) then
    raise exception 'a % page cannot carry a % block', v_actor_kind, v_refused
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
    elsif v_key in ('accent', 'surface') then
      -- `surface` is what a PANEL is painted with, where `accent` is what a bar
      -- or a button is. Both are one colour and neither is nullable here: a
      -- page that wants the design's own omits the key rather than storing a
      -- null, which is how absence means inherit everywhere in this model.
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
    elsif v_key = 'measure' then
      -- How wide the page lays its own sections. Checked against this closed
      -- list for `backgroundFit`'s reason rather than `skin`'s: a measure is
      -- not an open set of renderer names that grows without a migration here,
      -- it is six named stops that each have to exist as a real class, so
      -- there is nothing lost by refusing a seventh at the write. Keep it in
      -- step with `PAGE_MEASURES` in `domain/actor-theme.ts`.
      if v_value not in ('narrow', 'medium', 'wide', 'wider', 'widest', 'full') then
        raise exception 'measure: unknown measure' using errcode = '22023';
      end if;
    elsif v_key = 'font' then
      -- The typeface the page's own content is set in. A closed list for
      -- `measure`'s reason rather than `skin`'s: each name has to resolve to a
      -- real stack in `presentation/theme-css.ts`, so there is nothing lost by
      -- refusing a seventh at the write. Keep it in step with `PAGE_FONTS` in
      -- `domain/actor-theme.ts`.
      if v_value not in ('system', 'classic', 'serif', 'mono', 'casual', 'poster') then
        raise exception 'font: unknown typeface' using errcode = '22023';
      end if;
    elsif v_key = 'spacing' then
      -- How tightly the page sets its content: the card padding and the text
      -- size together. NOT the canvas `density` dial above, which is how busy
      -- the backdrop is. Keep it in step with `PAGE_SPACINGS`.
      if v_value not in ('compact', 'roomy') then
        raise exception 'spacing: unknown spacing' using errcode = '22023';
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
