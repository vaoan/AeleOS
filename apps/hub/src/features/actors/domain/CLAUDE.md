# The actors feature — domain layer

## Read this before you change anything here, and again before you finish

**Every change inside `features/actors/` ends by re-reading this note against
what you just did.** Not a skim for the paragraph you touched — a pass asking
whether anything here has become false, including the parts you did not go near.

Nothing automated can do this for you. `pnpm check:docs` is per exported symbol
and compares a symbol against its own code, so it is blind to a note whose
subject is a different file, a deleted prop, a mechanism that moved, or a debt
that was paid. Root rule 18 names that exposure and root rule 30 is what it
cost: three comments describing a caller that never existed, green through every
unit test, and two headline features shipped broken behind them.

The three questions, in order:

1. **Is anything here now false?** A component named that no longer exists, a
   prop that was deleted, a mechanism replaced, a file path that moved, a
   measured number taken before the code changed.
2. **Is anything here still true but no longer the way we work?** A pattern
   superseded, a constraint lifted, a decision reversed. Say the new one; do not
   leave both, because a document that contradicts itself is worse than one that
   is simply wrong — whichever half a reader reaches first is the one they
   follow.
3. **Did this change establish something the next person needs?** A trap you
   fell into, a mechanism that is not obvious from the code, a reason a tempting
   alternative is wrong. That is what this note is for.

**Whoever fixes a fault deletes the note saying it is open.** A sentence naming
a file and a line reads like a measurement and will be believed. A note left
asserting a closed fault is the confident, wrong instruction this repository
warns about everywhere else — and it has happened here three times in twelve
days: the `PreviewThemeHost` atmosphere prop documented after it was deleted,
the drag handle recorded as broken for a day after `#154` fixed it, and a
superseded spec's banner claiming unwritten phases that had already landed.

---

**The addressing model — person addresses, vanities, and fursona handles — lives in the feature root, `apps/hub/src/features/actors/CLAUDE.md`, not here.** This note covers only the domain layer: what a block IS, what the vocabulary means, and what the database enforces. No rendering.

## Blocks: a container arranges, a leaf holds content

A page used to be a flat array of sections, each with a `type`, and **that type
decided two unrelated things at once**: how the section's children were
arranged, and what kind of thing each child was. `gallery` was a grid _of
pictures_ and `links` a list _of links_, so every new idea had to become
another welded pair — and "a player beside a paragraph beside a table" was not
merely unsupported but unrepresentable, because every item in a section
rendered identically.

A page is a **tree of blocks** now, and the two axes are separate.

- A **container** decides arrangement and nothing else. It holds children and
  lays them out in a `mode`.
- A **leaf** is one piece of content, rendered on its own `kind`'s terms. A
  container may hold leaves of different kinds side by side, which is exactly
  what the welded types could not express.
- **A section is a container at depth 0 that carries a name.** That is what
  collapses two parallel models into one — one style bag, one renderer, one
  validator, and one editor component when phase 3 writes it. A container
  further down may name itself too; an unnamed one is a group with no heading,
  which is the ordinary case for a container inside another and the only honest
  rendering, since inventing a heading would put words on somebody's page that
  they did not write.

`domain/block-schema.ts` is the vocabulary. The renderer is **four files now
(2026-08-27)**, and the split is worth knowing before you go looking:

- `presentation/block-contract.ts` — `PageContext`, `LeafProps`, `LeafRenderer`
  and the surfaces every kind shares. **Nothing here renders**, which is what
  lets a kind's module import it with no cycle.
- `presentation/blocks.tsx` — what ARRANGES blocks: the container modes, the
  page shell, and the `LEAVES` / `MODES` registries.
- `presentation/text-leaves.tsx` — the kinds made of an author's own WORDS:
  `text`, `quote`, `stat`, `progress`, `table`. None of them reaches a network.
- `presentation/media-leaves.tsx` — the kinds that show something hosted
  ELSEWHERE: `picture`, `embed`, `player`, `jukebox`. The provider allowlist and
  the frame tables are consumed here and nowhere else among the leaves.
- `presentation/link-leaves.tsx` — the two that POINT somewhere without showing
  it: `link` and `social`. They always draw a control, whatever host was pasted.
- `presentation/identity-leaves.tsx` — the five that draw the ACTOR.

It was one 2,333-line file until the kinds moved out; `blocks.tsx` is 1,367 now
and the largest leaf module is 449 lines.

**The grouping is by what a kind REACHES, not by what it looks like**, and that
is the line worth keeping: a change to the embed allowlist cannot reach
`text-leaves.tsx`, and nothing in `link-leaves.tsx` resolves a provider. Card
shape would have grouped `stat` with `link` and taught you nothing.

**Splitting them made two fallbacks visible that were three calls inside one
file.** `PictureLeaf` degrades to `PlainLeaf` when an address will not pass
`safeHttpUrl`, and `EmbedLeaf` degrades to `SocialLeaf` when no provider claims
it — so `media` imports `text` and `link`, and neither imports back. A DAG, and
`madge` says so.

Nothing about the enforcement changed: `satisfies Record<LeafKind, LeafRenderer>`
still sits on the registry, so a kind with no renderer is a build failure.

This note says what the model IS; their TSDoc says what each piece does and does
not do, and between them they are longer than this section, for a reason.

### Nothing was thrown away — every old type is somewhere in here

The old list was a flattened cross-product, so unwelding it expands what is
expressible by more than another welded pair ever could while losing none of
the work. Somebody looking for `gallery` should find this table rather than
conclude it was dropped.

| the old `type`   | what it is now                                                |
| ---------------- | ------------------------------------------------------------- |
| `cards`          | a `grid` container                                            |
| `gallery`        | a `grid` container holding `picture` leaves                   |
| `masonry`        | a `masonry` container                                         |
| `carousel`       | a `carousel` container                                        |
| `tabs`           | a `tabs` container                                            |
| `accordion`      | an `accordion` container                                      |
| `timeline`       | a `timeline` container                                        |
| `links`          | any container holding `link` leaves                           |
| `socials`        | any container holding `social` leaves                         |
| `posts`          | any container holding `embed` leaves                          |
| `video`, `music` | `embed` leaves — NOT `player`, which means something else now |
| `stats`          | `stat` leaves                                                 |
| `quote`          | `quote` leaves                                                |
| `progress`       | `progress` leaves                                             |
| `two-column`     | a `table` leaf — or a `stat` leaf, for a single pair          |

What the old list had no entry for at all, and the model now admits without a
new layout: a `text` leaf for a paragraph of prose, and a `table` leaf for the
thing the request actually asked for.

**`two-column` is the one row that changed shape rather than moving**, and it
is worth reading rather than skimming, because it is the row the decomposition
originally got wrong. It said "container, paired-column mode" — filing a
CONTENT concern as an arrangement. What made that layout worth having was never
the two columns: it was the PAIRING, a `<dl>` whose `dt` and `dd` a screen
reader announces together, dropping a whole row when its localised value is
empty rather than rendering half of one. That is a property of what an item IS,
so it belongs to `stat` (one pair) and `table` (many). Two columns of PROSE, if
anybody ever wants them, are a style key — `align: "stretch" | "start"` — which
composes with every mode instead of being welded to one.

**The drop rule came with the pairing, and one half of it deliberately
inverts.** A row whose localised value is empty still disappears entirely,
label and all: a `dt` with no `dd` is invalid markup, and because the value is
read AFTER `contentFor` has chosen a language, a row written in one language
only is a row for readers of that language. But where the flat layout then
dropped the whole list — correctly, since an item was one row among others and
dropping it closed the gap — **a leaf must not.** A block sits in a grid track
its author deliberately placed it in, so a leaf that vanished would leave a
hole nothing on the page explains. `stat` and `table` drop the pair or the row
and then fall back to the plain leaf, which shows the author's own words. Never
nothing, and never a bordered box with nothing in it either.

### The container modes

