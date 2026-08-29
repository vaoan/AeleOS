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

**What each page's palette actually rests on, as of 2026-08-28.** This
paragraph used to say all three of the late additions were knowledge-built, and
two of them stopped being so lower down this same document — a document
contradicting itself, which is worse than one that is simply wrong.

- **Fur Affinity** and **Facebook** are evidence-backed, from a real December
  2008 and a real March 2007 capture. FA was measurably wrong and was
  corrected; Facebook's `#3b5998` was already right.
- **Fotolog** is the one page still built from knowledge, and the only one. Its
  snapshots render the logged-out homepage with broken styling; no profile
  capture has been found. What is claimed for it is the FEEL, not a palette
  anybody measured.
- **Bluesky and Threads are measured against the LIVE sites** (2026-08-29),
  which is the only evidence either can have — both are still running, so
  there is no archive to reach into. Both moved; see "Two live sites, measured"
  below.
- **MySpace and hi5** name what they were built from in the seeder: a real 2007
  profile capture and a 2007 capture of the site.
- **The last four were chased down on 2026-08-29** and the gap is closed — not
  because all four found evidence, but because each now says which it is. See
  "The last four" below.

### The last four (2026-08-29)

The four pages that recorded no provenance at all. **One found evidence here, and two more
were found once other archives were tried** — which is a finished answer rather
than a deferred one, because the searching is what nobody had done.

| page      | evidence   | outcome                                                                     |
| --------- | ---------- | --------------------------------------------------------------------------- |
| Messenger | **yes**    | Wikipedia's own capture of version **8.0**, the 2006 release it is dated to |
| Board     | none, ever | a dark mode is not archivable — see "Other sources" below                   |
| Sonico    | **yes**    | arquivo.pt, October 2008 — found once other sources were tried              |
| GeoCities | **yes**    | a restored gallery of real personal pages; the portal was the wrong subject |

**`web.archive.org` was the wrong place to look for Messenger, and that is the
finding.** It is a desktop application: a capture of it is a SCREENSHOT, not an
archived page, and the archive being unreachable never had anything to do with
it. The whole provenance gap had been framed as one problem with one blocked
source, and it was four different problems — a live site, a screenshot, and two
subjects nobody photographed.

**Messenger was measurably wrong, the same way Fur Affinity was.** Sampled from
that capture: **56% of the window is `#f8f8f8`**, the contact list is
`#ffffff`, the title bar is `#193c74` navy and a `#dbf1ee` band sits under it.
So the real thing is **near-white panels over blue chrome, and this page had it
the other way round** — a blue field with panels tinted from it, because until
`theme.surface` existed a panel could only be a step off the ground. The accent
is the measured navy now and the surface the measured near-white.

**Its blue ground stays, and that is a judgement stated rather than hidden.**
`aero` is the whole reason the page exists — the one pastiche wearing a skin
for its own sake — and glass needs something behind it to show through. A
near-white ground would be more faithful to a screenshot of the window and
would delete the effect the page is a test of. Fidelity and purpose genuinely
conflict here; the panels went to the measurement and the field did not.

**The board's palette is not the era it was filed under.** `#15202b` and
`#1d9bf0` are recognisably Twitter's DARK mode from about 2019; 2012 Twitter
was a light page with a paler blue. The page is coherent and its date was not,
so the README says ~2019 now. **Nothing was restyled**: a pastiche of a real
era is worth more than a pastiche of a date somebody typed, and this one is a
generic board rather than a reproduction of one product.

**Three pages were recalled and said so — and then a different SOURCE closed
two of them (2026-08-29).**

### Other sources, when one archive is unreachable

`web.archive.org` was treated as _the_ archive, and the whole provenance
question was shaped by its being down. It is one of several, and the others
answer:

| source                         | reachable          | what it gave                                                      |
| ------------------------------ | ------------------ | ----------------------------------------------------------------- |
| `web.archive.org`              | **no**             | nothing — three clients, connection times out                     |
| `arquivo.pt`                   | yes                | **Sonico** at Oct 2008 and **Fotolog** at Feb 2008, both replayed |
| `geocities.restorativland.org` | yes                | a restored gallery of real archived GeoCities **personal pages**  |
| Wikipedia / Commons            | yes                | the Messenger 8.0 screenshot                                      |
| `archive.ph`                   | yes (rate-limited) | nothing usable — its coverage starts too late                     |

