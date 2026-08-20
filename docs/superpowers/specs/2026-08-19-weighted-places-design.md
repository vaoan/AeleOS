# Weighted places: a section whose places are not all the same width

> **Status: DELIVERED, 2026-08-19.** The model, the renderer, the database
> guard, the editor control and places-as-columns all shipped on the
> `weighted-places` branch. This banner carries what the implementation
> settled; the body below is left as it was written, so where the two disagree
> the banner is right.
>
> - **`TRACK_FLOOR` stayed `8rem`.** The table below is arithmetic and the spec
>   said it had to be watched in a browser before it was believed. It was, at
>   all five thresholds, and nothing overflowed — so the number did not move.
> - **The threshold widths in the body are arithmetic and the browser needs
>   more.** The container query measures the `<section>`, and the page's own
>   padding sits outside it, so the viewport widths that first lay 2/3/4/5/6
>   places are **352 / 544 / 720 / 944 / 1072px** against the predicted
>   320/512/672/896/1024 — each 32–48px larger. A width chosen from the
>   arithmetic measures a grid that is still collapsed, which passes while
>   proving nothing.
> - **The arbitrary-value Tailwind class DID compile.**
>   `grid-template-columns:var(--block-tracks,repeat(N,minmax(0,1fr)))` was
>   emitted for all five counts, each inside its own `@container (min-width:…)`
>   rule. So the `globals.css` cascade-layer fallback this spec offers as a
>   contingency was not needed, and that contingency is closed. (The built CSS
>   is at `apps/hub/.next/static/chunks/*.css` under Turbopack — the plan said
>   `.next/static/css/`, which does not exist.)
> - **The `flex-basis`-style fixed side is still refused** and nothing here
>   implements it, as intended.
> - **`weighted-places.spec.ts` proves the browser half**, and rule 29 in the
>   root `CLAUDE.md` is what the branch's sabotage steps cost. Two of them
>   could not discriminate at all and were reported rather than counted.
> - **"Stored data" repeats a CRLF hazard that no longer exists here.** The
>   hand-apply to live was real and was done; the line-ending conversion it
>   demands is a no-op, because `.gitattributes` pins `*.sql` to LF and beats
>   `core.autocrlf`. Measured — see the rewritten rule 28.
> - **The final whole-branch review found one Critical, one Important and
>   three Minors, all fixed on the same branch after delivery.** `--block-tracks`
>   inherits — CSS custom properties always do — so a nested unweighted grid
>   used to resolve an ENCLOSING weighted grid's track list instead of its own
>   fallback; `Grid` now sets the property unconditionally, `"initial"` when
>   there is no ratio to state, proven first by a failing browser test
>   (`weighted-places.spec.ts`) that genuinely reddened before the fix. An
>   unclamped weight dial could write a share the database refuses at an array
>   index `blockProblems` cannot mark, surfacing as an unmarked page-level
>   banner; the dial now clamps in `onChange`. `is_weight_list` in `0009` split
>   in two: it checks only the SHAPE now (dropping its `p_max` parameter), and
>   `validate_block` checks the RANGE inline with its own message — a wrong
>   count and an out-of-range share are different mistakes and now say so. A
>   stale SQL comment claiming `jsonb_array_elements` was "not used" was
>   corrected to say when it is. The feature note gained the places-as-columns
>   section (`addToPlace`) it was missing entirely.

A container declares `spaces` and lays `repeat(<spaces>, minmax(0, 1fr))` —
**uniform tracks, always**. Every place is exactly as wide as every other one,
and there is no way to say otherwise.

The standing answer in the feature note is that _"a wide thing is a container
of one space nested where it is wanted."_ **That answer does not work**, and it
is worth saying plainly because it reads like a mechanism and is not one. A
nested container still occupies exactly one place of its parent, so in a
three-space section it is a third of the width no matter what it declares
inside itself. **Nesting can make something narrower and can never make
anything wider.** Narrow sides with a wide middle — the page this design exists
for — is not merely unbuilt today; it is unrepresentable.

