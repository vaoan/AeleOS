# A page of one's own: the identity header becomes blocks

> **Status: DELIVERED, 2026-08-19.** All seven phases shipped on the
> `page-of-ones-own-impl` branch. This banner carries what the implementation
> settled; the body below is left as written, so where the two disagree the
> banner is right.
>
> - **A leaf CANNOT have no fields.** The spec said `avatar`, `handle` and
>   `name` would draw none. `title_en` is required and non-empty at the strict
>   write AND in `validate_block`, so a fieldless leaf is unrepresentable. Each
>   uses the field the model insists on instead: `avatar`'s title is the
>   portrait's ALT TEXT, `handle` and `name` label their value the way `stat`
>   does, `owner` and `fursonas` name their heading.
> - **The vocabulary and the renderers cannot land separately.** The phasing
>   split them; `satisfies Record<LeafKind, LeafRenderer>` on `LEAVES` refuses
>   to compile the moment a kind exists without one. That guard is why a kind
>   cannot be added and forgotten, so the phases merged.
> - **`PageContext` had to reach the EDITOR too**, not only the two public
>   routes: every section previews with the real renderer. `FursonaEditor`
>   overlays the handle, display name and avatar from the LIVE form, because a
>   context resolved on the server holds what was saved.
> - **`validate_block` did not need its signature changed** — the body already
>   says so, and the implementation confirms it. `block_kinds_present` is a
>   second walk.
> - **The editor's read must NOT be shimmed when `sections` is null.** Null
>   means the stored shape did not parse; supplying a header there would turn
>   "unreadable" into "here is a page" that the next save writes over somebody's
>   content.
> - **Applying a TEMPLATE replaces the page**, and templates name no identity
>   block — so the shim runs on that path too. Without it, choosing a template
>   silently stripped somebody's portrait.
> - **A page missing only SOME required blocks gets only what it lacks**, never
>   the composed section. Branch coverage found that: handing back the whole
>   header would stand a second portrait beside the one its owner kept.
> - **`public-actor-name` moved to `handle`, not `name`.** It is the end-to-end
>   suite's proxy for "this page loaded and names its actor", so it belongs on
>   the kind that is required rather than the one that is optional.
> - **The empty state was deleted rather than redefined**, which the body
>   leaves open. Its condition cannot be true once every page is guaranteed a
>   portrait and a handle.
> - **`bleed`'s SQL check reads the JSON TYPE, not the text.** `jsonb_each_text`
>   renders `true` as the string `'true'`, which is exactly what the client
>   schema refuses.
>
> The measured facts worth keeping: the six measure stops are asserted as class
> strings because a viewport test cannot tell `wider` from `widest`; the page's
> own gutter is marked `data-page-gutter` so the no-viewport-breakpoint guard
> can exclude one element rather than being relaxed; and cspell runs in CI but
> not in the pre-commit hook.
>
> **DELIVERY LIST 5 WAS WRONG ABOUT ITSELF ON TWO COUNTS, corrected
> 2026-08-20.** It records "the `set_actor_theme` write" and "the full-width
> `PageShell` variant" as delivered. The variant was WRITTEN and never called —
> both public routes still asked for `width="wide"`, so the whole inversion this
> spec argues for at "The mechanism inverts who owns the measure" was defeated
> by the column it was meant to replace: a second gutter, `widest` and `full`
> capped at the old 80rem, and a bled section reaching neither edge. And the
> `set_actor_theme` write was never made at all, so `measure` hit that
> function's closing `unknown theme key` and choosing a width threw away the
> whole theme save. Both are fixed and both now have guards
> (`tests/e2e/page-measure-and-bleed.spec.ts`, `tests/db/actor-theme.test.ts`).
> Read that list as a plan rather than as a record: what makes this worth
> writing down is that everything ELSE on it was true, which is what made the
> two false entries survive a reading.

A public page is not a page its owner built. It is a **header the app built**,
followed by a page its owner built, followed by a **list the app built**. The
middle part is a recursive tree of blocks somebody arranges freely; the two ends
are hard-coded markup in `public-profile.tsx` that cannot be moved, resized,
styled, reordered, repeated or placed anywhere else.

