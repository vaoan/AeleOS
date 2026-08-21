# Flush page padding: a banner against the bar, a footer against the floor

A public page always has vertical padding on `main` — `py-6 sm:py-10` — because
`PageShell`'s `"full"` width dropped every _horizontal_ constraint and kept the
vertical half on purpose. That padding is why a full-bleed banner cannot sit
against the header bar, and why a last section cannot sit on the viewport
floor as a footer. Width already belongs to the author (`measure`, plus
`style.bleed` on a section). The two remaining edges of the page's own box
do not.

This spec adds two page-level checkboxes, next to the measure, that drop the
top padding, the bottom padding, or both. Existing pages stay padded.

## What this is not

**Not per-section.** `style.bleed` already opts a section out of the _width_.
The space above the first section and below the last is page chrome, which is
why the control sits with `measure` rather than on a section's paintbrush.

A nested block cannot flush the page either. Depth 0 is the only place that
meets `main`.

**Not one enum** (`padded` / `flush-top` / `flush-bottom` / `flush-both`). A
banner and a footer are independent; two checkboxes are the form that says so.

**Not the editor's own shell.** The signed-in layout stays `width="wide"` with
its padding, so the form does not jam the toolbar. These flags affect the
_public_ `PageShell` only. The live preview inside the editor will not sit
flush against the editor chrome, and must not pretend to: that chrome is not
the bar a stranger sees.

## The keys

`ActorTheme` gains two booleans:

- `flushTop` — drop the top padding on the public `main`.
- `flushBottom` — drop the bottom padding on the public `main`.

**Absent and `false` are the same answer: keep today's padding.** That is the
existing-page guarantee. The writer omits the key when the box is unchecked,
the same way `measure` is omitted when it is the design's own. A stored
`false` is not a distinct state.

Checked means the padding on that side is gone. The gap between sections
(`gap-10` on the page grid) is untouched; only `main`'s padding changes.

Polarity is "flush", not "pad", so the stored `true` is the thing somebody
chose. A checkbox labelled as keeping padding would store the default as
`true` on every save and look like a choice nobody made.

## Where the padding lives

It stays on `PageShell`. `sm:py-10` is a viewport breakpoint, and
`blocks.test.tsx` forbids those everywhere below `main`. Moving the padding
onto `PublicBlocks` would either break that guard or invent a container query
for a box that has no container.

The public routes already pass `width="full"`. They also pass the two flags
from the theme they just read. `PageShell` composes the vertical classes:

| `flushTop` | `flushBottom` | `main` vertical padding |
| ---------- | ------------- | ----------------------- |
| no         | no            | `py-6 sm:py-10` (today) |
| yes        | no            | `pb-6 sm:pb-10`         |
| no         | yes           | `pt-6 sm:pt-10`         |
| yes        | yes           | none                    |

Whole class strings, never interpolated — the same rule as `MEASURE_CLASS`.
Tailwind reads source text; `p${side}-6` compiles to nothing.

`"column"` and `"wide"` are unchanged. Those shells serve the signed-in app,
not a stranger's page.

## How a banner and a footer actually work

Flush top alone still leaves the first section inside the measure's
horizontal gutter. A banner that should meet the bar _and_ both edges is
flush top **and** `style.bleed` on that first section.

Flush bottom alone still leaves the last section inset. A footer that should
meet the floor _and_ both edges is flush bottom **and** `style.bleed` on that
last section.

Neither flag moves a section. Order is still the tree. The page author puts
the banner first and the footer last; the flags only remove the chrome that
was keeping them off the edges.

## Persistence

`set_actor_theme` must hear of both keys. Its allowlist ends in
`unknown theme key %`, which is how `measure` made the whole theme save throw
until it was added. The SQL check reads the JSON **type**, not the text:
`jsonb_each_text` renders `true` as `'true'`, which is exactly what a form
control hands back if somebody forgets to convert it, and exactly the value
the client schema refuses. Same lesson as `bleed`.

A non-boolean is refused. `true` is stored. `false` is not sent.

`0009` is edited in place (nothing is in production in the sense of consuming
apps having copied the migrations). After the edit, the changed statements
are applied to the live project by hand — `db push` will not re-run an
applied file. `tests/db/actor-theme.test.ts` pins the write.

The client schema, `parseTheme`, and the persist omit-when-false path land in
the same change as the SQL. A vocabulary written in two languages needs the
test that says so in the same change.

## The editor

Two labelled checkboxes under the measure select, in the same panel. They do
not depend on the chosen measure: a narrow page can still flush its top, and
a full-width page still has `main` padding to drop.

Unchecked is the default. Checking one and saving, then reopening, shows it
checked. Resetting the theme unchecks both.

Catalogues in both languages, key-checked. The labels name the effect
("flush to the bar" / "flush to the bottom"), not the CSS property.

## Tests

Unit:

- `parseTheme` reads `true`, treats absent and `false` as not flush, refuses
  a string.
- Persist omits both keys when unchecked and includes them only when true.
- `PageShell` class strings for all four combinations, verbatim — a unit
  assertion on `PublicBlocks` cannot see `main`'s padding.
- Theme configurator: both boxes, test ids `theme-flush-top` and
  `theme-flush-bottom`, wiring into `onChange`.
- `tests/db/actor-theme.test.ts`: `true` stores, a string is refused, an
  unknown sibling of these keys still throws `unknown theme key`.

Browser:

- Extend `page-measure-and-bleed.spec.ts` (or a sibling next to it). Seed a
  page with flush top and a bleeding first section; assert that section's
  top edge meets `main`'s top edge (no padding). Same for flush bottom and
  the last section against `main`'s bottom. A page with neither flag keeps
  a gap that those two cases do not.
- Sabotage: leaving the shell on `py-6 sm:py-10` must redden the flush-top
  case. A fixture that only compares class names on `PublicBlocks` cannot
  catch this — that is how `COLUMN.full` shipped unused.

## Out of scope

Horizontal padding on `main` for `"full"` stays none. Section gutters stay
on `MEASURE_CLASS` / `BLEED_CLASS`. Sticky headers, overlapping the bar, and
`position: fixed` footers are a different product.