This adds one number per place, and nothing else.

## What a weight is, and why it lives on the parent

A container gains `weights`: one share per place, so `spaces: 3` with
`weights: [1, 3, 1]` lays a narrow place, a place three times as wide, and a
narrow place. Absent means uniform, which is what every stored page is now.

**The obvious alternative is the flexbox model, and rejecting it is the whole
structural decision.** Flexbox puts the number on the CHILD — `flex-grow`
declares how greedy an item is for leftover space — where CSS Grid puts it on
the parent as `grid-template-columns`. The distribution math is identical; `fr`
_is_ `flex-grow`, the same algorithm sharing out the same leftover space. What
differs is who owns the number, and here that decides three things at once:

- **A weight on the child is `span` returning under a new name.** `span` was
  removed, and the reason still holds: a drop is an exchange of two places, and
  an exchange between a two-wide place and a one-wide place has no meaning.
  Weights on the parent leave `moveBlock` untouched — the places keep their
  widths and the contents trade seats.
- **Flexbox cannot express an empty place at all.** A place that holds nothing
  is not a flex item, so it has no width and does not exist. The positional
  empty place is the decision the whole block model rests on, and a model that
  cannot say "the middle one is empty" cannot be adopted here at any price.
- **A width is the parent's business.** The feature note already says so. A
  block dragged from a wide place into a narrow one becomes narrow, because the
  width was never the block's.

So `weights` sits beside `spaces` on the container, **not in `style`**. `style`
is documented as form, every key optional and meaning "inherit whatever
encloses this". A weight inherits nothing and is structural in exactly the way
`spaces` is — the two are one fact stated in two parts, and they are validated
together.

```
container: { kind, mode, spaces?, weights?, name_en?, name_es?, children[], style? }
```

### Bounds, and what they buy

Each weight is a whole number from **1 to 6**, matching `BLOCK_LIMITS.spaces`,
and `BLOCK_LIMITS.weight` is where the number lives so there is one of it.

The bound is what keeps a dial from producing an unreadable page for a
stranger: the worst ratio anybody can build is 1:6, which the track floor below
then makes readable anyway. **Free real numbers are refused** — they buy
nothing a whole number from a bounded set does not, and they turn a control
somebody nudges into a control somebody can get wrong.

**`weights.length` must equal `spaces` on the write, and a mismatch is ignored
on the read.** That asymmetry is the one this model already uses everywhere: a
strict save refuses what it cannot store, and a lenient read treats what it
does not understand as a shape it does not know rather than as corruption. A
weights array a newer deployment wrote against a larger `spaces` costs a
container its proportions and never blanks a page. Where the lengths disagree,
the container renders uniform.

## Rendering: the class keeps the query, the property carries the tracks

`SPACE_CLASS` maps a space count to a static Tailwind class carrying a
**container query** — `@lg:grid-cols-3` and so on — and its TSDoc states the
constraint this design has to work inside:

> An inline style cannot carry a query of any kind, viewport or container, so
> the collapse to a single track would have nowhere to live.

That is still true, and weights make it sharper: **weights are author data, so
no build step can ever see them**, and a Tailwind class for
`grid-cols-[1fr_3fr_1fr]` cannot be generated for a value that arrives from
`jsonb`. Inline styles are available — the CSP sets
`style-src 'self' 'unsafe-inline'` and `blockStyle` already returns
`CSSProperties` — but an inline `grid-template-columns` would apply at 320px
too, flattening the collapse every narrow screen depends on.

**The split resolves it: the inline style carries a custom property, and the
class carries the query and the fallback.**

- The container emits a `--block-tracks` custom property whose value is the
  track list — `minmax(min(8rem,100%),1fr) minmax(min(8rem,100%),3fr) minmax(min(8rem,100%),1fr)`.
  A static value; no query needed.
- `SPACE_CLASS` gains one arbitrary-value class per count, still static and
  still visible to the compiler:
  `@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]`.

