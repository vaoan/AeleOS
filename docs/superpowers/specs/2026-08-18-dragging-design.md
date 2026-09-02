# Dragging — rearranging a page that can already be built

**Status:** COMPLETE, 2026-08-18 — every phase shipped on `feat/dragging`, by
mouse and by keyboard, proved in a browser at the depth cap. Every trap below
was real, and each has a guard now with a sabotage behind it. Where a
measurement in this document turned out to be wrong, the paragraph says so
rather than being quietly corrected. What is still owed is at the end.
**Follows:** `2026-08-18-sections-of-spaces-design.md`, delivered in `#159`.

> **NARROWED 2026-09-01 by
> `2026-09-01-recursive-inspector-drill-down-design.md`. Read this banner
> before anything under it.**
>
> Everything below about what a move MEANS still holds: `moveBlock` is
> untouched, an exchange is still an exchange, an empty place still keeps its
> width, and the refusals still say what they said. What changed is which of
> those moves a person can still ASK for. The recursive inspector offers one
> scope at a time, so **only siblings visible in the current Items list may be
> dragged**; `moveSiblingBlock` and `siblingTarget` refuse everything else
> before `moveBlock` is consulted.
>
> So the cross-level gestures this document describes — carrying a leaf into
> another section, dropping a section on its own descendant, a drop one level
> past the cap — are unreachable by any input. They remain fully proved in
> `block-moves.test.ts` and `block-drag.test.ts`, because the model still
> admits them and the day the interface offers them again it must still be
> right.
>
> **`block-drag.spec.ts` is deleted**, and this document names it three times
> below. Its surviving half is `section-drag-reorder.spec.ts`'s pointer case,
> which is now the only place in the repository where `placeUnderPointer` meets
> a rectangle Chromium measured; that spec's header records where each deleted
> case went, and names the two — `onDragCancel` and the collapsed-card walk —
> that are left with unit coverage alone.

## Why this exists

A person can build a page: choose a section's shape, fill a place with content
or another section, pick a kind, edit, remove. What they cannot do is **move
anything**. Rearranging means removing and re-adding, which loses what was
typed and is miserable on a phone.

Dragging was deliberately deferred. Placement is how a page gets built;
dragging is how it gets _good_, and it carries the only genuine unknown left in
this design.

## 1. What a drag means in a model of places

This is the decision the phase turns on, and it is not the obvious one.

A section's children are **positional**: place three is place three whether or
not anything sits in it, and an empty place keeps its width. So the flow
semantics people expect from a list — insert here, everything after shifts down
— **would move the empty places somebody deliberately left.**

So:

- **Dropping onto an empty place moves the thing there.** Its old place becomes
  empty.
- **Dropping onto an occupied place swaps the two.** Nothing else moves.
- **Sections at the top level reorder by shifting**, because the page's own list
  has no empty places to disturb.

Swap rather than shift is the coherent choice inside a section, and it is
stated here because it is the part most likely to feel wrong in use. If it does,
the fix is a ruling in this document rather than a change to the model — the
positions are stored either way.

## 2. What must be draggable

- A **piece of content**, from any place to any other, including into a place in
  a different section and into a nested one.
- A **section**, both at the top level and nested inside a place.
- Into and out of nesting, to the depth cap of three. **Dragging a container
  into its own descendant must be refused**, not merely discouraged: the tree is
  stored as `jsonb` and a cycle is unrepresentable, so the guard belongs where
  the move is computed, before anything is written.

**Delivered, with one thing this section did not think of.** The guard is
checked in BOTH directions, because a drop is an exchange and an exchange moves
the target as well: dropping a block onto its own ANCESTOR is the same fault
mirrored, and it is the direction an implementation misses. Neither can hang,
which is worth knowing before writing the test — the writes are immutable, so
no reference cycle forms; what forms is a duplicated subtree that the other
half of the exchange then deletes. The symptom is a section silently lost, not
a stack overflow, so the case asserts the refusal rather than the absence of a
crash. And `moveBlock` ANSWERS all of this rather than throwing: a refused drop
is an ordinary outcome of dragging, and the caller turns the refusal into a
sentence somebody reads.

## 3. The library, already spiked

**`@hello-pangea/dnd` cannot do this**, and its own README says so twice: nested
lists work _"but you cannot drag items from the parent list into a child list"_,
and _"grid layouts are not supported"_. A grid of places is exactly what this is.

**`@dnd-kit/core` with `@dnd-kit/sortable`** replaces it. MIT, and the spike
quoted **17 kB against the incumbent's 31 kB** min+gzip — the migration is a net
reduction. `@atlaskit/pragmatic-drag-and-drop` is disqualified on keyboard: it
is HTML5 drag-and-drop with no keyboard drag at all.

**Delivered: the direction held and that pair did not.** Measured over an entry
importing exactly the symbols each library is used for, React external,
minified and gzipped: **13.9 kB against 28.5 kB**. So the reduction is real and
rather better than promised — but the numbers above were never ours, which is
why the phase was told to confirm them rather than to assume them. Quote the
measured pair.

### Three traps the spike recorded, each of which fails silently

- **Nesting is not a switch.** dnd-kit hands you the collision decision. With a
  nesting-naive collision function, `over.id` resolves to a _leaf inside_ the
  hovered container and the container reorder never fires — this happened on the
  spike's first run. **Depth three is not proven**: the working detector was
  two-level-specific, and generalising it is where the remaining unknown sits.

  **Delivered: it is proven, and by a mechanism rather than by a fixture.**
  Candidates rank by PATH LENGTH, because "innermost" and "longest path" are
  the same fact at any depth — so there is no branch on depth anywhere in
  `placeUnderPointer`, and nothing to generalise a second time if the cap ever
  moves. It is asserted on nested rectangles a unit test writes, and against
  rectangles Chromium measured, at the deepest seat the schema admits.