This spec removes that. The furniture becomes blocks, the page gets to choose
its own measure, a section may run to both edges, and the one control the app
still rendered inside somebody's content moves up into the bar.

## What is actually welded, which is less than it looks

The prompting complaint was broad — a banner, where the name goes, links at the
top, the space at the sides, a footer, somewhere more visible for the fursonas.
Most of that is **already representable** and the complaint is really about one
thing standing in the way of it.

A banner is a `picture` leaf in a one-space section placed first. Links at the
top are a `social` leaf in a section placed first. A footer is a section placed
last. All three work today. What does not work is putting any of them **above
the name**, because nothing can go above the name.

Three things are welded, and they are the whole gap:

1. **The identity header.** `public-profile.tsx` renders a `<header>` holding
   the avatar, the display name and the handle, above `PublicBlocks`. Always
   first, always that shape, always that size.
2. **The fursona list.** `FursonaCardList`, below everything. Always last.
3. **The page measure.** `PageShell` is asked for `width="wide"`, which is
   `max-w-7xl` — 80rem, 1280px — with `px-4` / `sm:px-6` padding. It is a
   constant in a route. On a 2560px display that is 640px of empty field on
   each side and no one can do anything about it.

This is the same weld the block model already removed once. `gallery` was a
grid **of pictures** and `links` was a list **of links**; arrangement was
married to content, so heterogeneity was not merely unsupported but
unrepresentable. Blocks unwelded that. The header is the identical mistake one
level up: identity married to position. Unwelding it is the same move, and the
model to unweld it into already exists.

## The decision: the furniture becomes blocks

Five new leaf kinds. No new layout vocabulary, no page frame, no slot record —
the container model already expresses everything a frame would have offered,
and a frame sitting beside it would be a second arrangement language answering
the same questions worse.

| kind       | renders                           | required on        |
| ---------- | --------------------------------- | ------------------ |
| `avatar`   | the actor's own portrait          | both page kinds    |
| `handle`   | the handle, or a person's address | both page kinds    |
| `name`     | the display name                  | nothing — optional |
| `owner`    | a link to the owner               | a fursona's page   |
| `fursonas` | the card list of public fursonas  | a person's page    |

`owner` is **refused** on a person's page and `fursonas` is **refused** on a
fursona's. Neither has anything to render there, and a block that accepts a
choice and draws nothing is the failure this repo has a standing rule about.

### The alternative that was rejected, and why

**A page frame with named slots** — a stored record of `{banner,
headerPosition, showTopLinks, width, fursonasPosition}` rendered around the
block tree. It is bounded, trivially defaulted, and needs no migration.

It was rejected because every future question about it is answered by growing
it toward being blocks, badly. Can the banner hold two images? Can the footer
hold text? Can the header have a background of its own? Each is already a
solved problem in the block model and each would have to be re-solved in the
frame. The frame's one real advantage — a guaranteed shape — is delivered
instead by the enforcement rule below, without a second vocabulary.

### Why `name` and `handle` are two kinds and not one

Folding the display name and the handle into a single leaf is tidier by one
block and is the same mistake as `gallery`. The pairing people picture — name
above handle, beside the portrait — is a **container's** job, and the container
model states it exactly: a section of two places, the avatar in one, a stack of
name and handle in the other.

Welding them costs things that are explicitly wanted: a large display name
across a bled banner with the handle small in a footer, a portrait large at the
top and small again beside a signature. Every one of those is a
they-are-separate feature and none survives the weld.

### Why `name` is the optional one

`display_name` is nullable. A person who has set none has nothing for a `name`
block to render, so requiring it would make their page impossible to save until they
filled in a field the schema permits them to leave empty.

A `name` block whose actor has no display name **renders nothing**, and the
editor's card says so. That is not the "accepts a choice and changes nothing"
failure: it draws nothing because the person has not written their name, the
cause is theirs, and it is fixable from a field they can see. What makes it
safe is that `handle` is required — there is always something naming them on
the page, and the display name is decoration on top of a guarantee rather than
the guarantee itself.

### `handle` on a person's page renders their ADDRESS

