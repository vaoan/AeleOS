# Carrd-style page builder — Phase 3: selection model + focused Properties panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on Phase 1 and Phase 2** landing first on this same branch.
> One branch (`carrd-style-builder`), one PR (#67), seven sequential
> phases. Spec: `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`,
> Interaction section.

**Goal:** Replace the recursive Items/Options inspector (`presentation/canvas-inspector.tsx` + `inspector-items.tsx`) with the spec's single Properties panel: no Items tab, no tree navigation, click-to-select on the live canvas already does the navigating. One panel per selection — leaf → Content + Appearance; container → Layout + Appearance; Page → Page + Theme — with Clone and Delete at the foot, and Close clearing selection.

**Architecture:** `CanvasInspector` is renamed to `PropertiesPanel` and loses its Items pane, tablist-for-Items, breadcrumbs, and Back button entirely — the spec's own words are "There is no Items tab and no tree navigation in the panel," and canvas click-to-select (already implemented in `block-editor.tsx`'s `onCanvasClick`, innermost-`data-block-path`-wins) is what replaced tree navigation as of the checkpoint. What each selection kind renders inside the panel is **extracted, not rebuilt**: the existing field-editing pieces of `LeafEditor`/`BlockCard`/`SectionStylePopup`/the page-level fields host/`ThemeConfigurator` are split into a content half and a style half so each can be a panel tab, reusing every existing form control, validation rule, and TSDoc contract.