| mode        | the mechanism it earns its place by                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`     | the resting state — children down the page, arranging nothing                                                                                     |
| `grid`      | uniform tracks: `repeat(<spaces>, minmax(0, 1fr))`, filled row by row                                                                             |
| `masonry`   | CSS multi-column, which has no rows at all, so a short item is followed by whatever comes next instead of waiting for the tallest one beside it   |
| `carousel`  | scrolls sideways, at every width                                                                                                                  |
| `tabs`      | one panel at a time — a radio group and `:checked`, so it stays a server component and every panel is reachable by keyboard with nothing hydrated |
| `accordion` | disclosures, every one openable at once, where `tabs` is a switcher                                                                               |
| `timeline`  | a sequence, marked and ordered                                                                                                                    |

**A mode earns its place by a mechanism none of the others has, not by another
set of numbers** — the same bar the layout list always set itself. What is new
is a way of applying that bar which does not depend on arguing about
mechanisms. `columns` was in this list and **was removed before anything could
store one**, and it failed in a way nobody had to debate: three consecutive
tasks wrote down three different meanings for it. `block-schema.ts` said it
laid uniform tracks exactly as `grid` does; `0009` said **`grid` fills them
across and `columns` down** — a real mechanism, column-major fill order, which
nothing else has and which was never implemented; and the renderer shipped the
same grid as `grid` with `items-start`. **A vocabulary entry whose meaning
three consecutive authors cannot state the same way twice does not have a
mechanism — it has a name each of them filled in from context.** That test is
better than "is there a mechanism" because it is observable. The track count is
already a PARAMETER of `grid`, so a second mode for it was the welded
cross-product this model exists to undo, one level down; and `items-start` is a
dial, which belongs in the style bag where it composes with every mode.

### The leaf kinds

| kind       | what it holds        | `title_*`       | `description_*`   | also reads                 |
| ---------- | -------------------- | --------------- | ----------------- | -------------------------- |
| `text`     | a paragraph          | heading         | body              | —                          |
| `link`     | a button out         | button text     | subtitle          | `link_url`, `icon`         |
| `picture`  | a picture            | alt text        | caption           | `image_url`                |
| `embed`    | anybody's embed      | frame title     | caption           | `link_url`, `icon`         |
| `player`   | a retro media player | player name     | caption           | `rows`, `icon`             |
| `jukebox`  | a retro music player | player name     | caption           | `rows`, `icon`, `link_url` |
| `social`   | a branded chip       | chip label      | **not rendered**  | `link_url`, `icon`         |
| `stat`     | one fact             | **the label**   | **the value**     | —                          |
| `quote`    | a quotation          | **who said it** | **what was said** | —                          |
| `progress` | one measured thing   | **the label**   | **the value**     | —                          |
| `table`    | rows of paired cells | the caption     | a note under it   | `rows`                     |
| `avatar`   | the actor's portrait | **alt text**    | —                 | the ACTOR                  |
| `handle`   | what names the actor | a label above   | —                 | the ACTOR                  |
| `name`     | the display name     | a label above   | —                 | the ACTOR                  |
| `owner`    | a link to the owner  | the heading     | —                 | the ACTOR                  |
| `fursonas` | the fursona list     | the heading     | —                 | the ACTOR                  |

**`stat`, `quote` and `progress` invert the pair**, and that is the one thing
here somebody will get wrong — it has been got wrong once already. Everywhere
else the title is the big text; in those the description is. The inversion is a
RENDERING fact and never a schema one: the fields keep their generic names on
the block, so switching a kind to look at it and switching back finds what was
typed still there.

`progress` is the kind that additionally tries to READ its value.

#### The identity leaves (2026-08-19) — content that is not typed

**The last five are a new CATEGORY, not five more entries.** Every kind above
draws what its author typed into the block; these draw the ACTOR, resolved by
the renderer out of `PageContext`. They live in
`presentation/identity-leaves.tsx` rather than beside the content kinds, because
they are a different thing to read.

**They stopped restating the props contract on 2026-08-27.** This module used
to declare its own `IdentityLeafProps` / `IdentityLeafRenderer`, with a comment
saying why: importing the real ones would have made it depend on the file that
registers it. A restated interface is a second copy free to drift, so the
contract moved to `block-contract.ts` instead and both leaf modules import it.

They exist because the page's furniture used to be welded. `public-profile.tsx`
rendered a portrait, a display name, a handle and a fursona list as chrome
above and below the blocks, and none of it could be moved, resized, styled,
repeated or placed anywhere else. It was the same mistake `gallery` and `links`
were — arrangement married to content — one level up.

Four things about them that are easy to get wrong:

- **They still carry a title, and it is not an oversight.** `title_en` is
  required and non-empty at the strict write AND in `validate_block`, so a
  fieldless leaf is unrepresentable. Each uses the field the model insists on
  rather than carrying a dead one: `avatar`'s is the portrait's ALT TEXT, which
  is the only place a screen reader learns whose picture it is; `handle` and
  `name` label their value the way `stat` labels its number; `owner` and
  `fursonas` name the heading over what follows, in the author's own words.
  Those two titles are **a person's writing, not next-intl** — a missing
  `title_es` is somebody who has not written the Spanish yet.
- **`handle` shows a person's ADDRESS, never their handle.** A person is minted
  as `u-<actor_ref with the hyphens out>`, which on a person is the `owner_ref`
  of every fursona they own — the exact column `/api/actors/mine` strips by
  name. It also carries the `public-actor-name` test id, which the end-to-end
  suite reads as "this page loaded and names its actor": that id belongs on
  this kind rather than on `name`, because `handle` is required on every page
  and a display name is optional.
- **`name` may render nothing, and that is the one kind allowed to.**
  `display_name` is nullable. It is safe because `handle` is required, so
  something always names an actor and the display name is decoration on top of
  a guarantee.
- **`owner` shows the address always and the owner's name and picture only
  sometimes**, and decides neither. A fursona's page is governed by the
  fursona's visibility rather than its owner's, so a public character routinely
  belongs to somebody whose own profile 404s — `public_fursona` withholds their
  name and portrait in that case. The address is safe unconditionally: it is
  already the first segment of the page's own URL.

**An EDITOR resolves all of this the same way a visitor does, and for a while
two of them did not.** The identity leaves render from `PageContext`, which
each editor route builds by hand — and two of those routes filled a field with
a constant rather than a read. `/pages/[handle]/edit` hardcoded the owner's
name and portrait to `null`, so every fursona's required `owner` block
previewed as the anonymous card even for an author whose profile is public:
304px on the page against 280px in the preview, with the name missing.
`/me/edit` hardcoded `fursonas: []`, so the required `fursonas` block previewed
as a heading over nothing while the page carried a grid of cards — 330px
against 72px. And `/pages/new` passed no `owner` key at all, which is not an
empty card but NO card: `OwnerLeaf` returns null without one, so a required
block rendered nothing on the one screen where somebody is choosing where to
put it.

All three ask `readPublicPerson` now — the same `public_person` a stranger
reads, so the visibility gate is asked rather than re-derived, and a private
profile answers nothing and keeps the anonymous card, which is what a visitor
genuinely gets there. The consequence to know: **a person whose own profile is
still `private` — the minted default — previews an empty fursona list**,
because there is no public page for them yet. That is honest and it is not
obviously the kindest answer; the alternative is filtering `listMyActors` by
visibility, which is `0012`'s rule copied into a route, free to drift.

`fursonas` keeps its heading when the list is empty. `FursonaCardList` answers
null for an empty list, which was right while it was chrome the page appended
and wrong for a block somebody deliberately placed: the grid track it sat in
would be a hole nothing on the page explains. `stat` and `table` already settle
this the same way.

#### At least one of each — and what that does NOT guarantee

A page must carry `avatar`, `handle`, and `fursonas` on a person or `owner` on
a fursona. **At least one, never exactly one**: any number of copies, at any
depth, in any container. `owner` is refused on a person's page and `fursonas`
on a fursona's, because neither has anything to render there.

Enforced in three places, and the duplication is deliberate:
`set_actor_sections` is what makes it a guarantee, the save boundary makes the
refusal legible without a round trip, and the editor withdraws the remove
control on the last copy. All three ask `missingRequiredKinds`, so they cannot
disagree about what a complete page is. The database side walks the tree with
`block_kinds_present`, which descends through `children` ONLY — a `$.**.kind`
jsonpath would find a `kind` key anywhere in the payload, so a crafted object
under an unvalidated key could satisfy the rule without ever being a block.

**The guarantee is that the block EXISTS IN THE TREE, not that a visitor sees
it, and that hole is accepted rather than overlooked.** `accordion` renders its
children collapsed and `tabs` shows one at a time, so a required block inside
either satisfies every layer while showing a stranger nothing; colour can hide
one just as completely, and deliberately, since an author's colours are
rendered exactly as picked. `tests/db/blocks.test.ts` asserts that hole is open
as a PASSING case, so nobody reads the enforcement and concludes it covers
visibility.

That was weighed against putting the ownership FACT in the page chrome —
outside `SKIN_SCOPE`, derived from the row, un-styleable — and declined: the
ruling is that every part of the page belongs to its owner. If accountability
ever has to be genuinely enforced, the chrome route is the design to revive,
and it composes with this rather than replacing it.

**Absence means the default POSITION, not deletion.** `withRequiredBlocks` runs
on every read path, so a page naming none of these — which is every page stored
before they existed — reads back with the header it always had. That is why no
page needed migrating. It applies to a PARSED page only: `readActorPage`
answers `null` for a shape it could not read, and supplying a header there
would turn "unreadable" into "here is a page" that the next save writes over
somebody's content.

A page missing only SOME of them gets exactly the leaves it lacks, never the
composed section — handing back the whole header would stand a second portrait
beside the one its owner kept.

It may be deleted once every stored page carries them explicitly, and **nothing
can tell you when that is** — the same condition `withSpacesFromColumns`
carries.

**A page being CREATED gets them too, and forgetting that made the product
unusable for a day.** "Every read path" was the rule, and the create page reads
nothing — there is no actor yet — so `FursonaEditor` defaulted its sections to
`[]`, which `set_actor_sections` refuses for naming none of the three. A
fursona built by hand could not be saved AT ALL: the banner said the sections
were refused, over a page whose author had done nothing wrong. Only the
template path worked, because applying one runs the shim over the result. The
default is `withRequiredBlocks([], kind)` now, so the rule is "every page holds
them from the moment it opens" rather than "every read applies them".

**That made every page non-empty, which broke a control that had been asking
the wrong question all along.** The template picker confirms before replacing,
and its gate was `blocks.length > 0` — true of a page nobody had touched, so a
brand-new fursona warned its owner about losing work they had not done. It asks
`holdsNothingAuthored` now: a page is the author's when it is neither empty nor
byte-for-byte what `withRequiredBlocks` seeds. It errs towards ASKING, which is
the safe direction — the costly mistake is replacing somebody's page without
one.

**It takes the THEME as well, since 2026-08-28, and the gap it closes is the
same shape one level along.** A chosen look is the author's work and the blocks
cannot see it: somebody who picked colours and touched nothing else has a page
that is still byte-for-byte the scaffold, so every question the predicate asked
answered "nothing here is theirs" while a palette they chose was about to go.
The parameter is optional, so a caller with no theme to hand keeps the old
behaviour rather than being made to invent one, and it asks `isCustomised`
rather than comparing against a default — that is already the question "has
this person chosen anything", and a second implementation of it would drift.
The discriminating case is the negative one: an untouched theme and a null one
must both still answer true, or an implementation reading `theme !== undefined`
satisfies the positive case and is wrong about every page that opens with a
default.

**A person's scaffold is two sections, not one**, and this is the part that
looks like a bug when a test is written against a fursona's. The composed
header carries `owner` for a fursona and nothing in its place for a person;
their third required kind, `fursonas`, is not part of that header at all, so it
is APPENDED in a section of its own — after everything the author has, not
beside the header.

**A page also REFUSES one kind, and the client knows it now.** `REFUSED_KIND`
is the mirror of `REQUIRED_KINDS` — `owner` is refused on a person's page and
`fursonas` on a fursona's, because neither has anything to render on the
other. It lived only in `set_actor_sections` until 2026-08-27, which is why
the kind select offered a choice the database rejected. It is pinned to `0009`
by `block-limits-match-migration.test.ts` like every other vocabulary written
down twice.

The kind select is narrowed by `offerableLeafKinds` and shows a stored kind
it cannot offer as a disabled option, so a page saved by a newer build is not
silently retyped. `leaf-kind-options.test.tsx` carries a positive assertion
beside each negative one, because an empty select satisfies every
`not.toContain` ever written.

`progressValue` (`domain/progress-value.ts`) accepts a fraction (`3/5`), a
percentage (`60%`) or a bare number (`60`), decimals allowed wherever a whole
number is, clamped to 0–100 because nothing stops somebody writing `150`.
**Anything it cannot read renders the plain row with no bar at all** — prose, a
unit it does not know, an empty description — and that refusal is the common
case rather than an edge, since a template's unedited placeholder is prose.
Read its TSDoc before touching the parse: a fraction whose sides both overflow
to `Infinity` once reached the DOM as `width: NaN%`, which CSSOM rejects, which
left the bar at its parent's full width — the "refuses nothing, shows nothing"
trap inverted into a bar reading 100% on nonsense, which is worse because it
looks like an answer.

**`social` renders no description and the editor must not offer it one.** Its
sub-line is the handle `resolveSocial` derived from the address, which is all a
chip has room for. A control that accepts what somebody types, stores it,
refuses nothing and renders nothing is the worst kind — there is no way for
them to learn it did nothing.

**`domain/leaf-fields.ts` is where that rule lives now**, one row per kind
saying whether the renderer reads the address, the icon, the picture, the rows
and the description; `LeafEditor` offers exactly what it says yes to. It
replaces the flat editor's `LINKED`/`ICONED`/`PICTURED` sets, and it is
**pinned to the renderer rather than trusted against it** —
`leaf-fields.test.tsx` draws each kind in every state its own renderer can
reach, with a field written and without, and fails when the markup differs for
a field the table calls unread or fails to differ for one it calls read. That
guard is not decoration: written from the table alone it disagreed with
`blocks.tsx` on three cases, all for the same reason. **`player` and `post`
read the ICON**, because an address neither can frame falls back to a link or
to a branded chip and both draw one — and a Bluesky `post` is ALWAYS the chip,
since `embed.bsky.app` hard-refuses the handle a shareable address carries. A
single-state measurement reports that as a field nobody reads.

### The players (2026-08-19) — and a name that was taken back

Three kinds where there were two, and one of the two changed meaning. Read this
before assuming `player` still means what it did.

| kind      | what it is                   | plays                               |
| --------- | ---------------------------- | ----------------------------------- |
| `embed`   | ANY provider's own embed     | whatever `resolveEmbed` recognises  |
| `player`  | a retro media player of OURS | audio and video files; a video pane |
| `jukebox` | a retro music player of OURS | audio files; no video pane          |

**`embed` is `post` renamed, and it absorbed `player`.** The two embed kinds
were one leaf under two names: `LEAF_FIELDS` gave them byte-identical entries,
both resolved through `EMBED_PROVIDERS` and both rendered `EmbedFrame`. Nothing
about an embed varies per leaf — the height, the shape and the aspect all come
from the provider table — which is why no per-embed option was ever needed and
why the merge cost nothing. It is called `embed` rather than `post` because it
holds YouTube, Spotify and Tidal as well as Instagram and Mastodon, and "post"
described about a third of what it does.

**The two kinds differed in exactly two ways, and one of them has been
misdescribed once already — do not repeat it.** `player` passed `parentHost` to
`resolveEmbed` and `post` did not, so the same Twitch address framed under one
and chipped under the other. That looks exactly like a bug and **it was
deliberate**, with the reason written above the case: Twitch is the only
provider reading `parentHost`, its player is a `video` shape rather than a post,
and a video did not belong in a post's 420px column. A review of this branch
called it "a latent bug nobody chose" in a commit message, a pull request and
the spec before anybody read the comment. The merged kind passes `parentHost`
now — but because the premise went away, not because the old behaviour was
wrong. There is no post's column, and a chipped Twitch beside a framed YouTube
would be the one arbitrary case.

**A `player` has a video pane and a `jukebox` does not, and that line is
LICENSING rather than technical.** A playlist can hold a YouTube address and
play it by driving the provider's own embed with `postMessage` over
`enablejsapi=1` — no third-party script, no `script-src` origin, and `frame-src`
already allows the host. But YouTube's terms forbid hiding or obscuring the
player, so only a chrome with somewhere to SHOW it may offer that. Winamp's
275x116 window, whose largest free area is a 76x16 visualiser, has nowhere.
Splitting by capability rather than by product is what makes the rule survive
the next chrome.

**Not one new field was added for any of it.** A playlist is `rows` — the same
field a `table` leaf uses — because that field is already capped by the live
database at 50 rows of 8 cells, with no migration written and no statement
hand-applied. `icon` names the CHROME, and `link_url` on a `jukebox` is the
`.wsz` skin. The whole database delta for the feature is the kind list in
`is_block_kind()`.

Two consequences that are easy to get wrong:

- **`icon` is not an icon for these two kinds.** `LEAF_FIELDS` says what the
  RENDERER reads, which is what `leaf-fields.test.tsx` measures; which control
  the EDITOR draws for it is a separate decision, and for these two it is a
  chrome picker rather than the glyph picker.
- **The skin is deliberately absent from `LEAF_FIELDS`.** Its sheets arrive from
  a fetch in an effect, so writing one changes no static markup and that table
  cannot honestly claim it is read. It gets a bespoke control with a live
  preview instead.

**A chrome is DATA — a token set over one component per kind** — which is what
makes a long roster cost a few hundred bytes rather than a chunk each.
`chromes.ts` holds it. Winamp is the ONE exception and carries a `sprites` flag:
it is a sprite engine reading a real `.wsz`, so it sits behind its own dynamic
import and a page wearing any other chrome never loads it.

**Winamp is deliberately NOT the default jukebox chrome**, and the reason is not
taste. Being behind a dynamic import it produces no server markup, so a public
page wearing it by default would render nothing for its player until hydration —
where every other leaf here paints something before script runs. `EmbedFrame`
sets that standard. `leaf-fields.test.tsx` is what caught it, by finding that a
`jukebox`'s claimed fields changed no static markup.

**No skin artwork is in the repository, and none should be added.** A control
whose sprite is missing draws itself from the chrome's tokens in the classic
layout's own box, so the unskinned window is this app's own look, a museum skin
makes it authentic, and there is ONE rendering path rather than a special
unskinned mode that would drift. It falls out of `controlStyle` answering the
BOX even with no picture — which is also why a skin supplying only some sheets
draws the rest of the window instead of piling it into the top-left corner.

### Depth is capped at three, and the database is what enforces it

A section, a container inside it, a container inside that, then leaves.
`MAX_DEPTH` says so in `block-schema.ts` and `validate_block` in `0009` says so
again, **with an explicit counter passed down its own recursion**.

The duplication is the design rather than belt-and-braces.
`actor_profiles.sections` is user-controlled `jsonb`, so an unbounded recursive
validator over it is a stack whose depth somebody else gets to choose; a cap in
the editor is a suggestion and a cap in `set_actor_sections` is the guarantee.

**And that is a guarantee only because the write grant on `actor_profiles`
names its columns.** `authenticated` may `update` exactly `sort_order` and
`featured`; `sections` and `theme` are reachable only through the two
`security definer` functions. Before that, PostgREST exposed the table and a
signed-in person could `PATCH` `sections` on their own row with no cap applied
at all — the sentence above was a convention wearing a guarantee's words.
`tests/db/blocks.test.ts` pins it in both directions: the direct write is
refused, and arranging still works.
The Zod side is not a walk anybody has to remember to run either — every
exported schema is built by a factory that threads depth through the recursion,
so a container at the cap meets an option that fails **by name**, and both
sides carry that same `TOO_DEEP_MESSAGE` string. Without it, a container one
level too far is refused for naming a `kind` no leaf has: the editor would tell
somebody their block kind is invalid and their title is missing, neither of
which they got wrong. That is the fault class this repo already paid for once,
when a missing `nuqs` adapter was reported as "we could not load your
identity".

Three is where two independent costs bite. Beyond it, "where am I" stops being
answerable at a glance on a phone. And style recalculation is linear in DOM
size — measured at 15.6 ms on the editor's own DOM, times roughly twelve under
CPU throttling — which nesting multiplies.

**The cap's arithmetic is the thing to be careful about, not the cap.** Two
people got it wrong independently and from opposite directions on the branch
that built this: a leaf's deepest seat is three containers down, and a test
that nests two and calls itself "at the deepest level" is sitting one level
above the only place the refusal it exists to prove can happen.

### A container is its SPACES, and there are no spans

**`columns` and `span` are gone and nothing replaced them.** A container
declares `spaces` — how many places it lays ACROSS, from one to six — and every
child takes exactly one of them, filling row by row so the section grows
downward. Where a block sits is entirely its parent's business, and its width
is not a property of the block at all.

**A wide thing is a place with a bigger SHARE, and this paragraph used to say
something else that was never true.** It said a wide thing was "a container of
one space nested where it is wanted, which is the same recursion doing the work
rather than a second mechanism beside it" — which reads like a mechanism and is
not one. A nested container still occupies exactly ONE place of its parent, so
inside a three-space section it is a third of the width whatever it declares
about itself: **nesting can make something narrower and can never make anything
wider.** Narrow sides with a wide middle was therefore not merely unbuilt, it
was unrepresentable. `weights` on the parent is what says it now — see below —
and nesting keeps the job it can actually do, which is making a place a COLUMN
rather than making it wide.

**Weights are not `span` under a new name, and the refusal above stands
unchanged.** The number is on the PARENT, and that is the whole difference. A
drop is an exchange of two places, so a `span` on the child asks what it means
to exchange a two-wide place with a one-wide one — a question with no answer,
which is why `span` went. Weights leave `moveBlock` untouched: the places keep
their widths and the contents trade seats. **Flexbox is the instructive
contrast**, because it is the model that puts the number on the child
(`flex-grow`) and `fr` IS `flex-grow` — literally the same algorithm sharing
out the same leftover space, differing only in who owns the number. It cannot be
adopted here for a second reason as well: a place holding nothing is not a
flex item, so flexbox cannot express an empty place at all, and the positional
empty place is what this whole model rests on.

If you are reading a document that still describes `BLOCK_LIMITS.tracks`,
`effectiveSpan`, `TRACK_CLASS` or `SPAN_CLASS`, this note is newer: none of
them exists.

**A place may be empty, and then it keeps its width and draws nothing.** That
is the decision the whole model rests on rather than a detail of it, because a
place is POSITIONAL: `[a, null, b]` has to mean that `b` is third, and a list
that merely happens to be shorter cannot say so. Collapsing was refused
deliberately. If an unfilled place closed up, a space count would mean nothing
the moment a section was partly filled — a three-space section holding two
things would read as two columns — and the shape somebody chose would change
under them as they worked, which is exactly the failure a flow of tracks had.
What a visitor sees is room: no border, no surface, no padding, so it reads as
space rather than as a broken box. A TRAILING empty place is kept for the same
reason and trimmed by nothing, since somebody is usually about to fill it and
trimming would move every entry after the next thing they add.

**`tabs` and `accordion` except themselves, and the exception is that ruling
rather than a breach of it.** Both drop an empty place, because there a
place is a CONTROL and not a box: an empty tab opens onto nothing and an empty
disclosure has nothing to disclose, which is a control that does not work and
is strictly worse than the gap it would have filled. `filledSeatsOf` is where
that lives, and every seat it keeps carries its true `path` and `ordinal`, so
dropping one renumbers nothing and the third place is still called the third.
Every mode that lays a BOX keeps the place, because there the empty box IS the
shape its author chose — and `timeline` keeps the step while drawing no marker
beside it, which is the same rule read from the other end: a bullet with
nothing next to it is chrome for content that is not there.

**A `spaces` a build does not know renders as one place rather than blanking
the page.** `SPACE_CLASS.get(n) ?? ""` is that fallback, and the LENIENT read
admits a count above the vocabulary for the same deploy-skew reason it admits
an unknown `mode` — see `spaceCount` in `block-schema.ts`. The write still
refuses one, and so does `validate_block`. The same asymmetry now covers
`children`'s length: capped on the write, unbounded on the read. **Both were
strict on both sides and that was a fault**, because a number a newer
deployment raised is not corruption, and refusing one on the read failed the
container, then the union, then the array, then the page — `null` to its owner
and `[]` to a stranger, over a value that was only ever going to cost a
container its shape.

**There are THREE stored shapes, not two, and the third loses its width
silently unless something reads it.** Flat sections are one; blocks carrying
`spaces` are another; and in between, for about a day, `#158` shipped an editor
that converted at the save boundary and wrote blocks carrying **`columns`** and
leaves carrying a materialised `span`. Those rows are in the database. The
lenient object strips a key it does not know, so without a fallback `spaces`
falls to its default and a three-across gallery reads back as one full-width
column — for its owner and for a stranger — after which the next save stores
that loss permanently, with nothing warning anybody, because a strip is not an
error. `withSpacesFromColumns` in `block-schema.ts` reads `columns` as `spaces`
where there is no `spaces`, on the LENIENT build only; the strict save refuses
the key and `validate_block` refuses it by name, so an owner who saves a
repaired page stores it in the new shape. **It can be deleted once no stored
page carries `columns`, and no test can tell you that** — it is a fact about
the live database rather than about the code.

