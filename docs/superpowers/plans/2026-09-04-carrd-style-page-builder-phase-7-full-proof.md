# Carrd-style page builder — Phase 7: full proof and merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on Phases 1–6, all landed on `carrd-style-builder`.** This is
> the final phase — its last task is opening PR #67 for real review and
> merge. Spec: `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`,
> "Proof" section (browser bullet) and root `CLAUDE.md`'s "Picture proof
> on the PR is part of the work" section.

**Goal:** Prove the finished builder end to end in a real browser — pointer drag, touch-grip drag, keyboard drag, insertion bars, grid swaps, Preview fidelity, the 320px sheet, save-error visibility — run a real accessibility scan of the new Properties panel and compact menu, sweep breakpoint-straddling widths, and post picture proof to the PR before it is merged.

**Architecture:** No new application code is expected in this phase except whatever the browser suite and axe scan turn up as real defects — and per this repository's own track record (root `CLAUDE.md` rule 19, and every prior a11y-scan account in the actors `CLAUDE.md`), expect real defects, do not assume a clean pass and treat any red result as a genuine bug to fix rather than a false positive to explain away.

**Tech Stack:** Playwright (`chromium` project), `@axe-core/playwright`, `gh` CLI with a private gist for image hosting (root `CLAUDE.md`'s documented mechanism — `gh pr comment` cannot attach a file directly).

## Global Constraints

- `.secrets` must be sourced in the same shell invocation as any `pnpm test:e2e` command (root `CLAUDE.md` operational trap #1).
- Zero tolerance for flakiness (root `CLAUDE.md` rule 33) — a test that fails intermittently is a defect report about the mechanism, not the test; find the real cause before considering any fix.
- Never `git checkout --` as a sabotage restore.
- Photograph the branch, never `main` by accident — unset `PLAYWRIGHT_BASE_URL` or point it at a preview of this exact branch before taking any picture-proof screenshot (root `CLAUDE.md`'s own warning, verbatim).
- Read every picture back for what else is in frame, not only for the claim it was taken to prove (root `CLAUDE.md`'s "Then READ the pictures back" rule) — this is a distinct step in Task 4 below, not implied by taking the screenshot.
- One agent, this working tree, in order — and confirm via `gh pr list --state open` that no other PR is mid-merge before this phase's final push, per root `CLAUDE.md`'s in-place-migration ordering rule, in case any of the prior six phases hand-applied a migration (none of the seven phases in this plan should have touched `supabase/migrations/`; confirm that is still true before this phase's Task 5).

---

## Task 1: Browser suite — the spec's Proof-section bullet, in full

**Files:**

- Create or extend: `apps/hub/tests/e2e/carrd-style-builder.spec.ts` (confirm this does not collide with whatever filename Phase 5 Task 4's canvas-width proof and Phase 5 Task 1/2's drag-gap-closing tests already created — extend those files if they already cover part of this list, rather than duplicating coverage across two files)

Cover, each as its own named test case:

- [ ] Pointer drag: lift a block by mouse press on the canvas, drop it before/after a sibling in a linear container, assert the new order via DOM position (matching this repo's own "its new position in the DOM" assertion idiom from the retired `section-drag-reorder.spec.ts`, per root `CLAUDE.md` rule 27's discrimination discipline — assert something that would differ under a wrong implementation, not merely that a drop event fired).
- [ ] Touch-grip drag: same, but lifting via the selected block's own grip button with a touch-shaped pointer event (`pointerType: "touch"`), confirming a bare touch press elsewhere on the block does NOT start a drag (the scroll-preservation guarantee).
- [ ] Keyboard drag: select a block, use its grip, arrow to a new position, space to drop — through `tests/e2e/support/drag.ts`'s existing rAF-then-timer helper (root `CLAUDE.md` rule 26), never a raw `keydown` dispatch with no yield.
- [ ] Insertion bar: during a linear drag, assert the `canvas-drop-before`/`canvas-drop-after` element is visible and positioned adjacent to the hovered sibling (a geometry assertion, not merely presence).
- [ ] Grid swap: drag one grid cell onto an occupied one, assert both cells' contents exchanged.
- [ ] Preview fidelity: with a page carrying at least one of every container mode, compare the editor's Preview (hide-controls) rendering against the same page's real public route, at the same viewport, the same way `editor-is-the-page.spec.ts` already does (reuse that spec's own box+pixel comparison method rather than inventing a third).
- [ ] 320px sheet: at a 320px viewport, select a block, confirm the Properties panel's bottom sheet does not obscure content the spec's own Layout section requires stay reachable, and confirm Phase 5 Task 3's scroll-into-view actually delivers the selected block above the sheet at this exact width (not merely at some wider width where it happens to work).
- [ ] Save-error visibility: trigger a save refusal (e.g. attempt to delete the last required-kind block, per the existing required-kind-refusal mechanism) and confirm the refusal banner is not occluded by the now-right-docked Properties panel — this is a direct re-check of the exact occlusion fault root `CLAUDE.md` already documents once for the left-docked panel; Phase 3 Task 3 moved the padding, but this task is what proves the banner itself was re-tested against the NEW geometry rather than merely assumed safe by analogy.

For each case: write it failing-or-passing-honestly first (some of these describe mechanisms Phases 1–6 should have already made correct — if a case passes on the first run, that is expected and fine; the goal here is coverage of the spec's own proof checklist, not manufactured failures), then sabotage-verify at least the geometry-based assertions (insertion bar position, Preview fidelity, save-error visibility) by naming the exact CSS/logic change that would break each and confirming the test catches it.

- [ ] **Step: run the whole new/extended spec file**

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS/apps/hub
set -a && . ./.secrets && set +a
pnpm test:e2e --grep "carrd-style-builder"
```

- [ ] **Commit.**

---

## Task 2: Accessibility scan of the new surfaces

**Files:**

- Extend: `apps/hub/tests/e2e/a11y.spec.ts` (the existing suite, per its own established pattern of one case per newly-reachable state — see the actors `CLAUDE.md`'s account of the page-source dock's own axe cases for the exact idiom to follow)

- [ ] **Step 1: Add a case scanning the Properties panel open on a leaf selection, on a container selection, and on Page selection** (three states, three axe runs — a leaf's Content+Appearance tabs may reach different controls than a container's Layout+Appearance, and Page's Theme tab mounts `ThemeConfigurator`, which may have its own reachable-but-unscanned controls now that it lives inside a panel tab rather than wherever it was mounted before this plan's Phase 3).

- [ ] **Step 2: Add a case scanning the compact menu's More disclosure open.**

- [ ] **Step 3: Add a case scanning the Add picker open from the toolbar** (this dialog already has its own axe coverage per the actors `CLAUDE.md`'s account of `add-block-picker.tsx`'s `inert`/nested-interactive fixes — confirm that existing coverage still runs against the RELOCATED single toolbar mount, not against a now-deleted per-scope mount).

- [ ] **Step 4: Run the scan**

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS/apps/hub
set -a && . ./.secrets && set +a
pnpm test:e2e --grep "a11y"
```

- [ ] **Step 5: For every violation reported, fix it — do not adjust the axe tag set or add an exemption without the same justification discipline root `CLAUDE.md` already requires** (its own account of `heading-order`/`scope-attr-valid`/`empty-table-header` being deliberately excluded, each for a stated, checked reason — read that reasoning before excluding anything new, and if a genuinely new exemption is warranted, write down why in the same shape).

- [ ] **Step 6: Re-run until clean. Commit each fix separately if more than one violation is found**, so a reviewer can see which fix addressed which finding.

---

## Task 3: Responsive sweep

**Files:**

- Extend: `apps/hub/tests/e2e/responsive.spec.ts`

- [ ] **Step 1: Identify every NEW breakpoint this plan's phases introduced** — Phase 3's panel moving to the right (does this shift the point at which the panel's own `md:` layout switch happens relative to the toolbar's existing wrap point at ~640px, per root `CLAUDE.md` rule 38's own account of a 673px-vs-640px band?), Phase 5's mobile-canvas-width control (interacting with the toolbar row's own wrap behavior — does adding one more control to that row reopen the exact "a control added to an already-full row" fault rule 38 already documents once?).

- [ ] **Step 2: For each, sweep widths straddling it** — per root `CLAUDE.md` rule 38's own instruction, not round numbers: check immediately below, at, and immediately above each new or shifted breakpoint, in addition to the standing 320/375/768/1280 sweep this file already runs.

- [ ] **Step 3: Fix anything found. Sabotage-verify the new sweep cases** by reverting whichever fix Step 3 required and confirming the case catches it, then restore.

- [ ] **Step 4: Run the full file**

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS/apps/hub
set -a && . ./.secrets && set +a
pnpm test:e2e --grep "responsive"
```

- [ ] **Step 5: Commit.**

---

## Task 4: Full CI parity check and picture proof

- [ ] **Step 1: Run everything CI runs, locally, from repo root**

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS
pnpm lint
pnpm typecheck
pnpm check:docs
pnpm check:agent-notes
pnpm check:tools
pnpm --filter hub test:coverage
pnpm --filter hub build
set -a && . ./.secrets && set +a
pnpm --filter hub test:e2e
```

Expected: every command exits 0.

- [ ] **Step 2: Push and confirm every required check is green on the real PR**

```bash
git push origin carrd-style-builder
set -a && . ./.secrets && set +a && export GH_TOKEN="$GH_TOKEN"
gh pr view 67 --json statusCheckRollup --jq '.statusCheckRollup[] | {name, conclusion, status}'
```

Poll every ~90 seconds rather than sleep-looping faster than the run needs. Do not proceed to Step 3 until `conformance`, `hub`, `idp-cloud`, `e2e`, `schema-drift`, and `canvas` all report `SUCCESS`.

- [ ] **Step 3: Take picture proof, against THIS branch, never `main`**

Confirm `PLAYWRIGHT_BASE_URL` is unset or points at a preview deployment of `carrd-style-builder` specifically:

```bash
echo "$PLAYWRIGHT_BASE_URL"
```

Photograph, at minimum: the compact menu (desktop, all its controls visible), the Properties panel open on each of the three selection kinds (leaf/container/Page), the canvas-width control toggled to mobile showing a genuinely collapsed grid, a pointer drag mid-flight showing the insertion bar or place highlight, and the 320px bottom sheet. Use Playwright's own screenshot capability inside a throwaway script or spec (temporary — per root `CLAUDE.md`'s convention, delete any `shot-*.png` files and temporary specs before the PR comment goes up; do not commit them).

- [ ] **Step 4: Read every picture back before posting** — for each screenshot, name what it proves AND separately name anything else visible in the frame that looks wrong (an overlapping control, clipped text, a raw i18n key, a colour that did not apply). This is root `CLAUDE.md`'s own explicit two-pass rule; do not merge the two questions into one glance.

- [ ] **Step 5: Host the images and comment on the PR**, following root `CLAUDE.md`'s exact documented mechanism (a private gist, not `gh pr comment` alone, which cannot attach files):

```bash
set -a && . ./.secrets && set +a && export GH_TOKEN="$GH_TOKEN"
gh api gists -X POST -f 'description=PR #67 picture proof' -F 'public=false' \
  -f 'files[README.md][content]=placeholder'
# clone the gist's own git_push_url from the response, copy the PNGs in,
# commit, push, then reference the raw.githubusercontent.com URLs in the
# PR comment body.
```

Confirm `gh api user` reports the expected identity before pushing to the gist — never a different account, never a browser-session drag-drop.

- [ ] **Step 6: Post the comment**

```bash
gh pr comment 67 --body "$(cat <<'EOF'
## Picture proof — Carrd-style builder, complete

[captions and gist raw URLs for each screenshot from Step 3, one per line]
EOF
)"
```

- [ ] **Step 7: Mark the PR ready for review** (it is currently a draft)

```bash
gh pr ready 67
```

- [ ] **Step 8: Do not merge it yourself.** Per this repository's own git-safety convention, merging is the user's call — report back that all six required checks are green, picture proof is posted, and the PR is marked ready, and wait for the user's explicit instruction before running `gh pr merge` or approving any auto-merge.