A person actor is minted with `u-<actor_ref with the hyphens out>`. The feature
note is emphatic that this must never reach a stranger's screen: on a person it
is the `owner_ref` of every fursona they own, the exact column
`/api/actors/mine` strips by name. `isMachineHandle` already guards this in
`public-profile.tsx` and the guard moves into the `handle` leaf with the
rendering. Same kind, page-kind-dependent value.

### The renderer needs an actor, and today it has none

`LeafProps` is `{leaf, locale, labelled, parentHost}`. A leaf renderer cannot
see the actor at all, so none of the five new kinds has anything to render
from. `blocks.tsx` is deliberately a **server component** file — every mode is
CSS precisely so it stays one — which rules out React context.

The precedent is already in the file. `parentHost` is a page-level value that
has nothing to do with any block, and it is threaded from the route through
`PublicBlocks` → `Block` → every container → `Leaf`. The identity data takes
the same route, and rather than adding six more props at every level,
`parentHost` becomes one field on a single threaded object:

```ts
interface PageContext {
  parentHost: string; // as today
  actorKind: "person" | "fursona";
  handle: string; // the raw handle; `isMachineHandle` decides
  address: string; // the page's own address
  displayName: string | null;
  avatarUrl: string | null;
  owner?: {
    // present on a fursona's page only
    address: string;
    displayName: string | null; // null unless the owner's profile is readable
    avatarUrl: string | null; // same gate
  };
  fursonas?: PublicFursonaSummary[]; // a person's page only
  fursonasFallbackTitle: string; // the catalogue string, for an untitled block
}
```

One prop replacing one prop. Every existing call site changes shape; none
changes structure.

### The first leaves whose content is not typed

`leaf-fields.ts` maps a kind to the fields its editor draws. `avatar`, `handle`
and `name` map to **no content fields at all** — the renderer resolves them
from the actor row. That is a new category in the model, and the next person
adding a leaf kind will assume otherwise unless it is written down here and in
the feature note.

Two of the five do use a field, and both are wins:

- **`fursonas` uses its `title`.** The heading over somebody's characters
  becomes their own words instead of the `publicProfile.fursonas` catalogue
  string the route passes today, falling back to that string when they have
  written none.
- **`owner` uses its `title`** the same way — "belongs to", "a character of",
  whatever they like.

Those titles are **a person's own writing, not next-intl.** A missing
`title_es` is somebody who has not written the Spanish yet and must never be
reported as a fault. This is the line the studio port drew and it holds here.

### What the `owner` block may safely show

`public_fursona` returns `owner_address` and nothing else about the owner. Two
more columns are needed for a link worth clicking — the owner's display name
and avatar — and they cannot simply be selected.

`actors.visibility` defaults to `'private'`, and a fursona's page is governed
by the **fursona's** visibility rather than its owner's (`0012` says so
deliberately and explains why). So a public fursona routinely belongs to a
person whose own profile 404s. Returning that person's display name and
portrait on a page anybody can read would disclose something about somebody who
chose privacy.

The rule:

- The **address** is shown always. It is already in the URL bar, so it is not a
  disclosure at all, and it is the community number the design calls worth
  awarding.
- The owner's **display name and avatar** are returned only when the owner's
  own profile is readable — `visibility` is `'public'` or `'unlisted'`. The
  gate is in `public_fursona`, computed in SQL, not in the renderer. A
  component deciding this is a second copy of a privacy rule, free to drift
  from the one the database enforces.
- Otherwise the block degrades to the bare address, which still links and still
  works.

## Mandatory: what it buys and what it does not

Every required kind must appear **at least once** — not exactly once. Any
number of copies, at any depth, inside any container.

Enforced in **three places**, deliberately redundantly, because the reason is
accountability rather than tidiness: a character must be traceable to its
owner, and an owner to their characters.

1. **The database** — `set_actor_sections` and `validate_block` in `0009`. The
   only enforcement that cannot be bypassed. `sections` is user-controlled
   `jsonb` and that RPC is its sole writer, so this is where the guarantee
   actually lives.
2. **The save boundary** — the zod schema in `block-schema.ts`, checked before
   `fursona-arrangement.ts` calls the RPC, so a save that will be refused is
   refused without a round trip and with a message naming what is missing.
   There is no HTTP write endpoint for a page; this is what "the endpoint"
   means here.
