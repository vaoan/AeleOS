# Drag-to-add from a palette tab

- **Date:** 2026-09-05
- **Status:** Designed, not built
- **Scope:** How a new block enters the page. The stored document, the public
  renderer, the depth cap, positional-vs-linear drop semantics for **moving**
  an already-placed block, required identity leaves, and the Properties
  panel's existing Content/Appearance/Layout/Theme tabs do not change their
  jobs.
- **Supersedes:** The click-a-button, open-a-modal Add path from
  `2026-09-04-carrd-style-page-builder-design.md`'s "Add is one global
  control" bullet and `2026-09-02-editor-interaction-and-motion-design.md`'s
  "one Add picker with real samples" — both described the modal
  `AddBlockPicker`/`add-slot.tsx`/`add-target.ts` mechanism this design
  removes.
- **Does not supersede:** Everything else in
  `2026-09-04-carrd-style-page-builder-design.md` — click-to-select, one
  Properties panel per selection, dragging an **already-placed** block by its
  own grip, the drop-semantics table for that case (linear insert-and-shift vs
  positional move/swap), the compact builder menu, desktop/mobile canvas
  width, Preview. `2026-08-18-sections-of-spaces-design.md` (places, empty
  slots, no free positioning) and the depth cap in
  `2026-08-18-sections-of-spaces-design.md` / `2026-09-04`'s own invariants.

## Problem

Adding new content today means pressing one global Add button, which opens a
modal of real-rendered sample previews to click. It works, but it is a detour
away from the canvas: press a button, read a grid of options, click one, the
modal closes, you land back where you were. The owner wants something closer
to Carrd's own feel for this specific action — drag the thing you want
straight from a list onto the spot you want it, watching every place it could
go light up as you do it.

## Invariants carried over unchanged

- The document stays `{ theme, blocks }`. No migration.
- One public renderer, `presentation/blocks.tsx`. This design touches only the
  editor.
- Depth stays capped at three; `mayNest` stays the authority on what may nest
  where.
- Colour stays page-level.
- Required identity leaves (owner, avatar, handle, …) still cannot be deleted
  below the floor; this design changes how something is _added_, not the
  floor itself.
- Dragging an **already-placed** block by its own grip — reordering,
  cross-container moves, the linear-insert-and-shift-vs-positional-swap split
  — is untouched. This design is additive: a second kind of drag, sharing the
  same drag machinery, for content that does not exist on the page yet.

## The panel: one fixed Palette tab, plus whatever is selected

The Properties panel gains a tab strip. **Palette** is always present and is
not really a content tab — it is a mode switch. Alongside it, zero or more
tabs appear depending on selection, exactly as today:

| Selection   | Tabs                               |
| ----------- | ---------------------------------- |
| Nothing     | `Palette`                          |
| A leaf      | `Palette`, `Content`, `Appearance` |
| A container | `Palette`, `Layout`, `Appearance`  |
| The page    | `Palette`, `Page`, `Theme`         |

Clicking a block on the canvas sets selection and switches the active tab
away from Palette to that block's first contextual tab — unchanged from
today's click-to-select behaviour, just now sitting beside a Palette tab
instead of being the only content in the panel. Clicking the Palette tab
clears selection, collapsing the strip back to just `Palette`.

Closing the panel (the existing toolbar toggle) hides it without clearing
selection; reopening restores whichever tab was last active. This is the one
part of the panel's behaviour that does not change.

## The palette's own content

Grouped exactly as the outgoing modal grouped them — **Content** (leaf kinds)
and **Layout** (section/container kinds) — but rendered as a compact list of
mini thumbnails rather than full-size cards, since they now share sidebar
width with everything else. Each thumbnail is still a real render of that
kind's fixed sample content from `add-samples.ts` (shrunk, not replaced by an
icon), because recognizing what you're picking up matters more here than it
did in a modal you could take your time reading.

## Picking one up: every valid spot lights up at once

Starting a drag — pointer press on a thumbnail, or the keyboard path below —
immediately computes and highlights **every valid drop target on the whole
page**, all together, filtered to what that specific kind may enter:

- A **leaf** kind may enter any container's places: every existing empty
  place, every existing occupied place (occupied places accept a drop by
  pushing everything after them along to make room — the same
  insert-and-shift behaviour linear containers already use when reordering,
  extended here to every container, not just the linear ones), and one
  virtual **append a new row** spot at the foot of every container, present
  even when that container is currently full in its own `spaces` width. A
  container is never truly "full": places describe width, not capacity, and
  a new row is always reachable.
- A **section/layout** kind may enter the same set of places, but only inside
  containers that have not hit the depth cap of three. A container already
  three deep highlights nothing for a section drag while still highlighting
  normally for a leaf drag.

Both rules reuse the model's own existing validity primitives (`mayNest`, the
depth cap) rather than inventing new ones — the palette asks "where is this
kind allowed" of the same functions the rest of the editor already asks it of.
Disallowed spots simply do not highlight; there is no dimmed, disabled state
to render.

