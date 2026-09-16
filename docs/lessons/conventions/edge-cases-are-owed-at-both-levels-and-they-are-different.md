# Edge cases are owed at BOTH levels, and they are different questions at each.

- **Edge cases are owed at BOTH levels, and they are different questions at
  each.** Happy path plus failure modes is the floor, not the bar.

  A unit test's edges are the boundaries of a **value**: empty, one, many, the
  cap, one past the cap, absent against explicitly-default, the first position
  and the last, the palindrome that hides a reversal, the list whose last entry
  equals the constant you would pad with.

  An end-to-end test's edges are the boundaries of a **situation**: the
  narrowest viewport, the longest string in the longest language, the deepest
  nesting the model allows, the fullest page, the cold cache, the second drag
  in a suite where the first one's announcement is still on screen.

  **Neither level covers for the other, and that is measured rather than
  argued.** On 2026-08-27 an eyebrow added to the leaf editor's header row
  displaced a 204px `select` — as wide as `Reproductor de música`, its longest
  option in Spanish, which is this app's FALLBACK language — and pushed the
  editor 71px past a 320px viewport. 3023 unit tests at 100% branch coverage,
  `lint`, `typecheck` and `check:tools` were all green; `responsive.spec.ts` at
  portrait 320 was the only thing in the repository that failed, because "how
  wide is this control, in the longest language, on the smallest phone" is not
  a question any unit test has an opinion about. The converse holds just as
  hard: no browser case will tell you what `moveBlock` does at the depth cap,
  and `block-moves.test.ts` is where that lives.

  The practical form: when you add anything to a row that already holds a
  `select`, the select is as wide as its longest option **in Spanish**, and the
  row has no slack you have not measured.

  **An edge case still has to discriminate.** Rule 27 is at its sharpest here —
  the middle of a range is exactly where a right answer and a wrong one land on
  the same pixel, and the edge is where they part. So name the wrong behaviour
  the case excludes and ask whether this edge can tell it from the right one.
  If it cannot, that is a case to rewrite, not one to count.
