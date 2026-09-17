---
paths:
  - "apps/hub/src/**"
  - "apps/hub/tests/**/*.tsx"
---

# Editor and blocks

Loaded when hub source or a component test is read. Each line is the rule; the link is why.

- **A name three consecutive authors cannot define the same way twice has no mechanism — it has a meaning each of them filled in from context.** → `docs/lessons/rules/15-a-name-three-consecutive-authors-cannot-define-the-same-way.md`
- **A comment describing what ANOTHER file does is a claim nothing checks, and it shipped two broken headline features on one branch.** → `docs/lessons/rules/30-a-comment-describing-what-another-file-does-is-a-claim.md`
- **A Tailwind class that compiles to NOTHING is indistinguishable, in every test this repository has, from one that works.** → `docs/lessons/rules/36-a-tailwind-class-that-compiles-to-nothing-is.md`
- **A write path's looseness is usually justified by a CONTROL, and the justification is void the moment a paste box exists.** → `docs/lessons/rules/37-a-write-path-s-looseness-is-usually-justified-by-a-control.md`
- **A containment boundary enumerated BY HAND is only as good as its list, and nothing static can see the list is short.** → `docs/lessons/rules/39-a-containment-boundary-enumerated-by-hand-is-only-as-good-as.md`
- **What the block model CANNOT be pushed toward is written down, and it was found by trying.** → `docs/lessons/conventions/what-the-block-model-cannot-be-pushed-toward-is-written-down.md`
- **A window is corners chosen one at a time (2026-08-29).** → `docs/lessons/conventions/a-window-is-corners-chosen-one-at-a-time-2026-08-29.md`
- **The feature's account lives in HISTORY.md beside its note (2026-09-15).**
  The actors feature's dated account moved out of its `CLAUDE.md` into
  `apps/hub/src/features/actors/HISTORY.md`, a file under this rule's own
  `apps/hub/src/**` glob; every bullet above still holds, and the standing
  rules those history sections carried now live in
  `.claude/rules/editor-domain.md`, `editor-application.md` and
  `editor-presentation.md` rather than here.
- **Drop-target legibility (2026-09-07 → 09-16) is ruled in the layer files, not here.** The gap vocabulary `before`/`after`/`place`, the one-winner rule, the out-of-flow mark, the bar that replaced the gap ghost and the host-filling `place` mark that replaced the last ghost (2026-09-16 — no mark sizes itself from the carried block any more, and `carriedHeight` is gone from every interface) are bullets in `.claude/rules/editor-presentation.md` and `editor-domain.md`; the seven task accounts and the two reversals are the last sections of `apps/hub/src/features/actors/HISTORY.md`.
- **The one drag gap still open is a page taller than the viewport (2026-09-16).** dnd-kit measures droppable rectangles in viewport coordinates and auto-scrolls during a drag; `editor-canvas-scroll.spec.ts` proves the canvas scrolls and never drags while scrolled, and the tall-viewport suite that kept the question out of scope went on 2026-09-01. Closing it owes a browser case that drags on a scrolled canvas, at the level the fault would live. → `docs/superpowers/specs/2026-08-18-dragging-design.md`, "What is left undone" **2026-09-17: closed.** The case exists for both origins and the rectangles were never stale; what it found instead was the mark frozen at its entry edge, fixed the same day — `.claude/rules/editor-presentation.md`'s 2026-09-17 line.
