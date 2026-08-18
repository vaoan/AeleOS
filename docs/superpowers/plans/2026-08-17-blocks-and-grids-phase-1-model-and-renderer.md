# Blocks and Grids — Phase 1: the model and the renderer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `sections` array with a recursive tree of typed blocks, and render it on the public page — so a person's page can hold a Spotify player beside a paragraph beside a table, nested, before any editor exists to build one.

**Architecture:** One recursive schema. A **container block** arranges children in a mode; a **leaf block** is one piece of content. A section is a container at depth 0 carrying a name. Depth is capped at three and enforced in `set_actor_sections`, not only in the editor. Blocks span whole grid tracks and collapse to one track below a breakpoint — never coordinates.

**Tech Stack:** Next.js server components, Zod, Postgres/plpgsql (`supabase/migrations/0009_actor_profiles.sql`, edited in place), Tailwind v4, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-blocks-and-grids-design.md`

**Follows:** `#150`–`#156`.

**Not in this plan:** the editor, the dnd-kit migration, the block palette, and the editor's DOM reduction. Those are phases 3–5 and get their own plans; phase 3 carries the unknown cost and must not block this one. This plan's deliverable is proven with fixtures written straight to the database.

## Global Constraints

- **Existing pages are discarded.** No conversion, no backward-compatible read path. Nothing is in production. This is cheap **only until Puck copies the migrations**.
- **Strict on write, lenient on read.** An unknown key is _refused_ when saving and _stripped_ when parsing stored data; an unrecognised block **kind** or container **mode** is refused when saving and kept verbatim when reading, for the renderer's own fallbacks to answer. Not for legacy data — there is none — but for **deploy skew**: a strict read blanks a whole page while a newer deployment's writes are read by an older one. The kind half is not free — a discriminated union refuses an unrecognised discriminator, so the lenient build needs an explicit fallback option and it must refuse every kind the vocabulary already names, or the depth cap falls through it.
- **A person's own writing is not next-intl.** A missing `title_es` is somebody who has not written the Spanish yet and must never be reported as a fault. The app's own chrome stays key-checked and build-failing.
- **The depth cap is enforced in the database.** `sections` is user-controlled `jsonb`; a recursive validator with no guard can exhaust its stack, and a deeply nested payload can make a public page render pathologically. An editor-only cap is a suggestion.
- **`pnpm test:db` cannot run locally** (no Docker). SQL runs in CI's required `conformance` job, so **match every `raise exception` string to its test regex character for character** — read the existing pairs in `0009` and `tests/db/` and copy the idiom rather than inventing one.
- **`0009` is edited in place**, column comment updated in the same edit. An in-place edit **never reaches the live database** — `db push` will not re-run an applied file — so apply the changed function by hand and confirm `pnpm check:schema-drift` is green.
- **Never index a plain object with a user-controlled string.** `Map`/`Set` only. This repo shipped a prototype-pollution Critical from exactly that shape, and a block's `kind` arrives from `jsonb`.
- **Any address goes through `resolveEmbed` / `safeHttpUrl` / `backgroundImageValue`** — parse, exact hostname match, strict id pattern, discard the query, rebuild from a fixed template. Adding block kinds must not add a bypass. `safeHttpUrl` refuses `"` and `\` so its output is safe in any CSS context.
- **Custom CSS belongs in a cascade layer**, and never style a class the framework generated. `@utility surface` is ours.
- **No count in any comment** tracking a collection's size — including synonyms ("the pair", "trio", "seventeen"). Grep the diff for counts you **wrote** and the touched files for counts you **invalidated**; the second is how ten survived last time.
- **Every export carries TSDoc stating the contract**, not the types. 100% coverage including branches; `vitest.config.ts` excludes `src/features/*/presentation/**`, so presentation files need **named** tests.
- **`pnpm lint` from the repo root** — from `apps/hub` it silently disables nine rules and reports a false clean. `pnpm check:tools` before every commit.
- **Neither `pnpm test:e2e` nor bare `npx playwright test` loads `apps/hub/.env.local`** — source it manually, and **cold-start the dev server**: a stale `next dev` serves stale message modules and has produced a convincing false failure.
- Branch: `git checkout -b feat/blocks-and-grids origin/main`.

---

### Task 1: the recursive schema

**Files:** `apps/hub/src/features/actors/domain/block-schema.ts` (create), `apps/hub/tests/block-schema.test.ts` (create)

**Interfaces produced:** `BLOCK_KINDS`, `CONTAINER_MODES`, `BlockKind`, `ContainerMode`, `blockSchema`, `lenientBlockSchema`, `BLOCK_LIMITS`, `MAX_DEPTH`.

- [ ] **Step 1: Write the failing tests**

A container accepts children; a leaf refuses them. Depth 3 parses; depth 4 is refused. A block whose `kind` is `__proto__` or `constructor` is refused rather than resolving to something inherited. An unknown key is refused by the strict schema and stripped by the lenient one. `title_es` absent is valid; `title_en` empty is not.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

```ts
export const CONTAINER_MODES = [
  "stack",
  "grid",
  "masonry",
  "carousel",
  "tabs",
  "accordion",
  "columns",
  "timeline",
] as const;

export const LEAF_KINDS = [
  "text",
  "link",
  "picture",
  "player",
  "post",
  "social",
  "stat",
  "quote",
  "progress",
  "table",
] as const;

/** Depth 0 is a section. A container at depth 2 may hold only leaves. */
export const MAX_DEPTH = 3;
```

The recursion needs `z.lazy()`. **Give the recursive type an explicit annotation** — inference on a `z.lazy()` cycle does not terminate.

Depth is a **parse-time** concern: thread it through a factory (`blockSchemaAt(depth)`) so a container at `MAX_DEPTH - 1` produces a schema whose children are leaf-only. That makes "too deep" a schema refusal rather than a separate walk.

- [ ] **Step 4: Green, then sabotage-verify** the depth guard: raise `MAX_DEPTH` by one and watch the depth test fail. Restore.

- [ ] **Step 5: Gate and commit**

---

### Task 2: span, and the container's track count

**Files:** `block-schema.ts`, `apps/hub/tests/block-schema.test.ts`

A container declares `columns` (1–4). A block declares `span` (1–4), **clamped to its parent's `columns`** rather than refused — a block moved into a narrower container must not make the page unsavable.

Below the breakpoint every block is one track. **This is the whole responsive story** and it is why coordinates were refused: `minmax` does not shrink below its minimum, so the grid uses `repeat(<columns>, minmax(0, 1fr))` and the collapse is a media query, not arithmetic.

- [ ] Failing tests: `span` above the parent's `columns` clamps; `span` of 0 or a non-integer is refused; absent `span` means 1.
- [ ] Red → implement → green → gate → commit.

---

### Task 3: the database guards

**Files:** `supabase/migrations/0009_actor_profiles.sql` (in place), `tests/db/blocks.test.ts` (create)

- [ ] **Step 1: Write the conformance tests first**, matching each `raise exception` string character for character. Read the existing pairs before writing new ones.

- [ ] **Step 2: Validate recursively in `0009`**

A plpgsql recursive check over the `jsonb` tree, refusing: a depth beyond the cap; an unknown `kind` or `mode`; children on a leaf; a `span` or `columns` outside range; a text field over the character cap; and the whole array over the byte cap.

**The depth guard must be a hard counter, not a shape assumption.** A recursive function with no explicit depth argument is the fault this guard exists to prevent.

Update the `actor_profiles.sections` column comment **in the same edit** — the comment being current while the database is not is exactly how a whole validation block went missing for weeks.

- [ ] **Step 3: Replace the old flat validation.** Every object is defined exactly once; do not stack a new function beside the old one.

- [ ] **Step 4: Apply to live by hand** and confirm `pnpm check:schema-drift` is green. An in-place edit does not reach the database on its own.

- [ ] **Step 5: Commit.** Note you cannot run `pnpm test:db`; `conformance` proves it in CI.

---

### Task 4: the container renderer

**Files:** `apps/hub/src/features/actors/presentation/blocks.tsx` (create), `apps/hub/tests/blocks.test.tsx` (create)

**Interfaces produced:** `<Block>`, `containerStyle`, `MODES`.

- [ ] Render each mode. `grid` and `columns` use CSS grid with the container's track count; `masonry` uses CSS columns with `break-inside: avoid`; `carousel` scrolls horizontally; `tabs` uses a radio group and `:checked` so it stays a **server component**; `accordion` is vertical and multi-open; `timeline` is a sequence; `stack` is the default and emits no grid at all.
- [ ] **`MODES` is a `Map`**, not a `Record` — `mode` comes from `jsonb`.
- [ ] Recursion: a container renders `<Block>` for each child. Depth is structural, so nothing needs a counter here — but assert the renderer terminates on the deepest legal tree.
- [ ] The style bag applies **at every level**: reuse the exported `sectionStyle` so the popup's live preview cannot drift from what the page renders. `nestedSkinVars` already emits a skin's complete property set; **prove it holds at depth 3**, since it was written for one level.
- [ ] Named tests (presentation is coverage-excluded). Gate and commit.

---

### Task 5: the plain leaves — `text`, `link`, `picture`

**Files:** `blocks.tsx`, tests

- [ ] `text` is a heading with optional prose. `link` is an anchor built by `safeHttpUrl` — **refuse the address rather than escape it**. `picture` is a pasted address through the same guard; AeleOS hosts no files.
- [ ] A leaf that cannot render its content **falls back to a plain row, never to nothing**. "Refuses nothing, shows nothing" is the trap the media layouts already avoid.
- [ ] Focus rings: every interactive leaf sits on a `surface`, which now carries an **inset** ring. Do not name an offset on an element — it beats `@utility surface` on sort order and specificity.
- [ ] Gate and commit.

---

### Task 6: the embed leaves — `player`, `post`, `social`

**Files:** `blocks.tsx`, tests

The provider table already exists and is underused. **This task is wiring, not new security surface** — but that is only true if nothing bypasses it.

- [ ] `player` and `post` resolve through `resolveEmbed`; `social` through `resolveSocial`, which accepts any `http(s)` address and labels an unknown host by hostname.
- [ ] **`frame-src` is derived from the provider table**, not kept as a second list. Confirm the derivation still covers every provider a block can now reach.
- [ ] An unresolvable address renders **a link**, not an empty frame.
- [ ] A `fast-check` property asserting `resolveEmbed` never throws on arbitrary input — the prototype-pollution Critical reached a public page render as a throw.
- [ ] **Every branch needs a named case.** A branch reached only when a generator happens to cooperate is untested and the coverage number lies at a low rate; that flake cost a required check about one run in 42.
- [ ] Gate and commit.

---

### Task 7: the taste leaves — `stat`, `quote`, `progress`, `table`

**Files:** `blocks.tsx`, tests

These carry the design that makes a page look good without design skill. Port their current rendering rather than reinventing it.

- [ ] **`progress` inverts the title/description pair** — title is the label, description is the value, as `stat` and `quote` already do. It reads `n/m`, a percentage or a bare number, decimals in all three. **A non-numeric value renders a plain row and no bar at all** — test that branch explicitly; it is the one somebody skips.
- [ ] Guard the overflow: both sides of a fraction overflowing to `Infinity` yields `NaN`, which CSSOM rejects, so the width falls back to auto and **the bar renders full**. Assert on the rendered output, not the parser's return.
- [ ] `table` is new: rows of cells, bilingual per cell, with a hard cap on rows and columns validated in `0009`.
- [ ] Gate and commit.

---

### Task 8: the public page, and proving it in a browser

**Files:** the public page route, `apps/hub/tests/e2e/blocks-render.spec.ts` (create)

- [ ] Wire the tree into `/{address}/{handle}`. A profile lists only `public` fursonas; a suspension travels to every public page, the owner's included.
- [ ] **Seed fixtures directly into the database** — there is no editor yet, and that is the point of this phase.
- [ ] A real-browser spec asserting: a depth-3 tree renders every leaf; `tabs` shows exactly one panel and switches by keyboard **and** by click, with the tab row painting above the panel; `masonry` does not split a card; at 320px `scrollWidth <= clientWidth`.
- [ ] **Sabotage-verify each assertion against the fault it names.** A test never seen red proves nothing, and this branch's ancestors produced eight that could not fail.
- [ ] Gate and commit.

---

### Task 9: documentation

**Files:** `apps/hub/src/features/actors/CLAUDE.md`, the spec, root `CLAUDE.md`

- [ ] Record the model: container versus leaf, section as a container at depth 0, the depth cap and that the database enforces it, span and why not coordinates.
- [ ] Record what replaced what — the decomposition table from the spec, so nobody looks for `gallery` and concludes it was dropped.
- [ ] Mark the spec complete. Note phases 3–5 are unwritten and why.
- [ ] **Do not write a count.** The tables are the lists.
- [ ] Full gate, branch-base check (`git log --oneline origin/main..HEAD` should list only your commits), **no push, no PR**.
