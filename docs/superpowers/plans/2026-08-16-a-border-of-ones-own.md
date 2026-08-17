# A Border of One's Own Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a section a border it chooses for itself — the literal request the previous spec answered with skins instead — and add the layouts and skins the feature note has always described its own lists as a floor for.

**Architecture:** `border` joins the per-section `style` bag. A new `--skin-border-style` token in `globals.css` defaults to `var(--tw-border-style)` so Tailwind's own `border-dashed` keeps working on descendants, and `@utility surface` reads it. Three new layouts and three new skins follow the feature note's own bar: each earns its place by a mechanism none of the existing ones use.

**Spec:** `docs/superpowers/specs/2026-08-16-a-border-of-ones-own-design.md`

**Follows:** `#150`–`#154`.

## Global Constraints

- **`sectionStyleShape` is shared** by the strict (write) and lenient (read) schemas. Add `border` there once — adding it to one and not the other is a defect.
- **Strict on write, lenient on read.** An unknown style key is _refused_ when saving and _stripped_ when parsing stored data. A strict read blanks a whole page during deploy skew.
- **Do not write to `--tw-border-style`.** It is Tailwind's own generated variable; writing to it is the class of mistake that once styled `[class~="border"]` — reaching the right elements while unable to see what any of them asked for. Add `--skin-border-style` and have `@utility surface` read that.
- **`SKIN_DEFAULTS` gains the new token**, and `skins.test.ts` pins it against `globals.css` by parsing the stylesheet. `nestedSkinVars` then covers it automatically. **`skinVars` stays unchanged** — `themeCss` keys the page-level rule on its emptiness.
- **`none` and absent are different.** `border: "none"` means no edge; no `border` key means inherit. Never store `""`.
- **A skin names no colour of its own** — only `--ink`, `--edge`, or neutral black/white at low alpha.
- **Adding a layout is four edits and three guards catch a miss:** `SECTION_TYPES`, `is_section_type()` in `0009` (**edited in place**, column comment updated in the same edit), a renderer in the `LAYOUTS` record, and a name in **both** catalogues. `section-limits-match-migration.test.ts` reads the SQL; the `LAYOUTS` record is typed `Record<SectionType, …>`; `messages.test.ts` compares `SECTION_TYPES` against `fursonas.types` in each catalogue **separately**. That last one was written at the branch's final review — until then `messages.test.ts` compared en against es only, so a name absent from **both** passed every check and rendered as a raw key.
- **A layout that renders no field must not offer it** — `LINKED`, `ICONED`, `PICTURED` decide what the editor shows.
- **Custom CSS belongs in a cascade layer**, and never style a class the framework generated.
- **Respect `prefers-reduced-motion`** in anything that moves.
- **Never index a plain object with a user-controlled string.** `Map`/`Set` only.
- **No count in any comment** tracking a collection's size. **Grep your own diff before every commit** — this project has produced that pattern eleven times, several inside commits removing it.
- **`pnpm check:tools` before every commit**; **run `pnpm lint` from the repo root** (from `apps/hub` it silently disables nine rules and reports a false clean); neither `pnpm test:e2e` nor bare `npx playwright test` loads `apps/hub/.env.local` — source it manually.
- **`pnpm test:db` cannot run locally** (no Docker). SQL runs in CI's required `conformance` job, so match every `raise exception` string to its test regex character for character.
- Every export carries TSDoc stating the contract. 100% coverage including branches — `vitest.config.ts` excludes `src/features/*/presentation/**`, so presentation files need **named** tests.
- Branch: `git checkout -b feat/section-borders origin/main`.

---

### Task 1: the border token

**Files:** `apps/hub/src/app/globals.css`, `apps/hub/src/shared/domain/skins.ts`, `apps/hub/tests/skins.test.ts`

- [x] **Step 1: Write the failing tests**

`SKIN_DEFAULTS` contains `--skin-border-style` and its value matches what `globals.css` declares; `nestedSkinVars` emits it for every skin.

- [x] **Step 2: Run and watch them fail**

- [x] **Step 3: Implement**

