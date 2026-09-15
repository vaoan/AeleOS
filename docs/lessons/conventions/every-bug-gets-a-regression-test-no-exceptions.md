# Every bug gets a regression test. No exceptions.

- **Every bug gets a regression test. No exceptions.** Finding the cause is half
  the work; the other half is a test that fails on the unfixed code. Write it
  before the fix where you can, and **sabotage-verify it against the original
  fault** either way — a regression test that never reproduced the bug is a
  guess about it.

  The test belongs at the level the bug actually lived at, which is rarely
  where it was noticed. `/pages` (then `/fursonas`) once threw for every signed-in visitor
  because `nuqs` shipped without its adapter, and the signed-in error boundary
  reported that as "we could not load your identity" — a message about the
  database, which was never involved. The regression test is not a nicer error
  page. It is `app-providers.test.tsx`, the one suite that does **not** mock
  `nuqs`, because every other suite mocked away the very thing that was
  missing.

  That is the lesson worth carrying: **a mocked dependency hides its own setup
  requirements.** When a bug turns out to be wiring a mock stood in for, the
  regression test has to use the real thing, and it will usually be the only
  test that does.

  **A second instance, 2026-08-16.** A section's drag handle had never worked —
  not by mouse, not by keyboard — since it was first written in commit
  `fa9d3dc`. `@hello-pangea/dnd` refuses to start a drag whose source event
  targets a tag it treats as interactive; the handle is a `<button>`; nothing
  set `disableInteractiveElementBlocking` on its `Draggable`. Lifting a
  section did nothing at all, silently, for every input method. It survived
  because the flat section editor's only coverage — `section-editor.test.tsx`,
  deleted along with that editor when the block editor replaced it — mocked
  `@hello-pangea/dnd` entirely and counted buttons by `aria-label`, wiring
  that passes whether or not a lift ever begins. The guard is now
  `tests/e2e/section-drag-reorder.spec.ts`, which drives a real drag by
  keyboard and is sabotage-verified against the original fault: removing the
  prop leaves the library's own `aria-live` announcement empty, because the
  lift never starts. Same lesson, same shape: the suite that mocked the
  dependency away is the one that could not have caught this, and the one
  that used the real thing did on its first run.

  The fix landed first in the flat editor's own card alone, and this note
  recorded `fursona-list.tsx` as still carrying the identical fault rather than
  leaving the next person to rediscover it. **It was then fixed in `#154`.**

  **The prop is gone, and the LESSON is not, which is why this note now says
  where the guard moved rather than which line sets it.** `@hello-pangea/dnd`
  is no longer a dependency — see the dragging bullet below — and dnd-kit has
  no interactive-tag rule at all: a grip is whatever element carries
  `listeners`. So the original fault cannot recur in that form, and the one
  that replaces it is the same shape with a different cause — a grip that
  renders, looks right, and was never handed the four things `useDraggable`
  returns. `block-slot.test.tsx` is where that is caught now, driving the real
  hook inside a real `DndContext` and carrying a deliberately unwired grip
  beside it as a permanent control, because a suite where the negative case
  cannot fail is a suite that proves nothing about the positive one.

  Which makes this note's own history the smaller lesson beside the bug's: it
  went on asserting an open fault for a day after that fault was closed, and
  was believed, because a sentence naming a file and a line reads like a
  measurement. **A note recording something as unfixed has to be deleted by
  whoever fixes it**, or it becomes the confident, wrong instruction this file
  warns about everywhere else.