**Free positioning — x, y, width, height on a canvas — is refused, and the
refusal is hard to walk back once shipped.** It cannot degrade to a narrow
viewport, and this project has already shipped one overflow at exactly 320px;
it makes the editor close to unusable on a phone, which is where most people
will build; and it is how the pages this product is inspired by became
unreadable.

**`minmax(0, 1fr)` is load-bearing wherever a track is laid**, and the
measurement that established it is worth not having to repeat. At 320px with an
eight-cell `table`, `document.scrollWidth` read 656 against a `clientWidth` of
320 — and the `overflow-x-auto` box round the table had itself resolved to
638px, so there was nothing left to scroll and the class was decoration. The
table was not overflowing the page: **the page had grown to fit the table**,
through a chain of `auto` tracks each floored at its content's min-content
contribution. Identical to a reader, opposite cause, and therefore a fix in the
opposite place. Two notes in `blocks.tsx` exist only because none of that is
visible without a browser — `tabs`' panel survives on `w-full` capping its
automatic minimum, and `min-w-0` on a leaf pairs with `@container` on the same
element, each individually sufficient because inline-size containment zeroes
the same min-content contribution `min-width: 0` does.

**Every responsive rule inside a block is a CONTAINER query, and that is a
correction rather than a preference.** A leaf in one place of a three-space
section is about a third of the page wide, while every `sm:`-prefixed rule
inside it would believe it had the whole window — and the error compounds with
depth. **A viewport breakpoint here is the wrong tool and not a weaker one**,
which is the distinction worth keeping: it answers a question about a box the
block does not live in, so it is not less accurate about the block's width —
it is not about the block's width at all, and no threshold can be picked that
makes it so. The editor's own cards ask the same way, for the same reason: a
nested card lays its places inside a track of its parent's grid, so a viewport
query there would be the identical mistake one level down. `blocks.test.tsx`
asserts that a page of every mode emits no `sm:`/`md:`/`lg:`/`xl:`/`2xl:` class
at all, built from `LEAF_KINDS` so a breakpoint added to any renderer fails it.

