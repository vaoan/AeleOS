# Era looks, phase 1 — a template is a document

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a shipped template carry a theme as well as a page, applied
through the same `parseDocument` path a pasted document already uses, so an era
look can be picked rather than only pasted.

**Architecture:** `FursonaTemplate` stops being `{ id, sections }` in the
pre-block vocabulary and becomes `{ id, document }`, where `document` is the
`{ aeleos, theme, blocks }` envelope `page-document.ts` owns. `FursonaEditor`
grows one `applyDocument` callback used by BOTH the source dock and the
template picker — the "one path, not two" the spec requires — and
`holdsNothingAuthored` learns to count a chosen theme as authored work.

**Tech Stack:** TypeScript, React, react-hook-form, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-28-era-looks-design.md`

> **Correction, made while executing Task 2 (2026-08-28).** This plan was
> written against a `PageDocument` type that **does not exist**.
> `page-document.ts` is text-in and text-out: `toDocument` returns a JSON
> string and `parseDocument` consumes one. So a shipped template carries the
> shape `parseDocument` RETURNS — `{ theme: ActorTheme | null; blocks: Block[] }`
> — rather than JSON text, and is not re-parsed at runtime.
>
> That is a better design than the one written below, not merely an
> accommodation. Shipped templates are ours and type-checked at compile time;
> round-tripping them through JSON at runtime would parse our own data to
> discover errors the compiler already refuses, and hide type errors behind a
> runtime check. What "one path, not two" actually buys is that APPLICATION is
> shared — `applyDocument` in Task 4, called by the dock with what
> `parseDocument` returned and by the picker with a template's literal — and
> that is preserved exactly.
>
> The guarantee the plan wanted from parsing is kept as a BUILD-TIME one
> instead: Task 2's test round-trips every shipped template through the real
> `toDocument`/`parseDocument` pair, so a malformed template fails the build
> rather than a user's editor. Read `PageDocument` below as
> `{ theme, blocks }` throughout.

## Global Constraints

- **A look is never a default.** Absence keeps meaning what it meant before;
  no stored page changes appearance.
- **An absent theme means "leave the current theme alone", never "reset".**
  `parseDocument` already distinguishes an omitted `theme` from a malformed
  one; templates ride that rule.
- **An import uses the READ path's guards, never the write path's.** Root rule
  37: `themeSchema` is loose because a colour input cannot produce anything
  else, which is a statement about a widget. `parseTheme` is the correct guard.
- **Every export carries TSDoc stating the contract**, and `pnpm check:docs`
  fails when code moves and its documentation does not.
- **Every export is tested on its happy path and each failure mode**, and any
  test guarding already-correct behaviour is verified by sabotage.
- **Run `pnpm lint` from the repository root**, never from `apps/hub`.
- **Source `.secrets` in the same invocation as any browser run**
  (`set -a; . ./.secrets; set +a`), and check the case COUNT rather than the
  word "passed" — root rule 31.

---

## File structure

| file                                                            | responsibility                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/hub/src/features/actors/domain/fursona-templates.ts`      | The shipped templates, now as documents. Modify.           |
| `apps/hub/src/features/actors/domain/required-blocks.ts`        | `holdsNothingAuthored`, extended to count a theme. Modify. |
| `apps/hub/src/features/actors/presentation/template-picker.tsx` | Hands out a document instead of sections. Modify.          |
| `apps/hub/src/features/actors/presentation/block-editor.tsx`    | Forwards the picker's document upward. Modify.             |
| `apps/hub/src/features/actors/presentation/fursona-editor.tsx`  | Owns `applyDocument`, shared with the dock. Modify.        |
| `apps/hub/tests/fursona-templates.test.ts`                      | Every shipped template parses. Create.                     |
| `apps/hub/tests/required-blocks.test.ts`                        | The theme half of the guard. Modify.                       |
| `apps/hub/tests/template-picker.test.tsx`                       | Picker hands out a document. Modify.                       |
| `apps/hub/tests/fursona-editor.test.tsx`                        | One path; theme applied; absent theme preserved. Modify.   |

---

### Task 1: `holdsNothingAuthored` counts a chosen theme

Today it asks only about blocks, so somebody who picked colours and nothing
else is told nothing before a template replaces them.

**Files:**

- Modify: `apps/hub/src/features/actors/domain/required-blocks.ts`
- Test: `apps/hub/tests/required-blocks.test.ts`

**Interfaces:**

- Consumes: `isCustomised` from `@/features/actors/domain/actor-theme`.
- Produces: `holdsNothingAuthored(blocks: readonly Block[], kind: ActorKind,
theme?: ActorTheme | null): boolean` — the third parameter is OPTIONAL, so
  every existing caller keeps compiling and the new behaviour is opt-in at the
  call site.

