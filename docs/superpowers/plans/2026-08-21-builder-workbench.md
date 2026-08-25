# Builder Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every builder control visually AeleOS while the real section and
complete-page previews alone wear the author's live theme and section styles.

**Architecture:** Add a preview-only CSS emitter beside unchanged public
`themeCss`, then wrap the existing `Block` and `PublicBlocks` renderers in a
small preview host. Move each top-level section preview outside its draggable
control card and add a collapsed complete-page preview after `BlockEditor`.

**Tech Stack:** Next.js 16, React 19, TypeScript, react-hook-form, Tailwind CSS
4, next-intl, Vitest/Testing Library, Playwright, dnd-kit.

> **Superseded in two boundaries on 2026-08-24.** The task body below records
> the workbench delivered by PR `#8`; it is not the current instruction for the
> complete preview or document atmosphere. The complete preview is now
> page-faithful and full-bleed rather than bounded by the editor column. While
> the theme panel is open, `atmosphereCss` puts only `--field`, the body
> background-picture layers, `--canvas`, the numbered canvas colours, the three
> canvas dials and `--nebula-blend` on the document. Closing it restores the app
> atmosphere; palette, skin, cursor and every other control token remain
> preview-only. See
> `docs/superpowers/specs/2026-08-24-atmosphere-and-page-fidelity-design.md`.
>
> The 2026-08-23 final review also replaced Task 3's top-level `sections` watch
> with a small complete-preview controller, so leaf edits do not rerender the
> toolbar and identity/theme controls. The preview still lenient-parses draft
> blocks and keeps horizontal overflow reachable rather than hidden.
> `final-fix-report.md` records that verification.

## Global Constraints

- Controls are AeleOS; previews are the author's page.
- `themeCss` and `ThemeScope` on public routes remain byte-for-byte unchanged.
- `Block` and `PublicBlocks` remain the only preview renderers.
- No iframe, screenshot, new dependency, schema change, save-flow change, or
  new viewport breakpoint inside `blocks.tsx`.
- The complete-page preview is inline, collapsed by default, and outside
  `DndContext`.
- Section previews stay visible when their control card is collapsed.
- Preview hosts use a dedicated attribute selector, never `.SKIN_SCOPE` alone.
- Every new export carries contract TSDoc and every new branch has a named
  test. Sabotage each regression guard against the original coupling.
- Both message catalogues change together.
- `apps/hub/.gitignore` is unrelated and must remain untracked.

---

## File Structure

- Create
  `apps/hub/src/features/actors/presentation/preview-theme-host.tsx`: one
  preview-only boundary that emits scoped theme CSS and paints `--field`.
- Create
  `apps/hub/src/features/actors/presentation/section-preview-tray.tsx`: owns
  section-style splitting and renders the existing lenient `Block`.
- Create
  `apps/hub/src/features/actors/presentation/complete-page-preview.tsx`: owns
  the collapsed disclosure and renders existing `PublicBlocks`.
- Modify `apps/hub/src/features/actors/domain/actor-theme.ts`: add
  `previewThemeCss`; do not alter `themeCss`.
- Modify
  `apps/hub/src/features/actors/presentation/theme-configurator.tsx`: stop
  injecting document-scoped preview CSS.
- Modify `apps/hub/src/features/actors/presentation/block-card.tsx`: make it
  controls-only and permanently AeleOS-shaped.
- Modify `apps/hub/src/features/actors/presentation/block-editor.tsx`: place
  the section tray beside, not inside, the top-level droppable.
- Modify `apps/hub/src/features/actors/presentation/fursona-editor.tsx`: watch
  live theme/sections and append the complete preview after `BlockEditor`.
- Modify `apps/hub/src/app/[locale]/(app)/pages/labels.ts`,
  `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`, and
  `apps/hub/tests/support/editor-labels.ts`: complete-preview copy.
- Modify focused unit/browser tests and the actors feature note to pin the new
  boundary and remove the old coupling claim.

---

### Task 1: Preview-Scoped Theme Boundary

**Files:**

- Modify: `apps/hub/src/features/actors/domain/actor-theme.ts`
- Create:
  `apps/hub/src/features/actors/presentation/preview-theme-host.tsx`
- Modify:
  `apps/hub/src/features/actors/presentation/theme-configurator.tsx`
