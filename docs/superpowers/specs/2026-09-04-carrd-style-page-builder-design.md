# Carrd-style page builder

- **Date:** 2026-09-04
- **Status:** Designed, not built
- **Scope:** The signed-in person and fursona page editors. The stored page
  document, public renderer, public routes, database RPCs, required identity
  leaves, depth cap, page-level colour, templates, and JSON source dock do not
  change their jobs.
- **Supersedes:** The recursive Items/Options inspector workflow in
  `2026-09-01-recursive-inspector-drill-down-design.md` (navigation, sibling-only
  inspector drag, Items as the add/reorder surface). `BlockPath` selection,
  selection repair, shallow field editors, Preview clearing selection, and
  canvas-only edit scrolling still hold.
- **Does not supersede:** `2026-08-18-sections-of-spaces-design.md` (places,
  empty slots, no free positioning), `2026-08-18-dragging-design.md` §1 for
  **positional** containers (empty = move, occupied = swap),
  `2026-08-27-the-editor-wears-the-page-design.md`,
  `2026-09-02-editor-interaction-and-motion-design.md` (interaction lock, one
  Add picker with real samples, Motion only in `CHROME_SCOPE`),
  `2026-09-03-editor-preview-selection-and-canvas-scroll-design.md`.

## Problem

The editor already shows the live page, but building it still means walking a
tree in a recursive inspector: Items, Options, Back, breadcrumbs, grips on
list rows. Carrd's builder is simpler in a way this product can copy without
changing what a page is: click the thing, edit the thing, drag the thing.

## Invariants

- The document remains `{ theme, blocks }`. No migration. An existing page
  opens in the new builder and saves the same shape.
- One public renderer: `presentation/blocks.tsx`. The editor does not paint a
  second page.
- No x/y coordinates. Layout stays spaces, weights, container queries.
- Colour stays page-level.
- Depth stays capped at three, enforced in domain and database.
- Preview is still hide-controls on the same document, interactive, selection
  cleared before paint.
- Interaction stays locked while controls show unless the session switch is
  on; Preview unlocks.
- Required identity leaves may be moved and styled and cloned where valid;
  they may not be deleted.

## Interaction

The editor opens on the live page with a compact floating builder menu. There
is no Items tab and no tree navigation in the panel.

- **Click an element** selects the nearest `data-block-path` and opens one
  Properties panel. Innermost path wins.
- **Click empty canvas** selects Page (theme and page options).
- **Properties panel** edits only the selection. A leaf shows Content and
  Appearance. A container shows Layout and Appearance. Page shows Page and
  Theme. Clone and Delete sit at the foot. Close clears selection.
- **Add** is one global control. Selected container: append inside.
  Selected leaf: insert after. Page or nothing: append at root. The new
  element is selected and its panel opens.
- **Drag the rendered block** on desktop. Touch and keyboard use a grip on the
  selected block so scrolling is never hijacked. Invalid destinations never
  advertise themselves; the domain check is still the authority on drop.
- **Compact menu:** Add, desktop/mobile canvas width, Preview, Save, More.
  More holds source JSON, Interact with page, and Cancel. Mobile is icon-first
  and omits a redundant mobile-width toggle.

## Drop semantics

A drop is a source `BlockPath` plus a discriminated target. The planner
answers the next tree and the moved block's destination path, or a refusal.

| Scope                                              | Target                                                                  | Meaning                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Page, `stack`, `list`, `timeline`                  | `before` / `after` a sibling                                            | Insert and shift. Empty places in that list move with the shift.              |
| `grid`, `masonry`, `carousel`, `tabs`, `accordion` | a `place`                                                               | Unchanged: onto empty is a move (source left empty); onto occupied is a swap. |
| Across containers                                  | `before` / `after` in a linear parent, or a `place` in a positional one | Allowed when depth and cycle rules permit.                                    |

Leaving a linear list splices the source out. Leaving a positional place
clears it and keeps the hole.

Refusals stay ordinary outcomes, not throws: no such place, into itself, too
deep, and too many children (`BLOCK_LIMITS.children`). A drop that lands where
the block already is succeeds and answers the same array by identity.

## Layout

Desktop: compact opaque menu over the canvas; selected Properties panel on the
**right**; edit mode reserves space so the panel does not cover the selected
block. Mobile: bottom sheet; opening it scrolls the selection into the
unobscured canvas. Hover and selection use one outline; linear drops show an
insertion bar; positional drops highlight the place.

## Deferred

Undo/redo, copy/cut/paste shortcuts, an elements tree, panel docking or
minimizing, and section-view navigation. The drop result type is shaped so a
history stack can wrap it later.

## Proof

- Domain: linear insertion vs positional swap on fixtures that would make the
  two operations identical if they were adjacent; cross-container; cycles;
  depth; stale targets; no-ops; returned destination path. Sabotage insertion
  into swap and vice versa.
- Component: click-to-panel, Add placement at three scopes, clone/delete,
  required-kind delete refusal, public renderer unchanged when the editor seam
  is absent.
- Browser: pointer drag, touch-grip drag, keyboard drag, insertion bars, grid
  swaps, Preview fidelity, 320px sheet, save-error visibility.

## Architecture

`FursonaEditor` still owns the form, theme, save, Preview, source dock, and
interaction switch. `BlockEditor` owns selection, the editable canvas, the
Properties panel, and the drop planner. Field editors stay the existing
`BlockCard` / `LeafEditor` / style controls, mounted shallow for one target.
