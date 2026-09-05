# Carrd-style page builder — Phase 4: drop semantics completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on Phases 1–3.** One branch (`carrd-style-builder`), one PR
> (#67), seven sequential phases. Spec:
> `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`,
> "Drop semantics" and "Proof" sections.

**Goal:** Audit the checkpoint's `domain/block-drops.ts` and `domain/block-drag.ts` against the spec's full drop-semantics table and proof checklist, and close only the gaps found — this phase does not replan what Phase 1's own reading already confirmed is correct and tested.

**Architecture:** No new files unless a genuine gap is found. This is a verification pass with test-writing where verification finds a hole, following the same discipline root `CLAUDE.md` rule 27 requires of every fixture in this codebase: for each row of the spec's table, name the wrong behavior a correct implementation must be distinguishable from, and confirm an existing test (or a new one written in this phase) actually can tell them apart.

**Tech Stack:** TypeScript, Vitest (domain-level tests only — this phase's proof obligations are unit-level; Phase 7 owns the browser-level proof for the same table).

## Global Constraints

- Every new test is sabotage-verified (name the mutation, confirm red, confirm restored-green).
- Never `git checkout --` as a sabotage restore.
- 100% branch coverage.
- If a row of the spec's table is already correct and tested, say so explicitly in this phase's own commit messages, citing the exact existing test — do not add a redundant test "to be safe."

---

## Task 1: Build the audit table and check each row against the actual code

**Files:** none changed yet — this task is read-only and produces a checklist consumed by Task 2.

- [ ] **Step 1: Re-read `block-drops.ts` and `block-drag.ts` in full** (both already read once during this plan's own drafting — re-read them now for however Phases 1–3 may have changed them, e.g. Phase 1's `too many` fix, Phase 3's `cloneAt` reuse of `reach`/`fitsAt`).

- [ ] **Step 2: For each row below, find the exact existing test that proves it, or mark it a gap**

| Spec row                                                                               | Mechanism in code                                                                                                                                                                                                                                                                                           | Existing test (name it) or GAP |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Page, `stack`, `list`, `timeline` → before/after a sibling                             | `LINEAR_MODES`, `applyLinearDrop`                                                                                                                                                                                                                                                                           |                                |
| `grid`/`masonry`/`carousel`/`tabs`/`accordion` → a place, empty=move/occupied=swap     | `applyDrop`'s `place` branch → `moveBlock`                                                                                                                                                                                                                                                                  |                                |
| Across containers, linear or positional destination, depth/cycle permitting            | `applyLinearDrop`'s cross-parent branch (`taken`/`parent`/`nextIndex` adjustment)                                                                                                                                                                                                                           |                                |
| Leaving a linear list splices the source out                                           | `removeAt` call in `applyLinearDrop`'s `!sameParent` branch                                                                                                                                                                                                                                                 |                                |
| Leaving a positional place clears it and keeps the hole                                | `clearAt` call in the same branch                                                                                                                                                                                                                                                                           |                                |
| Refusal: no such place                                                                 | `placeExists` checks                                                                                                                                                                                                                                                                                        |                                |
| Refusal: into itself                                                                   | `isInside` checks (both directions — check both are exercised)                                                                                                                                                                                                                                              |                                |
| Refusal: too deep                                                                      | `fitsAt`                                                                                                                                                                                                                                                                                                    |                                |
| Refusal: too many (`BLOCK_LIMITS.children`)                                            | Phase 1 Task 5a's test, plus the same-parent case (does one exist for insert-and-shift within the SAME parent overflowing? — same-parent insert never grows the list, so "too many" cannot occur there; confirm this is true rather than assumed, since `sameParent` returns early before any length check) |                                |
| A drop landing where the block already is succeeds, returns the same array by identity | The `sameParent && (fromIndex === insert \|\| fromIndex + 1 === insert)` branch                                                                                                                                                                                                                             |                                |
| Returned destination path is part of every success                                     | Every `BlockDrop` success case's own `path` field                                                                                                                                                                                                                                                           |                                |

- [ ] **Step 3: For each spec Proof-section bullet, find the exact existing test or mark it a gap**:
  - Fixtures that would make linear-insert and positional-swap identical if adjacent (root `CLAUDE.md` rule 27's own named trap).
  - Cross-container.
  - Cycles (both directions — dropping onto an ancestor, and the ancestor being the thing carried).
  - Depth.
  - Stale targets (a path that no longer exists by the time the drop lands).
  - No-ops (identity-preserving).
  - Returned destination path.
  - Sabotage insertion-into-swap and vice versa (does a test exist that would catch `applyLinearDrop` being called where `moveBlock` should have been, or the reverse?).

- [ ] **Step 4: Write the completed table into this task's own commit message** (not a new file — this plan already carries the audit; duplicating it elsewhere is a second place for it to go stale).

---

## Task 2: Close whichever rows Task 1 marked GAP

This task's step count depends on Task 1's findings. For each gap:

- [ ] Write the failing test naming the exact row/bullet it closes.
- [ ] Run it to verify it fails against the CURRENT code (if it passes immediately, the row was not actually a gap — correct Task 1's table and skip to the next gap rather than inventing a fix for something that already works).
- [ ] If it genuinely fails, implement the minimal fix in `block-drops.ts`/`block-drag.ts`.
- [ ] Run it to verify it passes.
- [ ] Sabotage-verify: state the exact mutation, confirm red, confirm restored-green.
- [ ] Commit each closed gap separately, one commit per row, so a reviewer can see exactly which spec row each commit closes.

---

## Task 3: Full local verification

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS
pnpm --filter hub test:coverage
pnpm check:docs
```

Expected: PASS, 100% coverage on every file this phase touched.