- Modify: `apps/hub/tests/actor-theme.test.ts`
- Create: `apps/hub/tests/preview-theme-host.test.tsx`
- Modify: `apps/hub/tests/theme-configurator.test.tsx`

**Interfaces:**

- Produces:
  `previewThemeCss(theme: ActorTheme): string`
- Produces:
  `PreviewThemeHost({ theme, children, className? }: PreviewThemeHostProps):
ReactNode`
- Preserves:
  `themeCss(theme: ActorTheme): string` exactly for public routes.

- [ ] **Step 1: Write failing domain tests for preview-only selectors**

Add named cases to `apps/hub/tests/actor-theme.test.ts`:

```ts
describe("previewThemeCss", () => {
  it("scopes palette, skin, and background to preview hosts", () => {
    const css = previewThemeCss({
      ...DEFAULT_THEME,
      background: [{ colour: "#24152f", at: 0 }],
      accent: "#f04f91",
      skin: "comic",
      backgroundUrl: "https://example.test/background.png",
    });

    expect(css).toContain("[data-preview-theme]");
    expect(css).toContain("--accent:");
    expect(css).toContain("--skin-");
    expect(css).toContain("background-image:");
    expect(css).not.toContain(":root");
    expect(css).not.toContain(" body");
  });
});
```

Also snapshot/store `themeCss(theme)` before implementation and assert it is
unchanged after adding the new function.

- [ ] **Step 2: Run the domain test and verify it fails for the missing export**

Run:

```bash
pnpm --filter hub exec vitest run tests/actor-theme.test.ts
```

Expected: FAIL because `previewThemeCss` is not exported.

- [ ] **Step 3: Implement `previewThemeCss` from the same declaration sources**

In `actor-theme.ts`, reuse `themeVars`, `skinVars`,
`bodyBackgroundVars`, and `declarations`:

```ts
export function previewThemeCss(theme: ActorTheme): string {
  const selector = "[data-preview-theme]";
  const values = declarations({
    ...themeVars(theme),
    ...skinVars(theme.skin),
    ...bodyBackgroundVars(theme),
  });
  return values ? `${selector}{${values}}` : "";
}
```

The TSDoc must say this is editor-only, safe because values were already
generated/refused, and must never replace public `themeCss`.

- [ ] **Step 4: Run the domain test and verify it passes**

Run the Step 2 command. Expected: PASS, including the unchanged public
`themeCss` assertion.

- [ ] **Step 5: Write failing host and configurator tests**

Create `preview-theme-host.test.tsx` to assert:

```tsx
render(
  <PreviewThemeHost theme={theme}>
    <div data-testid="child" />
  </PreviewThemeHost>,
);

expect(screen.getByTestId("preview-theme-host")).toHaveAttribute(
  "data-preview-theme",
  "",
);
expect(screen.getByTestId("preview-theme-host")).toHaveClass(SKIN_SCOPE);
expect(container.querySelector("style")?.textContent).toBe(
  previewThemeCss(theme),
);
```

Extend `theme-configurator.test.tsx`: opening the panel and changing the
background must not leave a `<style>` whose text contains
`:root:not([data-page-theme`.

- [ ] **Step 6: Run both component tests and verify the old configurator fails**

Run:

```bash
pnpm --filter hub exec vitest run \
  tests/preview-theme-host.test.tsx \
  tests/theme-configurator.test.tsx
```

Expected: host test fails because the component is absent; configurator guard
fails because it still emits document CSS.

- [ ] **Step 7: Implement the host and remove document-level injection**

`preview-theme-host.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import {
  previewThemeCss,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { SKIN_SCOPE } from "@/shared/domain/skins";
import { tid } from "@/shared/infrastructure/test-id";

export interface PreviewThemeHostProps {
  theme: ActorTheme;
  children: ReactNode;
  className?: string;
}

export function PreviewThemeHost({
  theme,
  children,
  className = "",
}: PreviewThemeHostProps): ReactNode {
  const css = previewThemeCss(theme);
  return (
    <>
      {css ? <style>{css}</style> : null}
      <div
        data-preview-theme=""
        {...tid("preview-theme-host")}
        className={`${SKIN_SCOPE} [background:var(--field)] ${className}`}
      >
        {children}
      </div>
    </>
  );
}
```