3. **The editor**, which refuses to remove the last copy of a required kind and
   says why on the control rather than by failing silently.

`block-limits-match-migration.test.ts` already compares the schema's limits
against `0009`; the required-kind sets join whatever it covers, so layers 1 and
2 cannot drift apart.

### The hole in this, stated plainly, and accepted

**Existence is not visibility.** `accordion` renders each child as a
`<details>` with no `open` attribute — collapsed, contents not painted. `tabs`
shows one child at a time. Both are container modes anybody may pick, and both
nest. So a required `owner` block placed inside a collapsed accordion at the
bottom of a long page satisfies every one of the three checks, and a visitor
sees nothing.

A second, unfixable-by-validation route exists too: _"The author's own colours
are rendered exactly as picked. Nothing corrects them. A page may be as garish
or as unreadable as its owner likes."_ That freedom is load-bearing and is not
being withdrawn. Any block inside `SKIN_SCOPE` can be made the colour of its
own background entirely within the rules.

The alternative considered was to put the ownership **fact** in the chrome —
outside `SKIN_SCOPE`, derived from the actor row rather than from stored
`jsonb`, un-styleable and un-hideable, beside the wordmark and the theme
switch — and leave the _display_ in the blocks. That would have made the
accountability property real rather than approximate.

**It was considered and declined.** The decision is that every piece of the
page belongs to its owner, including this one, and the guarantee is
"at least one exists in the tree" rather than "a visitor sees it". This is
recorded as an accepted trade-off, not an oversight. If accountability ever has
to be genuinely enforced — a moderation requirement, an abuse pattern — the
chrome route is the design to revive, and it composes with everything here
rather than replacing it.

### A separate collector, NOT a change to `validate_block`

The obvious move is to make `validate_block(jsonb, int, text) returns int`
return a tally of which kinds it saw as well as its block count. **Do not.**
That function is the one thing every block passes through, it is `immutable`,
it is explicitly revoked from `public` and `anon`, and
`block-limits-match-migration.test.ts` reads its constants out of the file.
Changing its signature spreads a two-line feature across all of that.

Instead, a second function walks the same tree once and collects kinds:

```sql
create or replace function public.block_kinds_present(p_blocks jsonb)
returns text[]
```

Called once from `set_actor_sections`, after the validating loop. A second walk
over a tree already capped at 500 blocks is not a cost worth avoiding.

**It descends only through `children`**, starting from the top-level array —
never by searching the document for a `kind` key. `jsonb_path_query(p_blocks,
'$.**.kind')` is the one-liner version and it is wrong: it would find a `kind`
buried anywhere in the payload, so a crafted object under an unvalidated key
could satisfy the requirement without ever being a block. Descending through
`children` guarantees every node it counts is a node `validate_block` also
checked.

`actors.kind` is `'person' | 'fursona'`, immutable, and `set_actor_sections`
already takes `p_actor_ref`, so the kind-dependent required set is one lookup
away.

## The page measure

A field on `ActorTheme`, which is already where page-level _look_ lives — skin,
canvas, cursor, background picture and fit — and which has its own write,
`set_actor_theme`, separate from `set_actor_sections` precisely because it
changes while somebody drags a control. It is not a property of any block.

**An enum, not a free number**, and for a mechanical reason. `weights` had to
become a custom property because they are author data out of `jsonb` and no
build step can generate a class for an arbitrary number. A fixed enum has no
such problem: named stops are real Tailwind classes, with no `var()` plumbing
and no fallback chain. It also keeps the property that three people asked what
a stop means give the same answer, which is what rule 15 in the root
`CLAUDE.md` exists to protect.

The stops, from the app's own reading measure out to no maximum at all:

| stop     | max-width      |
| -------- | -------------- |
| `narrow` | 620px          |
| `medium` | 48rem / 768px  |
| `wide`   | 64rem / 1024px |
| `wider`  | 80rem / 1280px |
| `widest` | 96rem / 1536px |
| `full`   | none           |

Nullable, meaning the design's own — consistent with every other nullable field
on the theme, all of which mean exactly that. The default renders as `wider`,
today's `max-w-7xl`, so an untouched page does not move.