**Sonico is measured now, and its accent was wrong.** arquivo.pt replays
`http://www.sonico.com/` at `20081024155043` with its stylesheet intact: a
white page, a solid **`#003399`** navigation bar and footer, `#f3f3f3` panels,
`#3366cc` as the secondary blue. The ground was already right; the accent was
`#1a6bb5`, a plausible mid-blue nobody had measured. **That `#003399` is the
same navy MySpace carries is a genuine coincidence of 2008 web design** — both
measured, and it was a web-safe value half the era reached for.

**GeoCities is measured, and the portal was never the right subject.** An
archive of `geocities.com` holds the PORTAL; this pastiche imitates somebody's
personal homepage, which is what the restored gallery holds. Five pages sampled
from one neighbourhood: **`font-family` is `"Times New Roman"` on all five**,
grounds are `#000000` (three), `#ffffff` and `#ff0000`, two of five tile a
background image, and `<center>` tags and layout `<table>`s are everywhere.

**Nothing about that page changed, which is the useful shape for evidence to
have.** The seeder already recorded that the first attempt reached for
`terminal`, got monospace and read as a developer's site rather than a personal
one; five out of five Times New Roman is the measurement that reasoning was
missing.

**Fotolog stays recalled, and a second archive says why.** arquivo.pt replays
it too, with the same result as the first: 126 links at `#0000ee` — the
browser's own default — unstyled serif headings and raw bullet lists. The
markup survives and the stylesheet does not, at two independent archives. It is
also the logged-out homepage either way, where this pastiche imitates a
profile.

**The board can never be closed by any archive, and that is a property rather
than a gap.** arquivo.pt holds `twitter.com/twitter` profile captures from 2009
and 2010 — a crawler arrives **logged out and is served the default LIGHT
page**, so no archive anywhere holds the dark palette this page imitates. That
will still be true next time somebody looks.

**The general lesson is narrower than "try harder".** One unreachable host had
been standing in for "the archive", and the four pages behind it needed four
different sources — a national archive, a fan-restored gallery, an encyclopedia
and, for one of them, nothing that can exist. **Ask what the SUBJECT is before
asking which archive has it**: a desktop application wants a screenshot, a
personal homepage wants a page archive rather than a portal capture, and a
logged-in dark mode wants something no crawler has ever seen.

### Two live sites, measured (2026-08-29)

**A page whose subject is still running needs no archive at all**, which is
obvious in hindsight and was not what anybody reached for first: the whole
provenance question had been framed as an archive problem, and two of the six
were never archive problems.

| page    | was                           | is                   | read from                           |
| ------- | ----------------------------- | -------------------- | ----------------------------------- |
| Bluesky | ground `#ffffff` → `#eef6ff`  | flat `#ffffff`       | `getComputedStyle(document.body)`   |
| Bluesky | accent `#0085ff`              | `#006aff`            | the Follow button's own background  |
| Threads | ground `#000000` → `#0a0a0a`  | flat `#0a0a0a`       | `body`, under `colorScheme: "dark"` |
| Threads | accent `#f5f5f5`              | `#f3f5f7`            | `body`'s own `color`                |
| Threads | no `surface` (a derived step) | `surface: "#101010"` | the card the profile sits in        |

Both also lost their canvas. Neither real page paints anything behind itself,
which is the same fidelity argument five other pages here already carry.

**The Bluesky accent is the useful finding.** `#0085ff` is the brand blue
everybody quotes and it is **not** the blue the application paints. A colour
being the official one is not evidence about what a page looks like — the
measurement and the brand guideline are different claims, and only one of them
is about pixels.

**Threads needed a colour SCHEME before the measurement meant anything.** A
probe with no dark preference is served `#fafafa`, and this page is the black
one Threads launched with; `colorScheme: "dark"` is what makes the reading the
right one. A live measurement carries the prober's own environment into the
result unless that environment is stated.

**And its 2026 relayout is deliberately NOT copied.** Live Threads now puts the
profile in a rounded card on a grey field; this page stays the 2023
edge-to-edge one the README dates it to. **A live site is evidence about today,
and today is not always the era being imitated** — which is the one way
checking a running site is harder than reading a capture, since a capture
carries its date and a live page does not.

**Re-checking the remaining four was attempted on 2026-08-28 and BLOCKED, at the
network rather than at the archive.** `archive.org/wayback/available` answered
for seven of the eight and named snapshots; `web.archive.org` — the host the
capture itself comes from — resolved to `207.241.237.3` and then never
completed a connection, three tries, ~21s each, over both `http` and `https`.

