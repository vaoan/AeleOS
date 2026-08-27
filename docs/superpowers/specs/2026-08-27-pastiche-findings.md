# What eight pastiches found — 2026-08-27

**Status: findings, not a design.** Nothing here is scheduled. It is a record of
what the block model can and cannot be pushed toward, measured by trying.

## The method, and why it is worth the trouble

`seed-showcase.mjs` proves every key still renders. `seed-persona.mjs` proves one
page is worth looking at. Neither asks whether somebody could reach a LOOK the
model was not designed for — and that question is only answerable by aiming at
something specific, because **a pastiche fails visibly and in a way you can
name**. "The editor feels limited" is not actionable; "a feed cannot lose its
card edges" is.

`scripts/seed-pastiches.mjs` builds eight pages, each aimed at an era's
characteristic arrangement rather than its logo. No marks, no wordmarks, no
brand assets: what is copied is layout, palette and density, which is exactly
what the model either can or cannot express.

They are `unlisted` fursonas of `/137`, so they are reachable by address and
absent from that curated profile.

## What landed, and what carried it

| page                   | what made it work                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Windows Live Messenger | `aero` — glassy blue cards, `accordion` contact groups, `bubbles` canvas. The closest of the eight.                            |
| MySpace                | `retro` + the **Winamp jukebox chrome**, a two-column `weights: [1, 2]` body, a `table` for the contact box, a 4-across Top 8. |
| hi5                    | `candy` pill cards with hard shadows, `sticker` for the friends grid, `progress` as a profile-completeness meter.              |
| Sonico                 | `glass` + `masonry` for a real photo wall, `carousel` for album strips.                                                        |
| GeoCities              | `terminal` monospace, `stars`, a tiled `dark-mosaic` background, a `table` of visitor stats, a `link` row as a webring.        |
| Microblog boards       | `timeline`, `stat` rows, `social` chips that resolve a brand.                                                                  |

**The single most convincing element in the whole set is the jukebox.** A
Winamp-chromed player embedded in a purple starfield is not a thing most page
builders can produce at all, and it is the one element that made a reviewer say
"that's MySpace" rather than "that's like MySpace".

## The bar, restated (and it moved)

The first pass measured against "reads as MySpace". **The bar is
near-identical: put a screenshot of the pastiche beside a screenshot of the
real thing and you should struggle to tell them apart.** Behaviour does not
have to match; the picture does.

That is a much higher bar, and it changes which gaps matter. Colour and layout
get you to "reads as"; **typeface and type scale are what get you to "cannot
tell"**, and they are exactly what an author cannot touch today.

## The gaps, in the order they cost the most

### 1. A leaf is always a card, and nothing can turn that off

**Verified rather than assumed.** The first attempt used the `outline` skin,
whose whole identity is a border, so asking it for `border_style: "none"` was a
test confounded by its own fixture. Re-run with `default` and
`border_style: "none"`: **the card edge is still there.**

`border_style` removes the border STYLE; it cannot make a leaf render as bare
content. Every modern feed — Threads, Bluesky, the dark microblog board — is
edge-to-edge rows separated by hairlines, and none of the three can be reached.
The Threads page says "if you can see a card edge here i have failed", and you
can.

This is the one gap that blocks a whole category rather than a detail.

### 2. An author cannot choose a typeface

`terminal` gives monospace body text, which is why GeoCities half-works. But
section headings stay the app's display face in every skin, and there is no way
to ask for a serif, a Comic Sans, or anything else. Two of the eight eras are
**defined** by their fonts; a page can imitate their colour and layout and still
read as a modern site in period costume.

### 3. There is no text alignment

Everything is left-aligned. The 2000s web was relentlessly centred, and a
GeoCities pastiche without `<center>` is missing its posture, not a decoration.

### 4. `timeline` is the only feed-shaped mode, and it has a strong opinion

Its dot-and-rail is correct for a chronology of redesigns — the job it was built
for — and wrong for a feed, which is a list with dividers and no ornament. All
three microblog pastiches got a rail they should not have. **What is missing is
a plain divided list**, which is not the same as `stack` (cards with gaps).

### 5. Blocks cannot overlap

Every microblog profile in existence puts a cover image behind an avatar that
overlaps its lower edge. Blocks tile; nothing can sit on top of anything. This
was refused deliberately for free positioning — see the sections-of-spaces
design — and the banner/avatar overlap is the one common case that refusal also
costs.

### 6. Colour is page-level, so per-box colour is unreachable

