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

> **Corrected 2026-08-25 — "and only then" was too narrow, and the complete
> preview paid for it.** The trigger is now EITHER page-scale surface being
> open: the theme panel, or the complete-page preview. The reason is the same
> one this section gives — atmosphere is what a page sits on and cannot be
> judged inside a box — and the complete preview is the other place a page is
> judged whole. With both closed the builder's resting state is still
> untouched, and the set that reaches the document is unchanged, so the
> boundary this branch drew is not weakened. See "Four things this got wrong"
> at the foot of this file.

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

- `atmosphereCss` applies the closed atmosphere set to the editor document
  while a page-scale surface is open — the theme panel, and since 2026-08-25
  the complete preview too. The root canvas, field and body picture respond
  live; closing the last one restores the app atmosphere through the cascade.
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

## Four things this got wrong, found 2026-08-25 by photographing a page twice

Both were invisible to every check this branch shipped, and both were found the
same way: seed one page, photograph it at its public address and again inside
the complete preview, and compare the images.

**1. The preview never showed the page's own backdrop.** `PreviewThemeHost`
painted `background: var(--field)` on an in-flow element, and `NebulaCanvas` is
`fixed inset-0 -z-10` in the root layout — so the host's background covered the
canvas outright. A page with a nebula photographed mottled at its address and
perfectly smooth in the preview. The same opacity re-anchored the author's
field: `body` is `background-attachment: fixed`, so the gradient a visitor sees
spans one viewport, while the host's copy spanned the whole document — measured
at 1280×1696 against a 1280×900 window on an eight-section page.

The fix is the trigger widening above plus a host that declines to paint:
`PreviewThemeHost` takes an `atmosphere` prop, `document` mode drops the field
class and marks itself so `previewThemeCss` withholds the background-picture
layers as well. What shows through is then `body` and the real canvas — the
public composition rather than an approximation of it, and it closes the
`background-attachment` residue this file recorded as unclosable inline.

**2. Neither preview's guard could have caught it, and one still cannot.** The
per-section pixel comparison quiets the canvas and flattens the field on both
sides, correctly — the canvas animates and is seeded per load. That quieting is
exactly why the missing backdrop was invisible, so it needed a case of its own,
which asks whether hiding the canvas changes what the preview paints and
whether `:root` is resolving the AUTHOR's field. A transparent host over the
app's own backdrop satisfies the first and fails the second; only the second is
the feature.

**3. The preview host was a scroll container, and `main` is not.** It carried
`overflow-x-auto` so horizontal excess would scroll inside the preview rather
than dragging the workbench sideways. A `visible` overflow paired with a
non-visible one computes to `auto`, so the box was a scroll container on both
axes — and a scroll container clips ink. Because ink overflow is not scrollable
overflow, nothing scrolled and no scrollbar was offered; the shadow was simply
absent. A bled, margin-less, unnamed section is flush with the host's own edge,
and a `neobrutalism` banner's hard cast measured 77.33 channels over the field
below it on the page against 0.00 in the preview.

Removed. Excess is still reachable and still never clipped — the document
scrolls, which is what a stranger gets. Two suites had required `overflow-x:
auto` by name; both were pinning the mechanism, and the mechanism was the
fault.

**4. A fractional device row is the CAMERA, not the page.** Heights and widths
agree to three decimals between the two; only the fractional part of `y`
differs, and it falls on the half pixel publicly as readily as in the preview.
Chromium snaps the layer, so the content compares at zero differing pixels —
but the photograph of a box at `y = .5` spans one device row more, and
`locator.screenshot()` fills that row with pure white. The size claim is read
from `getBoundingClientRect` now rather than from the image.

**The residual difference is smaller than this file claimed, and the `iframe`
is still the mechanism for what is left**: the shared scrollbar, viewport units
and the real `body` element. The backdrop and the box kind are no longer part
of that residue.

> **Superseded 2026-08-26.** The iframe this file deferred is built — see
> `2026-08-26-preview-route-design.md`. The complete preview is a document of
> its own at `/{locale}/me/preview`, rendered at a named device size, so the
> residue above is gone rather than reduced: it has its own viewport, its own
> scrollbar and its own `body`. What this file still owns is the section TRAY,
> which remains a bounded workbench preview and still carries the
> `background-attachment` trade-off measured here at 29 channels against 7.

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
