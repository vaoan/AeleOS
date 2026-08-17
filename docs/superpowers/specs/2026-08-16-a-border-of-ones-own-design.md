# A border of one's own — and the layouts and skins the list was always a floor for

**Status:** design, 2026-08-16. **Shipped 2026-08-16 — this spec is complete.**
**Follows:** `2026-08-15-section-personality-design.md`, delivered in `#150`–`#154`.

## Why this exists

The section-personality spec was written from a request that said, among other
things: _"we want to add the option to change individually things of every
section. Like adding picture links for background, **change the borders for a
list of borders**"_.

That spec answered the border half with **skins**, each
scoped to a section. The argument was that a skin already carries border weight
alongside radius, shadow and gloss, so the skin list _is_ the border list.

**That argument was wrong, and it is worth being exact about how.** A skin is a
whole aesthetic: choosing `comic` to get a heavy border also brings a halftone
gloss, a particular radius and a hard shadow. What was asked for was a list of
**borders** — a smaller, orthogonal choice that composes with whatever skin the
section already wears. Those are different controls, and substituting one for
the other is the kind of near-miss that reads as delivered.

It is also **not reachable at all today**, not merely bundled. `@utility surface`
sets `border-style: var(--tw-border-style)` — Tailwind's own variable — and
`SKIN_VARS` carries only `--skin-border`, a _width_. Nothing in the style bag can
make a section's edge dashed, dotted or doubled.

The same request framed the whole feature as _"very myspace, very sonico, hi5"_
and _"extreme creativity and allow a lot of things"_. The actors feature note
already records that ambition against itself in two places: of the layouts,
**"More are wanted; this list is a floor, not a ceiling"**; and of the skins and
canvases, **"what earns a place is a MECHANISM, not another set of numbers."**
This phase takes both at their word.

## 1. A border a section chooses for itself

`sectionStyleShape` gains `border`, one of **`solid` · `dashed` · `dotted` ·
`double` · `none`**. Absent means "inherit", the same resting state every other
key in that bag has.

### The token, and why not the obvious one

The obvious implementation is to emit `--tw-border-style` directly. **Do not.**
That is a variable Tailwind generates and owns, and writing to it is the same
class of mistake as the rule that once styled `[class~="border"]` — reaching the
right elements while unable to see what any of them asked for.

Instead `globals.css` gains **`--skin-border-style: var(--tw-border-style)`**,
and `@utility surface` reads that. The indirection is what makes it safe:

- A section that chooses a border sets `--skin-border-style` on its own wrapper,
  and every `surface` inside it follows.
- A descendant using Tailwind's own `border-dashed` still works, because
  `--skin-border-style` inherits **unresolved** and re-resolves against that
  element's own `--tw-border-style`.

It is a new skin token, so **`SKIN_DEFAULTS` gains an entry** — pinned to
`globals.css` by the test that already parses the stylesheet — and
`nestedSkinVars` covers it for free.

### `none` is a real choice, not an absence

A section with `border: "none"` has no edge; a section with no `border` key
inherits the page. Those are different, and the schema must keep them different —
storing `""` for either would be the third state this project has refused
everywhere else in this bag.

## 2. The layouts, each earning its place by a mechanism

The bar is the feature note's own: a new layout earns its place by doing
something structurally none of the existing ones can, not by rearranging what
they already do.

| layout     | what an item is          | `title`   | `description` | the mechanism nothing else uses                                                                                                                                                    |
| ---------- | ------------------------ | --------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `masonry`  | a card of its own height | heading   | body          | **variable-height packing.** `gallery` and `cards` are uniform grids; this fills columns by height, so long and short entries sit together without ragged gaps.                    |
| `progress` | one measured thing       | the label | the value     | **it draws a proportion.** `stats` states a number; nothing renders one as a length. A commission queue, a ref-sheet completion, a species trait on a scale.                       |
| `tabs`     | one panel                | the tab   | the panel     | **one at a time, horizontally.** `accordion` is vertical and multi-open; this is a switcher, and CSS can do it with a radio group and `:checked` so no client component is needed. |

`progress` needs a number, which no other layout does. It reads it from the
**description**, and a description that is not a number renders as a plain
`stats`-style row rather than a broken bar — the same "refuses nothing, shows
nothing" trap the media layouts already avoid by falling back to a link.

## 3. The skins, each earning its place by a mechanism

| skin     | the mechanism nothing else uses                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neon`   | **a spread shadow with no offset** — a glow rather than a cast shadow. Uses `--ink` at low alpha, so it still names no colour of its own.          |
| `cutout` | **`clip-path`.** No skin has ever changed the _shape_ of a surface; this notches its corners.                                                      |
| `frame`  | **stacked rings.** Layered `box-shadow: 0 0 0 Npx` produces a matted picture frame — depth from concentric edges rather than from a single border. |

Each obeys the standing rule: **a skin names no colour of its own**, reaching
only for `--ink`, `--edge` or neutral black and white at low alpha.

## What this phase does not do

- **No per-section colour.** Form is the section's; colour is the page's.
  Unchanged and not reopening.
- **No new escaping path.** Any address still goes through
  `backgroundImageValue`, which refuses `"` and `\` so its output is safe in any
  CSS context.
- **No autoplay, no fetch, no pasted markup.** All three were refused with
  reasons in the previous spec and none of them is reconsidered here.

## What the delivery found that this design did not anticipate

Recorded here because a spec stamped complete should say where it was thin.
The full account of each lives in `apps/hub/src/features/actors/CLAUDE.md`,
which is authoritative.

- **`cutout` cost far more than the token this design allowed for.**
  `clip-path` clips an element's whole subtree, positioned descendants
  included — so the skin cut away the style popup that sets it, worst on a
  collapsed card, where what vanished was the select that would undo the
  choice. It clips `outline` too, which is a focus ring that does not exist
  rather than a dim one. The remedies are structural and both are global: the
  editor's card paints its face on a layer inside itself, and the `surface`
  utility rings every focusable element in the app on the inside.
- **`progress`'s refusal had an inverted failure mode.** A fraction whose
  sides both overflow to `Infinity` produced `width: NaN%`, which CSSOM
  rejects, which left the bar at its parent's full width. "Refuses nothing,
  shows nothing" became "shows everything", which is worse: a full bar on
  nonsense reads as an answer.
- **The border override does not reach a descendant with its own
  `border-dashed`, and that is correct.** This design's own wording implied it
  would. A dashed edge is the semantic empty state and must survive a
  section's choice.
- **An in-place edit to an applied migration never reaches the live
  database.** Found while verifying a layout, entirely outside this design's
  scope, and the reason the plan grew a task for a `schema-drift` CI job. The
  root `CLAUDE.md` carries it beside the squash convention that causes it.
