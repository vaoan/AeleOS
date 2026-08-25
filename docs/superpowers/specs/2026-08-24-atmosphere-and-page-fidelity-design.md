# Atmosphere and page fidelity — design

**Status: COMPLETE — implemented and verified 2026-08-24.**

This corrects two things `#8` got wrong, and one it broke silently. `#8` made the
builder's controls stable and confined the author's theme to preview hosts. The
separation was right. What it over-corrected is that it isolated **everything**
about a theme, when only the tokens that restyle **controls** ever needed
isolating.

## What this branch corrected

**1. The complete-page preview was a card in the editor column, not a page.**
Before this branch, `CompletePagePreview` rendered `PublicBlocks` inside a
`rounded-xl surface border-(--edge) overflow-x-auto` host, which sat inside the
signed-in shell's `COLUMN.wide` (`max-w-7xl` plus a gutter). The public route
does the opposite: `PageShell width="full"`, so `main` holds nothing back and
each depth-0 section applies its own measure. Four consequences, all visible:

- `wider`, `widest` and `full` were capped by the editor column, so three of the
  six measures a person could pick rendered identically.
- The column's gutter sat inside each section's own, so every section was
  inset twice.
- A `bleed` section could not reach either edge, which is the whole point of
  `bleed`.
- **Every container query inside a block answered to the editor column**, so
  sections collapsed into their phone layouts on a desktop. This was the one
  that made it look wrong rather than merely narrow.

The component's old TSDoc called this "a bounded, inline workbench view rather
than a public-route viewport". That deliberate trade-off was the wrong call;
the stale description was deleted with the boundary.

**2. The page background had stopped responding while somebody edited it.**
`ThemeConfigurator` used to render `<style>{themeCss(value)}</style>` while its
panel was open, which wrote `--field` at `:root` and the background picture on
`body` — so the whole editor wore the author's background live. `#8` deleted
that injection because it also restyled the chrome, and `previewThemeCss` only
painted inside `[data-preview-theme]`. The author's background therefore
survived only as a fill inside preview boxes and never as a page background.

**3. The moving-backdrop controls had become dead, and nobody noticed.**
`NebulaCanvas` is mounted in the root layout and reads `--canvas`,
`--canvas-density`, `--canvas-speed` and `--canvas-scale` from
`document.documentElement` (`nebula-canvas.tsx`, the `getComputedStyle` calls at
2262, 2288 and 2610). After `#8`, nothing wrote those at the root in the editor
and no preview host mounted a canvas — so the canvas picker, its colour pickers
and all three dials changed nothing an author could see. Every check stayed
green, because the dial guard counts **theme commits per delivered movement**
rather than anything rendered.

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

## What shipped

- `atmosphereCss` applies the closed atmosphere set to the editor document only
  while the theme panel is open. The root canvas, field and body picture respond
  live; closing the panel restores the app atmosphere through the cascade.
- The workbench still consumes AeleOS control tokens. Palette, skin, cursor and
  other control declarations remain inside `PreviewThemeHost`; opaque AeleOS
  backings protect bare labels and headings from hostile author fields.
- The signed-in layout asks `PageShell` for a full-width `main`. Each ordinary
  signed-in route now owns the former `max-w-7xl` geometry through
  `WidePageColumn`, while an editor ends that column before its complete
  preview.
- The complete preview keeps its disclosure control in the old column, then
  renders `PublicBlocks` at page width with no card surface, border or rounding.
  Depth-zero measures, bleed and container queries therefore use the same
  geometry as the public page. Section trays deliberately remain bounded,
  rounded workbench previews.

The result is page-faithful, not pixel-exact. The complete preview shares the
editor document, scrollbar and viewport-unit context. A dedicated preview route
inside an `iframe` remains deferred; it is the mechanism to use only if that
residual difference proves important.

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