**`full` and readable are in tension and nothing corrects it.** A paragraph in
a stack section at `full` on a 2560px display is a 2400px line. That is the
author's choice to make and the same freedom principle that governs colour
governs this. The editor may say so; it must not override it.

## Bleed: a section that runs to both edges

A key in the block's `style` bag, valid only at depth 0. `style`'s stated
contract — form only, never colour, every key optional meaning "inherit the
page" — fits without stretching, and the model already carries section-only
data in exactly this way: `name_en` and `name_es` are meaningful at depth 0 and
nowhere else.

### The mechanism inverts who owns the measure

The tempting implementation keeps `PageShell`'s column and lets a section
escape it with `w-screen` and a negative margin. **That is refused.** `100vw`
includes the scrollbar's width and the centred column does not, so the page
gains a horizontal scrollbar the moment its content is tall enough to need a
vertical one — and it is precisely the kind of CSS that gets argued about
instead of measured.

Instead: the public route asks the shell for a **full-width `main`** — no
`max-w`, no `mx-auto`, no horizontal padding — and `PublicBlocks` applies the
measure to each top-level section individually. A normal section gets
`mx-auto`, the measure class and the edge padding. A bled section gets none of
them and therefore reaches both edges with no viewport units and nothing that
can disagree with a scrollbar.

This is a **new variant** on `PageShell`, not a change to the existing one.
`SKIN_SCOPE`, the 620px column and the signed-in pages are untouched.

A bled section carries no horizontal padding, by design. Text placed in one
touches the edge; a picture fills it. That is what bleed means and the author
chose it.

## The theme selector moves into the bar

Two adjacent controls in the header bar, and the question mark is deleted.

**A palette button** appears on any page whose owner customised it — the same
`isCustomised` gate the route uses today. Pressed by default, because the
pre-paint script's default _is_ the author's theme and `getServerSnapshot`
already assumes it, so it renders pressed on the server with no hydration
mismatch. Press to leave the theme, press to return.

**The light/dark toggle** keeps its sun and moon on every page, always. The
`themed` prop stops feeding a question-mark branch — that branch is removed —
and instead tells the shell whether to render the palette button. Same prop,
new job, so nothing new is threaded through the routes and every existing
caller keeps working.

The trap and its fix, which already exists: pressing sun-or-moon while the
author's theme is on would change nothing visible. `PageThemeSwitch` today
writes **both** attributes when a default is chosen — taking the author's theme
off and naming which default replaces it — and that behaviour carries over to
the toggle. Three states, two controls, every state reachable and no press that
does nothing.

### What this is really for

Space on the profile header is the smaller half. The real payoff is that with
the header, the handle and the fursona list all blocks, and the theme switch in
the bar, **nothing the app owns renders inside `SKIN_SCOPE` on a public page**.
Everything inside the content column is the author's; everything the app
guarantees is outside it. The skin scope stops being where the line happened to
fall and becomes a line that means something — and `PublicProfile` dissolves
into the block renderer rather than lingering as a component with one slot.

### Bookkeeping this drags along

- The four `publicProfile.pageTheme*` keys move into the `controls` namespace,
  key-checked across both catalogues by `messages.test.ts`.
- `controls.authorTheme` changes meaning, from "the toggle cannot say" to the
  palette button's accessible name.
- The `public-theme-switch` test id moves out of the profile and into the
  shell; whatever selects it follows.

## Existing pages: a read shim, and no migration

Every stored page today has none of the five new blocks. Nothing is migrated
and no SQL backfill runs.

`withRequiredBlocks(blocks, kind)` — the same shape as `withSpacesFromColumns`
in `section-block-shim.ts` — synthesises the missing required blocks into the
default composed section on **every read path**, the public page and the editor
alike. An old page therefore renders correctly for a stranger from the moment
this ships, and the editor holds real blocks the instant it loads one, so the
first save writes them explicitly and the database rule is satisfied without
anybody doing anything. There is no window in which a save fails on a page its
owner did not break.

It gets the same deletion condition the `columns` shim carries, written the
same way: it may go once every stored page holds the blocks explicitly, and
**nothing can tell you when that is**.

### Every existing page changes appearance slightly, and that is expected

