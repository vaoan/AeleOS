# Sections of Spaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A section is defined by how many **spaces** it has; each space holds one thing — another section or a piece of content — and an author can build that in the editor, which today they cannot do at all.

**Architecture:** Spaces replace `columns`/`span`: a section declares how many spaces it has **across**, and holds a positional list of children that fills row by row, any entry of which may be empty. Every section is a CSS containment context and every piece of content sizes against its own box rather than the viewport. The editor places things explicitly; dragging is a later phase on `@dnd-kit`.

**Tech Stack:** Next.js server components, Zod, Postgres/plpgsql (`supabase/migrations/0009_actor_profiles.sql`, edited in place), Tailwind v4 container queries, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-sections-of-spaces-design.md`

**Follows:** `#157`, `#158`.

**Not in this plan:** dragging. It is phase 4, on `@dnd-kit`, and it carries the only genuine unknown — the spike proved two levels of nested drag and did not prove three. An editor that can add, fill, nest, edit and remove is usable without it.

## Global Constraints

- **`spaces` is a COLUMN COUNT, and rows extend downward.** A three-space section is three across; adding a fourth thing starts a second row. The vocabulary is small — one through six — because it is a shape somebody picks, not a capacity. Corrected mid-plan: the first draft read `spaces` as a total and demanded `children.length === spaces`, which made a fifty-picture gallery unrepresentable and forced the cap to absurdity. "It keeps extending down" is about rows.
- **A space is positional and may be empty.** `children` is an array up to the content cap whose entries may be `null`; an empty position keeps its width and draws nothing. A part-filled last row is the ordinary state, never a refusal. The assertion the model turns on is that `[a, null, b]` still has `b` in the third position after a round trip — the one that silently passes if somebody later "tidies" the nulls away.
- **An empty space keeps its width and draws nothing.** Collapsing would make a space count meaningless whenever a section is partly filled, and would change the author's chosen shape under them as they work.
- **Changing a shape must not destroy content.** Narrowing a section leaves the displaced occupant recoverable, exactly as a stored span wider than its parent is kept as typed and narrowed only at render. **Gate the field, never the value.**
- **Content adapts to its parent, never to the window.** `@container` and `cqw`/`cqi`, native CSS, no library — it works in server components, which these pages are. Replacing viewport breakpoints is a **correction to shipped code**, and the existing 320px guards do not cover it: they assert a narrow window, not a narrow space in a wide window.
- **The depth cap stays at three and the database keeps enforcing it** with an explicit counter. `sections` is user-controlled `jsonb`.
- **Existing pages must keep working.** Every page in the database is currently flat-shaped, converted on read by the shim from `#158`. That shim is the migration path; do not strand it.
- **`pnpm test:db` runs here**, and so does `supabase db reset` — Docker is available. An earlier draft of this constraint said `reset` fails on a retired storage container; it was measured and does not. A running local stack holds port 54320 and makes `check:schema-drift` abort; stop it first.
- **An in-place edit to `0009` never reaches live**, and must be hand-applied and re-applied after **any** later edit to that function — **comments included**, because a comment inside a function body is part of `prosrc`. That exact oversight failed CI on 2026-08-18.
- **Never index a plain object with a value from `jsonb`.** `Map`/`Set` only.
- **Every address goes through `resolveEmbed` / `safeHttpUrl` / `backgroundImageValue`.** Adding a content kind must not add a bypass.
- **No count in any comment** tracking a collection's size, including synonyms. Grep the diff for counts you **wrote** and the touched files for counts your change **invalidated**.
- **Every export carries TSDoc stating the contract.** 100% coverage including branches; `vitest.config.ts` excludes `src/features/*/presentation/**`, so presentation files need **named** tests.
- **`pnpm lint` from the repo root** — from `apps/hub` it silently disables nine rules and reports a false clean.
- **Cold-start the dev server**; a stale `next dev` serves stale message modules and has produced a convincing false failure. Neither `pnpm test:e2e` nor bare `npx playwright test` loads `apps/hub/.env.local`.
- Branch: `git checkout -b feat/sections-of-spaces origin/main`.

---

### Task 1: spaces in the schema

