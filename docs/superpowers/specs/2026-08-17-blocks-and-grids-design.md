# Blocks and grids — a page composed rather than chosen from a list

**Status:** COMPLETE for phases 1 and 2, 2026-08-18. The model and the public
renderer shipped in `feat/blocks-and-grids`; phases 3–5 are unwritten — see
Phasing.
**Follows:** `2026-08-15-section-personality-design.md`,
`2026-08-16-a-border-of-ones-own-design.md`, delivered in `#150`–`#155`.

> **Superseded in part, 2026-08-18, by
> `2026-08-18-sections-of-spaces-design.md`.** Read this as the record of what
> was believed when it shipped, not as the model in the code. What changed is
> the arrangement and only the arrangement: a container no longer declares a
> **track count** and its children no longer declare a **span** of those
> tracks. It declares how many places it lays ACROSS, children fill them row by
> row, and a place may be empty and keeps its width. So `BLOCK_LIMITS.tracks`,
> `effectiveSpan`, `TRACK_CLASS` and `SPAN_CLASS` — all named below, chiefly
> under "Span, and why not free positioning" — do not exist. The same spec
> also replaced every viewport breakpoint in the renderer with a container
> query, and delivered the editor this one left for its phase 3 — so a
> paragraph here standing a performance guard down until that phase has been
> acted on. What still holds: the container/leaf split, the section as a
> container at depth 0, the depth cap and where it is enforced, the embed
> refusals, and the dnd-kit findings, which are still what phase 4 inherits.
> **It is left otherwise untouched on purpose** — rewriting a delivered
> document to match later reality would make "complete" mean nothing, which is
> the same argument that made the successor a new spec rather than a reopening
> of this one.

## Why this exists

The request: _"we have created sections with layout and everything but its very
restrictive for what id like. So I think we can create layouts who allow us
create grids with different shape, sizes, distributions and general things to
then inside decide to add the content table, cards, media content, links, posts,
twitter post, telegram, spotify, and multiple things."_

The diagnosis is sharper than "restrictive". **A section's `type` decides two
unrelated things at once**: how its children are arranged, and what kind of
thing each child is. Those are independent, and fusing them is why the model
feels closed.

Look at what the current list actually contains and the fusion is visible:

- `gallery` is _a grid_ of _pictures_.
- `links` is _a list_ of _links_.
- `socials` is _a row_ of _social chips_.
- `posts` is _a column_ of _embedded posts_.

Each names an arrangement and a content kind welded together. Every new idea
therefore has to become a whole new welded pair, which is why the list keeps
growing and still cannot express "a Spotify player beside a paragraph beside a
table". An item is always `{title, description, url, icon}` and every item in a
section renders identically, so heterogeneity is not merely unsupported — it is
unrepresentable.

## The change: separate the two axes

A section becomes **a grid**, and the things inside it become **typed blocks**.

- A **container block** decides arrangement. It holds children and renders them
  in a mode: stacked, in a uniform grid, packed by height, one panel at a time,
  and so on.
- A **leaf block** is one piece of content: a paragraph, a link, a picture, a
  Spotify player, a Twitter post, a table, a statistic, a quotation, a
  proportion.

"A Twitter post beside a progress bar beside three links" stops being an
impossible request and becomes three blocks in one container.

### Nesting collapses "section" into "block"

Blocks nest — a container may hold containers. That decision, taken during
brainstorming, **simplifies the model rather than complicating it**: it makes a
section and a container block the same thing.

**A section is a container block at depth 0 that carries a name.** One recursive
model instead of two parallel ones — one style bag, one renderer, one
validator, one editor component. The alternative writes everything twice: a
`cards` grid nested in a section would need its own skin handling, its own
background, its own span logic, each duplicating what a section already has, and
the two would drift.

Everything the per-section work shipped in `#150`–`#155` — skin, background
picture and fit, card size, border — becomes per-container, unchanged in
meaning. `nestedSkinVars` already emits a skin's complete property set rather
than its differences precisely so a skin can nest; it was written for one level
and the recursion is the same shape at any depth.

## The decomposition

The existing types are a **flattened cross-product**. Unwelding them expands
what is expressible by far more than adding another welded pair ever could,
while throwing none of the work away.

