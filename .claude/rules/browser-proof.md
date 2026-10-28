---
paths:
  - "apps/hub/tests/e2e/**"
  - "apps/hub/playwright.config.ts"
  - "apps/hub/.env.example"
---

# Browser proof

Loaded when a Playwright spec or its config is read. Each line is the rule; the link is why.

- **Never diagnose a browser failure against a server older than the code.** → `docs/lessons/rules/12-never-diagnose-a-browser-failure-against-a-server-older-than.md`
- **An event you can OBSERVE is not proof that the thing which acts on it is listening yet.** → `docs/lessons/rules/26-an-event-you-can-observe-is-not-proof-that-the-thing-which.md`
- **A SKIPPED test reports green, and a suite that skips most of itself when a secret is absent is the easiest way in this repository to believe work is verified when it is not.** → `docs/lessons/rules/31-a-skipped-test-reports-green-and-a-suite-that-skips-most-of.md`
- **A responsive fault can live in a BAND a few dozen pixels wide, and the band starts at whichever breakpoint you just used.** → `docs/lessons/rules/38-a-responsive-fault-can-live-in-a-band-a-few-dozen-pixels.md`
- **A NETWORK failure is not a flaky test, and telling them apart decides whether retrying is discipline or its opposite.** → `docs/lessons/rules/41-a-network-failure-is-not-a-flaky-test-and-telling-them-apart.md`
- **A completely ABSENT `apps/hub/.env.local` fails silently rather than loudly, and the resulting error is unrecognizable as a config problem.** → `docs/lessons/rules/43-a-completely-absent-apps-hub-env-local-fails-silently-rather.md`
- **Picture proof on the PR is part of the work, not a follow-up.** → `docs/lessons/conventions/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`
- **A mark-versus-landing case reads BOTH the mark's box and the landed block for the SAME drag** (`drop-mark-matches-landing.spec.ts`, 2026-09-11), at a filled mid-list position — at an empty place a gap and a place coincide and the case could not tell a mark drawn on the space from one drawn on the block. Its boundary-straddle assertion compares against HALF the mark's own height, so it held unchanged when the gap mark became a 6px bar (2026-09-13). → `apps/hub/src/features/actors/HISTORY.md`, section "The branch closes: one gap vocabulary, out of flow, one winner (2026-09-11) — Task 8 of drop-target-legibility"
- **A drag on a scrolled canvas is proved by `drag-on-a-scrolled-canvas.spec.ts` (2026-09-17), and its fixture carries three traps.** The canvas's centre can sit in the GAP between two sections once a palette lift reserves append-slot height, under nothing with a canvas path; dnd-kit auto-scrolls while the pointer is within 20% of the port's height from either edge, so the target is chosen inside the middle 60% and the settled offset is asserted unchanged after the hover; a leaf onto a leaf in a `stack` is a `before`/`after` insertion, not a `place` swap. The discriminating target is one that was wholly below the fold at the lift. The mark-versus-landing spec now also covers a canvas move across ONE block's midline — two hovers inside the same block, never a direct arrival — which is the gesture that found the frozen-edge fault. → `apps/hub/src/features/actors/HISTORY.md`, section "The mark follows the pointer across a block's midline (2026-09-17) — found by proving the scrolled canvas"
