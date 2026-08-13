# Fursona studio, phase 4a — the editor shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fursona create and edit pages into the studio's editor — a full-page form with a sticky Save toolbar and an error banner — over the four fields that already exist, on react-hook-form, so that phase 4b can add sections to a shape that already holds them.

**Architecture:** `FursonaForm` is replaced by an `InlineEditor` built on react-hook-form with a zod resolver, saving through the browser client rather than a server action. The existing `parseFursona` schema is reused as the resolver's schema, so validation does not fork.

**Tech Stack:** Next 16 App Router, React 19, react-hook-form, zod, React Query, lucide-react, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md` — "Editor parity" in the phase list, and the parity checklist's editor rows.

## Why phase 4 is split

Libra's `InlineEditor` is a dozen components — `EditorToolbar` alone is 216 lines, `InlineSections` 150, plus `LangTextarea`, `FormErrorBanner`, `InlineTextField`, `AutoTextarea`, an icon picker, an image bar, and the add/remove controls. Porting all of it in one pull request would be too large to review, and a reviewer could reasonably accept the shell while rejecting how sections are edited.

- **4a (this plan)** — the shell: full-page editor, sticky toolbar, error banner, react-hook-form, over today's four fields. **Visible immediately.**
- **4b** — sections: add, remove, reorder, the four types, bilingual fields and the authoring language toggle.
- **4c** — templates from code, the icon picker, and the image field.

Each ships something somebody can use. 4a is the one that changes how saving works, which is why it comes first and alone.

## Global Constraints

- **Budget is $0.**
- **100% statements, branches, functions and lines** in `apps/hub`. Note `src/features/*/presentation/**` and `src/app/**` are excluded from that measurement — they still get tests.
- **Every export carries TSDoc stating the contract**; `pnpm check:docs` fails the commit when a symbol changes and its documentation does not.
- **Every bug found gets a regression test**, sabotage-verified against the original fault. `CLAUDE.md` now requires this.
- **A mocked dependency hides its own setup requirements.** The nuqs adapter shipped missing because every test mocked `nuqs`. Any provider this phase depends on gets exercised for real in `app-providers.test.tsx`, not stubbed everywhere.
- **Both message catalogues, always**, and Spanish must differ from English or `messages.test.ts` fails.
- **`pnpm add` normalises versions.** Pin `react-hook-form@^7.74.0` and `@hookform/resolvers@^5.2.2` — Libra's — after installing.
- **No `@param props`** on a destructured component.
- **Do not commit unless a step says to.**

## The decision this phase makes

**Saving moves from a server action to the browser client.** Today `createFursonaAction` and `updateFursonaAction` are server actions using `useActionState`. The studio's editor is a react-hook-form form that calls a mutation, and phase 4b needs `useFieldArray` for sections — which a server action cannot drive.

So this phase moves both writes onto the mutations built in phase 2b's shape, and that has consequences worth stating up front:

1. **`create_fursona` and `update_fursona` are called from the browser**, through `useSupabaseBrowserClient`. Both are `security definer` and derive the owner from the token, so nothing about authorisation changes — the RPC was never trusting the caller's word about who they are.
2. **The `handleTaken` and `limitReached` errors move too.** They currently arrive as typed errors from `apps/hub/src/features/actors/infrastructure/fursonas.ts` and are mapped by the actions. The editor maps them into the same field-keyed shape, so `FursonaForm`'s error contract survives even though the machinery under it does not.
3. **`revalidatePath` goes away** and React Query invalidation replaces it. The list already invalidates on mutation; creating and editing must do the same, or somebody returns to a stale list.
4. **The server actions are deleted, not left in place.** A second write path nobody calls is a second thing to keep correct, and `knip` will report the exports as unused anyway.

## How to read the tasks

Like phase 3's plan, this one gives the **rules** verbatim — what each test must
cover, what each component must do — and leaves the JSX and the hook bodies to
the implementer. These are presentational components and a thin mutation
wrapper whose contract is exactly what their tests select, and dictating the
markup would invite a diff that matches the plan while failing the tests.

The one place this plan is prescriptive is the decision above, because it is
about shape rather than style and getting it wrong costs a refactor.

---

## File Structure

| File                                                                   | Responsibility                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/hub/src/features/actors/application/use-fursona-editor.ts`       | Create and update as mutations, mapping refusals to fields.  |
| `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`         | Sticky bar: title, Cancel, Save, saving state.               |
| `apps/hub/src/features/actors/presentation/form-error-banner.tsx`      | Everything wrong at once, above the fields.                  |
| `apps/hub/src/features/actors/presentation/fursona-editor.tsx`         | The form: react-hook-form, the four fields, toolbar, banner. |
| `apps/hub/src/app/[locale]/(app)/fursonas/new/page.tsx`                | Renders the editor for a new fursona.                        |
| `apps/hub/src/app/[locale]/(app)/fursonas/[handle]/edit/page.tsx`      | Renders the editor for an existing one.                      |
| _deleted_ `apps/hub/src/app/[locale]/(app)/fursonas/actions.ts`        | Replaced by the mutations.                                   |
| _deleted_ `apps/hub/src/features/actors/presentation/fursona-form.tsx` | Replaced by the editor.                                      |

---

### Task 0: Branch

- [ ] **Step 1: Cut from `origin/main` and confirm the base**

```bash
git fetch origin
git checkout -b feat/studio-phase-4a-editor origin/main
git log --oneline origin/main..HEAD
```

Expected: no output.

---

### Task 1: Create and update as mutations

**Files:**

- Create: `apps/hub/src/features/actors/application/use-fursona-editor.ts`
- Test: `apps/hub/tests/use-fursona-editor.test.tsx`
- Modify: `apps/hub/package.json`

**Interfaces:**

- Consumes: `createFursona` and `updateFursona` from `@/features/actors/infrastructure/fursonas`, `FURSONAS_QUERY_KEY`.
- Produces: `useFursonaEditor(actorRef?: string)` returning `{ save, saving, fieldErrors }`, where `save(values: FursonaInput)` creates when `actorRef` is absent and updates when it is present.

- [ ] **Step 1: Install react-hook-form**

```bash
pnpm --filter hub add react-hook-form@^7.74.0 @hookform/resolvers@^5.2.2
```

Then confirm both ranges in `apps/hub/package.json` — pnpm rewrites them, and this has caught us on all four dependencies added so far.

- [ ] **Step 2: Write the failing test**

Cover: create is called when there is no `actorRef` and update when there is; the list is invalidated on success; a `HandleTakenError` becomes `{ handle: "handleTaken" }`; a `FursonaLimitError` becomes `{ form: "limitReached" }`; any other error propagates rather than being swallowed.

That last one matters — `createFursonaAction` lets anything it does not recognise propagate, and losing that would turn a real fault into a silent no-op.

- [ ] **Step 3: Run it and watch it fail**

- [ ] **Step 4: Write the hook**

`createFursona` and `updateFursona` in `infrastructure/fursonas.ts` currently build their own server client internally.

**Change them to take the client as their first parameter**, exactly as `fursona-arrangement.ts`'s five functions already do. Not an optional parameter defaulting to the server client — an optional one leaves two ways to call the same function and invites a caller to get the default without meaning to.

This is a small breaking change to two internal functions with few callers, and it makes the whole `infrastructure/` layer consistent: every function takes the client, none reaches for one. **Do not add browser twins.** A second function with the same RPC name in a second file is how argument shapes drift apart, and neither copy is obviously the stale one.

- [ ] **Step 5: Run it and watch it pass**

- [ ] **Step 6: Sabotage-verify the error mapping**

Make the hook swallow an unrecognised error instead of letting it propagate, and confirm the propagation test fails. Restore.

- [ ] **Step 7: Commit**

---

### Task 2: The toolbar and the banner

**Files:**

- Create: `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`
- Create: `apps/hub/src/features/actors/presentation/form-error-banner.tsx`
- Test: `apps/hub/tests/editor-toolbar.test.tsx`, `apps/hub/tests/form-error-banner.test.tsx`

**Interfaces:**

- Produces: `EditorToolbar` (props: `title`, `labels`, `saving`, `onCancel`) and `FormErrorBanner` (props: `errors`, `labels`).

- [ ] **Step 1: Write the failing tests**

The toolbar: renders its title; Save is a submit button so the form owns submission; Save is disabled and reads as saving while `saving`; Cancel calls back. The banner: renders nothing when there are no errors; lists one line per error; carries `role="alert"` so it is announced.

The banner exists because a long form can scroll a field error out of view — somebody presses Save, nothing appears to happen, and the reason is 400 pixels below.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Write both components**

Sticky via `sticky top-0 z-20` with the shell's `--bar` background, matching the header rather than inventing a second bar treatment.

- [ ] **Step 4: Run them and watch them pass**

- [ ] **Step 5: Sabotage-verify the disabled Save**

Remove the `disabled` binding and confirm the saving test fails. Restore. Double submission is the fault this prevents, and `create_fursona` would answer the second one with `handle already taken` — a confusing error for a fursona somebody just successfully created.

- [ ] **Step 6: Commit**

---

### Task 3: The editor

**Files:**

- Create: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Test: `apps/hub/tests/fursona-editor.test.tsx`
- Delete: `apps/hub/src/features/actors/presentation/fursona-form.tsx` and its test

**Interfaces:**

- Produces: `FursonaEditor` (props: `labels`, `initial?`, `actorRef?`, `handleEditable`).

- [ ] **Step 1: Write the failing test**

Cover: the four fields render with their initial values; the handle is read-only when editing; submitting valid values calls `save` with them; a rejected save shows the mapped field error; the banner appears when validation fails; a successful save navigates back to the list.

Reuse `parseFursona`'s schema through `zodResolver` rather than restating the rules — `fursona-schema.test.ts` already pins them, and a second copy would drift.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Write the editor**

- [ ] **Step 4: Point both pages at it, and delete what it replaces**

`new/page.tsx` and `[handle]/edit/page.tsx` render `FursonaEditor`. Delete `actions.ts`, `fursona-form.tsx`, and their tests. Check `knip` afterwards: anything left unused is a leftover this phase should have removed.

- [ ] **Step 5: Run the whole suite**

- [ ] **Step 6: Sabotage-verify the read-only handle**

Make the handle editable while editing and confirm that test fails. Restore. `update_fursona` takes no handle at all, so an editable one would submit a value the database ignores — a change somebody watched themselves make that silently did not happen.

- [ ] **Step 7: Commit**

---

### Task 4: Catalogues, then close the phase

- [ ] **Step 1: Add every new key to both catalogues**

`fursonas.editorTitleNew`, `fursonas.editorTitleEdit`, `fursonas.save`, `fursonas.saving`, `fursonas.cancel` (already present), `fursonas.errorBannerTitle`.

- [ ] **Step 2: Run every gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm format:check
pnpm --filter hub test:coverage
pnpm check:tools && pnpm check:docs origin/main && pnpm secretlint
pnpm --filter hub build
pnpm --filter hub test:e2e
```

- [ ] **Step 3: Confirm the new dependencies are pinned as stated**

- [ ] **Step 4: Push, open the pull request, wait for all four checks**

The body must say that **the write path moved from server actions to the browser**, since that is the part a reviewer most needs to look at, and that authorisation is unchanged because both RPCs are `security definer` and derive the owner from the token.

---

## What this phase does not do

- **No sections.** Phase 4b. The database has held them since `0013`; nothing writes them yet.
- **No templates, icon picker or image field.** Phase 4c.
- **No change to the four fields themselves**, their validation, or the handle rules. Only how they are laid out and saved.
- **No new RPC.** `create_fursona` and `update_fursona` are called as they always were, from a different place.