Highlighting is invasive on purpose only for the duration of a palette drag.
It shows for no other reason and disappears the instant the drag ends, one way
or another.

## Dropping

Dropping on (or keyboard-confirming) a highlighted target instantiates a new
block from that palette item's template and inserts it there — a plain insert
into an empty or virtual-append place, an insert-and-shift into an occupied
one. The new block is then **auto-selected**, and the panel's active tab moves
from Palette to that block's first contextual tab, landing the author straight
into editing what they just placed.

Canceling — Escape, or releasing over a spot that never highlighted — inserts
nothing. The panel returns to wherever it was (Palette if nothing was selected
before the drag, the previous selection's tabs otherwise). The dragged preview
simply disappears; there is no return-to-palette animation, because nothing
was ever removed from the palette to begin with — every kind is available
every time, unlike an already-placed block being dragged out of one spot.

## Keyboard equivalent

Drag-to-add is **replacing** the modal entirely, so a keyboard-only or
screen-reader path is not optional. It mirrors the pick-up/move/drop shape the
editor's existing keyboard-driven reordering already uses, applied to a
palette-origin drag instead of an existing block:

- **Enter/Space** on a focused palette thumbnail picks it up. Every valid
  target highlights, identically to a pointer drag.
- **Arrow keys** move focus between highlighted targets one at a time, in
  document order.
- **Tab** skips a whole section's worth of highlighted targets at once,
  landing on the next section's first highlighted target — a coarse jump for
  long pages.
- **Enter/Space** again drops at the currently focused target.
- **Escape** cancels, same as a pointer drag.

## What this removes, and what it leaves standing

**Removed:** `AddBlockPicker`, `add-slot.tsx`, and the selection-driven
`addTargetFor` in `add-target.ts` — the entire click-a-button-open-a-modal
path.

**Kept, repurposed:** `add-samples.ts`'s fixed sample templates — they now
back the palette's mini-previews and what a drop instantiates, rather than
backing the modal's option cards.

**Untouched:** dragging an already-placed block by its grip; the Properties
panel's Content/Appearance/Layout/Theme tab bodies; the required-identity-leaf
floor; the public renderer.

## Architecture

One `DndContext` continues to own all dragging in the editor. Palette
thumbnails become `useDraggable` sources carrying a synthetic id
(`palette:<kind>`) rather than a `BlockPath` into the tree. `onDragStart`
branches on the drag's origin: a canvas-origin drag behaves exactly as it does
today (existing move/swap planner); a palette-origin drag instead calls a new
domain function that walks the tree once, filtering by the dragged kind
through `mayNest`/the depth cap, and returns every valid target — including
the per-container virtual append spot — as a flat list the canvas renders as
highlights. `onDragEnd` for a palette-origin drag calls a new insert-from-
template function (instantiate the sample template for that kind, splice it in
at the chosen target using the same insert-and-shift/append mechanics the move
planner already has) rather than the existing move function. The keyboard
sensor already used for reordering drives the palette case the same way,
against the same computed target list.

## Proof

- Domain: the "compute every valid target for kind K" function, on fixtures
  covering an empty container, a fully-packed container (virtual append spot
  still present), a container at the depth cap (no section-kind targets,
  leaf-kind targets unaffected), and a mixed page exercising both. The
  insert-from-template function, on empty-place insert, occupied-place
  insert-and-shift, and depth/cycle refusal fixtures parallel to the existing
  move planner's own. Sabotage-verified: a version that only returns empty
  places (missing the append-spot case), a version that ignores the depth cap
  for section kinds, a version that mutates the wrong tree branch.
- Component: Palette tab always present and never removable from the strip;
  clicking it clears selection; clicking a canvas block always lands on that
  block's first contextual tab, never Palette; the palette's own thumbnails
  render the same templates the old modal rendered (regression guard against
  quietly losing a kind in the swap).
- Browser: pointer drag from palette to an empty place, to an occupied place
  (verify the shift), to a fully-packed container's append spot, into a
  depth-capped container (section kind shows no highlight, leaf kind does);
  keyboard pick-up/arrow/tab/drop/escape end to end; the panel's tab focus
  after a successful drop; axe/contrast on the highlighted state, since it is
  new visible chrome.

## Rollout note

The owner has asked for this to land in small, independently verifiable
slices rather than one pass that turns the browser suite into a multi-hour
run — the implementation plan should sequence tasks so each one has its own
narrow, fast-to-run proof (unit/component first, one or two targeted browser
cases per slice) rather than deferring all browser coverage to a single final
task.

Execution is unattended end to end: each slice is its own branch, its own PR,
its own full run of required checks, and auto-merge on green — the next slice
starts only once the previous one has actually merged. It is acceptable for
an intermediate merged state to be incomplete (e.g. the domain function
landed before the palette UI consumes it) as long as it is never **broken**
(every merge keeps `main` green, and never regresses the modal path until the
slice that replaces it is itself green and merged). The owner is notified on
each merge, not on each task, so they can look at the page after every real
step forward.