**That class is an assumption about Tailwind v4 and must be compiled before it
is believed** — an arbitrary property carrying a `var()` with a comma-bearing
fallback is not a shape this repo already uses anywhere. Rule 1 applies as it
does to any newly leaned-on tool: write it, look at the generated CSS, confirm
the declaration is there. If it does not compile, the fallback is five real
rules in `globals.css` — one per count, each a container query — which costs a
hand-written block and gains a form stylelint can actually check. **They belong
in a cascade layer if it comes to that**, because an unlayered rule beats every
Tailwind utility silently and forever, which this repo has already been bitten
by once.

Every property the current TSDoc claims survives. The query is still a
container query, so a container still asks how much room _it_ has. The
threshold still rises with the count. And the uniform case is still exactly
`repeat(n, minmax(0, 1fr))` — it is the `var()` fallback, reached whenever no
weights were stored, so **an unweighted page emits byte-identical CSS to what
it emits today.**

### The track floor is what makes growth self-correcting

Each weighted track is `minmax(min(8rem, 100%), <w>fr)` rather than
`minmax(0, <w>fr)`, and that one change is where the answer to "how does it
grow" actually lives.

At the collapse threshold a 1:6:1 split would give its sides about 3.75rem — a
sliver, which is the failure a bounded weight alone does not prevent, because
the existing thresholds were computed for tracks that are all the same size.
With a floor, both sides take 8rem and the middle takes what is left; as the
container grows, the shares overtake the floor and **the ratio asserts itself**.
So a weighted section is near-uniform when there is little room, becomes the
shape its author chose when there is room for it, and is a single column when
there is not much room at all.

The floor has to fit inside every existing threshold, gutters included
(`gap-4` is 1rem):

| places | threshold    | floors + gutters | headroom |
| ------ | ------------ | ---------------- | -------- |
| 2      | `@xs` 20rem  | 16 + 1 = 17rem   | 3rem     |
| 3      | `@lg` 32rem  | 24 + 2 = 26rem   | 6rem     |
| 4      | `@2xl` 42rem | 32 + 3 = 35rem   | 7rem     |
| 5      | `@4xl` 56rem | 40 + 4 = 44rem   | 12rem    |
| 6      | `@5xl` 64rem | 48 + 5 = 53rem   | 11rem    |

**8rem was chosen for that table, and the table is arithmetic rather than a
measurement.** The container query measures the enclosing `<section>` while the
grid lays out inside that section's padding, so the real headroom is smaller
than every figure above by whatever the padding is, and the two-place row has
the least of it. **This must be watched in a browser at each of the five
thresholds before it is believed**, and if it overflows the answer is a smaller
floor rather than a larger threshold — the thresholds are already tuned for
readability, and moving one changes unweighted pages that are correct today.

## The collapse, and why nothing reorders

Below its threshold a weighted grid is one track, exactly as an unweighted one
is, and the places stack **in the order they are stored**. So a page with a
left sidebar, a middle and a right sidebar reads on a phone as: left sidebar,
middle, right sidebar. The main content is second.

**Reordering on narrow screens is refused.** CSS `order` and explicit grid
placement both change what is seen without changing what is read: focus order,
screen-reader order and copy order all follow the DOM, so a page that looks
main-first and tabs sidebar-first is a defect — and one `a11y.spec.ts` would
not necessarily catch, since nothing in the `wcag2a`/`wcag21aa` sets it runs
measures a mismatch between visual and DOM order. An author who wants the
middle first on a phone puts it first: the shape is theirs, and
`weights: [3, 1, 1]` is a wide-left page that is honest at every width.

The editor's explanation says this in one sentence, because it is the only part
of the feature that is invisible while building on a desktop.

## A place is a column that grows

A place holds one child. To hold a list, it holds a `stack`, and then the
things in that stack grow downward without touching the places beside them.

That is the difference between the two pages this design could produce, and it
is worth drawing, because it is the whole reason weights are wanted:

```
places as slots — six loose leaves in a 1:3:1 section

[ a ][      b      ][ c ]
[ d ][      e      ][ f ]     d starts below the tallest of a, b, c
```