**Files:** `apps/hub/src/features/actors/domain/block-schema.ts`, `apps/hub/tests/block-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

A section declares `spaces` in `1..6`; `children` is positional, may hold `null`, and may be any length up to the content cap — **a part-filled last row is legal**. `spaces` outside the vocabulary is refused; `children` over the cap is refused. The case the model turns on: `[a, null, b]` round-trips with `b` still third.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

Replace `columns` and `span`. A container becomes `{ kind, mode, spaces, children }` where `spaces` is the column count in `1..6` and `children` is a positional list up to the content cap, each entry `Block | null`. **No equality between the two** — that was the first draft's error, and it is what made a fifty-picture gallery unrepresentable.

Keep `MAX_DEPTH` and its structural enforcement — the level factory that makes "too deep" a schema refusal rather than a walk somebody can forget to call.

- [ ] **Step 4: Sabotage-verify the positional rule**, which is the one the model turns on: strip the nulls from `[a, null, b]` and watch the round-trip case fail because `b` is no longer third. Restore.

- [ ] **Step 5: Gate and commit**

---

### Task 2: the database guard

**Files:** `supabase/migrations/0009_actor_profiles.sql` (in place), `tests/db/blocks.test.ts`

- [ ] **Step 1: Conformance tests first**, matching each `raise exception` string character for character. Read the existing pairs; do not invent the idiom.
- [ ] **Step 2:** `validate_block` accepts `spaces` in range and a `children` array up to the cap with nullable entries; refuses a `spaces` outside the vocabulary, a `children` array over the cap, and the old `columns`/`span` keys **by name**. It must **not** refuse a length that is not a multiple of `spaces` — a part-filled last row is the ordinary state.
- [ ] **Step 3: Update the `actor_profiles.sections` column comment in the same edit.** A current comment beside a stale database is how a whole validation block went missing for weeks.
- [ ] **Step 4: Hand-apply to live**, then confirm `prosrc` matches the file and `check:schema-drift` is green.
- [ ] **Step 5: Commit.**

---

### Task 3: spaces on the page

**Files:** `apps/hub/src/features/actors/presentation/blocks.tsx`, `apps/hub/tests/blocks.test.tsx`

- [ ] A section lays exactly `spaces` columns and flows its children into rows; **an empty entry occupies its position and draws nothing.**
- [ ] Below the container's own narrow breakpoint everything stacks to one track.
- [ ] Named tests — presentation is coverage-excluded, so nothing else will catch a gap.
- [ ] Gate and commit.

---

### Task 4: content adapts to its parent

**Files:** `blocks.tsx`, `globals.css`, the e2e specs asserting width

**This is the correction, and it is the task most likely to be got wrong**, because the current rules pass their tests by testing the wrong thing.

- [ ] Every section declares a containment context; every leaf's responsive rules become **container** queries rather than viewport ones.
- [ ] **The proof is a wide window and a narrow space.** Put an eight-cell table, a frame and a picture in one space of a three-space section at a **1400px** viewport and assert no overflow. The existing 320px guards cannot fail on this — they resize the window, and the window is not what is narrow.
- [ ] Sabotage-verify by restoring a viewport breakpoint on one leaf and watching that case go red.
- [ ] Gate and commit.

---

### Task 5: what is already stored

**Files:** the shim from `#158`, its tests

- [ ] The flat-to-blocks conversion emits sections with a space count rather than a track count, so existing pages keep rendering and keep opening.
- [ ] The round-trip test still holds: save, reload, and what comes back is what went in.
- [ ] Gate and commit.

---

### Task 6: the editor — shape and placement

**Files:** the editor presentation and application layers, message catalogues, tests

The first cut a person can actually build with.

- [ ] **Choose a section's shape** — its space count — and change it afterwards.
- [ ] **Put something in a space**: a piece of content, or another section, nesting to the cap.
- [ ] **Remove** what is in a space, leaving the space.
- [ ] **Changing a shape does not destroy content.** Narrowing leaves the displaced occupant recoverable and says so; it must not silently delete.
- [ ] Both message catalogues; a missing key fails the build, and Spanish is the fallback most people meet first.
- [ ] Gate and commit.

---

### Task 7: the editor — content kinds and editing

**Files:** the editor's field components, tests

- [ ] Choosing what a piece of content **is**, from the kinds the renderer draws.
- [ ] Editing its fields, offering **only** the fields that kind renders — a control that stores what somebody types and shows nothing is the worst kind, because nothing tells them it did nothing.
- [ ] A person's own writing is not next-intl: a missing Spanish field is an ordinary state, never a fault.
- [ ] Gate and commit.

---

### Task 8: proving somebody can build a page

**Files:** `apps/hub/tests/e2e/`

- [ ] A real-browser spec that builds a **nested** page from nothing: choose a shape, fill a space with content, fill another with a section, fill that, save, reload, and confirm it comes back — then open the public page and confirm a stranger sees it.
- [ ] Assert an **empty space keeps its width** on the public page.
- [ ] Sabotage-verify each assertion against the fault it names.
- [ ] Gate and commit.

---

### Task 9: documentation

**Files:** `apps/hub/src/features/actors/CLAUDE.md`, the spec, root `CLAUDE.md`

- [ ] Spaces: positional, possibly empty, keeping their width — and why collapsing was refused.
- [ ] Container queries, and that viewport breakpoints are the wrong tool here rather than merely a weaker one.
- [ ] What replaced `columns`/`span`, so nobody looks for them and concludes the model lost something.
- [ ] Mark the spec complete for these phases; state that dragging is phase 4 and what it inherits.
- [ ] **Do not write a count.** Full gate, branch-base check, **no push, no PR**.