Remove `themeCss` from `theme-configurator.tsx`'s imports and delete its live
`<style>`. For PR `#8`, update TSDoc to say the form value drives parent preview
hosts and no control token reaches the document. The superseding 2026-08-24
work restores a document stylesheet for the atmosphere allowlist only, as the
banner above records.

- [ ] **Step 8: Run focused tests, then sabotage the guard**

Run the Step 6 command. Expected: PASS.

Sabotage: temporarily restore `<style>{themeCss(value)}</style>` in
`ThemeConfigurator`; rerun `theme-configurator.test.tsx`; expected FAIL. Restore
and rerun green.

- [ ] **Step 9: Commit Task 1**

```bash
git add \
  apps/hub/src/features/actors/domain/actor-theme.ts \
  apps/hub/src/features/actors/presentation/preview-theme-host.tsx \
  apps/hub/src/features/actors/presentation/theme-configurator.tsx \
  apps/hub/tests/actor-theme.test.ts \
  apps/hub/tests/preview-theme-host.test.tsx \
  apps/hub/tests/theme-configurator.test.tsx
git commit -m "feat(actors): isolate live theme previews from builder chrome"
```

---

### Task 2: Stable Section Workbench Cards

**Files:**

- Create:
  `apps/hub/src/features/actors/presentation/section-preview-tray.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-card.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Modify: `apps/hub/tests/block-card.test.tsx`
- Modify: `apps/hub/tests/block-editor.test.tsx`
- Modify: `apps/hub/tests/e2e/section-card-face.spec.ts`

**Interfaces:**

- Consumes: `PreviewThemeHost`, `Block`, `blockStyle`, `lenientBlockSchema`.
- Produces:
  `SectionPreviewTray({ block, position, lang, page, theme, title }:
SectionPreviewTrayProps): ReactNode`
- Changes `BlockEditorProps<T>` to require `theme: ActorTheme`.
- Changes `BlockCard` to controls-only; its public props lose preview-only
  `page`.

- [ ] **Step 1: Write failing tests for the structural split**

In `block-editor.test.tsx`, render one top-level styled container and assert:

```ts
const card = screen.getByTestId("section-card");
const tray = screen.getByTestId("block-preview");
const slot = screen.getByTestId("place-0");

expect(slot).toContainElement(card);
expect(slot).not.toContainElement(tray);
expect(tray).toHaveAttribute("data-preview-theme");
```

In `block-card.test.tsx`, render a `comic` section and assert the section-name
input/card has no inline `--skin-*`, `backgroundImage`, or `clipPath`; keep the
existing real-renderer preview assertion, moved to the editor-level test.

- [ ] **Step 2: Run the focused tests and verify they fail against the coupled card**

Run:

```bash
pnpm --filter hub exec vitest run \
  tests/block-card.test.tsx \
  tests/block-editor.test.tsx
```

Expected: FAIL because the preview is still inside the droppable/card and the
card still carries section style.

- [ ] **Step 3: Extract the real renderer into `SectionPreviewTray`**

Move the current private `Preview` parse/render behavior out of
`block-card.tsx`. The new component:

```tsx
export function SectionPreviewTray({
  block,
  position,
  lang,
  page,
  theme,
  title,
}: SectionPreviewTrayProps): ReactNode {
  const parsed = lenientBlockSchema.safeParse(block);
  if (!parsed.success) return null;
  const chosen = blockStyle(block.style);
  const { inherited, painted } = splitStyle(chosen);
  return (
    <div {...tid("block-preview")} className="grid gap-1.5">
      <span className="text-xs font-medium text-(--muted)">{title}</span>
      <PreviewThemeHost
        theme={theme}
        className="relative overflow-hidden rounded-xl"
      >
        <div
          aria-hidden
          style={painted}
          className="pointer-events-none absolute inset-0"
        />
        <div style={inherited} className="relative">
          <Block
            block={parsed.data}
            locale={lang}
            depth={0}
            path={`preview-${position}`}
            page={page}
          />
        </div>
      </PreviewThemeHost>
    </div>
  );
}
```

Keep style splitting local/private unless another production caller already
needs it. Preserve the `undefined`-instead-of-empty-style behavior.

- [ ] **Step 4: Make `BlockCard` controls-only**

Delete the `blockStyle` split, decorative author face, and depth-zero preview
from `BlockCard`. Give the outer control shell its own stable class:

```tsx
<div
  {...tid(ids.card)}
  className="@container relative grid gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-3"
