# Carrd-style page builder — Phase 2: compact builder menu + unified Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on Phase 1** (`2026-09-04-carrd-style-page-builder-phase-1-checkpoint-blockers.md`)
> landing first on this same branch — this phase's tasks assume `blocks.tsx`
> no longer imports `editable-block-frame.tsx` and canvas drag ids already
> reach announcements. One branch (`carrd-style-builder`), one PR (#67),
> seven sequential phases. Spec:
> `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`
> (its Interaction section: "Compact menu: Add, desktop/mobile canvas
> width, Preview, Save, More").

**Goal:** Replace the current toolbar (whatever Save/Preview/Hide-controls/Cancel row exists today) with the spec's compact menu, and reduce the editor's three separate `AddBlockPicker` mount points (page-level, container footer, per-empty-place) to the spec's single global Add that targets whatever is currently selected.

**Architecture:** `AddBlockPicker` itself (`presentation/add-block-picker.tsx`) is already exactly what the spec asks for — one control drawing every option with the real renderer over real sample content, gated on `mayAddLayout`/`atBlockLimit`. Nothing about that component changes. What changes is _where it is mounted_: instead of the Items-scope-driven mounts `inspector-items.tsx`/`block-editor.tsx`'s `ItemsFooter`/the page-level `addPalette` each build today, `EditorToolbar` grows one `AddBlockPicker` slot whose `targetPath`/`kinds`/`mayAddLayout` are computed from the current `EditorSelection` by a new pure function, `addTargetFor`.

**Tech Stack:** Next.js hub, React 19, `@dnd-kit` (unaffected by this phase), Tailwind v4, Vitest + Testing Library, Playwright.

## Global Constraints

- `CHROME_SCOPE` on every new toolbar control (root `CLAUDE.md`'s workbench-opacity rule; `--menu` for anything painting a background behind text, matching `AddBlockPicker`'s own dialog).
- No x/y coordinates, ever. This phase adds no layout mechanism, so this constraint is inherited rather than newly relevant — noted because Phase 5 (canvas width) is not yet built and must not be anticipated here.
- Every export carries contract-stating TSDoc; `pnpm check:docs` enforces it.
- Every new/changed behavior gets a sabotage-verified test.
- `pnpm lint` from repo root only.
- One agent, this working tree, this phase's tasks in order.

---

## Task 1: `addTargetFor` — one selection, one Add target

**Files:**

- Create: `apps/hub/src/features/actors/domain/add-target.ts`
- Test: `apps/hub/tests/add-target.test.ts`

**Interfaces:**

- Consumes: `EditorSelection`, `BlockPath` from `@/features/actors/domain/editor-selection` / `@/features/actors/domain/block-edits`; `Block`, `isContainer`, `LeafKind`, `ContainerMode`, `mayNest` from `@/features/actors/domain/block-schema` (confirm the exact export name for the nesting check — grep `export function mayNest` before writing this; if it lives in `block-edits.ts` instead, import from there); `offerableLeafKinds` from wherever `block-editor.tsx` currently imports it for its own `kinds` computation (grep `offerableLeafKinds` to find the real module).
- Produces: `addTargetFor(blocks, selection, actorKind): AddTarget`, where:
  ```ts
  export interface AddTarget {
    readonly targetPath: BlockPath;
    readonly mayAddLayout: boolean;
  }
  ```
  Phase 2 Task 2 consumes this directly. No other phase depends on its shape, so it may be extended later without a cross-phase signature commitment.

Read `block-editor.tsx`'s existing `addAt`/`addOnPage` functions and the surrounding code that computes `mayAddLayout`/`kinds`/`atBlockLimit` for each of the three current `AddBlockPicker` mounts (page-level, container footer inside `inspector-items.tsx` or wherever `ItemsFooter` lives, and per-empty-place) before writing this function — it must reproduce the SAME targeting rule those three call sites already use for their own scope, unified into one function keyed on the selection rather than on which of three JSX call sites is rendering.

- [ ] **Step 1: Write the failing tests — one per selection kind**

```ts
import { describe, expect, it } from "vitest";
import { addTargetFor } from "@/features/actors/domain/add-target";
import { stack, text } from "./support/block-fixtures"; // match this repo's real fixture helper names — grep before assuming

describe("addTargetFor", () => {
  it("targets the page root when nothing is selected", () => {
    const blocks = [stack([text("a")])];
    const result = addTargetFor(blocks, null, "fursona");
    expect(result.targetPath).toEqual([]);
  });

  it("targets the page root when Page is explicitly selected", () => {
    const blocks = [stack([text("a")])];
    const result = addTargetFor(blocks, { kind: "page" }, "fursona");
    expect(result.targetPath).toEqual([]);
  });

  it("targets the container itself when a container is selected — append inside", () => {
    const blocks = [stack([text("a")])];
    const result = addTargetFor(
      blocks,
      { kind: "block", path: [0] },
      "fursona",
    );
    expect(result.targetPath).toEqual([0]);
  });

  it("targets the leaf's own parent when a leaf is selected — insert after", () => {
    const blocks = [stack([text("a"), text("b")])];
    const result = addTargetFor(
      blocks,
      { kind: "block", path: [0, 1] },
      "fursona",
    );
    // Adding "after" a leaf inside a container is defined here as appending
    // to that leaf's own parent container — see this function's own TSDoc
    // for why a literal positional "after index N" has no meaning for a
    // positional (grid/masonry/etc.) container, where addTargetFor's
    // targetPath is deliberately the PARENT, not a computed insertion index.
    expect(result.targetPath).toEqual([0]);
  });

  it("refuses to offer a layout option past the depth cap", () => {
    const deep = stack([stack([stack([text("leaf")])])]); // three containers deep
    const blocks = [deep];
    const result = addTargetFor(
      blocks,
      { kind: "block", path: [0, 0, 0] },
      "fursona",
    );
    expect(result.mayAddLayout).toBe(false);
  });
});
```

Adjust the exact fixture depth/shape to genuinely sit at `MAX_DEPTH` — read `block-schema.ts`'s `MAX_DEPTH` constant and construct a fixture that is provably AT the cap for the last case, not merely deeply nested by guess. If `mayNest` needs a `Block[]` and a path rather than just a path, adjust the call inside `addTargetFor` accordingly — this task's job is to match `mayNest`'s real signature, not invent one.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter hub exec vitest run tests/add-target.test.ts
```

Expected: FAIL — `add-target.ts` does not exist yet.

- [ ] **Step 3: Implement `addTargetFor`**

```ts
import { blockAt, type BlockPath } from "@/features/actors/domain/block-edits";
import type { EditorSelection } from "@/features/actors/domain/editor-selection";
import {
  isContainer,
  mayNest,
  type Block,
} from "@/features/actors/domain/block-schema";
// Adjust the import path for mayNest / ActorKind to whatever the real
// modules are — confirmed by grep, not guessed, before this step.

/**
 * The one Add target a given selection implies.
 *
 * **A container's own path is where content is appended INSIDE it. A leaf's
 * parent path is where content is appended AFTER it**, in the sense of
 * "added following it" rather than "spliced at a computed index" — a leaf
 * sits in one positional place, and "after" has no positional meaning for a
 * grid, masonry, carousel, tabs, or accordion parent, where a place is a
 * fixed slot rather than a point in a sequence. For the linear modes
 * (`stack`/`list`/`timeline`) and for the page's own top level, appending to
 * the parent already lands the new block at the end of that same sequence,
 * which is what "after" means in ordinary usage for those modes too — so
 * this one rule serves every mode without a second code path for the linear
 * case.
 */
export interface AddTarget {
  /** Where a chosen block should be added — the container itself, or the
   * page root. Never a leaf's own path; a leaf holds no children. */
  readonly targetPath: BlockPath;
  /** Whether a layout option should be offered at this target — `mayNest`
   * asked of `targetPath`, not of the selection's own path. */
  readonly mayAddLayout: boolean;
}

/**
 * Resolves the global Add control's target from the current selection.
 *
 * @param blocks - the whole page.
 * @param selection - what is currently selected, or nothing.
 * @returns where a chosen block is added, and whether nesting is still
 * possible there.
 */
export function addTargetFor(
  blocks: readonly Block[],
  selection: EditorSelection,
): AddTarget {
  if (!selection || selection.kind === "page") {
    return { targetPath: [], mayAddLayout: mayNest([]) };
  }
  const target = blockAt(blocks, selection.path);
  const targetPath =
    target && isContainer(target)
      ? selection.path
      : selection.path.slice(0, -1);
  return { targetPath, mayAddLayout: mayNest(targetPath) };
}
```

Correct the signature/imports to match `mayNest`'s real parameter list (it may need `blocks` as well as `path` — check before compiling). Remove the unused `actorKind` parameter from the test calls above if `offerableLeafKinds`/`kinds` end up being the TOOLBAR's concern rather than this function's — re-read Task 2 below before deciding whether `AddTarget` should also carry `kinds`, or whether the toolbar computes `kinds` itself from `actorKind` independently of the selection. Prefer keeping `addTargetFor` narrow (targeting only) unless the existing three call sites already couple kind-narrowing to scope in a way this function must reproduce — verify by reading them, per this task's own header note.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter hub exec vitest run tests/add-target.test.ts
```

- [ ] **Step 5: Sabotage-verify the leaf-parent case**

```bash
cp apps/hub/src/features/actors/domain/add-target.ts /tmp/add-target.ts.bak
```

Change `selection.path.slice(0, -1)` to `selection.path` (return the leaf's own path instead of its parent). Run:

```bash
pnpm --filter hub exec vitest run tests/add-target.test.ts -t "targets the leaf's own parent"
```

Expected: FAIL. Restore:

```bash
cp /tmp/add-target.ts.bak apps/hub/src/features/actors/domain/add-target.ts
rm /tmp/add-target.ts.bak
```

- [ ] **Step 6: `pnpm check:docs` and commit**

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS && pnpm check:docs
git add apps/hub/src/features/actors/domain/add-target.ts apps/hub/tests/add-target.test.ts
git commit -m "Add addTargetFor: one Add target for one selection"
```

---

## Task 2: One `AddBlockPicker` in the toolbar, driven by `addTargetFor`

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (remove the page-level `addPalette` mount and the per-empty-place mounts; keep the container-footer mount ONLY if Task 4 below finds Items/Options still needs its own — see that task's note)
- Test: `apps/hub/tests/editor-toolbar.test.tsx`
- Test: `apps/hub/tests/block-editor.test.tsx`

**Interfaces:**

- Consumes: `AddTarget`/`addTargetFor` from Task 1; `AddBlockPickerProps` (unchanged) from `presentation/add-block-picker.tsx`.
- Produces: `EditorToolbarProps` gains an `add: AddBlockPickerProps` (or a narrower subset — decide during implementation whether the toolbar receives the fully-built props object from `block-editor.tsx` or builds part of it itself; prefer receiving it fully built, matching how `pageThemeSwitch`/`interactWithPage` are already handed down as complete nodes/props rather than assembled inside the toolbar).

- [ ] **Step 1: Read the current toolbar and its existing Save/Preview/Cancel/More arrangement in full**

```bash
cat apps/hub/src/features/actors/presentation/editor-toolbar.tsx
```

Note exactly where `interactWithPage`, `pageThemeSwitch`, and the language toggle currently sit in the row, and how the row wraps at `sm`/`md` per the root `CLAUDE.md`'s "the bar's row WRAPS below `sm`" account — any new control added to this row must be checked against that same breakpoint-straddling risk (root `CLAUDE.md` rule 38) before this phase's Task 5 (Full proof phase) runs its own sweep; do not skip a spot-check here just because Phase 7 exists.

- [ ] **Step 2: Write the failing test for the toolbar's new Add slot**

```tsx
it("renders the Add control in the toolbar, targeting the current selection", () => {
  render(
    <EditorToolbar
      {...defaultToolbarProps}
      add={{
        targetPath: [],
        kinds: someKinds,
        mayAddLayout: true,
        atBlockLimit: false,
        labels: addLabels,
        page: pageContext,
        locale: "en",
        onAdd: vi.fn(),
      }}
    />,
  );
  expect(screen.getByTestId("add-block")).toBeInTheDocument();
});
```

Match this test file's existing `defaultToolbarProps` fixture pattern exactly — read the top of `editor-toolbar.test.tsx` before writing `defaultToolbarProps`/`someKinds`/`addLabels`/`pageContext` as if they already exist; they may need to be constructed inline instead.

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter hub exec vitest run tests/editor-toolbar.test.tsx -t "renders the Add control in the toolbar"
```

- [ ] **Step 4: Add the `add` prop and mount `AddBlockPicker` in the toolbar**

Add `add: AddBlockPickerProps;` to `EditorToolbarProps`, import `AddBlockPicker`, and mount it in the row — placed first among the action controls, matching the spec's own ordering ("Add, desktop/mobile canvas width, Preview, Save, More").

- [ ] **Step 5: In `block-editor.tsx`, build the `add` prop from `addTargetFor` and pass it to the toolbar**

```tsx
const addTarget = addTargetFor(blocks, selection);
const addProps: AddBlockPickerProps = {
  targetPath: addTarget.targetPath,
  kinds,
  mayAddLayout: addTarget.mayAddLayout,
  atBlockLimit,
  labels: addPickerLabels,
  page,
  locale: lang,
  onAdd: (block) => addAt(addTarget.targetPath, block),
};
```

Reuse the existing `addAt` function (already in this file, called by the old per-empty-place/container-footer mounts) rather than writing a new one — `addAt`'s own selection-after-add behavior (selecting the newly added block, opening the right inspector tab) is exactly what should still happen; only the calculation of WHERE it is called with (`addTarget.targetPath` instead of a hard-coded scope path) changes.

- [ ] **Step 6: Remove the three old mount sites**

Delete the page-level `addPalette` JSX block, the per-empty-place `AddBlockPicker` mount, and (pending Task 4's finding below) the container-footer mount in `inspector-items.tsx`/`ItemsFooter`. Do not delete `addAt`/`addOnPage`/`addTargetFor`'s own logic — only the JSX that rendered a _second, third_ `AddBlockPicker`.

- [ ] **Step 7: Run the full editor test suite**

```bash
pnpm --filter hub exec vitest run tests/editor-toolbar.test.tsx tests/block-editor.test.tsx
```

Fix any test that asserted on the now-removed mount sites (there will be several — the checkpoint's own CLAUDE.md account describes `add-content`/`add-nested` tests for the page-level and per-empty-place mounts specifically; find every one with:

```bash
grep -rn "add-block\b" apps/hub/tests/block-editor.test.tsx apps/hub/tests/inspector-items.test.tsx 2>/dev/null
```

and rewrite each to assert against the single toolbar mount instead of a scope-specific one).

- [ ] **Step 8: Sabotage-verify one representative case** — e.g. "still offers add-block from a full two-place container" (named in the actors `CLAUDE.md` as the fixture proving nesting was never actually deleted). Break `addTargetFor` to always return `{ targetPath: [], mayAddLayout: true }` regardless of selection, confirm the rewritten test fails, restore.

- [ ] **Step 9: `pnpm --filter hub test`, `pnpm check:docs`, commit**

```bash
git add apps/hub/src/features/actors/presentation/editor-toolbar.tsx \
        apps/hub/src/features/actors/presentation/block-editor.tsx \
        apps/hub/tests/editor-toolbar.test.tsx apps/hub/tests/block-editor.test.tsx
git commit -m "One global Add in the toolbar, targeted by the current selection

Replaces the page-level, container-footer and per-empty-place
AddBlockPicker mounts with one instance in the compact toolbar, driven
by addTargetFor. AddBlockPicker itself is unchanged."
```

---

## Task 3: The compact menu's remaining shape — More, and reordering the row

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`
- Test: `apps/hub/tests/editor-toolbar.test.tsx`

The spec: **"Compact menu: Add, desktop/mobile canvas width, Preview, Save, More. More holds source JSON, Interact with page, and Cancel."** Phase 2 does not build the desktop/mobile canvas-width control (that is Phase 5's — do not add a stub for it here; leave a `// TODO(phase 5)` comment nowhere, since this repo's "No Placeholders" rule for plans also applies to code: a dead stub controls nothing and is worse than its absence). This task only reorders what already exists and introduces the "More" grouping for the three controls the spec says belong there.

- [ ] **Step 1: Read what currently exists in the row for "source JSON" (the page-source dock trigger), "Interact with page" (the switch), and "Cancel"**

```bash
grep -n "openSource\|interactWithPage\|Braces\|Cancel\b" apps/hub/src/features/actors/presentation/editor-toolbar.tsx
```

- [ ] **Step 2: Write the failing test for the More grouping**

```tsx
it("groups source JSON, Interact with page, and Cancel under More", async () => {
  render(<EditorToolbar {...defaultToolbarProps} />);
  const user = userEvent.setup();
  expect(screen.queryByTestId("open-source")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: labels.more }));
  expect(screen.getByTestId("open-source")).toBeInTheDocument();
});
```

Match whatever test id the source-dock trigger button actually carries today (`grep -n 'tid("open-source"'` or similar to confirm the real string before writing this assertion).

- [ ] **Step 3: Run it to verify it fails**

- [ ] **Step 4: Build a `More` disclosure** — a simple `<details>`/`<summary>` pairing (matching this codebase's existing native-disclosure convention for the reference panel in `page-source-dock.tsx`, per the actors `CLAUDE.md`'s account of that component) or a small popover matching `AddBlockPicker`'s own dialog pattern if a `<details>` cannot host a `role="dialog"` cleanly with the toolbar's layout — read `page-source-dock.tsx`'s disclosure first and prefer reusing that idiom rather than introducing a third one.

Move the source-JSON trigger, the Interact-with-page switch, and Cancel inside it. Reorder the remaining row to: Add, Preview, Save, More (canvas-width joins between Add and Preview in Phase 5).

- [ ] **Step 5: Run the test to verify it passes; run the full toolbar suite; sabotage-verify by leaving one of the three outside the disclosure and confirming the test that names it specifically fails; restore.**

- [ ] **Step 6: `pnpm check:docs`, `pnpm lint` from repo root, commit.**

---

## Task 4: Confirm Items/Options no longer needs its own Add mount

Phase 6 deletes the recursive Items/Options inspector outright, but it is not deleted yet — Phase 3 has not built its replacement. Until then, `inspector-items.tsx`'s `ItemsFooter` may still be the only way to add a block WHILE the old inspector is the active selection host. This task decides, with evidence, whether that old mount can already be removed in Phase 2 or must survive until Phase 3/6.

- [ ] **Step 1: With Task 2's toolbar Add wired in, manually exercise the old recursive inspector** (run `pnpm --filter hub dev` from `apps/hub`, sign in, open an editor route, select a container through the existing Items tab) and confirm the toolbar's Add control is reachable and correctly targets that same container.

- [ ] **Step 2: If it is reachable and correct, delete `ItemsFooter`'s own `AddBlockPicker` mount now** and update `inspector-items.test.tsx` accordingly (removing cases that asserted on the now-deleted mount, confirming no case asserted on behavior that mount was the ONLY way to reach — if any did, that behavior must first be proven reachable through the toolbar's Add before the old test is deleted, not after).

- [ ] **Step 3: If it is NOT reachable or NOT correctly targeted** (for instance, if Items-scope selection and the new canvas-click selection turn out to be two different pieces of state that Phase 3 has not yet unified), leave `ItemsFooter`'s mount in place, write down exactly why in this task's own commit message, and hand the removal to Phase 6 explicitly rather than silently dropping it from this phase's scope.

- [ ] **Step 4: Commit whichever outcome Step 2 or Step 3 produced**, with a commit message stating which branch was taken and why.

---

## Task 5: Full local verification

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS
pnpm --filter hub test
pnpm lint
pnpm typecheck
pnpm check:docs
pnpm check:tools
```

Expected: all PASS. Do not run `pnpm --filter hub test:e2e` yet — Phase 7 owns the full browser proof; a manual spot-check in a running dev server (Task 4 Step 1) is sufficient confirmation for this phase.
