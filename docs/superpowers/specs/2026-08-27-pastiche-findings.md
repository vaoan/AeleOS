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

`scripts/seed-pastiches.mjs` builds eleven pages, each aimed at an era's
characteristic arrangement rather than its logo. No marks, no wordmarks, no
brand assets: what is copied is layout, palette and density, which is exactly
what the model either can or cannot express.

They are `public` fursonas of `/137`, so they are listed on that profile and
browsable end to end. They began `unlisted` — reachable only by address — and
the seeder went on writing `unlisted` after they had been made public by hand,
so every re-run silently undid it. The seeder owns visibility now, along with
each page's avatar, for the same reason: **a seed that does not restore
everything it depends on works exactly once.**

**Three were added later and are not the same evidence as the other eight.**
Fur Affinity, Fotolog and Facebook were built from knowledge, because
web.archive.org would not answer that session and Fur Affinity refuses an
unauthenticated fetch. What is claimed for them is the FEEL — a dark page with
a banner and a shouts wall; one photograph and a guestbook; blue bars, an
information rail and a wall — not a palette anybody measured. Check them
against a real capture before treating any colour in them as reference.

## What landed, and what carried it

| page                   | what made it work                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows Live Messenger | `aero` — glassy blue cards, `accordion` contact groups, `bubbles` canvas. The closest of the eight.                                                                               |
| MySpace                | `retro` + the **Winamp jukebox chrome**, a two-column `weights: [1, 2]` body, a `table` for the contact box, a 4-across Top 8.                                                    |
| hi5                    | `candy` pill cards with hard shadows, `sticker` for the friends grid, `progress` as a profile-completeness meter.                                                                 |
| Sonico                 | `glass` + `masonry` for a real photo wall, `carousel` for album strips.                                                                                                           |
| GeoCities              | `terminal` monospace, `stars`, a tiled `dark-mosaic` background, a `table` of visitor stats, a `link` row as a webring.                                                           |
| Fur Affinity           | A full-bleed banner, `weights: [1, 3]` for the stats rail, a submissions grid, and `list` + `chrome: "bare"` for the shouts wall — the first page here that needed a wall at all. |
| Fotolog                | One photograph at `measure: "narrow"` and a guestbook under it. Structurally the opposite of every other page: not a grid of comparable boxes.                                    |
| Facebook               | `heading: "bar"` in `#3b5998`, an information `table` with a mark on every row, a six-across friends strip, and a divided wall.                                                   |
| Microblog boards       | `timeline`, `stat` rows, `social` chips that resolve a brand.                                                                                                                     |

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

| #     | gap                                                                                                                                                                                                                                                               | status                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1     | **Typeface.** Every one of these sites is identifiable by its font before anything else — Verdana and Tahoma in the 2000s, a Helvetica-alike now. One display and one body face, no author choice.                                                                | **done** — the page-level `font` dial, six stacks                         |
| 2     | **Type scale and density.** Real MySpace body text is ~11px; ours is ~16px. With colour and layout perfect, the size alone still gives it away.                                                                                                                   | **done** — `spacing`, which sets padding and text size together           |
| ~~3~~ | **A divider-separated list.** Modern feeds are rows with a hairline between them. `stack` gives gaps, `timeline` gives a dot-and-rail; neither is a divided list.                                                                                                 | **done** — the `list` container mode                                      |
| 4     | **Per-block colour.** MySpace's boxes were individually coloured and hi5's bars are blue on a white page. Colour is page-level, deliberately.                                                                                                                     | **open on purpose** — see "Two gaps left open, and why" below             |
| 5     | **Overlap.** A banner with the avatar over its lower edge, which every modern profile has. Blocks tile; nothing sits on anything.                                                                                                                                 | **open on purpose** — see "Two gaps left open, and why" below             |
| 6     | **Avatar `object-fit`.** The avatar leaf is `object-cover` on a circle, so a WIDE image is cropped to unreadability — found by giving the pastiches their real logos, where hi5's 94x45 wordmark came through as two fragments.                                   | **done** — the `image_fit` style key, absent still meaning `cover`        |
| 7     | **Corner radius is welded to the skin.** Square corners ARE reachable — five skins set `--skin-round: 0` — but only by taking that skin's whole aesthetic with them. Checked rather than assumed; an earlier draft of this list called square corners impossible. | **done** — the `radius` style key, absent still inheriting the skin's own |
| 8     | **A heading bar is flat.** MySpace's and hi5's title bars were gradients.                                                                                                                                                                                         | **done** — `heading: "gradient"`, a third value beside `plain` and `bar`  |
| 9     | **No icon inside a table row.** MySpace's contact box has a small icon on every line.                                                                                                                                                                             | **done** — an `icon` on the row's first cell                              |
| —     | **A leaf is always a card.**                                                                                                                                                                                                                                      | **done** — `chrome: "bare"`                                               |
| —     | **A name cannot be a bar.**                                                                                                                                                                                                                                       | **done** — `heading: "bar"`                                               |
| —     | **No text alignment.**                                                                                                                                                                                                                                            | **done** — `text_align`                                                   |

