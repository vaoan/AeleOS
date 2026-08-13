# Fursona studio, phase 4b — editing sections

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let somebody compose a fursona out of sections — add, remove, reorder, choose a type, and write each field in either language — saving through the `set_fursona_sections` that `0013` already ships.

**Architecture:** The editor's form grows a `sections` array driven by `useFieldArray`, with a nested array of items per section. Saving becomes two calls: the four fields as before, then the sections. Client-side limits mirror `0013`'s, and a test proves the two agree.

**Tech Stack:** react-hook-form (`useFieldArray`), zod, `@hello-pangea/dnd`, React Query, lucide-react, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md` — "The section shape", and the parity checklist's mix-and-match and bilingual rows.

## Global Constraints

- **Budget is $0.**
- **100% statements, branches, functions and lines** in `apps/hub`.
- **Every export carries TSDoc stating the contract**; `pnpm check:docs` gates it.
- **Every bug found gets a regression test**, sabotage-verified against the original fault.
- **A mocked dependency hides its own setup requirements**, and so does a mocked module: `pnpm --filter hub build` is part of the gate list because unit tests mock away exactly the imports that break a bundle. Phase 4a shipped a `server-only` leak that only the build caught.
- **Both catalogues, always**, Spanish differing from English.
- **`pnpm add` normalises versions** — nothing new is needed here, but check if that changes.
- **No `@param props`** on a destructured component; `@returns` alone.
- **Do not commit unless a step says to.**

## Three decisions this phase makes

### 1. Saving is two calls, and the order is not arbitrary

The four fields go through `create_fursona`/`update_fursona`; sections go through `set_fursona_sections`. There is no single RPC that does both, deliberately — `0013` keeps content out of the actor row.

**Create must save the fields first**, because `set_fursona_sections` needs an `actor_ref` that does not exist until the fursona does. `createFursona` already returns it.

That leaves a real failure mode to handle rather than discover: **the fields save and the sections do not.** The fursona exists, the content does not, and the person is looking at an editor that appears to have failed. The rule: report the failure and **stay on the page with the content still in the form**, never navigate away. A second Save then retries only what is still missing — and because `set_fursona_sections` replaces rather than merges, retrying is safe.

Do not attempt a rollback. Deleting a just-created fursona to undo a failed section write would spend a handle from a namespace that never reclaims one, which is a worse outcome than a fursona with no sections yet.

### 2. The limits are mirrored, and a test proves they match

`0013` caps sections at 20, items at 50, text at 2000 characters and the whole payload at 65536 bytes. Telling somebody only after a round trip is poor, so the zod schema carries the same four numbers.

That is duplication, and duplication drifts — so it gets a guard rather than a promise. **A test reads `supabase/migrations/0013_fursona_sections.sql`, extracts the four constants, and asserts the client's match.** If somebody raises the database's limit and forgets the client, that test fails and names both numbers.

The database stays authoritative. The client copy exists to be kind, not to be trusted.

### 3. One language toggle, not two sets of fields

Libra's editor toggles the whole form between EN and ES rather than showing both. Adopted as-is: a section with eight text fields would otherwise show sixteen inputs.

**A missing Spanish value is never an error** — not on save, not in the schema, not with a warning badge. It is somebody who has not written it yet, and `0013` accepts it. The toggle shows which language is being written, and nothing anywhere nags about the other.

---

## File Structure

| File                                                                | Responsibility                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| `apps/hub/src/features/actors/domain/section-schema.ts`             | The section and item shapes, the four types, the limits. |
| `apps/hub/src/features/actors/application/use-language-toggle.ts`   | Which language the editor is writing.                    |
| `apps/hub/src/features/actors/presentation/section-item-fields.tsx` | One item's bilingual fields.                             |
| `apps/hub/src/features/actors/presentation/section-card.tsx`        | One section: name, type, items, collapse, remove, drag.  |
| `apps/hub/src/features/actors/presentation/section-editor.tsx`      | The sections array: add, reorder, empty state.           |
| `apps/hub/src/features/actors/presentation/fursona-editor.tsx`      | Grows `sections`; saves them after the fields.           |
| `apps/hub/src/features/actors/application/use-fursona-editor.ts`    | Saves sections as the second call.                       |
| `apps/hub/tests/section-limits-match-migration.test.ts`             | The drift guard for decision 2.                          |

---

### Task 0: Branch

- [ ] **Step 1: Cut from `origin/main` and confirm the base**

```bash
git fetch origin
git checkout -b feat/studio-phase-4b-sections origin/main
git log --oneline origin/main..HEAD
```

Expected: no output.

---

### Task 1: The section schema, and the drift guard

**Files:**

- Create: `apps/hub/src/features/actors/domain/section-schema.ts`
- Test: `apps/hub/tests/section-schema.test.ts`
- Test: `apps/hub/tests/section-limits-match-migration.test.ts`

**Interfaces:**

- Produces: `SECTION_TYPES`, `SECTION_LIMITS` (`{ sections: 20, items: 50, text: 2000, bytes: 65536 }`), `sectionsSchema`, and the inferred `FursonaSection` / `FursonaSectionItem` types.

  **Four entries, matching `0013`'s four constants.** `bytes` is included even though it is the least likely to be hit, because the drift guard compares the whole set — a client that tracked three of four would leave the fourth free to move unnoticed, which is exactly the drift the guard exists to prevent. The schema checks it against `JSON.stringify(sections).length`.

- [ ] **Step 1: Write the failing schema test**

Cover: a well-formed section passes; an unknown type fails; a missing `name_en` fails; **a missing `name_es` passes**; an item missing `title_en` fails; an item missing `title_es` passes; 20 sections pass and 21 fail; 50 items pass and 51 fail; a 2000-character field passes and 2001 fails.

The `_es` cases are the ones that must not regress. They are the difference between a person's own writing and a catalogue key.

- [ ] **Step 2: Write the failing drift guard**

`section-limits-match-migration.test.ts` reads the migration, pulls the four `c_max_*` constants out of it with a regular expression, and asserts each equals the matching entry in `SECTION_LIMITS`. It must fail loudly enough to name both numbers, because the person reading it will be somebody who changed one of them.

Assert the extraction found four constants before comparing. A regular expression that quietly matches nothing would make this test pass forever.

- [ ] **Step 3: Run both and watch them fail**

- [ ] **Step 4: Write the schema**

- [ ] **Step 5: Run both and watch them pass**

- [ ] **Step 6: Sabotage-verify the drift guard**

Change `SECTION_LIMITS.sections` to 19 and confirm the guard fails naming 19 and 20. Restore. Then change it back and confirm the schema test for 21 sections still fails for the right reason.

- [ ] **Step 7: Commit**

---

### Task 2: The language toggle

**Files:**

- Create: `apps/hub/src/features/actors/application/use-language-toggle.ts`
- Test: `apps/hub/tests/use-language-toggle.test.tsx`

**Interfaces:**

- Produces: `useLanguageToggle()` returning `{ lang: "en" | "es", toggle: () => void }`.

- [ ] **Step 1: Write the failing test**

Cover: it starts on English; toggling switches to Spanish; toggling again returns.

Starting on English is a deliberate default and not a statement about the app's audience — Spanish is the app's fallback locale. The editor's authoring language is a different axis from the interface language, and tying them would mean somebody reading the app in Spanish could not start writing in English without switching the whole interface.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Write the hook, run it, watch it pass**

- [ ] **Step 4: Commit**

---

### Task 3: One item's fields

**Files:**

- Create: `apps/hub/src/features/actors/presentation/section-item-fields.tsx`
- Test: `apps/hub/tests/section-item-fields.test.tsx`

- [ ] **Step 1: Write the failing test**

Cover: it renders a title and a description bound to the current language's field; switching language binds to the other pair; removing calls back; a missing Spanish value renders as an empty field rather than as a warning.

- [ ] **Step 2: Run it, watch it fail, write it, watch it pass**

- [ ] **Step 3: Sabotage-verify the language binding**

Bind both languages to the English field and confirm the switching test fails.

- [ ] **Step 4: Commit**

---

### Task 4: The section card

**Files:**

- Create: `apps/hub/src/features/actors/presentation/section-card.tsx`
- Test: `apps/hub/tests/section-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Cover: the name field binds to the current language; the type selector offers exactly the four types and reports a change; items render in order; adding appends an item; removing an item removes the right one; collapsing hides the items but keeps the header; removing the section calls back.

