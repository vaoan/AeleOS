# The editor wears the page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invert the editor's theming so the document wears the author's page
and the controls are the contained exception, delete the framed preview
entirely, and prove with a hostile responsive Playwright fixture that hiding the
controls yields the live page exactly.

**Architecture:** `ThemeScope` — the component public routes already use — goes
on the editor document. Control islands wear a new `.aeleos-chrome` class whose
tokens come from widening the selectors of the token blocks already in
`globals.css`, so nothing is duplicated. Section previews stop being cards and
render through `pageBoxClass`, the same page box a public page lays them in. A
hide-controls toggle removes every control, leaving the page.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4 (`@import
"tailwindcss"`), Vitest, Playwright, Supabase RPC fixtures, Clerk test
identities.

**Spec:** `docs/superpowers/specs/2026-08-27-the-editor-wears-the-page-design.md`

## Global Constraints

- **Every export carries TSDoc stating the contract, not the types.**
  `pnpm lint` fails without it.
- **Every export is tested on its happy path and each failure mode.** Branch
  coverage gates at 100%; an untested error branch fails the build.
- **Every bug gets a regression test, sabotage-verified against the original
  fault.** A test never seen red proves nothing.
- **Change an implementation, move its documentation.** `pnpm check:docs` is per
  symbol and has no suppression flag.
- **`apps/hub/src/features/actors/CLAUDE.md` is updated in the same task as the
  code it describes**, never swept up at the end.
- **Filenames are kebab-case.** Secrets never in git.
- **Never widen a timeout or a budget to make a check pass.** Split the suite or
  fix the mechanism (root `CLAUDE.md` rules 14 and 33).
- **Name the wrong behaviour each fixture and each sabotage excludes**, and say
  so when one cannot discriminate (rules 27 and 29).
- Measured container-query thresholds, used by Task 6: two places 352px, three
  544px, four 720px, five 944px, six 1072px.

---

### Task 0: The feature note's own upkeep rule

Write the standing obligation into the actors feature note before any code
changes, so it governs every task after it rather than being applied
retroactively.

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md` — a rule at the top, where it
  is read before the note's body.

**Why it belongs in that file rather than the root one:** the root `CLAUDE.md`
already says "change an implementation, move its documentation" and backs it
with `pnpm check:docs`. That check is **per exported symbol** and compares a
symbol against its own code — it is structurally unable to see a feature note
going stale, because nothing about the TypeScript moved. Root rule 18 is that
exposure named; root rule 30 is what it cost. This feature note has now gone
stale three times in twelve days: the `PreviewThemeHost` atmosphere prop it
still documents, the drag-handle note that asserted an open fault for a day
after the fix, and the superseded spec's banner that claimed three phases were
unwritten after they had landed. A note describing another file is a claim
nothing checks, so the check has to be a person, and the obligation has to be
written where that person is already looking.

- [ ] **Step 1: Add the rule**

At the top of `apps/hub/src/features/actors/CLAUDE.md`, before the body:

```markdown
## Read this before you change anything here, and again before you finish

**Every change inside `features/actors/` ends by re-reading this note against
what you just did.** Not a skim for the paragraph you touched — a pass asking
whether anything here has become false, including the parts you did not go near.

Nothing automated can do this for you. `pnpm check:docs` is per exported symbol
and compares a symbol against its own code, so it is blind to a note whose
subject is a different file, a deleted prop, a mechanism that moved, or a debt
that was paid. Root rule 18 names that exposure and root rule 30 is what it cost:
three comments describing a caller that never existed, green through every unit
test, and two headline features shipped broken behind them.

The three questions, in order:

1. **Is anything here now false?** A component named that no longer exists, a
   prop that was deleted, a mechanism replaced, a file path that moved, a
   measured number taken before the code changed.
2. **Is anything here still true but no longer the way we work?** A pattern
   superseded, a constraint lifted, a decision reversed. Say the new one; do
   not leave both.
3. **Did this change establish something the next person needs?** A trap you
   fell into, a mechanism that is not obvious from the code, a reason a
   tempting alternative is wrong. That is what this note is for.