As built — the mode and kind names are the ones in `CONTAINER_MODES` and
`LEAF_KINDS`, and `apps/hub/src/features/actors/CLAUDE.md` carries the same
table where somebody reading the code will find it.

| current type     | becomes                                     |
| ---------------- | ------------------------------------------- |
| `cards`          | a `grid` container                          |
| `gallery`        | a `grid` container holding `picture` leaves |
| `masonry`        | a `masonry` container                       |
| `carousel`       | a `carousel` container                      |
| `tabs`           | a `tabs` container                          |
| `accordion`      | an `accordion` container                    |
| `two-column`     | **a leaf that pairs a label with a value**  |
| `timeline`       | a `timeline` container                      |
| `links`          | any container holding `link` leaves         |
| `socials`        | any container holding `social` leaves       |
| `posts`          | any container holding `post` leaves         |
| `video`, `music` | `player` leaves                             |
| `stats`          | `stat` leaves                               |
| `quote`          | `quote` leaves                              |
| `progress`       | `progress` leaves                           |

**That `two-column` row said "container, paired-column mode" and it was the one
row in this table that misfiled a content concern as an arrangement** —
corrected during phase 1, along with the `columns` mode it produced, which was
removed before anything could store one. What made `two-column` worth having was
the PAIRING: a `<dl>` whose `dt`/`dd` a screen reader announces together, and
which drops a whole row when its localised value is empty rather than rendering
half of one. That is what an item IS, not how items are arranged, so it belongs
to `stat` (one pair) or `table` (many) — recorded as an owed behaviour in
`LEAF_KINDS`' own TSDoc, where the task that builds them will read it. Two
columns of prose, if anybody wants them, are `align: "stretch" | "start"` in the
style bag, which composes with every mode rather than being welded to one. The
debt was paid in phase 2 with one half deliberately inverted: a leaf that
dropped everything would leave a hole in a track its author chose, so `stat`
and `table` drop the pair or the row and then fall back to the plain leaf.

**Why `columns` went is worth a sentence of its own, because the reasoning is
reusable.** It was not refuted by argument. Three consecutive tasks wrote down
three different meanings for it — the schema said it laid uniform tracks
exactly as `grid` does, `0009` said `grid` fills them across and `columns`
down, and the renderer shipped the same grid as `grid` with `items-start`. The
middle one is a real mechanism, column-major fill order, which nothing else has
and which was never implemented. **A vocabulary entry whose meaning three
consecutive authors cannot state the same way twice does not have a mechanism;
it has a name each of them filled in from context.** That is a better test than
this document's own bar below, because it is observable rather than arguable.

New leaf kinds the request named and the model now admits without a new layout:
a **table**, a **paragraph** of prose, and the embed providers already resolved
by `embed-providers.ts` — Spotify, Apple Music, SoundCloud, Tidal, YouTube,
Vimeo, Twitch, Telegram and the rest. **That table already exists and is
underused**: adding a Spotify block is wiring, not new security surface, because
`resolveEmbed` already parses, matches an exact hostname, checks a strict id
pattern, discards the query and rebuilds from a fixed template.

### What is deliberately kept

The current layouts encode taste. `progress`, `stats`, `quote` and `timeline`
produce something good-looking without design skill, and a bare grid of
arbitrary blocks does not. **They survive as leaf types and container modes
rather than being replaced by freedom.** The templates shipped in code remain
the shortest path to a decent page.

## Span, and why not free positioning

The obvious reading of "different shapes, sizes, distributions" is x/y/w/h on a
canvas. **This design refuses that**, for three reasons that are hard to walk
back once shipped:

- it cannot degrade to a narrow viewport, and this project has already shipped
  one overflow at exactly 320px;
- it makes the editor close to unusable on a phone, which is where most people
  will build;
- it is how the pages this product is inspired by became unreadable.

Instead a container declares a **track count**, `columns`, and each block
declares the **whole number of those tracks it takes**, `span` — both from the
same small vocabulary, `BLOCK_LIMITS.tracks`, because a span wider than the
widest container could never be satisfied. Below the `sm` breakpoint every
block collapses to a single track. Variety in shape and distribution,
responsive by construction rather than by care.