Documented and deliberate: a skin names no colour, and every pairing of a style
and a palette is somebody's page. The pastiche cost is real anyway — a MySpace
page's boxes were individually coloured, often badly, and that badness was the
medium. Recording it as a cost, not as a request to reverse the decision.

### 7. `stat` is a card, so a counts row reads as three boxes

"312 Following · 4,891 Followers · Joined Aug 2026" is one line of text on every
site that has it. A `grid` of three `stat` leaves is three cards. Same root cause
as gap 1; it would disappear if that one were fixed.

## Two things that turned out NOT to be gaps

Recorded because both looked like faults in a screenshot and neither is.

- **The page background appearing to stop partway down.** A `fullPage`
  screenshot of a `background-attachment: fixed` body paints the field once and
  leaves the rest white. Scrolled in a real viewport the field covers
  completely. Every one of the eight looked broken this way and none is.
- **A tiled texture "not applying" on MySpace.** The URL was set, the file
  returns 200, and the texture is simply too low-contrast to see over that
  purple. `dark-mosaic` on GeoCities is plainly visible. A choice of texture,
  not a missing feature.

## The consolidated list, against the near-identical bar

Ranked by how much each one costs the "can you tell them apart" test.

| #   | gap                                                                                                                                                                                                                                                               | status                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | **Typeface.** Every one of these sites is identifiable by its font before anything else — Verdana and Tahoma in the 2000s, a Helvetica-alike now. One display and one body face, no author choice.                                                                | open                                                                        |
| 2   | **Type scale and density.** Real MySpace body text is ~11px; ours is ~16px. With colour and layout perfect, the size alone still gives it away.                                                                                                                   | **done** — `spacing`, which sets padding and text size together             |
| 3   | **A divider-separated list.** Modern feeds are rows with a hairline between them. `stack` gives gaps, `timeline` gives a dot-and-rail; neither is a divided list.                                                                                                 | open                                                                        |
| 4   | **Per-block colour.** MySpace's boxes were individually coloured and hi5's bars are blue on a white page. Colour is page-level, deliberately.                                                                                                                     | open, and reversing the decision is a design question rather than a gap fix |
| 5   | **Overlap.** A banner with the avatar over its lower edge, which every modern profile has. Blocks tile; nothing sits on anything.                                                                                                                                 | open, and a known cost of refusing free positioning                         |
| 6   | **Avatar `object-fit`.** The avatar leaf is `object-cover` on a circle, so a WIDE image is cropped to unreadability — found by giving the pastiches their real logos, where hi5's 94x45 wordmark came through as two fragments.                                   | open                                                                        |
| 7   | **Corner radius is welded to the skin.** Square corners ARE reachable — five skins set `--skin-round: 0` — but only by taking that skin's whole aesthetic with them. Checked rather than assumed; an earlier draft of this list called square corners impossible. | open, and the mildest of these                                              |
| 8   | **A heading bar is flat.** MySpace's and hi5's title bars were gradients.                                                                                                                                                                                         | open                                                                        |
| 9   | **No icon inside a table row.** MySpace's contact box has a small icon on every line.                                                                                                                                                                             | open                                                                        |
| —   | **A leaf is always a card.**                                                                                                                                                                                                                                      | **done** — `chrome: "bare"`                                                 |
| —   | **A name cannot be a bar.**                                                                                                                                                                                                                                       | **done** — `heading: "bar"`                                                 |
| —   | **No text alignment.**                                                                                                                                                                                                                                            | **done** — `text_align`                                                     |

## Found while rebuilding the eight (2026-08-27)

Two more, both discovered by using the new options rather than by reasoning
about them.

- **An author cannot turn the moving backdrop OFF.** `none` is not a canvas —
  it falls back to `nebula` — and the density dial floors at `0.25`. A flat
  2007 page had no animation at all, and the nearest reachable thing is a
  canvas painted in the page's own colours at the floor, which is what the
  three flat pastiches do. A real `none` is the fix.
- **A chosen typeface did not reach headings, and nearly shipped that way.**
  Eighteen elements across the leaf modules carry `font-display` or
  `font-sans`, which are explicit `font-family: var(--font-…)` declarations, and
  a declaration on the element beats a family inherited from an ancestor. Body
  text changed and every heading stayed in the app's own face. Fixed by setting
  the TOKENS as well as the property; the general form is that **an inherited
  property cannot override an explicit one, so a page-level face has to set
  whatever tokens the elements actually read.**

## If any of this were to be built

Gap 1 first, and alone it would fix gap 7 and most of gap 4's symptom. The
smallest version is a per-block `chrome: "none"` that suppresses the card
surface, padding and edge while leaving the content — which is a style key
beside `border_style`, not a new model.