>
```

Nested cards follow the same control style. Keep collapse/refusal behavior and
all places/edit controls unchanged.

- [ ] **Step 5: Place each tray outside the droppable**

Add `theme: ActorTheme` to `BlockEditorProps<T>`. For each top-level
container, render:

```tsx
<div key={seat.key} className="grid gap-3">
  <BlockSlot path={[seat.position]} filled label={labels.dragSection}>
    {(handle) => <BlockCard ... dragHandle={handle} />}
  </BlockSlot>
  {isContainer(seat.block) ? (
    <SectionPreviewTray
      block={seat.block}
      position={seat.position}
      lang={lang}
      page={page}
      theme={theme}
      title={labels.previewTitle}
    />
  ) : null}
</div>
```

The tray may stay under `DndContext`, but no `BlockSlot`/`useDroppable` wraps
it. A top-level leaf keeps no section tray because it is a recovery shape the
editor does not create.

- [ ] **Step 6: Run unit tests and verify green**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Move browser face assertions to the tray**

Update `section-card-face.spec.ts` so author background/clip/skin are asserted
under `block-preview`; assert the section input remains on an opaque AeleOS
surface. Do not weaken contrast/hit-testing expectations.

- [ ] **Step 8: Sabotage section-style isolation**

Temporarily put the inherited style back on the `BlockCard` wrapper; rerun the
new unit/browser guard; expected FAIL. Restore and rerun green.

- [ ] **Step 9: Commit Task 2**

```bash
git add \
  apps/hub/src/features/actors/presentation/section-preview-tray.tsx \
  apps/hub/src/features/actors/presentation/block-card.tsx \
  apps/hub/src/features/actors/presentation/block-editor.tsx \
  apps/hub/tests/block-card.test.tsx \
  apps/hub/tests/block-editor.test.tsx \
  apps/hub/tests/e2e/section-card-face.spec.ts