- [ ] **Step 1: Write the failing test**

Add to `apps/hub/tests/required-blocks.test.ts`:

```ts
it("counts a chosen theme as the author's work", () => {
  // The scaffold a brand-new page opens with — nothing authored in the blocks.
  const blocks = withRequiredBlocks([], "fursona");
  expect(holdsNothingAuthored(blocks, "fursona")).toBe(true);

  // Same blocks, but they have picked a colour. Replacing the page would
  // take that with it, so the picker has to ask.
  expect(
    holdsNothingAuthored(blocks, "fursona", {
      ...DEFAULT_THEME,
      accent: "#e21233",
    }),
  ).toBe(false);
});

it("does not count an untouched theme", () => {
  // Anti-vacuity: the case above must fail because the theme is CUSTOMISED,
  // not merely because a theme was passed at all.
  const blocks = withRequiredBlocks([], "fursona");
  expect(holdsNothingAuthored(blocks, "fursona", DEFAULT_THEME)).toBe(true);
  expect(holdsNothingAuthored(blocks, "fursona", null)).toBe(true);
});
```

Import `DEFAULT_THEME` from `@/features/actors/domain/actor-theme` alongside
the existing imports.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter hub exec vitest run tests/required-blocks.test.ts -t "chosen theme"
```

Expected: FAIL — the third argument is not accepted, or is ignored and the
call returns `true`.

- [ ] **Step 3: Implement**

In `required-blocks.ts`, add the import and the parameter:

```ts
export function holdsNothingAuthored(
  blocks: readonly Block[],
  kind: ActorKind,
  theme?: ActorTheme | null,
): boolean {
  // A chosen look is the author's work even when the page is still the
  // scaffold: replacing it would take their colours with it, and the whole
  // point of this predicate is deciding whether to warn about that.
  if (theme && isCustomised(theme)) return false;
  if (blocks.length === 0) return true;
  return (
    JSON.stringify(blocks) === JSON.stringify(withRequiredBlocks([], kind))
  );
}
```

Update its TSDoc to say what the third parameter decides and that it is
optional — `pnpm check:docs` fails otherwise, and the `@param` must be named.

- [ ] **Step 4: Run and watch it pass**

```bash
pnpm --filter hub exec vitest run tests/required-blocks.test.ts
```

- [ ] **Step 5: Sabotage-verify**

Delete the `if (theme && isCustomised(theme)) return false;` line, re-run, and
confirm the "counts a chosen theme" case reddens and "does not count an
untouched theme" stays green. Restore by copying the file back — never
`git checkout --`, which discards uncommitted work (root rule 34).

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/domain/required-blocks.ts apps/hub/tests/required-blocks.test.ts
git commit -m "feat(actors): a chosen theme counts as the author's work"
```

---

### Task 2: A template is a document

**Files:**

- Modify: `apps/hub/src/features/actors/domain/fursona-templates.ts`
- Test: `apps/hub/tests/fursona-templates.test.ts` (create)

**Interfaces:**

- Consumes: `PageDocument` and `parseDocument` from
  `@/features/actors/domain/page-document`; `sectionsToBlocks` from
  `@/features/actors/domain/section-block-shim`.
- Produces: `interface FursonaTemplate { id: string; document: PageDocument }`
  and `FURSONA_TEMPLATES: readonly FursonaTemplate[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/fursona-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import {
  parseDocument,
  toDocument,
} from "@/features/actors/domain/page-document";

describe("FURSONA_TEMPLATES", () => {
  it("ships at least one template", () => {
    // Anti-vacuity: every assertion below iterates, and an empty list would
    // satisfy all of them for free.
    expect(FURSONA_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("ships a document the real parser accepts", () => {
    for (const template of FURSONA_TEMPLATES) {
      const parsed = parseDocument(JSON.stringify(template.document));
      expect(parsed.ok, `${template.id} parses`).toBe(true);
    }
  });

  it("ships structure and never prose", () => {
    // A template's descriptions are empty because whatever sits in one becomes
    // the person's own writing the instant it is applied.
    const prose = JSON.stringify(FURSONA_TEMPLATES).match(
      /"description_(en|es)":"(?!")/g,
    );
    expect(prose, "no template ships a non-empty description").toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter hub exec vitest run tests/fursona-templates.test.ts
```

Expected: FAIL — `template.document` is undefined, so `JSON.stringify` yields
`undefined` and the parse refuses.

- [ ] **Step 3: Implement**

Change the interface and convert each shipped template's `sections` at module
scope, so the conversion happens once rather than per application:

```ts
export interface FursonaTemplate {
  /** Stable key, and the catalogue key for the name and description. */
  id: string;
  /**
   * The whole page this puts in the editor: blocks AND theme.
   *
   * A document rather than a section list, because a look is chrome plus
   * palette plus heading plus spacing and a template that could only carry
   * structure could never express one. `theme: null` means "leave whatever
   * the author already chose" — see `parseDocument`.
   */
  document: PageDocument;
}
```

Build each entry as `{ id, document: { aeleos: 1, theme: null, blocks:
sectionsToBlocks(sections) } }`, keeping the existing section literals as the
source. Use the real envelope version constant from `page-document.ts` rather
than a literal `1`.

- [ ] **Step 4: Run and watch it pass**

```bash
pnpm --filter hub exec vitest run tests/fursona-templates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/domain/fursona-templates.ts apps/hub/tests/fursona-templates.test.ts
git commit -m "feat(actors): a shipped template is a page document"
```

---

### Task 3: The picker hands out a document

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/template-picker.tsx`
- Test: `apps/hub/tests/template-picker.test.tsx`

**Interfaces:**

- Consumes: `FursonaTemplate` from Task 2.
- Produces: `TemplatePickerProps.onApply: (document: PageDocument) => void`,
  replacing `(sections: FursonaSection[]) => void`.

- [ ] **Step 1: Write the failing test**

In `apps/hub/tests/template-picker.test.tsx`, change the applied-value
assertion to expect an envelope, and add:

```tsx
it("hands out a copy, not the shipped template itself", () => {
  const onApply = vi.fn();
  render(
    <TemplatePicker hasSections={false} labels={labels} onApply={onApply} />,
  );
  fireEvent.click(screen.getByTestId("template-open"));
  fireEvent.click(
    screen
      .getAllByTestId(/^template-/)
      .find((node) => node.getAttribute("data-testid") !== "template-open")!,
  );

  const handed = onApply.mock.calls[0][0];
  expect(handed).not.toBe(FURSONA_TEMPLATES[0].document);
  handed.blocks.length = 0;
  expect(FURSONA_TEMPLATES[0].document.blocks.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter hub exec vitest run tests/template-picker.test.tsx
```

- [ ] **Step 3: Implement**

Change the prop's type and `apply`:

```tsx
const apply = (template: FursonaTemplate): void => {
  onApply(structuredClone(template.document));
  setPending(undefined);
  setOpen(false);
};
```

Update `TemplatePickerProps`' TSDoc: the caller receives a fresh copy, and
applying replaces the page AND the theme.

- [ ] **Step 4: Run and watch it pass**

```bash
pnpm --filter hub exec vitest run tests/template-picker.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/presentation/template-picker.tsx apps/hub/tests/template-picker.test.tsx
git commit -m "feat(actors): the template picker hands out a document"
```

---

### Task 4: One application path, owned by the editor

`BlockEditor` holds the picker but not the theme — `FursonaEditor` owns the
form. This is the task that makes "one path, not two" true.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: `apps/hub/tests/fursona-editor.test.tsx`

**Interfaces:**

- Consumes: `PageDocument` from Task 2, the picker's `onApply` from Task 3.
- Produces: `BlockEditorProps.onApplyDocument: (document: PageDocument) =>
void`, forwarded straight from the picker with no interpretation.

- [ ] **Step 1: Write the failing tests**

In `apps/hub/tests/fursona-editor.test.tsx`:

```tsx
it("applies a template's theme as well as its page", async () => {
  renderEditor();
  const before = document.querySelector("style[data-theme-scope]")?.textContent;
  fireEvent.click(screen.getByTestId("template-open"));
  fireEvent.click(screen.getByTestId("template-starter"));
  await waitFor(() => {
    expect(screen.getAllByTestId("section-card").length).toBeGreaterThan(0);
  });
  expect(
    document.querySelector("style[data-theme-scope]")?.textContent,
  ).not.toBe(before);
});

it("leaves the author's theme alone when a template carries none", async () => {
  // THE CASE THAT WOULD OTHERWISE SHIP UNTESTED. Every fixture tends to carry
  // a theme, so the `theme: null` branch — the one standing between a template
  // and somebody's reset palette — is reached by nothing unless a case aims
  // at it deliberately.
  renderEditor();
  const stylesheet = document.querySelector("style[data-theme-scope]");
  const before = stylesheet?.textContent;
  applyDocumentDirectly({ aeleos: 1, theme: null, blocks: [] });
  expect(document.querySelector("style[data-theme-scope]")?.textContent).toBe(
    before,
  );
});
```

Replace `template-starter` and `data-theme-scope` with the real test id and
the real stylesheet selector after reading `theme-scope.tsx` and
`template-picker.tsx`; do not guess them. If `ThemeScope` marks its element
differently, compare the resolved stylesheet by IDENTITY the way
`fursona-editor.test.tsx`'s existing "leaves the author's theme alone when a
pasted document omits it" case does — copy that case's technique rather than
inventing a second one.

- [ ] **Step 2: Run and watch them fail**

```bash
pnpm --filter hub exec vitest run tests/fursona-editor.test.tsx -t "template"
```

- [ ] **Step 3: Implement**

In `fursona-editor.tsx`, extract the dock's existing apply into one callback
and hand it to both consumers:

```tsx
const applyDocument = useCallback(
  (next: { blocks: Block[]; theme: ActorTheme | null }) => {
    setValue("sections", next.blocks, { shouldDirty: true });
    if (next.theme) setValue("theme", next.theme, { shouldDirty: true });
  },
  [setValue],
);
```

`if (next.theme)` is load-bearing and must not become unconditional: writing a
`null` through resets the author's palette on every template that ships none.

Pass `onApplyDocument={applyDocument}` to `BlockEditor`, and in
`block-editor.tsx` forward the picker's document straight up — still applying
`withRequiredBlocks` to the blocks, because a template names no identity block
and applying one REPLACES the page.

Pass the live theme into `holdsNothingAuthored` at the `hasSections` call site
so Task 1's behaviour is actually reached.

- [ ] **Step 4: Run and watch them pass**

```bash
pnpm --filter hub exec vitest run tests/fursona-editor.test.tsx
```

- [ ] **Step 5: Sabotage-verify the guard**

Make the theme write unconditional (`setValue("theme", next.theme, …)` with no
`if`). Confirm the "leaves the author's theme alone" case reddens. Restore from
a copy.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/presentation/fursona-editor.tsx apps/hub/src/features/actors/presentation/block-editor.tsx apps/hub/tests/fursona-editor.test.tsx
git commit -m "feat(actors): one path applies a document, picker and dock alike"
```

---

### Task 5: The confirmation tells the truth, and the whole thing is proved in a browser

**Files:**

- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/es.json`
- Modify: `apps/hub/src/features/actors/presentation/template-picker.tsx`
- Test: `apps/hub/tests/e2e/editor-saves-page.spec.ts`

- [ ] **Step 1: Reword the confirmation in BOTH catalogues**

It currently warns about replacing the page. It must now say colours go too.
`messages.test.ts` fails when a key exists in one catalogue and not the other,
so both move together or the build breaks.

- [ ] **Step 2: Write the failing browser case**

Extend `editor-saves-page.spec.ts` — which already applies every template
through the real picker, saves, reopens and compares field by field — with an
assertion that a template carrying a theme round-trips its theme too. Read that
file's existing helpers before writing; it has hard-won diagnostic ordering in
`saveAndLeave` that must not be re-derived.

- [ ] **Step 3: Run the whole browser suite with credentials**

```bash
set -a; . ./.secrets; set +a
unset PLAYWRIGHT_BASE_URL
pnpm --filter hub test:e2e
```

Check the case COUNT and that nothing skipped — root rule 31. A run without
`.secrets` silently stands down every suite needing a Clerk identity and still
prints "passed".

- [ ] **Step 4: Run every gate**

```bash
pnpm lint && pnpm typecheck && pnpm check:docs && pnpm check:tools && pnpm --filter hub test
```

- [ ] **Step 5: Update the notes**

`features/actors/CLAUDE.md`: a template is a document now, it carries a theme,
and applying one replaces colours. Delete anything asserting a template is
flat sections — whoever fixes a fault deletes the note saying it is open.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(actors): applying a template says it replaces colours too"
```

---

## Self-review

**Spec coverage.** "A template IS a document" → Tasks 2–4. "Applying replaces
colours, and the confirmation says so" → Tasks 1 and 5. "An absent theme leaves
the current one alone" → Task 4, with its own sabotage. "One path, not two" →
Task 4. The spec's phases 2 and 3 — the five era documents and the fidelity
pass on the eleven — are deliberately NOT in this plan; each gets its own,
because each ships working software on its own and this one is the seam they
both need.

**Placeholders.** Task 4's test names two identifiers I have not read
(`template-starter`, `data-theme-scope`) and says so explicitly, with
instructions to read the real ones and to copy the existing theme-identity
technique rather than invent one. That is a deliberate instruction, not a
placeholder — the alternative is inventing a selector that compiles and
silently matches nothing, which is exactly the trap root rule 27 describes.

**Type consistency.** `PageDocument` is the name used in Tasks 2, 3 and 4.
`onApply` keeps its name in Task 3 and is forwarded as `onApplyDocument` in
Task 4 — deliberately different, because the picker's prop and the editor's
prop are different seams.
