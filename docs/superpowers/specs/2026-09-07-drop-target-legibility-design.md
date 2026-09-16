# Drop target legibility — Design

**Status:** delivered.

## 1. Context and goal

The editor has two drag mechanisms and neither one tells a person where the
block they are carrying will land. Reported by the owner on 2026-09-07, in
four parts:

1. Every possible drop spot is marked the same way, so it is hard to see which
   one is actually being chosen.
2. The dragged item is invisible. It "kind of inhabits the cursor" — the person
   infers they are carrying something rather than seeing it.
3. In some layouts the mark shows one spot and the block lands somewhere else.
   The example given: a fursona page at `/137` under `me/edit`, where the mark
   appears at the bottom and the block lands under the next picture. **The
   landing is correct; the indication is wrong.**
4. While hovering a spot, that spot must change distinctively, so the landing
   is unmistakable before the pointer is released.

The goal is that **what is drawn is where it lands**, that only the landing is
drawn, and that the thing being carried is visible while it is carried.

## 2. What is actually wrong, per fault

### 2.1 Every candidate looks alike — a deliberate choice being reversed

`EditableBlockFrame` marks every valid palette target at once, and its own
comment says so on purpose:

> every place named in it gets the same outline `activeTarget`'s single "place"
> highlight already draws, rather than lighting up one at a time as the pointer
> happens to cross each candidate — a palette drop can land on any of them, and
> the whole point of this feature over the existing canvas-move highlight is
> that a person sees every valid target before choosing one.

**That ruling is superseded by this design**, by the owner's decision on
2026-09-07: mark only where it lands. It is recorded as a reversal rather than
quietly contradicted, because the argument it makes is a real one — a person
choosing among targets does benefit from seeing the set. What outweighed it is
that seeing the set costs the ability to see the choice, and the choice is what
a drop commits to.

Note the asymmetry this removes: the canvas-move path **already** marks one
target through `activeTarget`. Only the palette path lights everything. So this
change aligns the two rather than inventing a third behaviour.

### 2.2 Nothing follows the cursor

`DragOverlay` — dnd-kit's own floating layer — appears nowhere in the
repository. `useDraggable` hands back a `transform`, but no component renders a
carried preview, so there is nothing to see between picking a block up and
putting it down.

### 2.3 The mark lies, and only sometimes — this is the root fault

An insert target's path means **the splice index to insert BEFORE**. That is
`insertAt`'s own contract and `palette-targets.ts` states it plainly. So a
target of `[0, 2]` names **the gap above the block at index 2**.

What gets drawn for that target is `EditableBlockFrame` at `[0, 2]` — which is
**the block currently sitting at index 2**, the one that will be pushed down.

**A gap is being drawn as the block after it.**

Why it looks correct much of the time: at an **empty place** the gap and the
place coincide, so the mark is right by accident. Every filled position is
wrong, which is exactly the "some layouts" in the report. The bottom append
slot lighting up at the same time is the second half — both rectangles contain
the pointer, so the one visible mark a person notices is frequently not the one
that wins.

This is not a styling bug. **The palette path has no way to draw a gap.** It
only knows how to outline a place.

**The canvas path already knows how, which is the finding that reshapes the
work** (read 2026-09-08, after §4 was first written). `DropTarget` in
`block-drops.ts` already carries `before` / `after` / `place`, its own TSDoc
calls the first two "the insertion bar", and `EditableBlockFrame` already
draws them: `canvas-drop-before` and `canvas-drop-after`, an accent bar
`inset-x-0` at `top-0` or `bottom-0`, translated half its height so it sits ON
the boundary rather than inside either neighbour, `pointer-events-none`, and
gated on `isOver` so only the hovered one is drawn.

So a correct gap mark, drawn only for the winner, **exists and is in use** —
for canvas moves. The palette drag is the one that reuses none of it:
`InsertTarget` carries a bare `path` with no before/after at all, and
`isInsertTarget` collapses to the same `data-canvas-drop="place"` outline the
place highlight uses.