```
places as columns — three stacks in a 1:3:1 section

[ a ][      b      ][ c ]
[ d ][      b      ][ f ]     each column grows on its own
[ g ][      e      ]
```

Wrapping is not removed and does not change: children still fill row by row,
and a part-filled last row is still ordinary. **What changes is what the editor
builds for you.** Picking a shape seeds each place with an empty `stack`, so
the column page is what somebody gets by choosing it rather than what they get
by knowing to assemble it. Adding a second thing to a place that already holds
one wraps the existing block in a `stack` and appends.

Two rules keep that from being surprising:

- **The editor never removes a stack it made.** An emptied column renders as an
  empty place — no border, no surface, keeping its width — which is exactly
  what an empty place already does, so nothing new has to be explained. It is
  deleted the way any block is deleted.
- **A column spends one nesting level, and the cap is three.** Section → column
  → container → leaves. So a grid inside a column still works and a grid inside
  a group inside a column does not. That is a real ceiling, and the editor
  refuses it by name as it already does for depth.

## Where weights mean nothing, and the control that must not appear

Weights lay grid tracks. **`grid` is the only mode that has any.**

- `masonry` is CSS multi-column, whose columns are uniform by construction —
  `column-count` cannot take a ratio.
- `stack`, `carousel`, `tabs`, `accordion` and `timeline` lay no tracks across
  at all.

**So the editor offers the weights control only for `grid`.** This repo has
already paid for the alternative: _"a control that accepts what somebody types,
stores it, refuses nothing and renders nothing is the worst kind — there is no
way for them to learn it did nothing."_

The database does **not** refuse weights on a non-grid container, and that is
deliberate rather than an oversight: a person who sets a shape, switches to
`carousel` to look at it and switches back must find their proportions still
there, which is the same reasoning that keeps a leaf's fields when its kind
changes. Stored and dormant is right; offered and dormant is not.

**`LONE_CENTRE` does not apply to a weighted grid.** Centring a lone block on a
part-filled last row assumes the tracks either side of it are the same width,
and "one each" is not something that can be given out of unequal tracks. A
weighted grid leaves the lone block in the place it is in.

## The editor

The shape control sits where the `spaces` select is now, on both the section
card and the nested container card.

- **Presets first**: even, wide middle (1:3:1), sidebar left (1:3), sidebar
  right (3:1), wide left (3:1:1). Each sets `spaces` and `weights` together and
  seeds the empty columns.
- **Then the dials**: one bounded control per place, seeded from whichever
  preset was chosen, so tuning is a nudge rather than a fresh start. A stepper
  rather than a divider drag — a drag handle is the right gesture on a desktop
  and a poor one on a phone, and this repo has already ruled that most people
  will build on a phone. A divider drag can be added later as a desktop
  affordance over the same stored number.
- **The explanation**, which the request asked for by name: one short line
  saying that the shares set how wide each place is, that they even out when
  there is not much room, and that on a narrow screen the places stack in
  order.

Narrowing `spaces` still cannot lose content — `patchContainer` takes
`Partial<Omit<ContainerBlock, "kind" | "children">>` and so cannot express a
clamp on `children`. **`weights` must be trimmed and extended alongside
`spaces`**, and that is a genuine difference from `children`: a weights array
whose length no longer matches is ignored on the read, so leaving it stale
would silently drop an author's proportions at the moment they changed the
count. Narrowing truncates; widening pads with `1`.

## Stored data

**Nothing is migrated and no page changes meaning.** `weights` is a new
optional key; every stored page lacks it and renders uniform, which is what it
renders now — through the `var()` fallback rather than through a branch.

`validate_block` in `0009` gains `is_weight_list(p_value jsonb, p_max int,
p_length int)` beside `is_space_count` — the stored value, the largest share a
place may take, and the container's own `spaces` — returning true when the
value is absent, and otherwise when it is an array of exactly `p_length` whole
numbers each from 1 to `p_max`. It refuses **by name**, as the depth cap does,
so an author whose weights are wrong is told that and not that their `mode` is
invalid. The
`actor_profiles.sections` column comment gains `weights` in its description of
a container, because that comment is the readable index of the model.

