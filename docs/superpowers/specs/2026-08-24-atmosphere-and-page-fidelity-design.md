# Atmosphere and page fidelity — design

**Status: approved, not yet implemented.**

This corrects two things `#8` got wrong, and one it broke silently. `#8` made the
builder's controls stable and confined the author's theme to preview hosts. The
separation was right. What it over-corrected is that it isolated **everything**
about a theme, when only the tokens that restyle **controls** ever needed
isolating.

## What is wrong today

**1. The complete-page preview is a card in the editor column, not a page.**
`CompletePagePreview` renders `PublicBlocks` inside a
`rounded-xl surface border-(--edge) overflow-x-auto` host, which sits inside the
signed-in shell's `COLUMN.wide` (`max-w-7xl` plus a gutter). The public route
does the opposite: `PageShell width="full"`, so `main` holds nothing back and
each depth-0 section applies its own measure. Four consequences, all visible:

- `wider`, `widest` and `full` are capped by the editor column, so three of the
  six measures a person can pick render identically.
- The column's gutter sits inside each section's own, so every section is
  inset twice.
- A `bleed` section cannot reach either edge, which is the whole point of
  `bleed`.
- **Every container query inside a block answers to the editor column**, so
  sections collapse into their phone layouts on a desktop. This is the one that
  makes it look wrong rather than merely narrow.

The component's own TSDoc calls this "a bounded, inline workbench view rather
than a public-route viewport". That was a deliberate trade-off and it was the
wrong call.

**2. The page background no longer responds while somebody edits it.**
`ThemeConfigurator` used to render `<style>{themeCss(value)}</style>` while its
panel was open, which wrote `--field` at `:root` and the background picture on
`body` — so the whole editor wore the author's background live. `#8` deleted
that injection because it also restyled the chrome, and `previewThemeCss` only
paints inside `[data-preview-theme]`. An author's background now survives only
as a fill inside preview boxes and never as a background.

**3. The moving-backdrop controls became dead, and nobody noticed.**
`NebulaCanvas` is mounted in the root layout and reads `--canvas`,
`--canvas-density`, `--canvas-speed` and `--canvas-scale` from
`document.documentElement` (`nebula-canvas.tsx`, the `getComputedStyle` calls at
2262, 2288 and 2610). Nothing writes those at the root in the editor any more,
and no preview host mounts a canvas — so the canvas picker, its colour pickers
and all three dials now change nothing an author can see. `#8` shipped this and
every check stayed green, because the dial guard counts **theme commits per
delivered movement** rather than anything rendered.

## The distinction this rests on

A theme's declarations split cleanly in two, and `#8` failed to make the cut:

| Group              | Properties                                                                                                                                          | Where they belong                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Atmosphere**     | `--field`, the `body` background picture layers, `--canvas`, `--canvas-N`, `--canvas-density`, `--canvas-speed`, `--canvas-scale`, `--nebula-blend` | The document, so the page and the canvas can wear it |
| **Control tokens** | `--surface-solid`, `--bar-solid`, `--menu`, `--ink`, `--ink-2`, `--muted`, `--edge`, `--accent`, `--on-accent`, every skin variable, `cursor`       | Preview hosts only, never the document               |

Atmosphere is not a control. It is what a page sits **on**, and it is the one
part of a theme an author cannot judge inside a box.

## Decisions

**Atmosphere is live while the theme panel is open, and only then.** That is the
trigger `#8` removed and the one an author already learned. Closing the panel
returns the editor to the app's own field, so the builder's resting state is
unchanged.

**The atmosphere set is exactly the left column of the table above.** No
control token reaches the document, so no button, input, card, popup or toolbar
changes when a dial moves. `previewThemeCss` keeps emitting the full set,
unchanged, inside its hosts.

**Chrome legibility is a hard requirement, not a hope.** With the author's field
behind it, any editor text that sits directly on that field must still be
readable against a hostile background — a near-white gradient in dark mode and a
near-black one in light mode. The implementation chooses the mechanism (put bare
chrome text on a stable AeleOS surface, or hold the content column on one) and
proves it by measuring contrast in a browser, not by reasoning about it. Adding
the author's `--ink` to the atmosphere set is **not** an acceptable fix: it
reaches text inside AeleOS cards, whose surface is not being themed, and would
recreate exactly the readability fault `derivePalette` exists to prevent.

**The complete-page preview becomes full-bleed and page-faithful.** The
signed-in shell inverts the way the public route already does: `main` becomes
`width="full"` and each signed-in page owns its column, so the preview can
simply decline one. The preview then drops its card chrome — no rounding, no
`surface`, no border — lets each section apply its real measure and bleed, and
sits on the author's atmosphere.

**Every other signed-in page must look exactly as it does today.** The shell
inversion is a refactor, not a redesign: `/me`, the pages list, the create page
and the editor's own form each take the column the layout used to give them.
This is the change most likely to cause collateral damage, and the existing
responsive and browser suites are the guard.

**An iframe of the real route is explicitly deferred.** Full-bleed shares the
editor document, so it will never be pixel-exact: viewport units, the scrollbar
and the real `body` element still differ. If that residue matters once this
lands, the next step is a preview route rendering the draft inside an
`<iframe>`, which is the only thing that is genuinely the page. Nothing here
should make that harder.

## What must not change

- `themeCss` and `ThemeScope` — the public route's behaviour is not in scope.
- `previewThemeCss` and `PreviewThemeHost` — section trays keep working exactly
  as they do, and the controls/preview separation `#8` established stands.
- `Block` and `PublicBlocks` remain the only renderers. No second preview
  implementation, at any fidelity.
- Drag geometry: previews stay outside every droppable, and the complete
  preview stays outside `DndContext`.
- The save boundary, the schema, and every stored shape.

## Verification

- The canvas picker, its colours and all three dials visibly change the editor's
  canvas while the panel is open — driven in a browser, since the fault they are
  guarding against was invisible to every unit test and to the dial budget.
- Opening the panel changes the document's painted background; closing it
  restores the app's own. Both read as computed values, not class names.
- No control token reaches the document at any point: toolbar, inputs and
  section cards are measured before and after a theme change, as
  `section-card-face.spec.ts` already does for the tray boundary.
- Editor chrome clears its contrast minimum over a hostile field, in both
  schemes.
- The preview's laid width tracks the author's measure across all six stops, a
  `bleed` section reaches both edges, and a three-place section does **not**
  collapse to one track at a desktop viewport — the direct proof that container
  queries now answer to the page rather than the column.
- Every other signed-in page is unchanged at every viewport stop the responsive
  suite already measures.