## Found while rebuilding the eight (2026-08-27)

Two more, both discovered by using the new options rather than by reasoning
about them.

- **THE BACKDROP COULD ALWAYS BE TURNED OFF. This bullet used to say it could
  not, and every word of the diagnosis was invented.** It read: "`none` is not
  a canvas — it falls back to `nebula` — and the density dial floors at
  `0.25`." Checked against `origin/main`: `"none"` is the LAST entry of
  `CANVASES`, has been for as long as the list has existed, `CANVAS_SLOTS`
  carries it, `resolveCanvas` answers it, and `nebula-canvas.tsx` clears the
  bitmap and returns on it by name. Nothing was missing. The three flat
  pastiches were faked with a grid at the density floor to work around a
  limitation that did not exist, and they now simply say `canvas: "none"`.

  **The second attempt to close it was wrong in the same direction**, which is
  what makes this worth the space rather than a quiet edit: believing the
  sentence above, an entry was added to `CANVASES` — a DUPLICATE, which React
  reported as "two children with the same key, `none`" from the canvas select,
  and which no unit test caught because a duplicate in a `readonly` array
  changes no type and breaks no assertion. It was found in a browser log.

  So the same false claim cost work twice, and the shape is root rule 16 plus
  root rule 25 together: **a conclusion about what the code cannot do, believed
  because it was written down, and never dated or rechecked against what is
  actually on `main`.** The observation ("my seeded `canvas: "none"` came back
  as a nebula") was real and is still unexplained by anything in the current
  code; whatever produced it, it was not this.

- **A chosen typeface did not reach headings, and nearly shipped that way.**
  Eighteen elements across the leaf modules carry `font-display` or
  `font-sans`, which are explicit `font-family: var(--font-…)` declarations, and
  a declaration on the element beats a family inherited from an ancestor. Body
  text changed and every heading stayed in the app's own face. Fixed by setting
  the TOKENS as well as the property; the general form is that **an inherited
  property cannot override an explicit one, so a page-level face has to set
  whatever tokens the elements actually read.**

## Found while adding the last three (2026-08-28)

- **A grid's collapse is a single step, and for a strip of thumbnails that is
  the wrong shape.** Facebook's six-across friends strip was laid at
  `measure: "wide"`, where the container is 976px — just under the 64rem the
  six-space grid's container query asks for — and it collapsed to **one**
  column, so six thumbnails rendered as a single photograph the width of the
  page. There is no two- or three-across step in between: a space count either
  fits or becomes one. It was worked around by widening that page to `wider`,
  which is a fix for the page and not for the model. What a strip of small
  square tiles wants is a floor it can wrap against rather than a threshold it
  falls off, and nothing expresses that today.

- **A named section always draws its name, so a banner cannot be nameless and a
  header cannot avoid repeating itself.** The Fur Affinity banner printed
  "Aeleos" over a full-bleed picture, and the Fotolog header printed "aeleos"
  three times — once as the section's name, once as the `name` leaf's label and
  once as its value. Both are answered by making the block a depth-0 container
  with NO name, which the model already allows and which is easy to forget
  exists; recorded because two pages in a row got it wrong the same way.

## The fidelity pass on the eleven (2026-08-28)

### Archive.org answers again, and two pages stopped being guesses

The three knowledge-built pages exist because "web.archive.org stopped
answering". **Probed directly on 2026-08-28, it answers for all three.** That
sentence had become a dated claim believed past its date — rule 25 with an
external service as its subject rather than a database.

- **Fur Affinity is evidence-backed now**, from a real December 2008 capture,
  and it had been measurably wrong. Built from knowledge it used a near-black
  ground and saturated teal header bars; the capture shows a **slate blue-grey
  ground and light silver bars carrying DARK text**. It was reading as a modern
  dark theme rather than as 2008. Both were corrected from the capture, and
  `--on-accent` derived the dark text on the light bar with no help.
- **Facebook's palette is confirmed** from a real March 2007 capture: `#3b5998`
  was already right, and the capture adds the detail that the navy bar carries
  a LIGHTER blue sub-bar beneath it, which one accent cannot express.
- **Fotolog stays knowledge-built and says so.** Its snapshots render the
  logged-out homepage with broken styling; no profile capture was found.

### 12. One accent cannot express a two-tone header

Facebook stacks a navy bar and a lighter blue sub-bar. `heading: "bar"` takes
`--accent`, so a page has exactly one bar colour. The second tone is
unreachable — a smaller gap than the surface one above, and the same family:
the palette gives a page one of each thing where a real design has two.

### A rule the seeder stated and broke, for a fortnight

Its header said "no marks, no wordmarks, no brand assets" while the list below
set **eight brand logos** as avatars. The logos were added deliberately and the
sentence was never updated, so the file contradicted itself in the one place
that says what it is allowed to copy.

What is true is narrower: each page uses the site's own mark as the profile
AVATAR, hot-linked and never committed, and nothing else of theirs is
reproduced. The era looks take the opposite line and use no artwork at all,
because an operating system's chrome IS the thing being imitated. That
difference is deliberate and is now written down in both places rather than in
neither.

## Found while building the five era looks (2026-08-28)

Five looks aimed at five eras of somebody else's operating system — Windows 98,
XP, Vista, 7 and 8 — built from captures fetched and looked at, seeded under
`/137/` and photographed. The same method as the eleven, pointed at a different
kind of thing.

### 8. A page cannot choose its SURFACE colour, and this one gap explains most of the loss

**The biggest finding, and it was invisible until three looks failed the same
way.** Every derived colour comes from the page's background gradient, so a
panel is always a tint of the ground behind it. Windows 98 wants **silver
panels on teal**; XP wants **near-white panels on blue**; Metro wants
**coloured tiles on near-black**. All three are one missing mechanism: a
surface colour an author can set independently of the background.

It is not the same as gap 6. That one is per-BLOCK colour; this is per-PAGE,
and it is the more ordinary want — every real page in this set has a background
and a panel colour that are not shades of each other.

Photographed: the Win98 page's panels come out teal-on-teal and the XP page's
blue-on-blue, both legible and both wrong.

### 9. Metro's tiles are reachable; their COLOURS are not

Windows 8 was predicted unbuildable before it was built, and the photograph
sharpened the prediction into something more useful.

The **arrangement lands completely**: `spaces` with `weights: [2, 1, 1]` gives
the mixed tile widths, `radius: "square"` squares them, `border: "none"`
removes the edge and `spacing: "compact"` closes the gaps. What is left is one
thing — the tiles are all one colour where the capture holds seven.

**A trap on the way, and it is worth knowing.** The first attempt used
`chrome: "bare"`, which is the wrong tool: `bare` drops the FILL along with the
edge, the shadow and the padding, so the tiles vanished and Metro became
floating labels on black. A tile is a strong fill with no border and no corner
— `card` plus `border: "none"` plus `radius: "square"`. There is no gap here,
only a key that reads as if it meant "flat" and means "absent".

### 10. `radius` is one value for four corners

Luna rounds a panel's TOP corners and leaves its foot square. `radius: "soft"`
rounds all four, so XP's panels come out with a rounded bottom the original
never had. Small, visible, and unreachable without a key that no look was
allowed to invent on the way past.

### 11. The canvas is ON unless a look turns it off, and three flat desktops forgot

Not a gap — a thing to remember when authoring a look. Windows 98, XP and 8 are
FLAT grounds, and the default drifting nebula painted clouds across all three
until each said `canvas: "none"`. It reads as a bug in the look rather than a
default doing its job, which is exactly why it is written down here.

### What went RIGHT, because that is evidence too

**Vista and Windows 7 needed nothing new at all.** `aero` carries Aero glass
whole — the backdrop blur, the top sheen, the translucent surface — and the two
differ only in palette, one dark-tinted on green and the other light on blue.
Photographed, the Vista page reads as Aero without qualification. That is the
strongest evidence in this exercise that a look belongs in a document rather
than in `SKINS`: three of five eras needed no chrome written, and adding
`win98` or `win7` as skins would have duplicated what `retro` and `aero`
already are.

## Two gaps left open, and why

Both are refusals somebody already reasoned through and wrote down, and closing
them here would be reversing a documented decision as a side effect of a
tidying pass. They are named rather than quietly skipped.

**4 — per-block colour.** The standing rule is that a skin names no colour of
its own and every pairing of a style and a palette is somebody's page; a
per-block colour collapses that. The pastiche cost is real — a MySpace page's
boxes were individually coloured, often badly, and the badness was the medium —
but reversing it is a design question with an owner, not a gap fix. Everything
short of colour now composes freely: a block picks its own skin, border, corner,
card, alignment, picture fit and heading treatment independently of the page.

**5 — overlap.** A banner with an avatar over its lower edge is the one common
arrangement blocks cannot express, and it is the priced cost of refusing free
positioning: coordinates on a canvas cannot degrade to a narrow viewport, make
the editor close to unusable on a phone, and are how the pages this product is
inspired by became unreadable. That trade was taken deliberately in the
sections-of-spaces design. It stays taken.

## Everything here is an OPTION

Worth saying once, because it governs how every row above was closed: each of
these is a key an author may set, and **absence means exactly what a page did
before the key existed.** `image_fit` absent is `cover`. `radius` absent is
whatever the skin chose. `heading` absent is a floating name. `canvas: "none"`
is a choice a person makes, never a new default. No stored page changed
appearance when any of this landed, and no migration was needed for the same
reason.

## If any of this were to be built

Gap 1 first, and alone it would fix gap 7 and most of gap 4's symptom. The
smallest version is a per-block `chrome: "none"` that suppresses the card
surface, padding and edge while leaving the content — which is a style key
beside `border_style`, not a new model.