**Tech Stack:** Next.js hub, React 19, react-hook-form (existing field editors), Motion for React (`presentation/editor-motion.tsx`'s `m`/`LazyMotion`, opacity-only near any `@dnd-kit` node — unchanged rule), Vitest + Testing Library, Playwright + `@axe-core/playwright`.

## Global Constraints

- `CHROME_SCOPE` on the panel and every control it hosts.
- Motion only inside `CHROME_SCOPE`, never wrapping a `@dnd-kit` node (this phase removes the Items pane that hosted `BlockSlot`/`@dnd-kit`, so this constraint's _scope_ shrinks, but the rule itself is unchanged for whatever remains — the panel's own entrance animation).
- Every export gets contract-stating TSDoc; `pnpm check:docs` enforces it.
- Every removed capability gets a written note in `apps/hub/src/features/actors/CLAUDE.md` saying what replaced it — per that file's own standing rule, re-read it against every change made under `features/actors/` before finishing this phase's last task, not only after.
- Depth cap and required-kind rules are UNCHANGED — this phase only changes how a person navigates to a selection and how its fields are grouped, never what may be selected or edited.
- One agent, this working tree, in order.

---

## Task 1: Read every file this phase touches before writing anything

This phase restructures four existing, non-trivial components. Read each one in full before starting Task 2 — this step is not decorative; the exact current shape of each determines whether "extract a content half and a style half" is a small refactor or a large one, and this plan cannot specify that split more precisely without first knowing it.

- [ ] **Step 1:** `apps/hub/src/features/actors/presentation/canvas-inspector.tsx` (already quoted in full in this phase's own spec-reading pass — re-read it here anyway, in case Phase 2 changed anything adjacent).
- [ ] **Step 2:** `apps/hub/src/features/actors/presentation/inspector-items.tsx` — the Items pane's own content (the immediate-children list, drag grips, per-empty-place Add — the last of which Phase 2 may have already removed; confirm).
- [ ] **Step 3:** `apps/hub/src/features/actors/presentation/leaf-editor.tsx` in full — locate exactly where it currently mounts `SectionStylePopup` (a trigger button opening a dialog, per the actors `CLAUDE.md`'s "A leaf reaches its own style popup" account) versus where it renders the leaf's own content fields (title/description, kind-specific fields via `leaf-fields.ts`).
- [ ] **Step 4:** `apps/hub/src/features/actors/presentation/block-card.tsx` in full — the container's own Layout controls (mode/spaces/weights) versus its `SectionStylePopup` mount.
- [ ] **Step 5:** Find and read the `SectionStylePopup` component's own source file in full (confirm the exact path with `grep -rln "export function SectionStylePopup"` — the actors `CLAUDE.md` never states the file name outright).
- [ ] **Step 6:** Find and read whatever currently hosts the Page-level fields (display name, avatar, visibility) and the `ThemeConfigurator` — these are almost certainly in `fursona-editor.tsx` rather than in `block-editor.tsx`, since `BlockEditor`'s own note says it "owns selection, the editable canvas, the Properties panel, and the drop planner" while `FursonaEditor` "owns the form, theme, save, Preview, source dock, and interaction switch" (spec's Architecture section, last sentence). Confirm with `grep -n "ThemeConfigurator\|displayName\|avatarUrl" apps/hub/src/features/actors/presentation/fursona-editor.tsx`.
- [ ] **Step 7:** Write a one-paragraph note (in this task's own commit message, not a new file) naming the exact current boundary between "content" and "style" in each of the four components read above, and which of them is a clean split versus which needs a genuine refactor. This note is what Tasks 2–5 below are checked against — if what you find contradicts this plan's assumptions in the tasks that follow, fix the task's own text before implementing it rather than implementing the wrong thing to match a stale plan.

---

## Task 2: `PropertiesPanel` — the host, stripped to what the spec asks for

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/canvas-inspector.tsx` → rename to `apps/hub/src/features/actors/presentation/properties-panel.tsx` (a `git mv`, so history follows the file)
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: rename `apps/hub/tests/canvas-inspector.test.tsx` → `properties-panel.test.tsx` if it exists as its own file, or update whichever test file currently covers `CanvasInspector`

**Interfaces:**

- Produces:

  ```ts
  export interface PropertiesPanelLabels {
    readonly close: string;
    readonly primaryTab: string; // "Content" / "Layout" / "Page" — supplied per selection kind by the caller
    readonly secondaryTab: string; // "Appearance" / "Appearance" / "Theme"
  }
  export type PropertiesTab = "primary" | "secondary";
  export interface PropertiesPanelProps {
    readonly selection: EditorSelection;
    readonly tab: PropertiesTab;
    readonly onTab: (tab: PropertiesTab) => void;
    readonly labels: PropertiesPanelLabels;
    readonly onClose: () => void;
    readonly primary: ReactNode;
    readonly secondary: ReactNode;
    readonly foot: ReactNode; // Clone + Delete, built by the caller (Task 5)
  }
  ```

  Task 3 and Task 4 populate `primary`/`secondary` per selection kind; Task 5 populates `foot`.

- [ ] **Step 1: Write the failing tests** — one per removed affordance, asserting absence, plus one asserting the panel still opens and closes:

```tsx
it("renders no Items tab and no breadcrumbs", () => {
  render(<PropertiesPanel {...propsFor({ kind: "block", path: [0] })} />);
  expect(screen.queryByRole("tab", { name: /items/i })).not.toBeInTheDocument();
  expect(screen.queryByTestId("inspector-back")).not.toBeInTheDocument();
});

it("shows two tabs named for the selection kind, and Close clears selection", async () => {
  const onClose = vi.fn();
  render(
    <PropertiesPanel
      {...propsFor({ kind: "block", path: [0, 0] })}
      onClose={onClose}
      labels={{
        close: "Close",
        primaryTab: "Content",
        secondaryTab: "Appearance",
      }}
    />,
  );
  expect(screen.getByRole("tab", { name: "Content" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
  await userEvent.click(screen.getByTestId("panel-close"));
  expect(onClose).toHaveBeenCalledOnce();
});
```

Build `propsFor` locally in the test file (a small helper returning a complete `PropertiesPanelProps` for a given selection) rather than assuming one already exists.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Rewrite the component**

Delete: the `hasItems`/`items`/`breadcrumbs`/`onBack` props, the `role="tablist"` block that switched Items/Options, the Items pane's `m.div`. Keep: the fixed-position/bottom-sheet shell (`className` string — but flip its side, see Step 4), the Close button (retest it as `{...tid("panel-close")}` rather than `inspector-close` since this is a rename, and grep every test asserting the old id before deleting it), the `scopeKey`-based remount-on-selection-change mechanism (still correct and still needed — a different block should still replay the entrance), the opacity-only Motion rule on the root.

Rename the two-value tab union from `"items" | "options"` to `"primary" | "secondary"` and rewire the tablist to render exactly two tabs, labelled by `labels.primaryTab`/`labels.secondaryTab`, always both present (no `hasItems` conditional — the spec's per-kind pairing means every selection kind gets exactly two tabs, never one, never a variable number).

- [ ] **Step 4: Move the panel to the right, per the spec's Layout section ("selected Properties panel on the right")**

```
// BEFORE
md:top-[calc(var(--bar-top)+3.5rem)] md:right-auto md:bottom-0 md:left-0 md:max-h-none md:w-[min(36rem,40vw)] md:border-t-0 md:border-r

// AFTER
md:top-[calc(var(--bar-top)+3.5rem)] md:left-auto md:right-0 md:bottom-0 md:max-h-none md:w-[min(36rem,40vw)] md:border-t-0 md:border-l
```

- [ ] **Step 5: Run the new tests to confirm they pass; run the full properties-panel test file**

- [ ] **Step 6: `pnpm check:docs`, `git mv`-preserving commit**

```bash
git add -A
git commit -m "Rename CanvasInspector to PropertiesPanel; drop Items and tree navigation

No Items tab, no breadcrumbs, no Back — the panel now hosts exactly two
tabs per the spec's per-kind pairing (Content/Appearance,
Layout/Appearance, Page/Theme), and moves to the panel's own right edge
on desktop per the Layout section of the design spec."
```

---

## Task 3: Flip the canvas's own space-reservation padding to the right

The canvas currently pads itself on the LEFT (`md:pl-[min(36rem,40vw)]`, per the actors `CLAUDE.md`'s account of the recursive inspector's own layout) so the panel never covers a selected block. Moving the panel to the right (Task 2) means this padding must move too, or the panel will now sit on top of newly-uncovered content on the right while an unused gutter remains on the left.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (find the exact class string with `grep -n "pl-\[min(36rem"` )
- Test: whatever spec/unit test currently pins this padding class (search `editor-bars-stay-pinned.spec.ts` and `block-editor.test.tsx` for `pl-\[min`)

- [ ] **Step 1: Find every occurrence of the left-padding class and its sibling occlusion-guard test(s)**

```bash
grep -rn "pl-\[min(36rem" apps/hub/src apps/hub/tests
```

- [ ] **Step 2: Write/update the failing test** asserting the canvas section pads on the RIGHT when a selection is active, not the left — mirror whatever assertion shape the existing occlusion test already uses (the actors `CLAUDE.md` describes one measuring `x=41`/panel's edge for the save-refusal banner occlusion fault; a parallel measurement, now on the right edge, is the correct shape here).

- [ ] **Step 3: Flip `pl-[min(36rem,40vw)]` to `pr-[min(36rem,40vw)]`** at the found call site(s).

- [ ] **Step 4: Re-run the occlusion guard from the actors `CLAUDE.md`'s own account (the save-refusal banner test) and confirm it still passes with the panel now on the right** — this is exactly the kind of fault that guard was built to catch, applied to a fresh geometry change; do not skip re-running it just because this task did not touch the banner itself.

- [ ] **Step 5: Sabotage-verify**: revert the class to `pl-` only, confirm the updated test fails, restore.

- [ ] **Step 6: Commit**

---

## Task 4: Split each field editor into a content half and a style half

This task's exact shape depends entirely on Task 1 Step 7's findings. Three sub-tasks, one per selection kind, each following the same pattern: extract the existing style-popup trigger + dialog into an inline "Appearance" tab body, and leave everything else as the "Content"/"Layout"/"Page" tab body.

### 4a — Leaf: Content + Appearance

- [ ] **Step 1:** In `leaf-editor.tsx`, identify the `SectionStylePopup` trigger button and its dialog. Extract the dialog's own FORM (the actual style controls — skin, border, chrome, radius, corners, label, image_fit, portrait, gated per `StyleGates`/`styleGatesFor` exactly as today) into a new component, `StyleFields`, taking the same `patchLeaf`/`patchContainer`-shaped callback and the same `StyleGates` the dialog already computes — this is a pure extraction: no gating logic changes, no new field, only the JSX moves out of a `<dialog>`/popup shell into a plain fragment usable inline.

- [ ] **Step 2:** `LeafEditor`'s own render becomes the panel's "Content" tab body (title/description/kind-specific fields via `leaf-fields.ts`, unchanged). A new thin wrapper — or `LeafEditor` itself gains a second export — renders `StyleFields` as the "Appearance" tab body.

- [ ] **Step 3:** Write component tests proving: (a) every field `StyleFields` renders when extracted is byte-for-byte the same set `SectionStylePopup` rendered before extraction, gated by the same `StyleGates` (reuse the existing `leaf-style-popup.spec.ts`/`leaf-editor.test.tsx` cases that already exercise `portrait`/`label` gating — point them at the new component instead of the old dialog and confirm they still pass unmodified in their assertions, only their mount changes); (b) editing a field in the new inline Appearance tab still writes through the same `patchLeaf` callback and is reflected live on the canvas (reuse `leaf-style-popup.spec.ts`'s own browser-level `portrait` size assertion, retargeted at the new tab).

- [ ] **Step 4:** Delete the now-unused popup dialog shell from `leaf-editor.tsx` (the trigger button, the `<dialog>`, its own open/close state) — but NOT `SectionStylePopup`'s underlying form logic, which now lives in `StyleFields` and is the same code, relocated.

- [ ] **Step 5:** Sabotage-verify one gating case (e.g. `portrait` offered only for `avatar` kind) by reverting `StyleFields`'s gate check to always `true`, confirm the retargeted test fails, restore.

- [ ] **Step 6:** Commit.

### 4b — Container: Layout + Appearance

- [ ] **Step 1:** In `block-card.tsx`, identify the Layout controls (name, mode select, spaces, weights) versus the `SectionStylePopup` mount, applying the same `StyleFields` extraction from 4a (the container-side style controls are a superset of the leaf-side ones per `StyleGates`'s own `atTop`/`heading` gates — confirm `StyleFields` accepts whatever additional gates a container needs, extending its props rather than duplicating the component).

- [ ] **Step 2:** `BlockCard`'s Layout fields become the panel's "Layout" tab body; the extracted `StyleFields` (with container-specific gates) becomes its "Appearance" tab body.

- [ ] **Step 3:** Write/retarget tests mirroring 4a's Step 3, covering container-only gates (`heading`, `bleed`/`margins` at depth 0, `atTop`).

- [ ] **Step 4:** Delete the now-unused popup shell from `block-card.tsx`.

- [ ] **Step 5:** Sabotage-verify the `atTop` gate (bleed/margins offered only at depth 0), restore.

- [ ] **Step 6:** Commit.

### 4c — Page: Page + Theme

- [ ] **Step 1:** In `fursona-editor.tsx` (or wherever Task 1 Step 6 found these actually live), identify the page-level content fields (display name, avatar, visibility) and the `ThemeConfigurator` mount.

- [ ] **Step 2:** These likely already live OUTSIDE `BlockEditor`'s own tree (per the spec's Architecture section: `FursonaEditor` owns theme and the form; `BlockEditor` owns selection and the panel). This means Task 2's `PropertiesPanel` needs its `primary`/`secondary` props for the `{ kind: "page" }` selection to be built by `FursonaEditor` and threaded down to wherever `BlockEditor` renders the panel — confirm whether `BlockEditor` already receives these two field groups as props for some other purpose (e.g. the existing Page-selection Options pane, if the old inspector already showed page fields there) and reuse that channel rather than inventing a new prop-drilling path.

- [ ] **Step 3:** Write/retarget a test proving selecting Page shows the page-level fields under "Page" and `ThemeConfigurator` under "Theme," and that editing either still writes to the same form fields the pre-existing (non-panel) UI wrote to — if `ThemeConfigurator` already lived inside the old Options pane for a Page selection, this may already be true and this step is confirmation-only; do not claim it required new code if it did not.

- [ ] **Step 4:** Commit whatever change Steps 1–3 actually required — this sub-task may turn out to need no code change at all beyond Task 2's rename, which is a legitimate outcome; state that plainly in the commit message if so, rather than manufacturing a diff.

---

## Task 5: Clone and Delete at the panel's foot

**Files:**

- Create or modify: wherever the panel's `foot` prop is assembled — `block-editor.tsx`
- Create: `apps/hub/src/features/actors/domain/block-clone.ts` (Clone is new domain logic; Delete already exists somewhere in the current inspector — find it with `grep -rn "onDelete\|removeSelected" apps/hub/src/features/actors/presentation/`)
- Test: `apps/hub/tests/block-clone.test.ts`, `apps/hub/tests/block-editor.test.tsx`

**Interfaces:**

- Consumes: `insertAt`, `blockAt`, `BlockPath` from `block-edits.ts`; `MAX_DEPTH`, `BLOCK_LIMITS.children`, `isContainer` from `block-schema.ts`.
- Produces: `cloneAt(blocks, path): { ok: true; blocks: Block[]; path: BlockPath } | { ok: false; reason: "too deep" | "too many" }`.

Delete is a removal at the selected path plus the existing required-kind-refusal check (the actors `CLAUDE.md`'s "the editor withdraws the remove control on the last copy" rule) — this task does not change Delete's behavior, only relocates its trigger into the panel's foot; find the existing control (likely inside the old Options pane) and move it rather than rewriting it.

Clone is genuinely new: duplicate the block at `path` and insert the copy immediately after it in the same parent, refusing (with a sentence, never a silent no-op) if the parent is already at `BLOCK_LIMITS.children` or if the cloned subtree's own depth would not fit at the destination (reuse `block-drops.ts`'s own `reach`/`fitsAt` pattern rather than reimplementing depth arithmetic a third time — consider exporting `reach`/`fitsAt` from `block-drops.ts` if `block-clone.ts` needs them, rather than copy-pasting).

- [ ] **Step 1: Write the failing tests**

```ts
describe("cloneAt", () => {
  it("duplicates a block immediately after itself in its parent", () => {
    const blocks = [stack([text("a"), text("b")])];
    const result = cloneAt(blocks, [0, 0]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocks[0]).toMatchObject({
        children: [
          expect.objectContaining({ title_en: "a" }),
          expect.objectContaining({ title_en: "a" }),
          expect.objectContaining({ title_en: "b" }),
        ],
      });
      expect(result.path).toEqual([0, 1]);
    }
  });

  it("refuses when the parent is already at the children cap", () => {
    const full = stack(
      Array.from({ length: BLOCK_LIMITS.children }, (_, i) => text(`t${i}`)),
    );
    const result = cloneAt([full], [0, 0]);
    expect(result).toEqual({ ok: false, reason: "too many" });
  });

  it("refuses when the cloned subtree would not fit at the destination depth", () => {
    // A container-holding-a-container selected at MAX_DEPTH - 1, so cloning
    // it (which needs the same depth its original occupies) pushes one
    // level past the cap. Construct this fixture against the real
    // MAX_DEPTH constant, not a guessed nesting depth.
    const deep = /* build to exactly MAX_DEPTH */;
    const result = cloneAt([deep], [0]);
    expect(result).toEqual({ ok: false, reason: "too deep" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `cloneAt`**, reusing `reach`/`fitsAt`-equivalent depth arithmetic (export them from `block-drops.ts` if not already exported, rather than duplicating).

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Sabotage-verify the "too many" refusal** by changing the comparison to admit one extra child, confirm the test fails, restore. Repeat for "too deep" by changing the depth comparison by one.

- [ ] **Step 6: Wire Clone and Delete into the panel's foot in `block-editor.tsx`**, selecting the new clone's path on success (matching every other successful edit's own "select the result" convention already used by `addAt`/`onDragEnd` in this file).

- [ ] **Step 7: Component test**: clicking Clone in the panel duplicates the selected block and selects the new copy; clicking Clone when at the children cap shows the refusal sentence and does not change the page.

- [ ] **Step 8: `pnpm check:docs`, commit.**

---

## Task 6: Full local verification and the actors `CLAUDE.md` re-read

- [ ] **Step 1:** Run `pnpm --filter hub test`, `pnpm lint` (repo root), `pnpm typecheck`, `pnpm check:docs`, `pnpm check:agent-notes`. All must pass.
- [ ] **Step 2:** Re-read `apps/hub/src/features/actors/CLAUDE.md`'s three standing questions against every change this phase made (its own opening section: "Is anything here now false? Still true but not how we work? Did this establish something the next person needs?"). At minimum, its "recursive inspector" and "Dragging" sections' correction banners need a new paragraph recording that the Items/Options split is gone and `PropertiesPanel` is the current name — do not merely append; correct what is now false in place, per that file's own rule about a document contradicting itself being worse than one that is simply wrong.
- [ ] **Step 3:** Commit the documentation update separately from any remaining code fixes, so a reviewer can see the two apart.