It also cost no dependency and no client boundary. `@container` compiles to
`container-type: inline-size` and the `@`-prefixed variants are plain CSS, so
every renderer here stays a **server component** — where the JavaScript
alternative would have meant a resize observer, a `"use client"` on the whole
tree, and a first paint measured after hydration rather than before it.

### A place can be a column — `addToPlace`

**A place holds one child, so a column is a `stack`, and there is no second
mechanism for it.** `addToPlace` (`domain/block-edits.ts`) is what the
shape control and the editor's own drag-and-drop both write through, and its
rule is a small case split rather than a tree the editor assembles by hand:

- An **empty place** takes the block directly — no wrapping at all.
- A place already holding **one block** gets wrapped: `addToPlace` builds a
  new `stack` container of one space, puts what was there and the new block
  in it as `[here, block]`, and writes the stack in the place's stead.
- A place already holding a **`stack`** gets an append — the new block joins
  the existing column's `children` rather than starting a second one.

That is what makes "sides and a middle" a shape somebody picks from a preset
rather than a tree they build by hand: the preset seeds each empty place with
a `stack`, and every block dropped into that place afterwards lands in the
column already there.

**The editor never removes a stack it made.** A column emptied back down to
nothing is not unwrapped back to a bare place — it is left as a `stack` with
no children, which renders exactly as an empty place already does (see
`clearAt`'s note above). Deleting the column itself, if that is what somebody
wants, is the same operation as deleting any other block.

**The wrap is refused where `mayNest` says a container may not sit, and the
page comes back as the very same array.** A place at the depth cap
(`MAX_DEPTH`) may hold content and nothing else — wrapping it in a `stack`
would build a tree `validate_block` refuses on save, so `addToPlace` checks
`mayNest(path)` before building one and returns the identical array, by
identity, when it is refused. That is what lets a caller compare by identity
and skip a write rather than diffing a tree to discover nothing happened — the
same convention `moveBlock`'s no-op return uses.

A column spends one of the three nesting levels, like any other container: a
`stack` seeded into a place at depth 1 leaves only leaves for depth 2, which is
the ordinary cost of the mechanism the SPACES section above describes — a wide
thing is a place with a bigger share, and a "sides and a middle" shape is a
place turned into a column, never a block made wider than the place it sits
in.

### A place may be wider than its neighbours — `weights`

A container may carry `weights`: **one whole share per place, 1 to 6**, so
`spaces: 3` with `weights: [1, 3, 1]` lays a narrow place, one three times as
wide, and a narrow place. The bound is `BLOCK_LIMITS.weight`, and `0009` is the
authority in two steps, each refusing **by name** as the depth cap does, so
somebody whose shares are wrong is told that rather than that their `mode` is
invalid: `is_weight_list` checks the SHAPE — absent, or one share per place —
and, once that has passed, `validate_block` checks inline what each share is
WORTH, a whole number from 1 to `c_max_weight`. The two are split because they
are not the same mistake: a wrong count and an out-of-range share each name a
different field, and one message for both would occasionally name the field
somebody got right.

**Absent means uniform, and it reaches uniform through a CSS fallback rather
than through a branch — one that has to be re-armed explicitly, because CSS
custom properties INHERIT.** `SPACE_CLASS` is no longer `@lg:grid-cols-3` but
`@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]`, and
`Grid` sets `--block-tracks` on every grid, weighted or not — `"initial"` when
there is no ratio to state. That is a fix rather than a redundancy: `var()`
uses its fallback only when the property is UNSET on the element asking, and
an inherited value counts as set, so a plain conditional (`tracks ? {…} :
undefined`) once let an unweighted grid nested inside a weighted one resolve
the ANCESTOR's track list — a two-place grid dropped into the middle place of
a 1:3:1 section laid three tracks at that ratio instead of two equal ones,
which is the ordinary shape the preset seeding produces, not an exotic one.
`"initial"` resets the property at that element, which re-arms every `var()`
fallback beneath it. The class keeps the CONTAINER QUERY, because an inline
style cannot carry a query
of any kind and the collapse to one column would have nowhere to live; the
property carries the TRACKS, because weights are author data out of `jsonb` and
no build step can ever see them, so no class can be generated for them. The
consequence worth protecting: **an unweighted page emits the declaration it
always did**, `repeat(n, minmax(0, 1fr))`, byte for byte. `trackListFor`
answers `undefined` for no weights, for a length that is not `spaces`, AND for
shares that are all equal — that last on purpose, since uniform weights and no
weights are the same page and answering differently would let a test pin an
accident.

**A mismatched length is refused on the write and ignored on the read**, the
asymmetry this model uses everywhere: a strict save stores nothing it cannot
mean, and a lenient read treats a weights array a newer deployment wrote
against a larger `spaces` as a shape it does not know rather than as
corruption. It costs a container its proportions and never blanks a page.

**Only `grid` spends weights, and the database stores them for every mode
deliberately.** `masonry` is CSS multi-column, whose columns are uniform by
construction, and `stack`, `carousel`, `tabs`, `accordion` and `timeline` lay
nothing across at all — so the editor offers the control for `grid` alone,
because a control that stores what somebody types and renders nothing gives
them no way to learn it did nothing. Refusing to STORE it would be a different
and worse thing: somebody who sets a shape, flips to `carousel` to look and
flips back must find their proportions still there, which is the same reasoning
that keeps a leaf's fields when its kind changes.

**`LONE_CENTRE` does not apply to a weighted grid.** Centring a lone block on a
part-filled last row gives it one empty track each side — and "one each" cannot
be given out of tracks that are not the same width. A weighted grid leaves the
lone block where it is.

**Each weighted track is floored at `TRACK_FLOOR` (`8rem`,
`domain/block-tracks.ts`), and the floor is what makes growth
self-correcting.** The container-query thresholds were tuned for tracks that
are all the same size, so at the width where three places are first laid at all
a 1:6:1 split would give its sides about 3.75rem — a sliver a bounded weight
alone does not prevent. With the floor the sides take `8rem` and the middle
takes the remainder; as the container grows the shares overtake the floor and
the author's ratio asserts itself. So a weighted section is near-uniform when
there is little room, is the shape its author chose when there is room for it,
and is one column when there is not much room at all.

`8rem` was arithmetic — the largest value fitting inside every threshold with
its gutters — and it is a measurement now: `weighted-places.spec.ts` watched
all five in a browser and nothing overflowed, so the value did not move. What
DID move is the widths the browser needs to reach each threshold. The queried
box is the section, and the page's own padding sits outside it, so the viewport
widths that first lay 2/3/4/5/6 places are **352 / 544 / 720 / 944 / 1072px**
against the arithmetic's 320/512/672/896/1024 — each 32–48px larger. Anything
choosing a viewport width to prove a grid behaviour uses the measured numbers,
or it measures a collapsed grid and passes while proving nothing.

**Below its threshold a weighted grid is one column and the places stack in
STORED order**, exactly as an unweighted one does. Reordering on narrow screens
is refused: `order` and explicit placement both change what is SEEN without
changing what is READ, so focus order, screen-reader order and copy order would
all disagree with the page — and `a11y.spec.ts` would not necessarily catch it,
since nothing in the `wcag2a`/`wcag21aa` sets it runs measures that mismatch.
An author who wants the middle first on a phone puts it first; `[3, 1, 1]` is a
wide-left page that is honest at every width.

### Adding a mode or a kind — what is guarded, and what is not

`CONTAINER_MODES` and `LEAF_KINDS` in `block-schema.ts` are the vocabulary;
`is_container_mode()` and `is_block_kind()` in `0009` are the authority, and a
name the database does not know is refused whatever the array says.
`block-limits-match-migration.test.ts` reads those lists out of the SQL and
fails when the two sides disagree, so neither can be extended alone — and it
asserts its own regexes matched something before comparing anything, because a
pattern that quietly matches nothing makes every comparison after it pass
forever. `MODES` and `LEAVES` in `blocks.tsx` are `Map`s built from private
records carrying `satisfies Record<ContainerMode, …>` and
`satisfies Record<LeafKind, …>`, so a name with no renderer behind it fails to
compile.

**Those lookups are `Map`s rather than records because of a fault, not a style
rule.** `mode` and `kind` arrive from `jsonb`, and a plain object indexed by
user-controlled text answers `__proto__`, `constructor` and `toString` with
truthy inherited values. This repo shipped a Critical of exactly that shape
through `TIDAL_KINDS`, where the inherited value passed a `!entry` guard and
then threw during a public page render. A `Map` has no inherited entries to
find. The same argument covers `SPACE_CLASS`, `MASONRY_CLASS`, `LEAF_FIELDS`,
`PLACES_CLASS` in the editor and `SHAPE_OF` in the shim — every lookup whose
key arrives from `jsonb`. `SHAPE_OF` is the newest, and it was a plain object
until a review noticed: every caller passed a value `z.enum` had accepted, so
nothing was reachable — which is a property of three call sites rather than of
the table, and the guard has to be the structure rather than a discipline the
fourth caller has not read about.

One thing is **not** guarded and must not be assumed: nothing checks that a
mode is _good_. That part is still on you.

**Both vocabularies ARE named to a person now, and both are checked.**
`messages.test.ts` pins `CONTAINER_MODES` against `fursonas.modes` and
`LEAF_KINDS` against `fursonas.leafKinds`, in each catalogue separately — the
parity check beside it cannot see a name absent from both. It also pins
`fursonas.leafFields`, which is one title string per kind and a description and
a prompt for every kind that draws one: the pair genuinely means something
different per kind, so a `picture`'s title is its ALT TEXT and a `quote`'s is
who said it, and `DESCRIBED_KINDS` is what says which kinds owe the other two.
`pages/labels.ts` builds every one of those records by MAPPING the vocabulary,
so a kind added without a name fails the build instead of rendering its own id
at somebody.

**That catalogue guard is newer than the sentence that promised it**, which is
the part worth remembering rather than the guard. Four documents said a test
caught a missing name and none did: `skins.test.ts` imports no catalogue,
`messages.test.ts` compared en against es only — so a name absent from **both**
passed — and the `t()` call over an interpolated key is untyped, there being no
`IntlMessages` augmentation in this app. A layout added to neither catalogue
therefore rendered `fursonas.types.<id>` at somebody, which is not
hypothetical: it happened, at 155px, overflowing a 320px viewport. The lesson
generalises past this file — **a sentence crediting a guard is not the guard**,
and the ones most likely to be false are the ones nobody has watched go red.

### What a template ships, and what a title and a description mean

**A template ships structure, never prose.** Titles, arrangement, icons and
order are ours; every description is empty. They used to carry guidance
sentences in those descriptions, so a page created from a template and
published unedited read its own instructions out to strangers in its owner's
voice — "Say what your character is: one species, a hybrid, or something of
your own", presented as what that person had written. The prompt is the
description field's **placeholder** now: it helps while somebody writes, is
never stored, never published, and never has to be deleted. The templates
themselves are still flat and phase 3 rewrites them; the rule outlives them.

**A description may be empty and a title may not.** A block is a heading with
something under it: without the heading there is a blank box and nothing to
render, while without the description there is a perfectly good card — which is
exactly what a template hands somebody to fill in. Every kind leaves the
element out when the description is empty, or an empty `<p>` becomes a visible
hole in a gap-spaced grid.

**That rule is enforced on the WRITE and deliberately not on the read.**
`validate_block` refuses a zero-length `title_en` beside its type check, and so
does the strict schema. `min(1)` on the READ path made one leaf's empty title
fail the whole page, because a failed parse answers "nothing here yet" over a
page full of content — precisely the blast radius the lenient read exists to
prevent, and the leniency had only ever been extended to unknown keys. The read
is a floor now: one empty title costs that title, never the page, and every
renderer already handles it.

### Embedded media is allowlist-and-rebuild, never pass-through

`domain/embeds.ts` is the whole security model of the media leaves and its
TSDoc carries the argument in full. The short version, because it must not be
weakened by somebody who only read this file:

**What somebody pasted never reaches the page.** Every branch parses the
address, checks the host against an exact set on the parsed `hostname`,
extracts an id matching a strict pattern, and then BUILDS a new address from a
fixed template. A hostile value cannot become anything worse than no embed.

**The allowlist itself is a table, `shared/domain/embed-providers.ts`, not a
chain of branches in `embeds.ts`.** `EMBED_PROVIDERS` holds one entry per
service — its hosts, its player origin, its `resolve` and its `src` — and
`embeds.ts` is the lookup over it. `PLAYER_ORIGINS` (in `player-origins.ts`,
which feeds the CSP's `frame-src` below) is **derived** from that same table
rather than kept as a second list pinned to it by tests on both sides, so a
host cannot be allowed in the policy without a provider that builds on it, or
built without being allowed. Adding another service is one entry in
`EMBED_PROVIDERS`; nothing else has to be told about it.

A `fast-check` property test,
`apps/hub/tests/embed-providers-properties.test.ts`, asserts that no
provider's `resolve` throws, across hundreds of generated hostile paths per
provider. It exists because a named-case suite already had 100% branch
coverage on `tidalPath` and still missed a real fault: `TIDAL_KINDS` was a
plain object once, and indexing it with an untrusted path segment like
`__proto__` or `constructor` resolved to an inherited, truthy value that
passed the `!entry` guard and then had no `.id` to call `.test` on — a thrown
`TypeError` with no case anyone had written that chose such a key. Coverage
measures which branches ran, not which inputs were tried; the property test
tries the input nobody thought of, on every provider, so the next one that
makes the same mistake fails here rather than in production.

- Only `https:` survives, so `javascript:` and `data:` cannot reach a frame and
  run in this page's origin.
- Hosts are never matched by prefix or suffix. `youtube.com.evil.example`,
  `evil-youtube.com` and `https://www.youtube.com@evil.example` all fail — the
  last one only because the comparison is on the parsed authority. This is the
  same mistake `return_to` had to avoid in the picker, and it is the same fix.
- Every query parameter is discarded. Carrying them would let whoever pasted
  the link set whatever options the provider honours.
- Any provider whose player takes an address as a parameter rebuilds it from
  parsed path segments and then encodes it, so a `&` in what somebody pasted
  cannot add parameters to the widget. SoundCloud and Mixcloud both do —
  URL-inside-a-URL is not unique to one provider, and a third provider shaped
  this way inherits the same rule.
- Anchors go through `safeHttpUrl` and an address that fails renders as plain
  text. React escapes text, not URL schemes; nothing upstream is catching this.
- Public links carry `nofollow ugc` as well as `noopener noreferrer`. A page
  anybody can publish links on has to say so, or it becomes a way to buy
  ranking.
- **No frame is granted `autoplay`.** A profile that starts making noise at
  whoever opened it is the thing people remember most fondly and least
  accurately about the pages this borrows from.

**There is a second layer now.** `shared/domain/csp.ts` sets a
Content-Security-Policy on every route whose `frame-src` is built from
`PLAYER_ORIGINS` — so a frame can only ever point at a player this app can
produce, even if the resolver were made to build something else. As above,
that agreement is structural now rather than two lists kept in step by
tests: `PLAYER_ORIGINS` is derived from `EMBED_PROVIDERS`, so there is only
ever one list to have gotten wrong.

Read that file before editing the policy. Two things about it are easy to get
wrong and both fail quietly:

- **Cloudflare Turnstile must stay in `frame-src`.** Clerk frames it for bot
  protection, and without it the sign-in form renders with an empty box where
  the challenge should be.
- **`script-src` carries `'unsafe-inline'`**, because Next inlines its own
  bootstrap. So the policy is **not** a defence against injected inline script,
  and it must not be described as though it were. **A nonce was considered and
  declined**: it forces every page to render dynamically, and the public pages
  are the ones least worth giving that up for. What guards the surface instead
  is `html-sinks.test.ts`, which counts every way a string can become markup or
  script here and fails when a new one appears — there are two, both fed module
  constants, both asserted to interpolate nothing. The parts that protect
  something are `frame-src`, `object-src`, `base-uri`, `form-action` and
  `frame-ancestors`, none of which depend on `script-src`. A nonce is the
  upgrade, and its cost is that every page renders dynamically.

### `social` accepts anything; `post` and the media leaves do not

`resolveSocial` (`domain/social-links.ts`) is deliberately the opposite of
`resolveEmbed`. **It accepts any `http(s)` address.** A host in its brand
table becomes a chip carrying that brand's label, icon and the handle pulled
from the URL; a host outside the table still becomes a chip, labelled with its
own hostname rather than dropped. It returns `null` only for an address that
must not be linked at all — `javascript:`, `data:`, or nothing parseable as a
URL.

**This is the property that makes the kind worth having, and the one somebody
will look at and want to "fix" by refusing an unknown host. Do not.** A
`social` leaf exists precisely so FurAffinity, Toyhouse, Weasyl, Ko-fi,
itch.io, Bandcamp and ArtStation — and whatever a person links next — all have
somewhere to go, with no table entry required and nothing that can break.
Nothing here reaches a frame or executes anything, so tightening this to a
known-hosts allowlist would not be a security fix; it would just delete the
kind's reason for existing.

Some services give each person their own subdomain — `luna.itch.io`,
`luna.bandcamp.com` — which an exact-hostname table cannot brand, because the
hostname differs for every user. These fall through to the generic chip,
labelled with their own hostname, and that is a correct outcome, not a gap.
**Do not "fix" it with suffix matching.** Suffix matching is exactly the
mistake `resolveEmbed`'s allowlist already refuses, for exactly the same
reason `return_to` had to avoid it in the picker: `evil-itch.io` and
`itch.io.evil.example` both look plausible under a suffix rule, and a chip
that can be spoofed into wearing a brand's name is worse than one labelled
with its own honest hostname.

A `post` leaf whose address resolves to no provider — Bluesky, always;
anything else `resolveEmbed` cannot place — renders as a `social` chip, never
as nothing and never as a bare link. The two kinds share the same chip
component for exactly this reason: a page that already brands Bluesky as a
chip on one would be inconsistent showing it unbranded on the other.

### Era looks (2026-08-28) — five OPTIONS, and not one new skin

`domain/era-looks.ts` holds five looks aimed at five eras of somebody else's
operating system, as a second test of reach after the eleven social pastiches.
**Every one is an option and none is a default**; a page that picks none is
byte-for-byte what it was.

**Each look wears its release's own mark as an avatar, and is public and listed
(2026-08-29).** They carried no artwork and were seeded `unlisted` — the
opposite line from the eleven social pastiches beside them, recorded as a
deliberate difference rather than settled. It is settled towards consistency:
an empty circle where every neighbour has a mark reads as unfinished, and five
looks nobody browsing `/137` can find are five looks nobody sees. The marks are
hot-linked by the seeder and none is committed.

**Four of the five are WORDMARKS, so `identity()` sets `image_fit: "contain"`
on its avatar leaf.** The XP, Vista and 7 lockups are about five times as wide
as they are tall and the avatar renders `object-cover` on a circle, which crops
them to two meaningless fragments — the same fault `image_fit` was added for
when the social pastiches were first given their real logos. It reaches
somebody who PICKS one of these as a template too, which is the safe direction:
`contain` and `cover` are identical on a square portrait and differ only on one
that is not, where showing the whole of somebody's character beats cropping
it.

**Not one new skin was added, which is the finding that shaped the phase.**
`retro` already IS Windows 98's raised bevel and `aero` already IS Aero glass,
so three of the five needed no chrome written at all. Adding `win98` or `win7`
to `SKINS` would be the "another set of numbers" the bar forbids. What a look
adds is the PALETTE and the arrangement around an existing skin — which is
exactly why a look is a document rather than a vocabulary member.

**Vista and Windows 7 differ by PALETTE, not mechanism**, and that is a
refinement of the spec, which called them near-identical. The captures show one
dark-tinted on green and the other light-tinted on blue; both are `aero`. It is
the clearest single piece of evidence in the phase that a look is a document.

**A look is a FURSONA document and a person's page refuses it.** It names
`owner`, which has nothing to render on somebody's own profile, so
`set_actor_sections` refuses the save outright. The picker withholds what does
not fit — `fitsActorKind` — because offering one at `/me/edit` would hand
somebody a page that applies cleanly and then cannot be saved, which is the
"the control did nothing" fault wearing its worst face: it looks like it did
everything. A PASTED document needs no such filter, because `parseDocument`
already reports a refused kind as its own problem, naming the block; only the
picker, which does not parse, needed asking.

**A look carries its own identity section** rather than leaving it to
`withRequiredBlocks`. A look is pasted as well as picked, and a paste never
runs the read path that would add one.

**Windows 8 is a FINDING rather than a delivery, and it was predicted before it
was built.** Metro is flat solid tiles in DIFFERENT colours — the capture holds
seven in one screen — and per-block colour is refused by design. What IS
reachable is everything else, and it is worth knowing how much: `chrome:
"bare"` removes fill, edge, shadow and padding together, `radius: "square"`
squares the corners, `spacing: "compact"` closes the gaps, and the mixed tile
sizes are ordinary `spaces` and `weights`. So the arrangement lands and the
colour does not, which is the most useful shape a failure can have — it names
one mechanism rather than a feeling.

**Gap 8 is CLOSED (2026-08-28): `theme.surface` is a page-level panel
colour.** Null derives the stepped panel every page had, so nothing stored
moved. Choosing one gives the page TWO grounds, and `derivePalette` solves ink,
muted and edge against whichever leaves least room — the hardest-stop rule
extended from one ground to two, with the same reason: text has to clear its
minimum wherever it lands.

**What it guarantees is narrower than "both grounds clear 4.5", and a failing
test is what found the difference.** `#008080` sits near mid-lightness and
never cleared the minimum with or without this key; measured, choosing a
surface leaves the field at 4.05 exactly and takes the panel from 4.97 to
10.61. The contract is **a second ground costs the first nothing**. Weakening
the assertion to make it pass would have been rule 7's forbidden move.

**`--bar-solid` follows the surface's own HUE now**, not the background's. It
used to splice `bgH` onto the surface's lightness, which was harmless while a
surface was always a tint of the ground and wrong the moment it stopped being
one.

**What the photographs then found, which the plan could not.** One gap
explains most of the fidelity loss across three of the five: **a page cannot
choose its SURFACE colour independently of its background.** Every derived
colour comes from the background gradient, so a panel is always a tint of the
ground. Win98 wants silver on teal, XP near-white on blue, Metro coloured tiles
on black — one missing mechanism, three looks. It is NOT gap 6, which is
per-block colour; this is per-page, and it is the more ordinary want.

**`chrome: "bare"` was the wrong tool for Metro, and that is a trap rather than
a gap.** `bare` drops the FILL along with the edge, shadow and padding, so the
first attempt turned the tiles into floating labels on black. A tile is a
strong fill with no border and no corner — `card` plus `border: "none"` plus
`radius: "square"`. The key reads as if it meant "flat" and means "absent".

**A look must turn the canvas off if its ground is flat.** Windows 98, XP and 8
are flat desktops, and the default drifting nebula painted clouds across all
three until each said `canvas: "none"`. It reads as a bug in the look rather
than a default doing its job.

**Vista and Windows 7 needed nothing new at all**, which is the strongest
evidence here that a look belongs in a document: `aero` carries Aero glass
whole, and photographed, the Vista page reads as Aero without qualification.

**Windows XP reaches Luna's panel shape now, and this note recorded it as
unreachable until 2026-08-29.** `radius` was one value for all four corners,
so `soft` rounded the foot as well as the head and the strip could not sit
flush on the body. `corners` and `heading_corners` are the key that was not
invented on the way past — it arrived from the other end, from somebody
looking at these pages and naming what was missing, which is the outcome the
old sentence was holding the question open for.

The XP look wears it: the bar rounds its top and squares its foot, the body
squares its head and rounds its foot, and the join is straight.

**`heading_pad` reached Windows 98 and `heading_gap` deliberately did not
(2026-08-29).** Win98's two barred sections take `heading_pad: "snug"`,
sampled off the capture's own tight title-bar chrome. `heading_gap: "none"`
was tried on the same sections and on XP's, and reverted on both: a barred
heading's gap already collapses to `gap-0` with no key set at all
(`blocks.tsx`'s own fallback, `barred ? "gap-0" : "gap-3"`), so setting it to
`"none"` there reads the identical class — a key that shows as a change in
the diff and changes nothing, which `blocks.test.tsx`'s own heading-gap
comment names directly. That is the same trap the task adding these four keys
warned about for `heading_pad` on Vista and 7, just on `heading_gap` instead,
and on two looks the warning did not name.

Vista, 7 and 8 took no heading key at all, and not for the same reason as each
other. Vista and 7 because Aero's title bar is measurably translucent glass —
sampled off both captures — and turning it into a solid `bar` to reach
`heading_pad` would erase the one thing the era is. Windows 8 because its
capture shows real air between "Start" and its tiles: `heading_pad` is a dead
letter there regardless (no bar is drawn), but `heading_gap` is **not** gated
the same way — it reads from the table whenever a value is set, defaulting to
`gap-3` only when absent — so `heading_gap: "none"` there would have been a
real, wrong weld rather than the harmless no-op it is on a barred section.

## A page has a document (2026-08-27)

`page-document.ts` owns `{ aeleos, theme, blocks }` — the two `jsonb` columns
of `actor_profiles`, with identity deliberately absent so an imported page
renders with the importer's own portrait and name. An imported theme goes
through `parseTheme` and never through `themeSchema`, because the form
schema's looseness is justified by controls a paste does not have; an explicit
`"theme": null` reads the same as an omitted key — both mean leave the current
theme alone, never reset it. The size is checked before `JSON.parse`, never
after. Read the spec `2026-08-27-page-source-and-sharing-design.md` before
changing any of it.

**A `theme` that is present but not a plain object — `[]`, a string, a
number — is refused as its own `envelope` problem too (2026-08-28), found by
a whole-branch review.** `parseTheme` coerces any non-object to `{}` and
answers an all-defaults theme, which is the exact destructive reset `null` is
already refused above for, on an input that is more clearly malformed rather
than less. `isMalformedTheme`/`resolveEnvelope` in `page-document.ts` are
where this lives, and the guard runs BEFORE `blocksSchema` ever sees the
blocks — so a document carrying both a malformed theme and bad blocks reports
only the theme problem, the same envelope-before-contents ordering every other
envelope-level refusal here already uses.

**A refusal is reported by WHERE it was found, not by re-walking the tree a
second time.** `blockProblemsFromIssues` (`block-problems.ts`, beside
`blockProblems`) reads a raw `ZodError`'s own flat `issues` array — there is
no react-hook-form tree here, because `parseDocument` has no resolver — and
shares `blockProblems`' rule exactly: the numeric steps in an issue's `path`
are the `BlockPath` and the final named step is the field, with every other
named step (`children`, `style`, or anything nested under it) simply not
counted rather than matched by name. That is what lets a refusal inside a
block's own `style` bag resolve to a path with no special case for `style` at
all, and it was measured against the installed zod rather than assumed —
verify any future zod upgrade still reports `[0, "children", 2, "children", 0,
"children", 0, "title_en"]` for a nested block before trusting this again. **A
tree nested past `MAX_DEPTH` surfaces the same way "too many blocks" does**,
as an `envelope` problem naming `"too deep"` rather than a `block` problem: its
own issue path ends in a number, not a field, so there is nothing for
`blockProblemsFromIssues` to mark.

**`JSON.parse` runs behind a reviver that refuses `__proto__`, `constructor`
and `prototype` at any depth, as defence in depth rather than a fix for a real
pollution.** `JSON.parse` does not itself put a `"__proto__"` key onto
`Object.prototype` — confirmed against the installed engine, not assumed — but
nothing downstream of a paste should have to prove that of every future
consumer, which is the same reasoning `TIDAL_KINDS` cost this codebase once
already. A document carrying one of these anywhere is refused as its own
`unsafe-key` problem, named rather than folded into `syntax` — telling
somebody their JSON has a syntax error at a position that is fine would be
worse than not checking at all.

**The reviver costs a much lower parser depth ceiling, and that is measured
rather than assumed.** A plain `JSON.parse` has no ceiling reachable within
`PASTE_LIMIT_BYTES` — 5,000,000 levels parsed fine. Handing it a reviver makes
the engine walk the result calling the reviver on every property, and THAT walk
recurses in JS: measured against the block model's own container shape,
2026-08-27, the first depth to throw `RangeError` is 857 in this repo's vitest
worker and 863 in plain Node (862 is the last depth still accepted there) —
reachable inside the byte cap, since 2,000 such containers serialise to about
120KB against a 128KB cap. It cannot escape as an uncaught throw: `RangeError`
is an `Error`, so the same `catch` that reports a genuine syntax error reports
this one too. **The test fixture covering this is coupled to the host's own
stack**, not a flake: its window is bounded below by that ~857-863 ceiling and
above by the byte cap (~2,180 levels), so a runner with a materially larger
stack would parse it cleanly and redden the case on `at: "envelope"` instead.

**The reference is generated, and its meanings are gated.** `page-reference.ts`
interpolates every list and cap from the constants; the one-line meaning of
each mode, kind and theme key is hand-written and `page-reference.test.ts`
fails the build when a vocabulary member has none. Its worked example is run
through the real `parseDocument`, **and is checked against
`missingRequiredKinds`** — `parseDocument` only ever checks refused kinds, so
an example missing a required one would still parse `ok: true` while
`set_actor_sections` refuses it. An example a model copies and this build
refuses is worse than no example.

**`table` was never the only kind that reads `rows`, and this file's own
TSDoc said otherwise until 2026-08-28.** `player` and `jukebox` read it too,
as their playlist (`leaf-fields.ts`'s `RETRO` entry has carried `rows: true`
since both existed) — and `page-reference.ts` had copied the identical false
claim into the generated reference. That is exactly why the spec forbids
generating the reference from this file's TSDoc: the TSDoc was not merely
differently toned, it was **wrong**. Both are corrected now, and the
reference's `ROWS_MEANINGS` is gated against `leafFields` — checked per kind
in `page-reference.test.ts` — rather than asserted by hand a second time.

**The identical sentence had a THIRD copy, in `text-leaves.tsx`'s own
`tableRows` TSDoc — "every kind stores them and only this one reads them" —
found and corrected 2026-08-28, one review round after the first two.** Three
independent authors (or the same author three times) wrote the same false
generalisation about the same field without any of them checking it against
`leafFields`, which had the true answer the entire time. The lesson from
`table` was "fix the origin, not the copy"; the lesson from a THIRD copy
surviving that fix is that a false sentence does not announce which other
files repeat it — grep for the claim, not only for the file you already know
about.

**And there was a FOURTH, found on 2026-08-28 by taking that last sentence
literally on the closing task of this branch.** `0009_actor_profiles.sql`'s
`is_block_kind` carried the identical claim as an inline comment above
`'table'` — "The only kind that reads `rows`. Every other kind ignores it" —
**sixteen lines below its own `'player', 'jukebox'` comment saying "Both read
`rows` as a playlist".** So the file the root note calls the readable index of
the block model contradicted itself inside one `select ... in (...)` list, and
the three rounds above had each grepped the TypeScript and stopped there.
Every correction they claim is real; what was wrong was reading "the third
copy" as "the last copy", three times running, on a sweep that had never left
one language.

Two things follow, and the second is the one that generalises. **Grep the
whole repository for the claim, not the language you were working in** — a
model documented in TypeScript and in SQL has two places to be wrong, and
neither of the mechanisms below this paragraph reads the second one: the
`/\bonly\b|\bevery other\b/i` gate runs over `page-reference.ts`'s records,
and `check:docs` compares a TypeScript symbol against its own code. A `.sql`
comment is outside both, so it is grep or nothing. And **a comment inside a function body
is `prosrc`, so correcting one is an edit to an applied migration**: it was
hand-applied to the live project the same day and `pnpm check:schema-drift`
re-run green either side of it. Root rule 28's own incident is the proof that
this matters rather than an assumption — CRLF inside these same function
bodies was reported as drift precisely because migra compares source text.

**The STYLE keys had no meanings at all until 2026-08-29, which is the gap
this whole mechanism existed to prevent.** `MODE_MEANINGS`, `KIND_MEANINGS`,
`THEME_KEY_MEANINGS` and `ROWS_MEANINGS` had been gated for months; the style
bag was generated from `BLOCK_STYLE_LIMITS` alone, so the reference told a
model that `heading_gap` accepts `none`, `snug` or `roomy` and **nothing
whatever about what any of them changes**. Every key added since inherited the
omission silently, because the generator was working exactly as written.

`STYLE_KEY_MEANINGS` closes it, gated the same way and covered by the same
exclusivity pattern. Two things it cost that are worth carrying:

- **The gate catches a SPELLING; a writer has to catch the shape.** A first
  draft said `heading_pad` is read where a bar is drawn "and nowhere else" —
  the exact claim `/\bonly\b|\bevery other\b/i` exists to refuse, phrased
  around the words it looks for. Rewritten to say why instead: a plain name has
  no strip to pad.
- **A defensive fallback became an untestable branch.** The first version read
  the meaning with `meaning ? … : ""`, and the coverage gate refused it: the
  record is `satisfies Record<keyof typeof BLOCK_STYLE_LIMITS, string>`, so
  there is no absent case to reach. Typing the parameter as
  `keyof typeof BLOCK_STYLE_LIMITS` and indexing directly removes the branch
  rather than testing it.

**`0009`'s own column comment was stale in the same breath**, and by more than
this branch: it still said `heading (plain/bar/gradient)` after `soft` shipped.
That comment is the readable index of the block model, so it now carries `soft`
and the three new keys — and, being `prosrc`-adjacent, it is an edit to an
applied migration that was hand-applied to live with `check:schema-drift` green
either side.

**An exclusivity claim belongs in a gated record, never in prose, and this
was learned by trying it twice.** Round 1's sabotage — restoring
`page-reference.ts`'s hand-written `table` meaning to claim exclusivity over
`rows` — reddened nothing, and the honest conclusion at the time was that a
prose falsehood is not mechanically catchable. **That conclusion was true of
arbitrary prose and false of this one CLASS of claim.** Round 2 then
introduced two MORE sentences of the identical shape while fixing other
things — "children still fill places row by row [...] whichever mode is in
charge" (false for `carousel`/`tabs`/`accordion`) and "an invalid value for
any other theme key... falls back to the design's own default" (false for
`density`/`speed`/`scale`, which clamp rather than reset) — each a true
statement about a SUBSET, generalised with "only", "every other" or "any
other" into a false one about the whole. `page-reference.test.ts` now asserts
`KIND_MEANINGS`, `MODE_MEANINGS` and `THEME_KEY_MEANINGS` contain neither
`/only/i` nor `/every other/i` anywhere — sabotage-verified to redden the
original `table` claim — which is what makes the rule enforceable rather than
merely stated: **the moment a meaning needs to say a kind is exclusive, that
claim has to move into a record checked against real data (the way
`ROWS_MEANINGS` is checked against `leafFields`), because the sentence beside
it is not proof of anything.**

**Round 2 SHARPENED a pre-existing falsehood into a more precise one by
naming a mode explicitly, without checking the mechanism (round 3).** Section
2's `spaces` prose already said the wrong thing about every mode when it said
"whichever mode is in charge, children fill rows"; fixing `carousel`/`tabs`/
`accordion` and then writing "for both of them [`grid` and `masonry`],
children fill places row by row" made the SAME underlying error concrete and
specific by naming `masonry` outright — which is false, because CSS
multi-column fills column-major (down the first column, not across the first
row), the exact fact `MODE_MEANINGS.masonry` two paragraphs above already
states ("packs children into columns by height"). The lesson: correcting an
adjacent falsehood is not the same as verifying the sentence you are writing,
and a self-contradiction inside the SAME generated document — one paragraph
naming the mechanism correctly, another getting it wrong — is a check worth
running on its own, not assumed to follow from fixing something else nearby.

**The gate's regex grew a word boundary (round 3): `/\bonly\b|\bevery
other\b/i`, not the bare `/only|every other/i` round 2 shipped.** A fragment
match snags "commonly", "monopoly" or any future word merely containing "only"
— harmless today, since nothing in these records happens to contain such a
word, but a future true sentence could lose a legitimate word to it for no
reason connected to what the gate exists to catch. Sabotage-verified again
after the change: restoring the original `table` claim still reddens it.

**Where the history of a correction belongs is not inside a `@param`
(round 3).** `text-leaves.tsx`'s `tableRows` carried five lines of
provenance — including the original false sentence, quoted verbatim — inside
its `@param leaf` description, which this repo reserves for the parameter's
own contract. A `@param` is read as an assertion about the parameter, not a
changelog; quoting a falsehood there plants a searchable copy of it exactly
where someone skimming mid-comment is most likely to read it as still true.
The fix moved the (now true) fact into the function's TSDoc body and cut the
provenance entirely, since this note already carries it.

**A known, accepted limit: the gate cannot catch a fourth inverting kind.**
`stat`, `quote` and `progress` each name the OTHER two in their own meaning
("the pair is inverted, the same as `quote` and `progress`", and so on) —
hand-maintained cross-references rather than a derived list, because nothing
in {@link LEAF_KINDS} or `LEAF_FIELDS` marks which kinds invert their
title/description pair (that fact lives only in `block-schema.ts`'s own
TSDoc). If a fourth kind is ever given the same inversion, these three
sentences would need a fourth name added by hand, and nothing here would
fail if that were forgotten — "the same as X and Y" contains no `only` or
`every other` for the gate to catch, so this is a real residual gap. Ruled
deliberately NOT worth a mechanism for: three members is not worth a second
gated record the way sixteen leaf kinds or eight container modes are, and
the cost of getting it wrong is a slightly incomplete cross-reference, not a
falsehood the shape `ROWS_MEANINGS` was built to prevent. Revisit this
ruling if a fourth inverting kind is ever added — that is the moment the
maintenance cost stops being hypothetical.

### Every valid drop target for a palette drag (2026-09-05) — Task 1 of 9, domain only

`domain/palette-targets.ts` is the first slice of "drag-to-add from a
palette tab" — a new way to add blocks by dragging a leaf kind or a
container mode straight off a persistent palette, rather than through the
Add picker's dialog. This task ships no UI: `PaletteItem` (a leaf kind or a
container mode, deliberately never an already-built `Block`, since what
lands where must not depend on what content the dragged item would end up
carrying) and `insertTargetsFor`, which answers every splice index a
dragged item may legally land on, computed as one depth-first walk of the
page.

**Every top-level splice index is offered whatever the item is, and inside
an existing container every splice index is offered for a LEAF
unconditionally and for a CONTAINER only when `mayNest` admits one level
DEEPER than the container's own path** — the same convention
`domain/add-target.ts` already uses: the depth cap is a fact about the new
block's own depth, never about the depth of the container already there.
Getting this backwards — asking `mayNest` of the container's own path
rather than one segment longer — answers `true` one level too late, and is
exactly what this module's own sabotage-verification reddens. **The walk
still descends past a container the cap refuses to nest another container
in**, because the cap only ever gates a CONTAINER fitting at a path, never
a leaf — a container sitting at the cap may still have room for leaves
inside an even-deeper container that already exists there from before the
cap was reached.

**The brief this task was built from undercounted its own algorithm for "N+1
top-level indices," and the shipped test is corrected rather than copied
wrong.** Each top-level section is itself a container, so it ALSO offers its
own append slot for its children array — even an empty one, since `0` to
`children.length` inclusive is always at least `{0}`. A worked example
asserting the FULL target list is only `[[0], [1], [2]]` for two empty
sections is inconsistent with the very algorithm it hands down alongside
that example, which the grid fixture one case over (given, and correct)
already confirms behaves this way. `palette-targets.test.ts` asserts the
top-level slice specifically, which is what the case's own name claims,
rather than a full-list equality the algorithm cannot satisfy.

Nothing calls `insertTargetsFor` yet — no palette tab, no drag, no drop
handler. Those are later tasks in the same feature; this one is the pure
function and its own test suite, sabotage-verified against the two
off-by-ones its own mechanism invites: `mayNest` asked of the wrong path,
and the append slot's `<=` narrowed to `<`.

### Inserting a freshly-built block at a target (2026-09-05) — Task 2 of 9, domain only

`domain/palette-insert.ts` is the sibling `insertTargetsFor` needs: once a
palette drag names WHERE it may land, `insertBlockAt` is what actually puts
the freshly built leaf or container there. `InsertResult` matches every
other domain edit's shape here — `{ ok: true, blocks, path }` or `{ ok:
false, reason }` — and `InsertRefusal` (`"too deep" | "too many"`) mirrors
`domain/block-drops.ts`'s `DropRefusal` and `domain/block-clone.ts`'s
`CloneRefusal` beside it.

**The one case `cloneAt` never has to face: a leaf landing at a top-level
index.** `cloneAt`'s source is always whatever already sits on the page,
which is always a container — depth 0 holds containers only. A palette drag
names a bare KIND, never a block already on the page, so a leaf CAN target
the page root, and it is wrapped in a new one-place `stack` first, mirroring
`wrapLeafOnPage`'s own wrap but at an arbitrary splice index rather than
always appended. `fitsAt` is asked with `path` directly rather than a
translated destination, unlike `cloneAt` — a palette drop's target path IS
the destination, with no separate "where the source sits" to translate
from.

**This refuses independently of whatever `insertTargetsFor` already
offered**, rather than trusting a target computed a moment earlier: a stale
target survives an intervening edit just fine as a value, and only asking
the caps again here catches the page having changed underneath it.

Sabotage-verified against the two off-by-ones the brief named, each
excluding a real wrong behaviour rather than a hypothetical one: dropping
the `parentPath.length === 0` half of the wrap condition reddens exactly
"inserts a leaf directly into an existing container's own place, unwrapped"
— a leaf nested inside an existing container got wrapped too — and no
other case; omitting the wrapper's own `+1` from `addedBlocks` reddens
exactly "refuses when a page-root insert would cross `BLOCK_LIMITS.blocks`,
counting the wrap" — the insert lands one block under the cap where it
should have been refused — and no other case.

Nothing calls `insertBlockAt` yet either — no palette tab, no pointer
wiring, no drop handler. Those are later tasks in the same feature.

### Ordering insertion targets for keyboard stepping (2026-09-05) — Task 3 of 9, domain only

`domain/palette-targets.ts` gains three more exports, all still pure
domain — no palette tab, no pointer wiring, no keyboard handler wired to any
of it yet. `orderedInsertTargets` is a thin, documented alias of
`insertTargetsFor`: Task 1's own walk is already depth-first in drawing
order, the same guarantee `placeOrder` (`domain/block-drag.ts`) states for
its own walk, so naming that fact under a second export is cheaper than
inviting a future reader to wonder whether the two could ever disagree.
`stepInsertTarget` mirrors `stepPlace` exactly — linear step through the
ordered array, no wraparound at either end, an absent `current` stepping to
the first entry forward or the last backward — except that it compares
targets by exact `path` equality rather than `stepPlace`'s prefix-containing
`within`: every target in `order` IS one of the exact positions
`insertTargetsFor` computed, never a sub-path of one, so the ambiguity
`within` exists to resolve cannot arise here.

`stepInsertSection` is the new mechanism: given `current.path[0]`, it finds
the first entry in `order` whose own top-level index is strictly greater
(forward) or strictly less (backward). Because `insertTargetsFor`'s own
splice loop emits one entry per top-level index, in ascending order, before
its recursive walk ever runs, that match is always a bucket's own top-level
splice — never a target nested inside it, whichever direction is stepped.
Worth knowing before wiring a keyboard handler to this: because that ascending
splice block sits at the front of the WHOLE `order` array rather than being
interleaved per-section, stepping forward always lands on the immediately
following section's own splice (the smallest greater index is always
current-plus-one), but stepping backward from inside section N finds the
FIRST entry in `order` — scanning from the array's own start — with a
smaller index, which is section 0 whenever N is not already 0. That only
coincides with "the immediately preceding section" when there are exactly
two sections; every test written against this task uses either two sections
or the boundary/page-root cases, so backward stepping through three or more
sections is untested and its exact feel is for whichever task wires the
actual Tab-back gesture to judge. **Review caught this note carrying the
only account of it** — `stepInsertSection`'s own TSDoc still asserted
unconditional adjacency in both directions, which is exactly the "confident,
wrong instruction" shape this file warns about elsewhere. The export's own
doc comment states the same caveat now, since a constraint on code that
already exists belongs there rather than only here.

Sabotage-verified: the brief's own named sabotage for `stepInsertSection`
(strict `>`/`<` weakened to `>=`/`<=`) reddens exactly the three
forward-direction cases built against it and none of the others. Two more
sabotages were needed for `stepInsertTarget`'s own branches, neither named
in the brief: wrapping the step with a modulo reddens exactly the two
no-wraparound cases; collapsing the undefined-input ternary to always answer
`order[0]` regardless of direction reddens exactly the "steps to the last
entry going backward" case. A fourth, unnamed sabotage on
`stepInsertSection`'s own mirrored undefined-input ternary reddens the
equivalent case there, and only that one — needed because the brief's three
given tests for this function are all forward-direction with a defined
`current`, which alone would have left that branch pair uncovered.

Nothing calls any of the three yet — still no palette tab, no drag, no
keyboard handler. Those remain later tasks in the same feature.

### A palette insert target names a gap, not a block (2026-09-08) — domain only

`domain/palette-targets.ts` gains `insertMarkFor(blocks, target)`, a pure
translation with no caller yet. An `InsertTarget`'s own path — the one
`insertTargetsFor` answers — carries `insertAt`'s splice contract: the last
segment means "insert BEFORE whatever sits at this index," so drawing the
BLOCK at that index marks the sibling about to be pushed down rather than
the space the dragged item will actually take. `insertMarkFor` answers a
`DropTarget` instead — `before`/`after` an existing sibling, or `place` for
an empty container's own first position — the same vocabulary
`domain/block-drops.ts` already draws a canvas-move landing with, so a
palette drag and a canvas-move drag can share one rendering path once
something calls this.

**Nothing renders it yet.** No palette tab reads it, no highlight changes
shape because of it — this is the pure function and its own
sabotage-verified test suite, the first slice of a feature that finishes in
a later task. Read this as the same kind of incremental entry the block
Tasks above already use (see Task 1 of "Every valid drop target for a
palette drag," 2026-09-05, which shipped `insertTargetsFor` alone the same
way): a mechanism landing ahead of anything wiring it in, named here so it
is not mistaken for dead code once a renderer does reach for it.

**Review found an untested branch coverage could not see, and the `@returns`
above undercounted (2026-09-08).** `insertMarkFor`'s parent-walk guard is
`if (!next || !isContainer(next)) return null;` — the shipped suite drove
`!isContainer(next)` (a path stepping onto a real leaf) but nothing drove
`!next` (a path stepping onto a position nothing occupies at all, such as an
out-of-range intermediate segment). Coverage read 18 branch entries with
none at zero regardless, because a branch reachable only by an input nobody
wrote is untested however the number reads (root rule 11) — the gate is
satisfied by a suite that never tried the input, not by one that covers the
code. A case naming that exclusion explicitly closed it. The `@returns` is
rewritten too: it named two null routes ("no container or past the end")
where the implementation has four (empty path, negative index, a
non-container-or-absent parent step, past-the-end); a negative index was
honestly neither of the two the old sentence named.