"Removes the right one" is the assertion worth writing carefully — an index-based remove that closes over a stale index removes the wrong row, and a test that removes from a one-item list cannot tell.

- [ ] **Step 2: Run it, watch it fail, write it, watch it pass**

- [ ] **Step 3: Sabotage-verify the remove**

Make remove always drop index 0 and confirm the multi-item test fails.

- [ ] **Step 4: Commit**

---

### Task 5: The sections array

**Files:**

- Create: `apps/hub/src/features/actors/presentation/section-editor.tsx`
- Test: `apps/hub/tests/section-editor.test.tsx`

- [ ] **Step 1: Write the failing test**

Cover: an empty state inviting the first section; adding appends one of a chosen type; sections render in order; reordering by drag moves one; the add control disappears at the limit and says why.

The limit case matters: an add button that silently does nothing at 20 sections reads as a broken button.

- [ ] **Step 2: Run it, watch it fail, write it, watch it pass**

- [ ] **Step 3: Sabotage-verify the limit**

Allow adding past the limit and confirm that test fails.

- [ ] **Step 4: Commit**

---

### Task 6: Saving sections with the fursona

**Files:**

- Modify: `apps/hub/src/features/actors/application/use-fursona-editor.ts`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/tests/use-fursona-editor.test.tsx`, `apps/hub/tests/fursona-editor.test.tsx`

- [ ] **Step 1: Write the failing tests**

Cover, on the hook: creating saves the fields then the sections, in that order, using the returned `actor_ref`; editing saves both; a section write that fails leaves an error and **does not** navigate; the fields are not re-saved on a retry when they already succeeded — or, if that proves fiddly, retrying both is acceptable because both are idempotent, and the test should say which was chosen and why.

On the editor: the sections editor renders; a save sends what is in it.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement, run, watch them pass**

- [ ] **Step 4: Sabotage-verify the partial-failure path**

Make a failed section write navigate away anyway, and confirm the test fails. This is the one that loses somebody's writing.

- [ ] **Step 5: Commit**

---

### Task 7: Catalogues, then close the phase

- [ ] **Step 1: Add every new key to both catalogues**

Section type names, add/remove/collapse labels, the language toggle, the empty state, the limit message, and the partial-failure message.

- [ ] **Step 2: Run every gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm format:check
pnpm --filter hub test:coverage
pnpm check:tools && pnpm check:docs origin/main && pnpm secretlint
pnpm --filter hub build
pnpm --filter hub test:e2e
```

`pnpm --filter hub build` is not optional here. Phase 4a's `server-only` leak passed every unit test and only the build caught it.

- [ ] **Step 3: Push, open the pull request, wait for all four checks**

The body must state that **nothing here has browser-level proof**: no signed-in e2e exists, and the section editor is the most interaction-heavy thing in the app.

---

## What this phase does not do

- **No templates, icon picker or image field.** Phase 4c. `icon` and `image_url` stay absent from what the editor writes, and `0013` already treats both as optional.
- **No public rendering.** Phase 5. Sections can be written and nobody but their owner can see them.
- **No image upload.** Phase 6.
- **No change to `0013`.** If this phase wants a schema change, something was misjudged in phase 3 — stop and say so rather than adding a migration here.