That changes what this design is. It is not "invent a way to draw a gap"; it
is **"give the palette the vocabulary the canvas path already has, then raise
both from a bar to a slot."**

## 3. Decision: two marks, because there are two meanings

| drag                  | mechanism   | what it does                                                    | what the landing IS      |
| --------------------- | ----------- | --------------------------------------------------------------- | ------------------------ |
| from the palette      | `insertAt`  | inserts, and everything after shifts                            | a **gap between** blocks |
| a block on the canvas | `moveBlock` | exchanges — move into an empty place, swap with an occupied one | a **place**              |

Drawing both as an outlined place is what makes the first one lie. Giving each
the mark that its own meaning earns removes the fault by construction rather
than by tuning a threshold.

## 4. Decision: the mark is a ghost slot, drawn out of flow

The landing is drawn as a **ghost of the block being carried, at the size it
will occupy**, at the gap or place that wins — and it is **absolutely
positioned, outside the document flow**.

Three options were weighed. The middle one is what was chosen, and the reason
the obvious one was refused is worth keeping.

**A — an insertion bar.** A bold accent bar drawn in the gap. Cheap, standard,
cannot drift. Refused as not distinctive enough for fault 4 — **and it is what
the canvas path already ships**, so "A" here means "extend the existing bar to
the palette and leave it at that". That is the honest fallback if C reads
badly, and it is a smaller step from C than it looks: both hang off the same
`before`/`after` target kind, and differ only in what is drawn once the gap is
known.

**B — the space genuinely parts.** The gap opens to the height of the carried
block and the rest of the page moves down. The most legible option, and
**refused on measurement rather than on taste.** dnd-kit caches every drop
target's rectangle when a drag begins. A page that reflows mid-drag leaves
those rectangles stale, so collision starts answering about where things _were_
— which is a fresh instance of the exact fault this design exists to remove.
Making it correct requires continuous re-measurement, whose cost lands on the
`canvas` CI job's throttled-phone budget and would have to be defended with a
number rather than waved through.

**C — a ghost slot drawn as an overlay. Chosen.** It reads as the space opening
while nothing actually moves, so no rectangle a drag depends on can go stale.
**Its cost is real and is accepted rather than hidden:** the ghost overlaps the
block below instead of pushing it, which can read as landing _on_ something
rather than _between_. That is the thing to look at first when this is
photographed, and the reason to keep A available as a fallback.

**Only the winner is drawn.** No other candidate is marked at all.

**The risk materialised — measured, not merely predicted (2026-09-11).**
Task 7's browser proof and Task 8's own photograph pass both drove a real
drag over a section of three real, titled leaves and looked at the result:
with genuine content in every neighbour, the `before` mark's dashed accent
box visibly straddles the boundary, its top half overlapping the bottom of
the block above and its bottom half overlapping the top of the block below,
with the floating drag preview sitting on top of both. It reads as landing
_on_ a block rather than cleanly _between_ two, exactly as this section
predicted before anything was built. This is recorded as the outcome rather
than fixed: the owner chose option C knowing this cost, it was named an
escalation rather than a defect above, and the fallback — option A, the
plain insertion bar the canvas path already draws — is already written
down for whoever decides the trade no longer holds. It is not, on its own,
a bug to patch quietly.

**The trade no longer holds, and this is the record of that reversal
(2026-09-13).** The owner reviewed the photographed cost above and chose
option A. `before`/`after` are drawn as a plain insertion bar now — full
width of the host, a fixed `h-1.5` thickness, `rounded-full`,
`bg-(--accent)`, still translated by half its own height so it sits ON the
boundary rather than inside either neighbour, still absolutely positioned
and `pointer-events-none` so nothing a drag measures moves mid-drag. A bar
has no interior, so it cannot read as landing ON a neighbour the way the
ghost did — it simply cannot overlap anything, because it draws nothing
between its own thin edges.