Two operational rules apply, and both have bitten this repo before. `0009` is
an **applied** migration, so editing it changes what a fresh database builds
and changes nothing about the live project — the changed statements must be
applied to live by hand, in their own transaction. And they must be sent as
**LF**: a Windows checkout writes CRLF into every function body, `migra`
compares function source, and `check:schema-drift` cannot see it locally
because it builds its shadow from the same CRLF files.

## Testing, and the trap this feature is full of

Coverage is 100% with every failure branch reached by a named case, and the
container-query behaviour is browser-level by nature, so it is a Playwright
subject rather than a unit one.

**Rule 27 is the whole risk here, and it is unusually easy to fall into: a
weighted grid with `weights: [1, 1, 1]` is byte-identical to an unweighted
one.** So is `[2, 2, 2]`. Any fixture using equal shares proves nothing about
weights at all while looking exactly like a test of them. Every fixture is
asymmetric, and asymmetric in a way that distinguishes the failure being
excluded:

- **`[1, 3, 1]` distinguishes "weights applied" from "weights ignored"**, and
  the assertion is on measured track widths rather than on the class list — a
  class that names a custom property proves the property was named, not that
  anything read it.
- **`[3, 1, 1]` and `[1, 1, 3]` distinguish "applied" from "applied in the
  wrong order"**, which a palindrome cannot: `[1, 3, 1]` reversed is itself, so
  a renderer that reverses the array passes every test built on it.
- **The floor is proved at a width where the shares alone would breach it** — a
  1:6:1 at the collapse threshold, asserting the sides sit at the floor and not
  at an eighth of the row — and at a width where they would not, asserting the
  true ratio. One reading proves neither, because the two behaviours agree
  everywhere except across that boundary.
- **The collapse is proved below the threshold**, asserting one track and DOM
  order preserved.

Each is sabotage-verified: drop the property, reverse the array, remove the
floor, and watch the specific case go red. And the drag suite gains one case,
because the behaviour is worth pinning even though no code changes for it — a
block dragged from the wide place to a narrow one is narrow afterwards, which
is the visible proof that a width belongs to the place and not to the block.

## Refused

- **A canvas** — x, y, width, height. Already refused in the feature note, and
  the refusal holds: it cannot degrade to a narrow viewport, it makes the
  editor close to unusable on a phone, and it is how the pages this product is
  inspired by became unreadable. A splitter, by contrast, is a tree of splits,
  which is what this model already is.
- **Per-row shapes** — a section whose second row is shaped differently from
  its first. A page is already a list of sections and each has its own shape,
  so a hero over a 1:3:1 over an even gallery is three sections and works
  today. What a canvas buys that this does not is two different shapes side by
  side in one row, and that is the one thing being given up.
- **`flex-basis`-style fixed sides** — "this sidebar is always 220px". It is
  expressible in the same place later (`minmax(220px, 1fr)`), and the track
  floor already delivers most of what it was wanted for, so it waits until
  somebody asks for it with a page it would fix.
- **Weights on non-grid modes**, offered rather than stored — see above.
- **Reordering on narrow screens** — see above.

## Phases

1. **Model and renderer.** `weights` in `block-schema.ts`, `is_weight_list` in
   `0009`, the custom property and the `var()` fallback in `SPACE_CLASS`, the
   track floor, `LONE_CENTRE` suppressed when weighted. Browser proof of the
   floor at each threshold.
2. **The editor control.** Presets, per-place dials, the explanation, and
   `weights` trimmed and padded alongside `spaces`.
3. **Places as columns.** Seeding stacks from a preset, wrapping on a second
   child, and the depth refusal by name.

Phase 1 ships a feature nobody can reach; phase 2 is what makes it real. They
are separate because the renderer's browser proof is the risky half and should
not wait behind a form.