git commit -m "feat(actors): split section controls from live previews"
```

---

### Task 3: Complete Live Page Preview

**Files:**

- Create:
  `apps/hub/src/features/actors/presentation/complete-page-preview.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/src/app/[locale]/(app)/pages/labels.ts`
- Modify:
  `apps/hub/src/shared/infrastructure/i18n/messages/en.json`
- Modify:
  `apps/hub/src/shared/infrastructure/i18n/messages/es.json`
- Modify: `apps/hub/tests/support/editor-labels.ts`
- Create: `apps/hub/tests/complete-page-preview.test.tsx`
- Modify: `apps/hub/tests/fursona-editor.test.tsx`
- Modify: `apps/hub/tests/messages.test.ts`

**Interfaces:**

- Consumes: `PreviewThemeHost`, `PublicBlocks`, live `Block[]`, `ActorTheme`,
  `PageContext`, `AuthoringLanguage`.
- Produces:
  `CompletePagePreview({ blocks, theme, lang, page, labels }:
CompletePagePreviewProps): ReactNode`
- Adds `completePreview: { title; expand; collapse }` to
  `FursonaEditorLabels`.

- [ ] **Step 1: Add catalogue keys and failing component tests**

Add:

```json
"completePreviewTitle": "Complete page preview",
"completePreviewExpand": "Show complete page",
"completePreviewCollapse": "Hide complete page"
```

Spanish:

```json
"completePreviewTitle": "Vista previa de la página completa",
"completePreviewExpand": "Ver la página completa",
"completePreviewCollapse": "Ocultar la página completa"
```

Create `complete-page-preview.test.tsx`:

```tsx
it("starts collapsed and renders the real full page only when opened", async () => {
  render(
    <CompletePagePreview
      blocks={blocks}
      theme={theme}
      lang="en"
      page={page}
      labels={labels}
    />,
  );
  expect(screen.queryByTestId("complete-page-preview-content")).toBeNull();
  await user.click(screen.getByRole("button", { name: labels.expand }));
  expect(screen.getAllByTestId("public-section")).toHaveLength(blocks.length);
  expect(screen.getByTestId("complete-page-preview-content")).toHaveAttribute(
    "data-preview-theme",
    "",
  );
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
pnpm --filter hub exec vitest run tests/complete-page-preview.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the collapsed disclosure**

Use a button with `aria-expanded`/`aria-controls` so labels may change between
expand/collapse. Render `PublicBlocks` only while open:

```tsx
export function CompletePagePreview(
  props: CompletePagePreviewProps,
): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="mt-8 grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2>{props.labels.title}</h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? props.labels.collapse : props.labels.expand}
        </button>
      </div>
      {open ? (
        <PreviewThemeHost
          theme={props.theme}
          className="overflow-hidden rounded-xl"
        >
          <div id={id} {...tid("complete-page-preview-content")}>
            <PublicBlocks
              blocks={props.blocks}
              locale={props.lang}
              page={props.page}
            />
          </div>
        </PreviewThemeHost>
      ) : null}
    </section>
  );
}
```

TSDoc must state default collapse, real renderer, and read-only behavior.

- [ ] **Step 4: Wire labels and live form values**

In `FursonaEditor`, watch identity and theme only:

```ts
const [liveHandle, liveName, liveAvatar, liveTheme] = useWatch({
  control,
  name: ["handle", "displayName", "avatarUrl", "theme"],
});
```

Set `livePage.measure = liveTheme.measure ?? null`. Pass `liveTheme` to
`BlockEditor`. Render a small complete-preview controller immediately after
`BlockEditor`, outside its `DndContext`; that controller alone watches
`sections` and hands them with `liveTheme`, `lang`, and `livePage` to
`CompletePagePreview`.

Resolve the three new labels in `pages/labels.ts` and add matching fixture
values in `tests/support/editor-labels.ts`.

- [ ] **Step 5: Run component, editor, and catalogue tests**

Run:

```bash
pnpm --filter hub exec vitest run \
  tests/complete-page-preview.test.tsx \
  tests/fursona-editor.test.tsx \
  tests/messages.test.ts \
  tests/message-keys-exist.test.ts
```

Expected: PASS. The editor test must assert ordering: theme panel, language
strip, section workbench, complete preview.

- [ ] **Step 6: Verify live identity and measure**

Extend `fursona-editor.test.tsx`: type a new display name/avatar/handle, open
the complete preview, and assert identity leaves use the unsaved values. Change
theme measure and assert the `PublicBlocks` gutter uses the live measure class.

- [ ] **Step 7: Commit Task 3**

```bash
git add \
  apps/hub/src/features/actors/presentation/complete-page-preview.tsx \
  apps/hub/src/features/actors/presentation/fursona-editor.tsx \
  "apps/hub/src/app/[locale]/(app)/pages/labels.ts" \
  apps/hub/src/shared/infrastructure/i18n/messages/en.json \
  apps/hub/src/shared/infrastructure/i18n/messages/es.json \
  apps/hub/tests/support/editor-labels.ts \
  apps/hub/tests/complete-page-preview.test.tsx \
  apps/hub/tests/fursona-editor.test.tsx \
  apps/hub/tests/messages.test.ts
git commit -m "feat(actors): add an inline complete-page preview"
```

---

### Task 4: Browser Guards, Documentation, and Full Verification

**Files:**

- Modify: `apps/hub/tests/e2e/block-drag.spec.ts`
- Modify: `apps/hub/tests/e2e/a11y.spec.ts`
- Modify: `apps/hub/tests/e2e/responsive.spec.ts` only if new locators are
  needed; do not weaken assertions.
- Modify:
  `apps/hub/tests/e2e/personalised-page-cost.spec.ts` only if measured
  distributions require it.
- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify:
  `docs/superpowers/specs/2026-08-21-builder-workbench-design.md` status to
  delivered and append measured corrections.

**Interfaces:**

- No new production API.
- Produces permanent browser regression coverage for chrome/theme isolation,
  preview drag exclusion, accessibility, responsive layout, and performance.

- [ ] **Step 1: Add the browser-level chrome isolation case**

On a real editor route:

1. Record computed design token/style values for toolbar, identity input, and
   section-name input.
2. Open theme controls and change background/accent/skin.
3. Assert those controls keep the recorded values.
4. Assert `block-preview` and opened `complete-page-preview-content` changed.

The fixture must choose values distinct from defaults. Sabotage by restoring
document-level `themeCss`; the control assertion must fail first.

- [ ] **Step 2: Add preview-as-non-target drag coverage**

In `block-drag.spec.ts`, begin a pointer drag, hover the section preview before
release, and assert no public rendered seat gains the editor's `data-over`
marker and no invalid drop is announced. Keep existing keyboard cases.

- [ ] **Step 3: Extend a11y coverage**

Open the complete preview in `a11y.spec.ts`, run the existing WCAG A/AA scan,
and assert the workbench section heading precedes its preview content heading.
Do not enable the whole `best-practice` family.

- [ ] **Step 4: Run focused authenticated browser tests**

Run with secrets loaded in the same invocation:

```bash
set -a; . ./.secrets; set +a
pnpm --filter hub exec playwright test \
  tests/e2e/section-card-face.spec.ts \
  tests/e2e/block-drag.spec.ts \
  tests/e2e/a11y.spec.ts \
  tests/e2e/responsive.spec.ts
```

Expected: all selected cases pass, with no environment-conditioned skips.

- [ ] **Step 5: Measure performance without moving the budget by instinct**

Run the good build twice:

```bash
set -a; . ./.secrets; set +a
pnpm --filter hub exec playwright test tests/e2e/personalised-page-cost.spec.ts
pnpm --filter hub exec playwright test tests/e2e/personalised-page-cost.spec.ts
```

Then sabotage preview isolation by restoring document-level theme CSS and run
once. Record all three values in the spec correction note. Change no ceiling
unless the good-build spread and sabotaged distribution have a separating
gap.

- [ ] **Step 6: Update enforced documentation**

Update `apps/hub/src/features/actors/CLAUDE.md`:

- controls use AeleOS tokens and never inherit author theme/style
- per-section and complete preview hosts use the real renderers
- complete preview is outside DnD and collapsed by default
- remove the old statement that a theme reaches the whole editor

Mark the design spec delivered, and record implementation corrections and
performance measurements. Update changed export TSDoc in the same edits.

- [ ] **Step 7: Run all local gates**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:hub:coverage
pnpm check:docs
pnpm check:tools
pnpm check:contrast
pnpm secretlint
pnpm --filter hub build
```

Then run the full authenticated browser suite and compare the passed/skipped
case count, not just the exit code:

```bash
set -a; . ./.secrets; set +a
pnpm --filter hub test:e2e
```

Expected: all gates green and no credentialed suite silently skipped.

- [ ] **Step 8: Commit Task 4**

```bash
git add \
  apps/hub/tests/e2e/block-drag.spec.ts \
  apps/hub/tests/e2e/a11y.spec.ts \
  apps/hub/tests/e2e/responsive.spec.ts \
  apps/hub/tests/e2e/personalised-page-cost.spec.ts \
  apps/hub/src/features/actors/CLAUDE.md \
  docs/superpowers/specs/2026-08-21-builder-workbench-design.md
git commit -m "test(actors): prove builder chrome stays separate from previews"
```

Only stage files that actually changed; do not add the performance/responsive
files merely because they are listed.

---

### Task 5: Review, Push, and Shepherd the Pull Request

**Files:**

- Review every file in `git diff origin/main...HEAD`.
- No planned production changes in this task.

**Interfaces:**

- Produces one implementation PR with squash auto-merge enabled by the
  repository workflow.

- [ ] **Step 1: Run a fresh diff review**

Check:

```bash
git status --short
git diff --check
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Confirm only builder-workbench changes are tracked and
`apps/hub/.gitignore` remains untracked.

- [ ] **Step 2: Request code review**

Use the repository's code-review workflow on `branch changes`. Fix verified
high/medium findings with regression tests; rebut technically incorrect
findings with evidence.

- [ ] **Step 3: Re-run proportional verification after review fixes**

At minimum:

```bash
pnpm lint
pnpm typecheck
pnpm test:hub:coverage
pnpm --filter hub build
```

Re-run affected browser specs for any presentation change.

- [ ] **Step 4: Push and open the PR**

Push `cursor/builder-workbench-implementation`, create a PR against `main`,
include the control/preview boundary and sabotage evidence, and confirm squash
auto-merge is armed.

- [ ] **Step 5: Watch required checks and repair mechanical failures**

Required checks: `conformance`, `hub`, `idp-cloud`, `e2e`, `schema-drift`,
`canvas`. Branch protection is strict. Fix failures attributable to this
change, push normally, and stop only when all checks are green or a definitive
external blocker is confirmed.