**This does not reopen the choice between B and C above, and does not touch
`place`.** The refusal of option B — a gap that genuinely parts, reflowing
the canvas — stands exactly as argued in this section: nothing a drag
measures may move mid-drag, whichever mark is drawn on top of it. `place`
still draws the ghost-of-the-carried-block described at the top of this
section, unchanged, because there the landing genuinely IS the place — an
empty positional slot, or the block a swap will exchange with — and filling
that box was always correct, never the cost this section is about. Only
`before`/`after`, the gap-between marks, move from C to A.

**The original reasoning above is kept, not deleted, because it is what the
next person reuses.** Option A was refused the first time as "not
distinctive enough for fault 4" — a person must see, unmistakably, which
spot is about to receive the block. That argument was weighed against
option C's own cost and C was chosen anyway, on the belief the ghost's
extra distinctiveness was worth the overlap it produced. What changed is
not the argument; it is the measured outcome once real content sat on both
sides of a real boundary — the overlap reads as landing ON a block, which is
the more damaging misread of the two, so the trade the first decision made
no longer holds. A thin, unmissable, full-width accent bar still answers
fault 4 on its own terms: it is louder than the page around it, and unlike
the ghost it cannot be mistaken for highlighting a neighbour, because it has
no area to share with one.

## 5. Decision: the carried block is visible

`DragOverlay` carries a compact preview — the palette thumbnail when adding,
and the block's own kind and name when moving one already on the page.

**The source block already dims** — `EditableBlockFrame` writes
`opacity: isDragging ? 0.5 : undefined` today — so half of fault 2 is
delivered and only the floating half is missing. Do not rewrite the dimming;
it works, and a change there would be churn wearing a fix's clothes.

Two standing house rules apply and neither is negotiable here:

- **The overlay is editor chrome, so it must be fully opaque.** What sits
  behind it is a colour the page's author chose, and they may choose any
  colour, so a translucent overlay has no guaranteed contrast and no
  measurement can give it one. It takes `--menu`, the one token declared opaque
  in both modes.
- **No Motion on the overlay.** dnd-kit already writes its transform, and two
  systems writing one CSS property is the cascade fight the feature note
  already forbids.

## 6. Decision: a swap says it is a swap

Dropping a block onto an occupied place **exchanges** the two — the block
already there returns to where the carried one came from. Nothing on screen
says so today, so a swap is indistinguishable from a drop that is about to
overwrite something.

Both ends are marked: the target place shows the incoming ghost, and the source
place shows the block that is coming back to it.

## 7. What must not be undone

- **No renderer in `blocks.tsx` grows an `editing` branch.** Every leaf and
  container stays the one thing that draws both a stranger's page and the
  editor canvas. Drag feedback is drawn by the editor's own wrappers, never by
  teaching a leaf that it is being edited.
- **Motion never renders on a dnd-kit node**, and the overlay is a dnd-kit
  node.
- **The overlay stays opaque.**
- **Nothing that a drag measures may move during a drag.** This is the whole
  argument for option C, and it is what a later "let us just animate the gap
  open" change would silently undo.

## 8. How this is proved

**The lying-mark fault is not reachable from a unit test.** It is a claim about
which rectangle a pointer is inside, so it needs a real browser. The proof is a
single comparison nothing currently makes: **drag to a spot, read where the
mark is, drop, and assert the block landed where the mark said.**

**The fixture has to use a FILLED mid-list position.** At an empty place the gap
and the place coincide, so a correct implementation and the current broken one
land identically and the case passes either way — root rule 27 exactly. An
empty place is worth a second case as a control, never as the discriminating
one.

The sabotage that must redden it: restore the mark to the block at the target
index rather than the gap above it.

## 9. Out of scope

- Reordering by keyboard, which already works and is unaffected.
- The exchange semantics themselves. `moveBlock` is untouched; this design
  changes what is DRAWN, never what a drop means.
- Drag-to-add's absence from anywhere but the palette.
- Any change to the public renderer.