`globals.css` declares `--skin-border-style: var(--tw-border-style);` beside `--skin-border`, and `@utility surface` changes `border-style: var(--tw-border-style)` to `border-style: var(--skin-border-style)`.

`SKIN_DEFAULTS` gains the matching entry.

**The indirection is the point and its TSDoc must say so:** `--skin-border-style` inherits **unresolved**, so a descendant using Tailwind's `border-dashed` re-resolves it against that element's own `--tw-border-style` and keeps working — while a section that sets `--skin-border-style` outright overrides its whole subtree.

> **Corrected during Task 1's review, and the correction is what shipped.** The
> last clause above is **false**: a descendant carrying its own `border-dashed`
> declares a literal `border-style`, Tailwind sorts that shorter utility above
> `surface`, and it wins the property outright — the scope's token is never
> consulted. That behaviour is right, because a dashed edge is the semantic
> empty state and must survive a section's border choice. It was the sentence
> that was wrong.

- [x] **Step 4: Prove the descendant case still works**

A test that an element with Tailwind's own `border-dashed` inside a section that set a different border style still renders dashed. **This is the assertion that justifies the indirection**; without it the simpler `--tw-border-style` write would look equivalent.

- [x] **Step 5: Sabotage-verify**

Change the value in `globals.css`; the stylesheet pin must go red. Restore. Report it.

- [x] **Step 6: Gate and commit**

---

### Task 2: `border` in the style bag, the database, and the renderer

**Files:** `section-schema.ts`, `0009_actor_profiles.sql`, `public-sections.tsx`, and their tests

- [x] **Step 1: Write the failing tests**

`border` accepts the five values and refuses a sixth; `sectionStyle` emits `--skin-border-style` when set and **nothing extra when absent**; a section with no `style` at all still emits no attributes.

- [x] **Step 2: Run and watch them fail**

- [x] **Step 3: Add it to the shared shape**

`border: z.enum(["solid", "dashed", "dotted", "double", "none"]).optional()`, with TSDoc saying that `none` is a choice and absence is inheritance.

- [x] **Step 4: Validate in `0009`, in place**

Beside the other style keys, refusing an unknown value. **The existing null guard already covers it** — confirm by reading, do not assume. Update the `actor_profiles.sections` column comment.

- [x] **Step 5: Conformance test**, matching the SQL message character for character.

- [x] **Step 6: Render it** — `sectionStyle` emits the token.

- [x] **Step 7: Gate and commit**

---

### Task 3: the border control

**Files:** `section-style-popup.tsx`, both catalogues, tests

Follow the popup's existing controls exactly. **Choosing writes to that section and no other** (the three-section harness proves it); **clearing removes the key**; the live preview reflects it through the shared `sectionStyle`.

**This control is not gated on a layout** — unlike `card_size`, a border applies to every layout that renders a surface, which is all of them. Say so in its TSDoc so the difference from `card_size` is deliberate rather than inconsistent.

Name the options for a person, in both languages; Spanish is the fallback language and is what most people meet first.

- [x] Steps: failing tests → red → implement → green → gate → commit.

---

### Task 4: three layouts

**Files:** `section-schema.ts`, `0009`, `public-sections.tsx`, `section-item-fields.tsx`, both catalogues, tests

One commit per layout. Each needs the four wiring edits, a `LINKED`/`ICONED`/`PICTURED` decision, and named tests.

- [x] **`masonry`** — variable-height packing. CSS columns, so a long entry and a short one sit together without the ragged gaps a uniform grid leaves. Items keep their icon tile like `cards` do. Not `LINKED`.
- [x] **`progress`** — draws a proportion. The **title** is the label and the **description** is the value, inverting the pair exactly as `stats` and `quote` do; the editor names its fields accordingly. **A description that is not a number renders as a plain row rather than a broken bar** — test that explicitly, it is the "refuses nothing, shows nothing" trap. Decide and document how a value is read (a bare number, a percentage, or `n/m`) and refuse the rest gracefully.
- [x] **`tabs`** — one panel at a time, horizontally. A radio group and `:checked`, so this stays a server component and every panel is reachable by keyboard. `accordion` is vertical and multi-open; say so in the TSDoc, the way `cards`/`carousel` already distinguish themselves.