Retried on 2026-08-29 through three different clients, which is what makes this
a fact about the HOST rather than about one tool: `curl` times out at ~21s,
headless Chromium answers `ERR_CONNECTION_TIMED_OUT`, and the agent's own
fetcher refuses the domain outright. `archive.ph` answered (429, rate-limited)
and `archive.org` itself answered 200 in the same run, so it is that one
hostname and not the network as a whole.
So the two hosts have to be probed SEPARATELY: a green availability probe is
not evidence that a capture can be fetched, and reading it as one is how "the
archive answers again" could be written truthfully and still leave the work
undone. Whoever picks this up re-probes `web.archive.org` itself first.

## What landed, and what carried it

**Re-derived from `seed-pastiches.mjs` on 2026-08-28, and five of these rows
were wrong.** The table below used to name `retro` on MySpace, `candy` and
`sticker` on hi5, `glass` on Sonico, `terminal` on GeoCities and `timeline` on
the microblog board. **Every one of those five is a skin or a mode the page
does not use** — nine of the eleven pages are `skin: "default"` throughout, and
the board is a `list`. The rebuild against real captures is what changed them:
the real sites were plain white-and-blue pages, so the decorative skins came
off, and this summary went on describing the pages as they had been. It is
built from the file now rather than from recall.

| page                   | what actually carries it                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows Live Messenger | The only page still wearing a skin for its own sake: `aero` glass, `accordion` contact groups, a `bubbles` canvas — over `surface: "#f8f8f8"` and a `#193c74` accent, both measured off a real 8.0 screenshot.             |
| MySpace                | The **Winamp jukebox chrome**, a `weights: [1, 2]` two-column body, a `table` contact box, a Top 8 grid, `font: "classic"` and a tiled backdrop.                                                                           |
| hi5                    | `heading: "gradient"` title bars over white content, a `carousel` of widgets, and `progress` as a profile-completeness meter.                                                                                              |
| Sonico                 | Navy `#003399` bars on white with `#f3f3f3` panels, all measured off an October 2008 capture, plus `masonry` for a real photo wall and `carousel` for album strips.                                                        |
| GeoCities              | `font: "serif"` and centred text — measured, five of five real pages are Times New Roman — a `stars` canvas, a tiled backdrop, a `table` of visitor stats and a `link` row as a webring.                                   |
| Fur Affinity           | A `bleed` banner — the only one in the set — `weights: [1, 3]` for the stats rail, a submissions grid, and `list` + `chrome: "bare"` for the shouts wall.                                                                  |
| Fotolog                | One photograph at `measure: "narrow"` and a `list` guestbook under it. Structurally the opposite of every other page: not a grid of comparable boxes.                                                                      |
| Facebook               | `heading: "bar"` in `#3b5998` over `heading: "soft"` beneath it, an information `table` with a mark on every row, a six-across friends strip, and a `list` wall.                                                           |
| Microblog board        | `list` + `chrome: "bare"` rows, `stat` counts and `social` chips that resolve a brand — **not** `timeline`, which is what it was built to test. Its palette is Twitter's ~2019 dark mode, not the 2012 it was filed under. |
| Bluesky                | Flat `#ffffff` and `#006aff`, measured live. The one page that sets no `spacing` at all, so it is roomy where every other modern page here is `compact`.                                                                   |
| Threads                | `list` + `chrome: "bare"` on the live site's own `#0a0a0a`, with `surface: "#101010"` for the card. What defines it is what it removes.                                                                                    |

**GeoCities is worth reading twice**: it reached for `terminal` first and got
monospace, which reads as a developer's site rather than a personal homepage. A
serif and centred text is what actually dates a page to 1999 — a finding about
what a decade LOOKED like rather than about the model.

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
  a LIGHTER blue sub-bar beneath it, which one accent could not express — the
  gap below, since closed.
- **Fotolog stays knowledge-built and says so.** Its snapshots render the
  logged-out homepage with broken styling; no profile capture was found.

### 12. One accent cannot express a two-tone header — CLOSED (2026-08-28)

Facebook stacks a navy bar and a lighter blue sub-bar. `heading: "bar"` takes
`--accent`, so a page had exactly one bar colour and the second tone was
unreachable.

