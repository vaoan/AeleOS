# Section Personality — Phase D: the cards grid and the page background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author choose how big a card is and let the browser choose how many fit; and give a whole page a background picture, tiled or covering, the way the sites this borrows from did.

**Architecture:** `card_size` joins the per-section `style` bag Phase C built, and `Cards` becomes `repeat(auto-fill, minmax(var(--card-size), 1fr))` — the author picks the size, the browser picks the count, and no breakpoint is guessed. The page background is a `theme` key emitted by `themeCss` at `:root`, reusing the same `backgroundImageValue` the sections use.

**Spec:** `docs/superpowers/specs/2026-08-15-section-personality-design.md` — **this is the last phase.** When it merges the design is fully delivered.

**Follows:** Phase A (`#150`), Phase B (`#151`), Phase C (`#152`).

## Global Constraints

- **`sectionStyleShape` is shared by the strict (write) and lenient (read) schemas.** Adding `card_size` there covers both, which is the point of that shape existing. Do not add it to one and not the other.
- **The read path stays lenient and the write path stays strict.** An unknown style key must be _stripped_ when parsing stored data and _refused_ when saving. Phase C made this split because a strict read blanks a whole page during deploy skew — and `card_size` is precisely the key that would have triggered it.
- **`0009_actor_profiles.sql` is edited IN PLACE**, never superseded — every object defined exactly once. Both `set_actor_sections` (the section style block) and `set_actor_theme` (the page background) are in it. Update the `actor_profiles.sections` and `.theme` column comments in the same edits.
- **Validation is key-by-key with an unknown-key fallthrough**, and **a JSON null must be refused explicitly**: `jsonb_each_text` yields SQL `NULL` for one, so `length(NULL) > 32` and `NULL not in (…)` are both `NULL` and neither raises. Phase C added a null guard to the section block for exactly this; the theme block needs the same care.
- **`backgroundImageValue` refuses any address containing `"` or `\`.** That is what makes its output safe in **any** CSS context rather than only in the CSSOM sink — which is what lets `themeCss`, a raw `<style>` block, reuse it. Do not narrow that refusal, and do not build a second one.
- **Never index a plain object with a user-controlled string.** `Map`/`Set` only.
- **Never write a count into a comment** where it tracks a collection's size. **Grep your own diff before every commit** — this project has produced that pattern nine times, twice in text written while stating the rule, and once in a plan's own sample code.
- **`pnpm check:tools` before every commit.** It runs inside the required `conformance` job.
- **`pnpm test:db` cannot run locally** (no Docker; this is a cloud-only setup). SQL work is verified by inspection here and **executed in CI's `conformance` job** — so match every `raise exception` string to its test regex character for character, or CI fails for the wrong reason.
- **Custom CSS belongs in a cascade layer**, and do not style a class the framework generated.
- Every export carries TSDoc stating the contract. 100% coverage including branches — `vitest.config.ts` excludes `src/features/*/presentation/**`, so presentation files need **named** tests rather than the percentage.
- Branch from an explicit base: `git checkout -b feat/cards-and-page-background origin/main`.

## File Structure

| file                                                                           | responsibility                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Modify** `apps/hub/src/features/actors/domain/section-schema.ts`             | `card_size` on `sectionStyleShape`.                                      |
| **Modify** `supabase/migrations/0009_actor_profiles.sql`                       | Validates `card_size`; validates the page background.                    |
| **Modify** `apps/hub/src/features/actors/presentation/public-sections.tsx`     | `Cards` becomes an auto-fill grid; `sectionStyle` emits `--card-size`.   |
| **Modify** `apps/hub/src/features/actors/presentation/section-style-popup.tsx` | The card-size control.                                                   |
| **Modify** `apps/hub/src/features/actors/domain/actor-theme.ts`                | `backgroundUrl`/`backgroundFit` on `ActorTheme`; `themeCss` paints them. |
| **Modify** `apps/hub/src/features/actors/presentation/theme-configurator.tsx`  | The page-background control.                                             |
| **Modify** `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`     | New strings.                                                             |

---

### Task 1: `card_size` through the schema and the database

**Files:**

- Modify: `apps/hub/src/features/actors/domain/section-schema.ts`
- Modify: `supabase/migrations/0009_actor_profiles.sql`
- Modify: `apps/hub/tests/section-schema.test.ts`, `apps/hub/tests/db/fursona-sections.test.ts`

- [ ] **Step 1: Write the failing schema tests**

`card_size` accepts `"s" | "m" | "l"` and nothing else; a section with no `style` is still valid; the **write** schema refuses an unknown key while the **read** schema strips it.

```ts
it("accepts a card size", () => {
  expect(
    sectionsSchema.safeParse([section({ style: { card_size: "l" } })]).success,
  ).toBe(true);
});

it("refuses a card size it cannot render", () => {
  expect(
    sectionsSchema.safeParse([section({ style: { card_size: "xl" } })]).success,
  ).toBe(false);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter hub test tests/section-schema.test.ts`

- [ ] **Step 3: Add it to the shared shape**

`sectionStyleShape` gains `card_size: z.enum(["s", "m", "l"]).optional()`. Both the strict and lenient schemas pick it up, which is why that shape exists.

Its TSDoc says what the sizes mean: they set the **minimum** card width, and the browser decides how many fit — **absent means the page's default**, like every other key here.

- [ ] **Step 4: Validate it in `0009`, in place**

In `set_actor_sections`'s style block, beside the existing keys:

```sql
        elsif v_key = 'card_size' then
          if v_value not in ('s', 'm', 'l') then
            raise exception 'section %: unknown card size', i using errcode = '22023';
          end if;
```

The existing null guard already covers a JSON null for this key — **confirm that by reading it**, do not assume. Update the `actor_profiles.sections` column comment.

- [ ] **Step 5: Add the conformance test**

In `tests/db/fursona-sections.test.ts`, following the shape of the five style refusals Phase C added: an unknown card size raises. **Match the message to the SQL character for character** — it runs in CI, not here.

- [ ] **Step 6: Gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm check:tools`

---

### Task 2: the auto-fill cards grid

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/public-sections.tsx`
- Modify: `apps/hub/tests/public-sections.test.tsx`

**What is being replaced, and why its own TSDoc must go with it.** `Cards` is currently `grid gap-4 sm:flex sm:overflow-x-auto sm:pb-3 lg:grid lg:grid-cols-3 lg:pb-0` — full-width stacked below `sm`, a sideways-scrolling row of fixed `w-56` tiles from `sm`, a three-column grid at `lg`. Its TSDoc argues for that scroll row at length, and then apologises for it on phones.

That argument does not survive `card_size`: the author now says how big a card is, so the browser can say how many fit, at every width, with no breakpoint guessed. **Rewrite the TSDoc rather than leaving it** — it currently explains a decision the code no longer makes, which is the confidently-wrong-instruction failure this repo names.

**`carousel` is untouched and the distinction must survive.** It keeps scrolling sideways at every size, and that is the honest difference between the two: one is a set of cards, the other is a thing you swipe through, and somebody who wants the second picks it by name. Say so in the new TSDoc.

- [ ] **Step 1: Write the failing tests**

- A section with `card_size: "l"` renders a grid whose template uses the large minimum.
- A section with **no** `card_size` uses the default minimum — and a section with no `style` at all still renders no extra attributes on the wrapper (Phase C's guarantee, which must not regress).
- **Every card keeps its icon tile**, including items with no icon — a row where only some are anchored is ragged, which was half of why these did not read as cards.
- `carousel` still scrolls sideways.

**Assert the resolved template value, not that a class is present.** A test asserting `className` contains something passes on a grid that renders one column.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

`Cards` becomes a grid of `repeat(auto-fill, minmax(var(--card-size, <default>), 1fr))`. `sectionStyle` emits `--card-size` when the section chose one.

Pick the three widths so they are visibly different and each is sane on a 320px screen — a minimum wider than the viewport collapses `auto-fill` to one column, which is a legitimate outcome but must be the _small_ screen's behaviour rather than every screen's. **State the chosen values and your reasoning in the report**, and put the mapping in one place rather than inline in the class string.

- [ ] **Step 4: Prove it in a browser**

The unit test asserts what is emitted. Add an assertion to the existing e2e work — or a small spec beside it — that a page with `card_size: "s"` puts **more cards per row** at a given viewport than the same page with `card_size: "l"`. That is the behaviour the feature promises and the only check that would catch a template that parses but never wraps.

**Sabotage-verify it:** make `sectionStyle` ignore `card_size`, confirm red, restore.

- [ ] **Step 5: Gate and commit**

---

### Task 3: the card-size control in the style popup

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/section-style-popup.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Modify: `apps/hub/tests/section-style-popup.test.tsx`

- [ ] **Step 1: Write the failing tests**

Choosing a size writes `style.card_size` on **that** section and no other; clearing it **removes the key** rather than storing `""`; the live preview reflects it.

Those first two are the rules Phase C established and tested for skin and background — this control must honour them identically, and the tests are the reason it will.

- [ ] **Step 2–4: Run red, implement, run green**

Follow the popup's existing controls exactly: `tid()` on the control, strings in **both** catalogues, tokens not literals, and the preview driven by the same `sectionStyle` the public page uses — the popup and the page share that function precisely so they cannot drift.

- [ ] **Step 5: Gate and commit**

---

### Task 4: a background picture for the whole page

**Files:**

- Modify: `apps/hub/src/features/actors/domain/actor-theme.ts`
- Modify: `supabase/migrations/0009_actor_profiles.sql`
- Modify: `apps/hub/src/features/actors/presentation/theme-configurator.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Modify: `apps/hub/tests/actor-theme.test.ts`, `theme-configurator.test.tsx`, `tests/db/actor-theme.test.ts`

**This is the most recognisable thing about the era the design borrows from**, and it is a `theme` key rather than a section key because it is the whole page.

- [ ] **Step 1: Write the failing tests**

`ActorTheme` carries `backgroundUrl` and `backgroundFit`; `themeCss` paints them at `:root`; an address that `backgroundImageValue` refuses paints **nothing**; a theme with neither still emits what it emitted before, byte for byte.

**That last one matters more than it looks.** `themeCss` returns `null` for an uncustomised theme and `ThemeScope` then renders no element at all. Adding keys must not break that — test it.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

- `backgroundUrl` and `backgroundFit` on `ActorTheme`, parsed the way its neighbours are — a value that fails to parse falls back rather than throwing, because it arrives from a `jsonb` column.
- `themeCss` emits `background-image`, `background-repeat` and `background-size` at `:root`, **through `backgroundImageValue`**. That reuse is only sound because Phase C widened its refusal to cover `\` as well as `"`: `themeCss` interpolates into a raw `<style>` block, where CSSOM offers no protection at all. **Do not build a second escaping path.**
- The gradient stays. A picture sits **over** the author's gradient, so a transparent or partial picture still shows their colours — and a page with a picture and no gradient still has the design's own field beneath it.

- [ ] **Step 4: Validate it in `set_actor_theme`, in `0009`, in place**

Two keys beside the existing ones, length-capped like `cursor` and refusing an unknown fit. **A JSON null must raise** — `jsonb_each_text` yields SQL `NULL`, so a length test on it never fires. Check whether that block already has a null guard; if not, add one. Update the `.theme` column comment.

Add conformance tests in `tests/db/actor-theme.test.ts` beside its existing "refuses a key it does not know", matching messages **character for character**.

- [ ] **Step 5: The control**

In the theme configurator, beside the cursor field — both are pasted addresses for a picture, and grouping them is honest. `tid()`, both catalogues, tokens only.

- [ ] **Step 6: Gate and commit**

---

### Task 5: the documentation, and the spec's last page

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-15-section-personality-design.md`
- Modify: root `CLAUDE.md`

- [ ] **Step 1: The feature note**

Record `card_size` — that it sets a **minimum** width and the browser decides the count, and that `carousel` remains the swipe layout by name. Record the page background: that it sits over the gradient, and that it reuses `backgroundImageValue` because that refusal makes the value safe in a raw `<style>` block.

**Do not write a count.** The layouts table is the list.

- [ ] **Step 2: The spec**

**Mark Phase D done, and the spec complete.** Record that `card_size` landed here rather than in Phase C, with the grid that consumes it, so no schema key ever shipped that nothing rendered.

- [ ] **Step 3: The root note**

Add a "Current state" bullet: the section-personality design is delivered end to end — seventeen embed providers, `posts` and `socials`, per-section form, the cards grid and the page background.

- [ ] **Step 4: Full gate and branch check**

```bash
pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm test:hub:coverage && pnpm check:docs && pnpm check:style && pnpm format:check && pnpm check:tools
git log --oneline origin/main..HEAD
```

Coverage 100%. Only this plan's commits. **Do not push and do not open a pull request.**

---

## What Phase D deliberately does not do

- **No per-section colour**, now or ever. Form is the section's; colour is the page's.
- **No second escaping path** for a pasted address. One refusal, shared.
- **No per-section readability correction.** `PageThemeSwitch` drops all of it at once, and that page-level escape hatch is what makes the freedom safe.