- **Four props you must not drop.** Omit `{...listeners}` or `setNodeRef` and
  the drag is dead by mouse _and_ keyboard, with no error. **A mocked test hides
  this identically**, because the mock supplies what the real hook would have
  and so cannot observe whether the component passed it on. Omitting
  `{...attributes}` kills only the keyboard, and only on a non-focusable handle.

  **Delivered: every grip comes from one component**, `BlockSlot`, so there is
  a single place to drop a prop from rather than one per card. The guard is
  `block-slot.test.tsx`, driving the real hook inside a real `DndContext`, and
  it keeps a deliberately unwired grip beside the wired one as a permanent
  control — a suite whose negative case cannot fail proves nothing about its
  positive one. Dropping `listeners` was watched red by keyboard there and by
  MOUSE in a browser, where a dead grip looks like an `aria-live` region that
  is present, correct and empty.

- **A hydration mismatch invisible in production.** dnd-kit's id generator is a
  module-level counter rather than React's `useId`, so two server renders in one
  warm process emit different ids and every request after the first hydrates
  mismatched. `<DndContext id={useId()}>` fixes it; forgetting it fails quietly.

  **Delivered, and the mechanism is asserted rather than trusted.**
  `useUniqueId(prefix, value)` answers the value it is given, so a grip's
  `aria-describedby` is the context id verbatim; the test pins it for a context
  named by hand, which would read `DndDescribedBy-<n>` off the counter if the
  prop were dropped. Both contexts in the app — the editor's and the fursona
  list's — carry it.

## 4. Keyboard is not optional

The current implementation supports keyboard lift, move and drop, and **two
end-to-end specs prove it**. Those specs are **ported, not dropped** — their
announcement selectors re-derived from dnd-kit's own output.

This matters beyond principle: a drag handle in this repo was once dead by
mouse _and_ keyboard from the commit that introduced it, and survived because
the only test covering it mocked the library away and counted buttons.

**Delivered, and the emphasis turned out to be backwards.** Keyboard was so
much the reliable path in Playwright that it became the ONLY browser proof for
a while — and the keyboard branch of the collision never calls
`placeUnderPointer` at all, so the geometry the whole phase turns on had met no
rectangle a browser produced. The correction is `block-drag.spec.ts`, which
asserts the collision's own highlight before it releases. Keyboard is not
optional; it is also not a proof of the pointer, and a sentence saying "proved
in a browser" hid that for a phase.

**"Every case by both gestures" is not what that spec does, and saying so was
an overclaim.** Four of its cases run inside the gesture loop — the swap, the
move in and out of a nested place, the section reorder, and the refusal one
level past the depth cap.
The rest are single-gesture BY DESIGN: the cycle refusal and the plane rule
have no keyboard gesture that expresses them, because the walk never offers
those targets; the descendant-exclusion case IS the keyboard proof of that;
and the save-and-reload drags by pointer because a second gesture would only
repeat the drag, not the save.

## What this does not change

- **The model.** Spaces, positions, the depth cap, and what a place may hold are
  all settled. A drag is a rearrangement of stored positions and nothing else.
- **The refusals.** No server-side fetch, no pasted markup, no file hosting.
- **The preview.** It stays the real renderer on the tree the save will send.

## Phasing

1. **The move itself — DONE.** Computing a new tree from a drag, with the cycle
   guard and the swap-versus-shift rules, as pure functions with no UI.
2. **`@dnd-kit` — DONE.** The migration, in the editor and in the fursona list
   both, the collision function that resolves to the right target at depth, and
   the ported keyboard specs.
3. **Proof in a browser — DONE.** Dragging content between places, into a
   nested section, and out again, by mouse and by keyboard, at the depth cap,
   with a save and a reload at the end of it.

Phase 1 is where the semantics live and can be settled without any drag at all.
Phase 2 carried the unknown, and it turned out to be smaller than feared: the
detector generalised by being rewritten to rank rather than to branch, and
nothing about depth three needed special handling. What cost the time instead
was a flake nobody had budgeted for, in the keyboard sensor's own attach — rule
26 in the root `CLAUDE.md`.

## What is left undone

Named here rather than left to be rediscovered, because each fails quietly or
not at all.

- **`DragOverlay` is not used**, so a dragged block translates in place rather
  than being lifted out of the layout. It is fine at these sizes and it will
  feel heavy the first time somebody drags a wide section down a long page.
- **Nothing measures what a drag costs.** No budget anywhere covers a lift, a
  move or a drop, so the `canvas` job is green on a narrower subject than
  dragging. (This bullet also said that spec's dial half was still
  `test.fixme`. It is not, and was not when this was written — the editor port
  restored it and both halves run; there is no `test.fixme` in the file.)
- **No case models a long editing session.** Almost every browser case drags
  once into a freshly loaded page; the save case and the nested in-and-out case
  drag twice, the latter for both gestures. A page reshaped by drag after drag
  after drag, on one page load, with the library's measurements going stale
  under it, is covered by nothing. That is the shape a real hour of arranging
  has, and it is where a stale-rectangle fault would live.
- **Nothing drags on a page longer than the viewport.** dnd-kit measures a
  droppable's rectangle in VIEWPORT coordinates, and it auto-scrolls during a
  drag — so a long page moves the document under rectangles measured before it
  moved. `block-drag.spec.ts` chooses a 2600px-tall viewport precisely so that
  nothing scrolls, which keeps that question out of the suite rather than
  answering it.