- [x] After each: gate and commit.

---

### Task 5: three skins

**Files:** `skins.ts`, both catalogues, `skins.test.ts`

One commit for the set. Each must name **no colour of its own**.

- [x] **`neon`** — a spread shadow with no offset, a glow rather than a cast. `--ink` at low alpha.
- [x] **`cutout`** — `clip-path` notching the corners. **No skin has ever changed a surface's shape**; check whether `@utility surface` needs a new token for it, and if so add it to `SKIN_DEFAULTS` and the stylesheet pin like Task 1 did.
- [x] **`frame`** — stacked rings via layered `box-shadow: 0 0 0 Npx`, a matted picture frame.

Names in both catalogues. `skins.test.ts` does **not** check that — it imports
no catalogue at all — and neither did anything else until the final review;
`messages.test.ts` now compares `SKINS` against `fursonas.skins` in each
catalogue separately and fails if either name is missing.

**Check each renders**, not merely that it is listed — a skin whose CSS does nothing is the phantom-canvas fault this project has already caught.

- [x] Gate and commit.

---

### Task 6: documentation

**Files:** `apps/hub/src/features/actors/CLAUDE.md`, the spec, root `CLAUDE.md`

- [x] Record the border: the token, why it is not `--tw-border-style`, and that `none` differs from absent.
- [x] Add the three layouts to the layouts table with what their two text fields mean — **`progress` inverts the pair**, which is the thing somebody will get wrong.
- [x] Add the three skins, each with the mechanism that earned its place.
- [x] **Correct the record**: the previous spec answered "a list of borders" with skins, and this phase says why that was a near-miss rather than a delivery.
- [x] **Do not write a count.** The tables are the lists.
- [x] **Record the in-place-migration hazard** in the root `CLAUDE.md`, beside
      the squash convention that causes it — see Task 7 for the measurement.
- [x] Full gate, branch-base check, **no push, no PR**.

---

### Task 7: the drift nobody could see

**Files:** `.github/workflows/`, and whatever the check needs

Added mid-plan, from a defect found while verifying Task 4 rather than from the
spec. It is out of this plan's original scope and goes in anyway, because the
alternative is documenting a trap and letting it recur.

**What happened.** `supabase/migrations/` is squashed so every object is defined
exactly once, and a change to an existing function is an **edit in place**. But
Supabase records `0009` as applied and `db push` will not re-run an applied
file — so **an in-place edit never reaches the live database**, silently and
permanently. Measured consequence: `set_actor_sections()` live was missing its
entire per-section style-validation block, so `skin`, `background_url`,
`background_fit` and `card_size` have been **unvalidated at the database level
since `#150`–`#154` merged**, with `border` about to join them.

**Why nothing caught it.** `pnpm test:db` builds a fresh database from the files,
where the migrations apply cleanly from scratch — so drift cannot exist there by
construction. Unit tests were green at 100%. And the `actor_profiles.sections`
column comment, the one signal the convention requires be kept in step, **was
current** — truthful about the file and false about the database.

- [x] A `schema-drift` job gated exactly as `idp-cloud` is: pull request,
      **skipped on forks** (`if:` guard), because secrets are withheld there and
      it could never report green.
- [x] **Try `supabase db diff --linked` first** and fail on non-empty output —
      no bespoke comparison code to maintain. Only if it proves unreliable
      against a live project, fall back to diffing `pg_get_functiondef`, view,
      constraint and comment definitions against the files.
- [x] Prove it fails: introduce drift live, watch the job go red, restore. **A
      newly adopted check must be shown to fail before it is believed** — three
      tools in this repo were silently doing nothing when adopted.
- [x] Note in the workflow file and the plan that **making it a required check
      is repository settings, not YAML** — 🧑 Heiner. Until that is done the job
      can be ignored by a merge, exactly as `e2e` could before it was added to
      the required list.