**This supersedes an earlier draft of this paragraph that called a span "a
fraction of its parent container's track count", and the correction is not
cosmetic.** A fraction means nothing against `auto-fill`, whose track count
varies with the viewport, which is exactly why `repeat(<columns>, minmax(0,
1fr))` replaced `auto-fill` here. A `minmax` whose floor is `0` is the one
shape that cannot overflow whatever the container's width turns out to be —
and a phase-2 measurement made that concrete: an `auto` track is floored at its
content's min-content contribution, so one wide descendant widens every track
out to the page, which reads to a visitor as an overflow and has the opposite
cause.

A span is relative to its **parent**, not the page, which is how CSS grid
behaves anyway and is what makes nesting compose. **A span wider than its
parent is legal and is stored exactly as typed**, narrowed only at render: a
page must never become unsavable, and rewriting the stored value would destroy
what was typed so that dragging the block back out could not restore it.

## Depth, and why it is capped

**Depth is capped at three** — a section, a container inside it, a container
inside that, then leaves — and **the cap is enforced in the database**, not only
in the editor.

`actor_profiles.sections` is user-controlled `jsonb`. Unbounded nesting is a
real attack surface: a recursive validator can exhaust its stack, and a deeply
nested payload can make a public page render pathologically. A cap in the
editor is a suggestion; a cap in `set_actor_sections` is the guarantee — which
holds only because the write grant on `actor_profiles` names its columns, so
`sections` cannot be PATCHed past the function. That was not true when this was
first written and is pinned by `tests/db/blocks.test.ts` now.

Three is also the point where two independent costs bite:

- **Editor comprehensibility.** Beyond three levels, "where am I" stops being
  answerable at a glance on a phone.
- **Measured style cost.** Style recalculation is linear in DOM size — measured
  at 1.4 ms per update at 158 nodes and **15.6 ms at the editor's 4,814**, times
  roughly twelve under CPU throttling. Nesting multiplies node count. This is
  not a guess; it is the fault that made a theme dial stick, and it is why
  "shrink the editor's DOM" belongs in this design rather than after it.

## The block shape

One recursive schema, strict on write and lenient on read. The leniency is not
about legacy data — there is none, see below — but about **deploy skew**: a
strict read blanks a whole page while a newer deployment's writes are being
read by an older one.

It covers three things, and the third had to be built rather than assumed. An
unknown **key** is stripped. An unrecognised **kind** or **mode** is kept
verbatim and rendered by the fallbacks (`?? PlainLeaf`, `?? Stack`) — a
discriminated union refuses an unrecognised discriminator, so until a fallback
option was added to the lenient build, one such block failed the whole array
and the page blanked. And an empty `title_en` is a floor rather than a refusal.
Everything else the write refuses, the read refuses too: a container past the
depth cap, a malformed block of a kind it does know, the size caps.

A block carries:

- a **kind**, deciding renderer and editor fields;
- a **span**;
- the **style bag** already shipped — skin, background picture and fit, card
  size, border — with absent meaning "inherit the parent", the resting state
  every key in that bag already has;
- **children**, for a container;
- **content**, for a leaf, shaped by its kind.

Two rules carry over unchanged and must not be softened:

- **A person's own writing is not next-intl.** A missing `title_es` is somebody
  who has not written the Spanish yet, and must never be reported as a fault.
  The app's own chrome remains key-checked and build-failing; a block's
  bilingual fields remain optional.
- **A control that stores what somebody types and shows nothing is the worst
  kind.** The editor offers only the fields a block's kind will render — the
  reason `LINKED`/`ICONED`/`PICTURED` exist today — while the database keeps
  accepting the rest, so switching a block's kind to look at it and switching
  back finds the text still there.

## The database

`sections` is `jsonb`, so this is an application change plus new validation. No
table restructuring.

`set_actor_sections` gained **recursive validation with an explicit depth
guard** — `validate_block`, walking the tree with a counter passed down rather
than trusting a bound anybody has to remember — and every `raise exception`
string must match its conformance-test regex character for character.