`heading: "soft"` closes it. **The tone is DERIVED and not picked**, which is
what keeps it from being a second palette to keep in step: a sub-bar is a
quieter version of the bar above it rather than an unrelated colour, and every
pairing of two chosen colours is somebody's mistake to make. Its label is
solved against the tone itself, exactly as `--on-accent` is solved against the
accent, so the guarantee the accent already carries extends to it rather than
being re-argued.

**A value here that was measured wrong first, and it is the useful half.** The
obvious derivation is "move the accent a fraction of the way toward the panel",
and it fails on the exact page this gap exists for: a dark page's panel is dark
too, so `#000080`'s tone landed within 1.2 of the accent and the second bar WAS
the first one. It travels a fixed step in LIGHTNESS toward whichever extreme
has room instead — the same rule `--on-accent` already uses to choose a label —
because lightness is where a sub-bar's difference actually lives and every
accent has room in one direction or the other. `palette.test.ts` pins it with
`#7f7f7f` in the list on purpose: a mid-grey has the least room to travel, so
it is where a derivation that barely moves stops being visible first.

It reaches the Facebook pastiche as the strong bar on the identity section and
the quieter one on everything subordinate to it, which is the arrangement the
capture shows.

### A rule the seeder stated and broke, for a fortnight

Its header said "no marks, no wordmarks, no brand assets" while the list below
set **eight brand logos** as avatars. The logos were added deliberately and the
sentence was never updated, so the file contradicted itself in the one place
that says what it is allowed to copy.

What is true is narrower: each page uses the site's own mark as the profile
AVATAR, hot-linked and never committed, and nothing else of theirs is
reproduced.

**Both sets wear their subject's mark now (2026-08-29), and that closes a split
this document used to record as deliberate.** The era looks carried no artwork
at all, on the argument that an operating system's CHROME is the thing being
imitated and a logo is no part of it, while the eleven social pages each wore
their subject's. Two sets, opposite lines, written down rather than settled —
and the note said which way it should go was a judgement about this project
rather than something measurable. The judgement was made: consistency. **A page
with an empty circle where every neighbour has a mark reads as unfinished
rather than as principled.**

Each look wears the mark that shipped WITH its release rather than a modern
Windows logo — the 1998 flag, the XP wordmark, Vista's and 7's own lockups, the
flat 2012 flag — which is the same era-fidelity the palettes are held to.

**Four of the five are WORDMARKS, and that made `image_fit: "contain"`
load-bearing rather than decorative.** The XP, Vista and 7 lockups are about
five times as wide as they are tall, and the avatar leaf is `object-cover` on a
circle: `cover` crops them to two meaningless fragments. That is gap 6 exactly,
met a second time — the fault was first found by giving the social pastiches
their real logos, where hi5's 94x45 wordmark came through as two pieces.

**It reaches anybody who PICKS one of these as a template, and that is the safe
direction.** `contain` and `cover` render a square portrait identically and
differ only on a picture that is not square, where showing the whole of
somebody's character beats cropping it.

**They are public and listed now, too.** Seeded `unlisted`, the five looks this
project is proudest of were the five nobody browsing `/137` could find.

## Found while building the five era looks (2026-08-28)

Five looks aimed at five eras of somebody else's operating system — Windows 98,
XP, Vista, 7 and 8 — built from captures fetched and looked at, seeded under
`/137/` and photographed. The same method as the eleven, pointed at a different
kind of thing.

### 8. A page cannot choose its SURFACE colour — CLOSED (2026-08-28)

> **Built.** `theme.surface` is a page-level panel colour. Windows 98 is silver
> on teal, XP is near-white on Luna blue, and Fur Affinity's panels sit a shade
> off its slate ground — all three photographed. The account below is what the
> gap was; it is kept because the reasoning is the reason the key exists.

### What the gap was

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

### 10. `radius` is one value for four corners — CLOSED (2026-08-29)

Luna rounds a panel's TOP corners. `radius: "soft"` rounded all four, so the
strip could not sit flush on the body and XP's panels came out softer than the
original. Small, visible, and unreachable without a key that no look was
allowed to invent on the way past.

**It was closed from the other end**, which is the part worth keeping: not by a
look reaching for a key, but by somebody looking at these pages and naming what
was missing. `corners` and `heading_corners` name which corners are rounded,
on a block's cards and on its bar, and the XP look wears the result — bar
rounded on top, body rounded at its foot, join straight.