**Whoever fixes a fault deletes the note saying it is open.** A sentence naming
a file and a line reads like a measurement and will be believed. A note left
asserting a closed fault is the confident, wrong instruction this repository
warns about everywhere else — and it has happened here three times in twelve
days: the `PreviewThemeHost` atmosphere prop, the drag handle recorded as
broken for a day after `#154` fixed it, and a superseded spec's banner claiming
unwritten phases that had already landed.
```

- [ ] **Step 2: Verify the note still passes its gates**

Run: `npx cspell "apps/hub/src/features/actors/CLAUDE.md" --no-progress`
Expected: no issues. Confirm the file is pure LF and its byte count is sane —
prose has no compiler, and root rule 28 records a `CLAUDE.md` committed with
every newline stripped that no check noticed.

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/features/actors/CLAUDE.md
git commit -m "docs(actors): the feature note is re-read on every change to this folder"
```

---

### Task 1: Chrome tokens

Give control islands a class that restores the app's own palette on their own
element, so an author theme at `:root` cannot reach them.

**Files:**

- Modify: `apps/hub/src/app/globals.css` — the `:root` block declaring colour
  tokens, the `[data-theme="dark"]` block, and the `:root` block declaring skin
  defaults.
- Create: `apps/hub/src/shared/domain/chrome.ts` — the class name as a constant.
- Test: `apps/hub/tests/chrome-tokens.test.ts`

**Interfaces:**

- Produces: `CHROME_SCOPE: string` from `@/shared/domain/chrome`, the class every
  control island wears. Mirrors `SKIN_SCOPE` in `shared/domain/skins.ts`.

**Why the selector widens rather than a second block being written:** the app's
tokens are declared once. A second block restating them is 65 values free to
drift, and `check:docs` cannot see a stylesheet.

**Why the composed properties matter and are the whole trap:** `--surface: var(--surface-solid)`
and `--bar: var(--bar-solid)` are composed at `:root`. A descendant inherits the
already-resolved value, so restating only the raw colours leaves `--surface`
carrying the author's. This is the fault `previewThemeCss`'s `ROOT_COMPOSED`
exists for. Widening the block that declares both the raws and the composed
pair fixes it, because both are then declared on the chrome element itself.

- [ ] **Step 1: Write the failing test**

`apps/hub/tests/chrome-tokens.test.ts` reads `globals.css` as text and asserts
the three token blocks name the chrome class, in the same shape `skins.test.ts`
already parses that stylesheet:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHROME_SCOPE } from "@/shared/domain/chrome";

const CSS = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