**`pnpm test:db` does run on this machine**, which supersedes a standing
assumption this document was written under: Docker is present, `db:start` gives
the identical migration set, and only `supabase db reset` fails, on a storage
container this project no longer uses. Run the suite locally; do not wait for
CI's `conformance` job to be the first thing that reads the SQL.

Rewriting that function also closed a hole nobody was looking for. The code it
replaced tested `not is_section_type(v_section ->> 'type')`, and
`is_section_type(NULL)` evaluates to NULL, so the `if` never fired: **a section
with no `type` at all was accepted by the live database.** Every lookup is
paired with a `jsonb_typeof` test now. SQL's three-valued logic is the trap;
`not <predicate>(NULL)` is the shape to grep for.

**No conversion path, and no backward-compatible read.** Existing pages are
discarded: nothing is in production, and the shape is free to be designed on its
own merits. This is cheap **only until Puck copies the migrations**, at which
point every change becomes additive forever — which is the argument for landing
this before Puck integrates rather than after.

The existing caps — sections per fursona, items per section, characters per
field, bytes per serialised array — became caps on **total blocks per fursona**
counted at every depth, on children per container, on tracks, on a table's rows
and cells, and on depth. The byte cap does the heavy lifting and was kept.

**The unit of that byte cap is the one thing the two sides can agree on by
accident and disagree on in production**, and they did. The schema measured
`String.length` — UTF-16 code units — and called them bytes, where Postgres
measures `octet_length`. On one legal leaf of accented text the two differ by a
factor of two — `BLOCK_LIMITS.bytes`' own TSDoc carries the measurement — in
the direction where the editor promises a save the database then refuses after
the whole page has been written. Spanish
is this app's fallback language, so accented text is the ordinary case rather
than the edge. `TextEncoder` throughout now, and the TSDoc names
`octet_length` so the SQL matches it deliberately rather than by luck.

## The editor

**`@hello-pangea/dnd` cannot do this, and the spike proved it twice over.** Its
own README says nested lists work _"but you cannot drag items from the parent
list into a child list"_ — the caveat is the feature — and, independently,
_"grid layouts are not supported (yet)"_. A grid is exactly what this builds.

**`@dnd-kit/core` with `@dnd-kit/sortable`** replaces it: MIT, and a measured
17 kB against the incumbent's 31 kB min+gzip, so the migration is a net bundle
reduction. `@atlaskit/pragmatic-drag-and-drop` is disqualified — it is HTML5
drag-and-drop with no keyboard drag at all, and keyboard reordering is not
negotiable here.

Three findings from the spike that must shape the work rather than surprise it:

- **Nesting is not a switch.** dnd-kit hands you the collision decision. With a
  nesting-naive collision function, `over.id` resolves to a _leaf inside_ the
  hovered container and the container reorder silently never fires — this
  happened on the spike's first run. Making that drag-type aware is real work,
  and **depth three is not proven**: the working detector is two-level-specific.
- **The silent-failure trap moved rather than vanished.** With the old library
  it was one prop you had to add — the omission that left a section's drag
  handle dead by mouse and keyboard from the commit that introduced it. With
  dnd-kit it is four props you must not drop: omit `{...listeners}` or
  `setNodeRef` and the drag is dead, silently, both input methods. **A mocked
  test hides this identically**, because the mock supplies the props the real
  hook would have and so cannot observe whether the component passed them on.
  The keyboard e2e specs must be **ported, not dropped**.
- **A hydration hazard that is invisible in production.** dnd-kit's id generator
  is a module-level counter rather than React's `useId`, so two server renders
  in one warm process emit different ids and every request after the first
  hydrates mismatched. `<DndContext id={useId()}>` fixes it; forgetting it fails
  silently.

**Shrinking the editor's DOM is part of this work, not a follow-up** — see the
measured style cost above. Collapsing containers by default, then virtualising,
are the recorded starting points.

## What this design does not do

- **No free positioning.** Spans, not coordinates. Stated above with reasons.
- **No per-block colour.** Form is the block's; colour is the page's. A skin
  names no colour of its own, and every pairing of a style and a palette is
  somebody's page. Unchanged and not reopening.
