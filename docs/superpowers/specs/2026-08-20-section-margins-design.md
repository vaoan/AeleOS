# Section margins: a banner is a section with the chrome turned off

A public page's space around each section is not the section's. The sides live
on the measure box (`px-4 sm:px-6`, unless `style.bleed`). The gap between
sections lives on the page grid (`gap-10`). The space under the bar and above
the floor lives on `main` (`py-6 sm:py-10`). A banner that should meet the bar
and both edges therefore needs a special case (`bleed`) plus a page-level
padding flag this spec originally proposed and then withdrew.

The space around a section belongs to the section. It is on by default. It can
be turned off. A banner is then: first, bleed, no margins. A footer is: last,
bleed, no margins. No page-level flush keys, and no new container mode.

## What this is not

**Not a new layout.** Modes arrange children (`grid`, `carousel`, `masonry`).
Width already has `bleed`. The leftover is chrome around the section, which is
style, in the same popup, at depth 0.

**Not page-level `flushTop` / `flushBottom`.** Those would move every section
at once and still leave a first section's own gutter. First-plus-no-margins
is the banner; last-plus-no-margins is the footer. A measured first section
with margins off sits against the bar _inside_ the measure, which is the
freedom a page flag could not express.

**Not nested.** A block inside a section does not meet the window. The control
appears only at depth 0, same as `bleed`. The key may still be stored deeper,
so moving a section into another one does not fail on a style it carried
legitimately a moment earlier — same ruling as `bleed`.

**Not independent sides in this cut.** One checkbox drops that section's
entire page chrome: side gutter, gap to its neighbour, and bar/floor padding
when it is first or last. A footer that wants a gap above and none below is a
later split, not a third boolean smuggled in now.

## The key

`style.margins` on a container:

- **absent** — margins on. Today's look. Existing pages do not change.
- **`false`** — margins off. The choice somebody made.
- **`true`** — same as absent. The writer does not send it.

Polarity follows the control: the checkbox is "Margins", checked by default.
Unchecking stores `false`. Storing `true` on every page would look like a
choice nobody made.

`bleed` is unchanged and independent.

| bleed | margins | what the section's page box is                         |
| ----- | ------- | ------------------------------------------------------ |
| no    | on      | measured, gutter, gap, bar/floor chrome if first/last  |
| yes   | on      | full width, vertical gap and bar/floor chrome          |
| no    | off     | measured, flush to neighbours and to bar/floor if ends |
| yes   | off     | full width, flush — banner if first, footer if last    |

## Where the padding moves

**Off `main`.** `PageShell`'s `"full"` column keeps no vertical padding. The
signed-in `"column"` and `"wide"` shells are untouched.

**Onto each top-level section's `data-page-gutter` box**, which already carries
`px-4 sm:px-6` and is the one element the no-viewport-breakpoint guard
excludes. `sm:pt-10` here is the same exception, not a new one.

Replace `gap-10` on the page grid with per-section margins, so one section can
opt out without a parent gap that cannot be attributed to either neighbour:

- First, margins on: `pt-6 sm:pt-10` (what `main` used to add above).
- Every section except the first, margins on: `mt-10` (what `gap-10` was).
- Last, margins on: `pb-6 sm:pb-10` (what `main` used to add below).
- Horizontal: `MEASURE_CLASS` / `BLEED_CLASS` as today. Bleed already removes
  the side gutter so the painted section itself reaches the edge; margins do
  not put that gutter back.
- Margins off: none of those classes on that section.

Whole class strings, never interpolated. A unit test asserts them verbatim,
including first/last/middle and the four bleed×margins combinations.

A page of one section with margins on must still have both bar and floor
chrome. First _and_ last apply together on that box.

## Persistence

`validate_block` grows a `margins` arm next to `bleed`. The check reads the
JSON **type**, not the text `jsonb_each_text` yields. A non-boolean is
refused. `false` is stored. `true` is accepted and means the same as absent.

`0009` is edited in place. After the edit, the changed statements are applied
to the live project by hand. `block-limits-match-migration.test.ts` does not
own this key — it is not a closed vocabulary of names — so the pin is a
boolean-type case in `tests/db/blocks.test.ts`, sabotage-checked by sending a
string.

The client schema (`section-schema` / `block-schema`) and the editor's empty
string → omit path land in the same change.

## The editor

On the section style popup, at depth 0, next to bleed: a "Margins" checkbox,
checked when `style.margins` is not `false`. Unchecking writes `false`.
Checking again omits the key.

The live preview is `PublicBlocks`. Turning margins off is visible there
against the editor canvas. It will not sit flush against the _app_ bar — that
bar is the signed-in shell, which keeps its padding.

Catalogues in both languages. Test id `section-style-margins`.

## Tests

Unit:

- Schema: `false` parses, absent is on, a string fails, `true` is on.
- `PublicBlocks` class strings for first / middle / last, one-section page,
  bleed on and off, margins on and off. The gap must be a class on a section,
  not `gap-10` on the parent, or the no-margins case cannot be expressed.
- Style popup: the box is absent nested, present at depth 0, and `onChange`
  omits the key when checked.
- `PageShell` `"full"` has no `py-6` / `sm:py-10`.

Browser:

- Seed a three-section page. Default: a gap between first and second, and a
  gap between `main`'s top and the first section.
- First section `bleed` + `margins: false`: that section's top meets `main`'s
  top and its width meets both edges; the second section still sits below a
  gap.
- Last section `bleed` + `margins: false`: that section's bottom meets
  `main`'s bottom and both edges; it meets the previous section with no gap.
- Sabotage: putting `py-6 sm:py-10` back on `"full"` reddens the banner case.
  Leaving `gap-10` on the page grid reddens the footer-meets-previous case.
  Class-string unit tests cannot replace the banner measurement — they would
  have passed when `COLUMN.full` had no caller.

## Out of scope

Sticky bars, overlapping the header, `position: fixed` footers. Per-side
margin controls. Changing `bleed`. Nested gap inside a container's places.