describe("chrome tokens", () => {
  it("declares the app palette on the chrome class as well as the root", () => {
    expect(CSS).toContain(`:root,\n.${CHROME_SCOPE} {`);
  });

  it("declares the dark palette on a chrome island inside a dark document", () => {
    expect(CSS).toContain(
      `[data-theme="dark"],\n[data-theme="dark"] .${CHROME_SCOPE} {`,
    );
  });

  it("restates the composed properties, which a descendant cannot re-derive", () => {
    const block = CSS.slice(
      CSS.indexOf(`:root,\n.${CHROME_SCOPE} {`),
      CSS.indexOf("}", CSS.indexOf(`:root,\n.${CHROME_SCOPE} {`)),
    );
    expect(block).toContain("--surface: var(--surface-solid)");
    expect(block).toContain("--bar: var(--bar-solid)");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub test chrome-tokens`
Expected: FAIL — `Cannot find module '@/shared/domain/chrome'`.

- [ ] **Step 3: Add the constant**

`apps/hub/src/shared/domain/chrome.ts`, with TSDoc stating the contract: what a
caller may assume about an element wearing it, and that it must not be put on
`<html>`.

```ts
/**
 * The class marking an island of AeleOS's own controls.
 *
 * **The mirror of `SKIN_SCOPE`, and the inversion this app's editor rests on.**
 * A public page themes the document; the editor does too, so a control sitting
 * on that document would wear the author's palette. An element carrying this
 * class re-declares the app's tokens ON ITSELF, and a caller may assume every
 * descendant resolves the app's colours, surfaces, edges and skin defaults
 * whatever the author wrote at `:root`.
 *
 * **Never put it on `<html>`.** The tokens are declared for `:root` and for
 * this class in the same rule; an element that is both matches one selector
 * twice and gains nothing, while the author's theme — which targets `:root`
 * from an unlayered stylesheet injected later — would win the element outright.
 */
export const CHROME_SCOPE = "aeleos-chrome";
```

- [ ] **Step 4: Widen the three blocks in `globals.css`**

Each becomes a selector list. Add a comment above the first naming the
mechanism, because a widened selector reads like tidiness and is load-bearing:

```css
/*
 * **The palette is declared for the ROOT and for a chrome island, in one rule.**
 * The editor themes its document with the author's page, so a control on that
 * document would inherit their colours. An island wearing `.aeleos-chrome`
 * re-declares these ON ITSELF, and a declaration on an element always beats one
 * inherited from an ancestor — there is no cascade fight here at all, because
 * the cascade only compares declarations on the same element.
 *
 * **The composed pair below must stay inside this block.** `--surface` and
 * `--bar` are composed from the raw values; a descendant inherits the resolved
 * result, so an island restating only the raws would keep the author's surface.
 * That is the fault `ROOT_COMPOSED` in `domain/actor-theme.ts` exists for.
 */
:root,
.aeleos-chrome {
```

Do the same for `[data-theme="dark"]` and for the `:root` block declaring the
skin defaults — a control inside `SKIN_SCOPE` inherits the author's skin tokens
otherwise.

- [ ] **Step 5: Run the test and the style gate**

Run: `pnpm --filter hub test chrome-tokens && pnpm check:style`
Expected: PASS.

- [ ] **Step 6: Sabotage-verify in a browser, because a string test cannot see a cascade**

A string assertion proves the selector was written, never that it wins. Add
`apps/hub/tests/e2e/chrome-tokens.spec.ts`: seed a page whose theme sets a
hostile field and ink, open the editor, and read the computed `color` of a
control through `textColour` from `support/pixels.ts`. Assert it equals the
app's ink and not the author's.

Then remove `.aeleos-chrome` from that control and watch the case go red.
Restore. Record the measured channel values in the spec's own note.

- [ ] **Step 7: Update the actors feature note**

Add the inversion to `apps/hub/src/features/actors/CLAUDE.md` under the
controls-and-previews section, replacing the paragraph that says
`PreviewThemeHost` is the only editor boundary receiving the theme.

- [ ] **Step 8: Commit**

```bash
git add apps/hub/src/app/globals.css apps/hub/src/shared/domain/chrome.ts \
  apps/hub/tests/chrome-tokens.test.ts apps/hub/tests/e2e/chrome-tokens.spec.ts \
  apps/hub/src/features/actors/CLAUDE.md
git commit -m "feat(shared): a control island keeps the app's palette on a themed document"
```

---

### Task 2: Delete the framed preview

Remove the iframe subsystem outright before anything replaces it, so the editor
in the next tasks has one preview mechanism rather than two.

**Files:**

- Delete: `apps/hub/src/app/[locale]/(preview)/` (whole group),
  `presentation/preview-document.tsx`, `presentation/preview-message.ts`,
  `presentation/complete-page-preview.tsx`, `domain/preview-devices.ts`.
- Delete: `apps/hub/tests/preview-document.test.tsx`,
  `apps/hub/tests/preview-message.test.ts`,
  `apps/hub/tests/preview-devices.test.ts`,
  `apps/hub/tests/e2e/preview-fidelity.spec.ts`,
  `apps/hub/tests/e2e/complete-page-fidelity.spec.ts`.
- Modify: `presentation/fursona-editor.tsx` — drop the preview and its labels.
- Modify: `features/actors/index.ts` — drop the barrel exports.
- Modify: `shared/domain/csp.ts` — `frame-ancestors` back to the narrower value.
- Modify: `apps/hub/src/features/actors/presentation/pages/labels.ts` and the
  message catalogues — drop the device names and size hints.
- Test: `apps/hub/tests/csp.test.ts`

- [ ] **Step 1: Change the CSP test first**

Assert `frame-ancestors` is the narrower value, and run it to watch it fail
against the current `'self'`.

Run: `pnpm --filter hub test csp`
Expected: FAIL.

- [ ] **Step 2: Narrow the policy and rewrite its TSDoc**

The existing comment tells the story of the 2026-08-26 widening. Replace it with
why the widening was reverted, keeping the clickjacking reasoning. Whoever
closes a note deletes it rather than leaving it to be believed.

- [ ] **Step 3: Delete the files above**

- [ ] **Step 4: Remove every reference**

Run: `pnpm typecheck` and fix what it names. Then:

```bash
grep -rn "preview-device\|PREVIEW_DEVICES\|CompletePagePreview\|PreviewDraft\|PREVIEW_READY\|me/preview" apps/hub/src apps/hub/tests docs
```

Expected: only historical references in `docs/` and the superseded specs, which
Task 7 handles.

- [ ] **Step 5: Drop the catalogue keys**

Remove the device names and size hints from both `en` and `es`.
`apps/hub/tests/messages.test.ts` key-checks the two catalogues against each
other, so a key removed from one and left in the other fails the build.

- [ ] **Step 6: Run the gates**

Run: `pnpm --filter hub test && pnpm typecheck && pnpm lint`
Expected: PASS. Coverage must still be 100%; a deleted branch takes its test
with it.

- [ ] **Step 7: Update the actors feature note**

Delete the complete-preview paragraphs and the two-previews contrast. Do not
leave a note describing a component that no longer exists.

- [ ] **Step 8: Commit**

```bash
git commit -am "refactor(actors): the framed preview goes, and frame-ancestors closes again"
```

---

### Task 3: The editor document wears the theme

**Files:**

- Modify: `presentation/fursona-editor.tsx` — wrap in `ThemeScope`, put
  `CHROME_SCOPE` on the control islands.
- Modify: `presentation/theme-configurator.tsx` — drop `atmosphereCss`; the
  document is already themed.
- Modify: `domain/actor-theme.ts` — delete `atmosphereCss` and
  `ATMOSPHERE_PROPERTIES`.
- Modify: `application/use-fursona-editor.ts` — the TSDoc naming the atmosphere
  mechanism.
- Delete: `presentation/preview-theme-host.tsx` and its test.
- Test: `apps/hub/tests/actor-theme.test.ts` (drop the atmosphere cases),
  `apps/hub/tests/fursona-editor.test.tsx`

- [ ] **Step 1: Write the failing test**

In `fursona-editor.test.tsx`, assert the editor renders a `ThemeScope` carrying
the live draft theme, and that the toolbar element carries `CHROME_SCOPE`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub test fursona-editor`
Expected: FAIL.

- [ ] **Step 3: Wrap the editor and mark the islands**

`ThemeScope` takes the live theme from the form, so every keystroke in the theme
panel repaints the document — which is what `atmosphereCss` was doing for three
properties and now happens for all of them with no second mechanism.

Every control island gets `CHROME_SCOPE`: the toolbar, the identity fields, each
block card, the leaf editors, the menus, the theme panel, the template picker
and the section style popup.

- [ ] **Step 4: Delete `atmosphereCss` and `PreviewThemeHost`**

Both exist only to do partially what the document now does wholly. An option
with no caller is what `COLUMN.full` cost this app twice.

- [ ] **Step 5: Run the gates**

Run: `pnpm --filter hub test && pnpm typecheck && pnpm lint`

- [ ] **Step 6: Sabotage-verify the containment**

Remove `CHROME_SCOPE` from the toolbar and watch `chrome-tokens.spec.ts` from
Task 1 go red. Restore.

- [ ] **Step 7: Update the actors feature note and commit**

```bash
git commit -am "feat(actors): the editor document wears the author's page"
```

---

### Task 4: The tray becomes a page slot

**Files:**

- Modify: `presentation/section-preview-tray.tsx`
- Modify: `presentation/blocks.tsx` — export `pageBoxClass` for the editor, or a
  thin wrapper that composes one section's page box.
- Modify: `presentation/block-editor.tsx` — the editor column stops before the
  section renders.
- Modify: `app/[locale]/(app)/pages/[handle]/edit/page.tsx` and
  `app/[locale]/(app)/me/edit/page.tsx` — ask the shell for a full-width `main`.
- Test: `apps/hub/tests/section-preview-tray.test.tsx`

**The bug fixed here:** `overflow-x-auto` on the tray host. A `visible` axis
paired with a non-visible one computes to `auto`, so the box clips on all four
edges; ink overflow is not scrollable overflow, so nothing scrolls and no
scrollbar appears. Every `neon` glow and `comic` shadow in a tray is cut off.
This is the same fault fixed on the complete preview on 2026-08-25, one level
down.

- [ ] **Step 1: Write the failing regression test for the clipping**

An e2e case, because `getComputedStyle` resolves correctly on an element whose
paint an ancestor is throwing away — only a photograph can see this. Seed a
`neon` section, photograph the strip just outside its box in the editor and on
the page, and assert both carry the glow. Watch it fail on the unfixed code and
record the channel figures.

- [ ] **Step 2: Write the failing test for the page box**

Assert the tray renders the author's measure class, `bleed` when the section
bleeds, and no measure class when it does not — the classes `MEASURE_CLASS`
already names.

- [ ] **Step 3: Run both and watch them fail**

- [ ] **Step 4: Apply the page box and strip the card**

The label, padding, rounding, border and surface fill move into the control
card. `overflow-x-auto` is deleted. The remaining element is the page box and
the section.

- [ ] **Step 5: Give the editor a full-width `main`**

Both editor routes ask for the full width, and the control cards keep their own
column with `WidePageColumn` — the arrangement the complete preview already
used. A section owning its measure is what lets one bleed without `w-screen`.

- [ ] **Step 6: Run the gates and sabotage-verify**

Restore `overflow-x-auto` and watch the glow case redden. Restore the fix.

- [ ] **Step 7: Update the actors feature note and commit**

```bash
git commit -am "fix(actors): a section in the editor is laid in the page's own box"
```

---

### Task 5: Hide the controls

**Files:**

- Create: `presentation/controls-visibility.tsx` — the toggle and its context.
- Modify: `presentation/fursona-editor.tsx`, `presentation/block-editor.tsx`
- Modify: message catalogues, both languages.
- Test: `apps/hub/tests/controls-visibility.test.tsx`

- [ ] **Step 1: Write the failing test**

With controls hidden: no control card, no toolbar, no editor bar in the tree;
the sections and `page-content` still there; the restore control present and
outside `page-content`.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement the toggle**

State lives in the editor and is not persisted — it is a way of looking at the
page, not a preference. The restore control is positioned `fixed` outside
`page-content` so it cannot enter Task 6's comparison.

- [ ] **Step 4: Accessibility**

The toggle is a real button with an accessible name from both catalogues, and
`a11y.spec.ts` covers the hidden state as well as the shown one.

- [ ] **Step 5: Run the gates, update the feature note, commit**

```bash
git commit -am "feat(actors): the controls can step out of the way"
```

---

### Task 6: The proof

**Files:**

- Create: `apps/hub/tests/e2e/editor-is-the-page.spec.ts`
- Modify: `apps/hub/tests/e2e/support/blocks.ts` if the hostile fixture needs a
  seeder it does not have.

**Interfaces:**

- Consumes: `compareShots`, `sectionBoxes`-shaped box reading, `servePhoto` and
  the pinned-scroll idiom from the deleted `preview-fidelity.spec.ts` — lift
  them from git history rather than rewriting, since each encodes a measurement.

- [ ] **Step 1: Build the hostile fixture**

Every element listed in the spec's "The fixture is built to discriminate". Name
the wrong behaviour each element excludes, in the file header, in the shape
`preview-fidelity.spec.ts` used.

- [ ] **Step 2: Write the equality case at 1280 first**

Photograph `page-content` in hide-controls mode and on the live page, at the
same viewport and the same pinned scroll offset, and require the tenth-of-a-
percent budget. Assert section boxes are equal as an exact claim alongside it.

- [ ] **Step 3: Run it and watch it fail or pass, and say which**

If it passes first time, that is a finding to be suspicious of, not a result to
accept — check the fixture can discriminate before believing it.

- [ ] **Step 4: Add the responsive matrix**

Stops 320, 390, 536, 552, 712, 728, 1280. The pairs straddle the measured
three-place threshold of 544px and four-place threshold of 720px.

- [ ] **Step 5: Sabotage each stop**

For each, name the wrong behaviour excluded and confirm the fixture at that
width can tell it from the right one. Candidate sabotages: restore the editor
column so a gutter is doubled; drop the measure class from the tray; put the
card face back. Watch which stops redden, and report any that cannot
discriminate rather than counting them.

- [ ] **Step 6: Measure the runtime**

Report it. If a stop is slow, split the suite; never widen a budget.

- [ ] **Step 7: Fix what it finds**

Findings are fixed on this branch. Each gets its own regression test at the
level the bug lived at.

- [ ] **Step 8: Commit**

```bash
git commit -am "test(actors): hiding the controls yields the live page, at seven widths"
```

---

### Task 7: The documentation the change owes

**Files:**

- Modify: `CLAUDE.md` (root) — the current-state bullets for 2026-08-24,
  2026-08-25 and 2026-08-26, which describe mechanisms this branch deletes.
- Modify: `docs/superpowers/specs/2026-08-24-atmosphere-and-page-fidelity-design.md`
  and `docs/superpowers/specs/2026-08-26-preview-route-design.md` — superseded
  banners.
- Modify: `apps/hub/src/features/actors/CLAUDE.md` — final read-through.

- [ ] **Step 1: Put a superseded banner on both specs**

Naming this spec, and what remains true in each. The root note already records
that a banner is only a banner while somebody updates it, and that this exact
pair went stale for a day.

- [ ] **Step 2: Rewrite the three root bullets**

They describe the framed preview, the device sizes, the backdrop banding and
`atmosphereCss` as current. Whoever removes a mechanism deletes the note saying
it exists.

- [ ] **Step 3: Fix the stale atmosphere-prop note**

`features/actors/CLAUDE.md` documents a `PreviewThemeHost` prop with two modes.
Both the prop and the component are gone by Task 3.

- [ ] **Step 4: Add the rule this branch earned**

If the fixture found a fault invisible to every existing check, write the
general form into the root `CLAUDE.md` rules list as this repository does.

- [ ] **Step 5: Run the doc gates**

Run: `pnpm check:docs && npx cspell "**/*.md" --no-progress`

- [ ] **Step 6: Commit**

```bash
git commit -am "docs: the editor wears the page, and the framed preview's notes go with it"
```

---

### Task 8: Full verification and the pull request

- [ ] **Step 1: Every gate, in the order CI runs them**

```bash
pnpm typecheck && pnpm lint && pnpm --filter hub test:coverage && pnpm check:tools && pnpm check:docs
```

- [ ] **Step 2: The browser suite, whole**

The suite skips most of itself without credentials and prints a pass. Source
them in the same invocation and compare the case count, not the word "passed":

```bash
set -a; . ./.secrets; set +a; pnpm --filter hub test:e2e
```

- [ ] **Step 3: Schema drift**

Run: `pnpm check:schema-drift`. Nothing here touches SQL, so this should be
clean; a report naming a function this branch did not touch is a line-endings
report until proven otherwise.

- [ ] **Step 4: Open the pull request and post the picture proof**

Photographs as a comment on the PR, using the PAT in `.secrets` and the
procedure in `docs/git-with-gh-token.md`. Confirm `gh api user` first. Caption
each with the claim it proves: the editor wearing a hostile theme with its
controls legible, the same page with controls hidden beside the live page, and a
narrow stop where the collapse threshold matters. Do not commit the images.