- **No pasted embed markup.** Refused with reasons in the section-personality
  spec and not reconsidered: every embed is an allowlisted provider parsed and
  rebuilt from a fixed template. Adding block kinds does not add a bypass.
- **No server-side fetch.** Same spec, same refusal.
- **No file hosting.** Pictures remain pasted addresses; AeleOS stores no files,
  and reopening that means reopening the $0 budget.
- **No conversion of existing pages.** Stated above. **What that cost was not
  reckoned with**: nothing migrated the pages already stored in the flat shape,
  and the public read parsed only blocks — so every one of those pages served a
  stranger a heading with nothing under it until `parseBlocks` grew the same
  flat fallback the editor's read has. A stored shape nothing converts still
  has to be a shape something READS.

## Phasing

The work splits along seams that each leave something testable:

1. **The recursive model** — schema, depth guard in `set_actor_sections`,
   conformance tests. No UI. **Done.**
2. **The renderer** — container modes and leaf kinds on the public page, driven
   by fixtures. Public pages work before the editor does. **Done**, and the
   fixtures were written straight to the database precisely so this could be
   proved without an editor.
3. **The editor's tree** — dnd-kit migration, nested reorder, the ported
   keyboard specs. The largest and riskiest piece. **Unwritten.**
4. **The block palette** — adding a block, choosing its kind, the per-kind
   fields. **Unwritten.**
5. **DOM reduction** — collapse by default, then virtualise, measured against
   the same style-recalc metric that motivated it. **Unwritten.**

Phase 3 is where the unknown cost sits, and phase 1 did not wait on it.

**Phases 3–5 have no plan yet, and the state they inherit is not neutral.** The
editor is still the flat one, and it shipped unable to save at all: every save
carrying a section was refused by `set_actor_sections`, in production, from the
day phase 1 merged. **That was known and ruled acceptable here, and the ruling
was wrong** — it drew its line at data loss and stopped, and a core surface
that cannot save is not a degraded state. What closed it is
`domain/section-block-shim.ts`, which converts flat sections to blocks at the
write and back at the read, so the editor and every template keep working
unchanged; it is deleted by phase 3, with `section-schema.ts`, the templates
and the section editor, in one change. Read that file and
`features/actors/CLAUDE.md` before the port: the reverse direction recovers a
layout from a container's mode and its children's kind, so the pairs have to
stay distinct, and a tree it cannot flatten reads as `null` rather than as
something approximate. `--card-size` is a control with no reader
until `masonry` grows one. `personalised-page-cost.spec.ts`'s dial-latency half
is `test.fixme` because the page it measured is no longer heavy, with its body,
node guard and every ceiling kept verbatim and the restoration note written as
an acceptance criterion rather than a to-do: **if the ported editor renders far
fewer than 2,000 nodes for that same document, that is itself the finding**, and
the ceilings under the guard cannot be trusted again until somebody decides
which of the two happened.

**Read "The editor" above before starting phase 3 rather than after.** It is
the section that has not been overtaken by anything, and everything in it fails
silently: `@hello-pangea/dnd` cannot nest and does not support grids, which is
why it is being replaced at all; dnd-kit's collision decision is yours to make
and depth three is not proven; the props whose omission kills a drag dead for
both input methods are the trap that moved rather than vanished, and a mocked
test cannot see them; and the module-level id counter hydrates mismatched on
every request after the first unless the context takes a `useId`.

## Open

- **The mode vocabulary is a floor.** A mode earns its place by a mechanism none
  of the others has, not by another set of numbers — and the observable form of
  that test is above, under the decomposition.
- **Whether a container may set its own name** — settled in phase 1: any
  container may, and `name_en`/`name_es` are optional at every depth. An unnamed
  container renders no heading, which is the ordinary case for one nested inside
  another and the only honest rendering, since inventing a heading would put
  words on somebody's page that they did not write.
- **Depth three is unproven for drag-and-drop.** Still open. The spike proved
  two levels; that gap is phase 3's first task, and if three proves unworkable
  the cap becomes two — a smaller loss than a broken editor. Note that the cap
  is enforced in `validate_block` as well as in the schema, so lowering it is
  two edits and a hand-applied migration rather than one constant.