The default composed section is a depth-0 container, two places, weighted
narrow-then-wide: the `avatar` leaf in the first, a nested `stack` of `name`
and `handle` in the second. On a person's page a `fursonas` section follows at
the bottom; on a fursona's, an `owner` block joins the header stack under the
handle. Depth is section → stack → leaf, comfortably inside the cap of three,
and `[1, 3]` is inside the 1–6 range `validate_block` allows for a share.

That is **close to, and not identical to,** today's header. Today's is a
wrapping flex row; the default is a two-place grid, so the avatar sits in a
place roughly a fifth of the page wide rather than hugging the name, and on a
narrow screen the grid collapses to one track and stacks where the flex row
wrapped. The difference is the point — it is arrangeable now — but it is a
visible change on every page on the day this ships and should not be reported
as a regression.

Templates in `fursona-templates.ts` each gain the composed section, so a page
created from one starts arranged rather than starting bare and being shimmed.

## What is refused

- **A page frame of named slots.** See above.
- **`w-screen` breakout for bleed.** See above.
- **Free positioning.** Unchanged from the blocks spec: coordinates on a canvas
  cannot degrade to a narrow viewport, make the editor close to unusable on a
  phone, and are how the pages this product is inspired by became unreadable.
- **Correcting a `full`-width page's line length.** The author chose it.
- **Making the accountability guarantee real.** Declined above, on the record.

## Phasing

Each phase is independently shippable and each leaves the product working.

1. **`PageContext`.** `parentHost` becomes one field on a threaded object, with
   no behaviour change and no new kinds. Mechanical, touches every renderer
   signature, and is worth its own reviewable step precisely because it touches
   so much and should change nothing.
2. **The leaf kinds and the renderer.** Five kinds in `block-schema.ts` and
   `0009`, rendered by `blocks.tsx` off `PageContext`, plus the two gated owner
   columns in `public_fursona`. `PublicProfile` still renders its header;
   nothing is required yet. A page can now _contain_ these blocks.
3. **The shim, the templates, and `PublicProfile`'s dissolution.**
   `withRequiredBlocks` on every read path, the hard-coded header and card list
   deleted, templates updated. Existing pages render through the new path.
4. **Enforcement.** `block_kinds_present` in `0009`, the kind-dependent
   required set in `set_actor_sections`, the save-boundary check and the
   editor's refusal to remove the last copy.
5. **The measure.** The enum on `ActorTheme`, the `set_actor_theme` write, the
   control, and the full-width `PageShell` variant.
6. **Bleed.** The depth-0 `style` key, the per-section measure application in
   `PublicBlocks`, and the editor control.
7. **The theme selector.** The palette button, the deleted question mark, the
   message-key move.

## Testing, and the traps this design already knows about

- **Rule 27 and rule 29 apply throughout.** Most fixtures here have a wrong
  behaviour that lands identically to the right one. A required-block check
  tested on a page where the block is at the top cannot distinguish "found it
  anywhere" from "found it first". A bleed fixture on a page whose measure is
  already `full` cannot distinguish bled from not. A `[1, 3]` default is not a
  palindrome, which is deliberate, but a two-place section cannot tell a swap
  from a shift — name the wrong behaviour being excluded and check the fixture
  can see it, and where nothing at that level can, say so rather than writing
  something that looks like it does.
- **The enforcement rule needs a hostile test that is not the editor.** The
  editor refusing to delete proves the editor. The guarantee is the RPC, so it
  is proved by calling `set_actor_sections` directly with a tree missing a
  required kind and watching it raise — the same shape `tests/db/` already
  uses.
- **The accordion hole should have a test asserting it is open**, not closed. A
  required block inside a collapsed accordion saves successfully. Writing that
  down as a passing test is what stops somebody later reading the enforcement
  code and concluding the guarantee is stronger than it is.
- **The measure and bleed are browser facts.** Container queries measure the
  section and the page's padding sits outside it — the weighted-places spec
  measured threshold widths 32–48px larger than the arithmetic predicted. Take
  the numbers from a browser, not from a calculator.
- **`0009` is edited in place, which never reaches the live database.** After
  changing `validate_block` or `set_actor_sections`, apply the changed
  statements to the live project by hand and re-run `pnpm check:schema-drift`.