**The mechanism took two corrections a browser had to supply.** Written as
`border-radius` on the styled element it reached nothing, because the style bag
lands on a wrapper and the card is nested inside it — every unit case passed
while a real browser measured 0. And writing only the corners switched off left
the bar inheriting the section's, because custom properties inherit and the bar
sits inside the section. Both are recorded against the feature itself.

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

## Closing gap 8 (2026-08-28)

`theme.surface` is a colour or null. Null derives the stepped panel every page
had before, so nothing stored moved.

**Choosing one gives the page TWO grounds, and that is the whole design
problem.** Text has to be legible on the field AND on the panel, and one ink
cannot serve a near-black field and a near-white panel. `derivePalette` solves
against whichever of the two leaves least room — the same rule the hardest
gradient stop already followed, extended from one ground to two — so the worse
case is the one that was measured.

**What it guarantees is narrower than "both clear 4.5", and the difference was
found by a test that failed.** The first case asserted 4.5:1 on both grounds
and failed at 4.05 — because `#008080` sits near mid-lightness and _never_
cleared the minimum, with or without this feature. Lowering the threshold would
have been rule 7's forbidden move. Measured instead:

|              | ink on field | ink on panel |
| ------------ | ------------ | ------------ |
| no surface   | 4.05         | 4.97         |
| silver panel | 4.05         | **10.61**    |

So the real contract is **a second ground costs the first nothing**, which is
both true and checkable, and stronger than the claim it replaced because it
admits that an author's own field is rendered exactly as picked — the
page-level escape hatch being what makes that safe.

## Rebuilt against a real capture: MySpace (2026-08-29)

The pastiches-against-captures plan's task 5, and the largest single restyle
in that plan — the "aim at the era, not the product as shipped" ruling stated
plainly for the first time. The old MySpace page was the site's own **default**
profile chrome: a pale gradient, a stardust tile, white boxes, `#003399`. That
is what MySpace handed somebody at signup. It is not what MySpace WAS — real
profiles were customised almost universally, and the customisation was the
point.

Rebuilt against `profile.myspace.com/akioyang`, captured at `arquivo.pt`,
timestamp `20081024054301` (2008-10-24 05:43:01 UTC). It is a photograph
behind the whole page, boxes gone translucent so the photograph shows
through, thin bright borders, small text fighting the image — and the page's
own copy already argued for exactly this reading: "this layout took me four
hours and i am NOT taking it down."

### 13. A box cannot be TRANSLUCENT — the fill is a colour, not an alpha

**Tried.** A block's fill is `theme.surface` (gap 8's own key), and it is one
opaque `#rrggbb` colour or null. There is no alpha anywhere in the style bag,
on the theme or on a block — `chrome: "bare"` removes the fill outright
(transparent) and takes the border, the shadow and the padding with it, which
is the opposite of what this page wants: a border that stays, over a fill
that lets what is behind it through.

Sampled the capture rather than guessing: five patches of its boxes, taken
where they sit over the photograph's dusk sky, read `#495771`, `#4b576e`,
`#595c6d`, `#605f67` and `#5d575d`, averaging `#555a6a`. `theme.surface:
"#555a6a"` is the nearest reachable thing — every box on the page painted
with that sampled tone outright. It reads close to the capture at a glance
and is a different mechanism entirely: a flat colour standing in for a
photograph showing through, not the photograph showing through. Nothing
behind a MySpace box on this page is ever the page's own picture — every box
is the same opaque `#555a6a`, whether it sits over a bright streetlight or a
dark rooftop in the photograph beneath it, where the capture's boxes visibly
vary with what is behind them.

**What mechanism would be needed:** an alpha channel on `surface` (or a
second key beside it), consumed as `color-mix(in oklab, surface a%,
transparent)` rather than as an opaque `background-color` — which is exactly
the shape `chrome: "bare"` already refuses to be, because it exists to turn
the fill off rather than to dial it down. Composing correctly also needs
`derivePalette` to solve text against the RESULT of that mix over the page's
own picture, not against the flat `surface` colour alone, since a translucent
panel's effective contrast depends on what is currently behind it — a
question this model has never had to answer, because every ground it solves
against today is a flat colour by construction.

Not the same gap as 6 or 8. Gap 6 is per-block COLOUR being unreachable at
all; gap 8 was a page having no SECOND ground independent of its background,
now closed. This is neither: `surface` exists and is exactly the second
ground gap 8 built, and the page has one and used it. What is missing is a
third dial on that same key — how much of what is behind it comes through —
which neither gap needed and neither closed.
