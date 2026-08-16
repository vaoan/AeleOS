# Section Personality — Phase C: per-section form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each section carry its own **form** — a skin and a background picture — so a page is not one uniform texture top to bottom; move the drag handle inside the section card and the language strip beside the sections it actually governs; and edit it all in a popup that shows the result live.

**Architecture:** A skin is already nothing but CSS custom properties overridden inside `SKIN_SCOPE`. Scoping the same properties to one `<section>` therefore needs **no new mechanism** — but it does need a fix first: `SKIN_VARS` holds each skin's _differences from the `:root` defaults_, which is correct at one scope and silently wrong at two. Task 1 closes that. Everything after is a `style` key on `sectionSchema`, validated in `0009`, rendered by scoping tokens to the section element, and edited by a popup that emits the same tokens the public page will.

**Tech Stack:** TypeScript (strict), Vitest, fast-check, Playwright, Next 15 App Router, next-intl, Tailwind 4 (`@theme inline`, `@utility`), Supabase (SQL only in `0009`), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-15-section-personality-design.md`

**Follows:** Phase A (`#150`, provider table) and Phase B (`#151`, `posts` and `socials`).

## Global Constraints

- **Colour is page-level and stays page-level.** A section carries **form only** — skin, background picture. No per-section colour, ever. That split is what every skin rests on: _a skin names no colour of its own_, and every pairing of a style and a palette is somebody's page. A per-section colour would collapse it.
- **`card_size` is NOT in scope.** The spec's style bag lists it, but the grid that consumes it is Phase D. **Do not add a schema key nothing renders** — that is the "control that does nothing" fault, which this project has now caught in five separate guises. `card_size` lands in Phase D beside the `auto-fill` grid.
- **`0009_actor_profiles.sql` is edited IN PLACE**, never superseded by a new migration file — every object is defined exactly once. Update the `actor_profiles.sections` column comment in the same edit.
- **Validation in `set_actor_sections` is key-by-key with an `unknown style key` fallthrough**, the way `set_actor_theme` already does it, so a typo is refused at the write rather than stored and silently ignored. Lengths follow that function's precedents: a pasted address ≤ 500 like `cursor`, a skin name ≤ 32 like the theme's skin. **Neither is checked against a list** — a skin is CSS the app either implements or does not, the renderer falls back for a name it does not know, and a list in SQL would be a migration every time one is added.
- **Absent means "inherit the page".** Every key is optional and absence is a real answer, not a gap — the same resting state the theme's own keys have.
- **Never index a plain object with a user-controlled string.** Use `Map`/`Set`. A `Record` keyed by user input shipped a Critical in Phase A: inherited members bypassed a guard and made a resolver **throw** on a public page render.
- **Never write a count into a comment** where it tracks a collection's size. `check:docs` cannot see it — the commenting symbol's own code never changes. **This project has reintroduced that pattern five times, twice inside the commit that was removing it.** Grep your own diff before every commit.
- **`check:docs` is mechanical**: `then.code !== now.code && then.doc === now.doc`. A doc edit it obliges must say something true and new; do not pad.
- **`pnpm check:tools` before every commit.** It runs cspell, stylelint, knip, jscpd, madge, sherif and syncpack inside the required `conformance` job, and **no per-task gate ran it in Phase A**, which is how that branch reached its final review red.
- **Custom CSS belongs in a cascade layer.** Unlayered rules beat every layered one regardless of specificity — silently, and forever. And **do not style a class the framework generated**: `[class~="border"]` once beat every Tailwind utility for months. Own the class; `@utility surface` is ours.
- **A person's own writing is not next-intl.** A missing `*_es` is an ordinary state, never an error.
- **Every export carries TSDoc stating the contract, not the types.** 100% coverage including branches — note `vitest.config.ts` excludes `src/features/*/presentation/**`, so presentation files need _named_ tests rather than relying on the percentage.
- **Filenames kebab-case. Do not commit secrets. Never touch Libra's database.**
- Branch from an explicit base: `git checkout -b feat/per-section-form origin/main`, verified with `git log --oneline origin/main..HEAD` before pushing.

**Commands** (repo root):

| purpose              | command                                      |
| -------------------- | -------------------------------------------- |
| hub tests            | `pnpm --filter hub test`                     |
| one file             | `pnpm --filter hub test tests/skins.test.ts` |
| coverage             | `pnpm test:hub:coverage`                     |
| types                | `pnpm typecheck`                             |
| lint                 | `pnpm lint`                                  |
| CSS lint             | `pnpm check:style`                           |
| docs                 | `pnpm check:docs`                            |
| **the gate CI runs** | `pnpm check:tools`                           |
| browser              | `pnpm --filter hub test:e2e`                 |

## File Structure

| file                                                                           | responsibility                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Modify** `apps/hub/src/shared/domain/skins.ts`                               | `SKIN_DEFAULTS` and `nestedSkinVars`. `skinVars` unchanged.    |
| **Modify** `apps/hub/tests/skins.test.ts`                                      | Pins `SKIN_DEFAULTS` to `globals.css`; the nesting regression. |
| **Modify** `apps/hub/src/features/actors/domain/section-schema.ts`             | `sectionSchema` gains `style`.                                 |
| **Modify** `supabase/migrations/0009_actor_profiles.sql`                       | `set_actor_sections` validates it; column comment updated.     |
| **Modify** `apps/hub/src/features/actors/presentation/public-sections.tsx`     | Scopes the skin and paints the background per section.         |
| **Modify** `apps/hub/src/features/actors/presentation/section-editor.tsx`      | Grip moves into the card.                                      |
| **Modify** `apps/hub/src/features/actors/presentation/section-card.tsx`        | Accepts the handle; hosts the style button.                    |
| **Create** `apps/hub/src/features/actors/presentation/section-style-popup.tsx` | The popup, with live preview.                                  |
| **Modify** `apps/hub/src/features/actors/presentation/fursona-editor.tsx`      | Language strip moves below the theme panel.                    |
| **Modify** `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`     | Popup strings.                                                 |

---

### Task 1: The nested-skin fix — a prerequisite, not a detail

**Files:**

- Modify: `apps/hub/src/shared/domain/skins.ts`
- Modify: `apps/hub/tests/skins.test.ts`

**Interfaces:**

- Produces: `SKIN_DEFAULTS`, `nestedSkinVars(skin: SkinId): Record<string, string>`.
- `skinVars` keeps its exact current behaviour and signature.

**Why this is first.** A skin works by overriding custom properties, and every consumer reads them through `var()` at the element — `@utility surface` is `border-width: var(--skin-border); background-image: var(--skin-gloss); box-shadow: var(--skin-shadow)`, and `@theme inline` compiles the radius scale to `calc(var(--skin-round) * 0.75rem)` _inside the utility_. So the **mechanism nests**. The **table does not**: `SKIN_VARS` holds only each skin's differences from the `:root` defaults, which falls through to `globals.css` at one scope and to **the enclosing skin** at two. Three consequences, all of which would ship as "the styling popup sort of works":

- A `comic` page with a `paper` section **keeps comic's halftone dots**, because `paper` never mentions `--skin-gloss`.
- An `outline` page makes **every** section transparent whatever skin it picks, since only `outline` sets `--surface`/`--bar`.
- A section set to `default` inside a `glass` page **is still glass**, because `default: {}` overrides nothing.

- [ ] **Step 1: Write the failing tests**

Add to `apps/hub/tests/skins.test.ts`:

```ts
describe("SKIN_DEFAULTS", () => {
  // The defaults are duplicated from globals.css, which this repo would
  // normally refuse. The duplication is pinned rather than trusted — the same
  // idiom skins.test.ts already uses to read the stylesheet.
  it("matches what globals.css declares", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    for (const [name, value] of Object.entries(SKIN_DEFAULTS)) {
      const declared = new RegExp(
        `${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`,
      ).exec(css);
      expect(declared, `${name} is not declared in globals.css`).not.toBeNull();
      expect(declared![1].trim()).toBe(value);
    }
  });

  it("covers every property any skin overrides", () => {
    for (const skin of SKINS) {
      for (const name of Object.keys(skinVars(skin))) {
        expect(Object.keys(SKIN_DEFAULTS)).toContain(name);
      }
    }
  });
});

describe("nestedSkinVars", () => {
  it("emits every property, so nothing falls through to an enclosing skin", () => {
    for (const skin of SKINS) {
      expect(Object.keys(nestedSkinVars(skin)).sort()).toEqual(
        Object.keys(SKIN_DEFAULTS).sort(),
      );
    }
  });

  // The regression the spike found. `paper` never mentions --skin-gloss, so
  // nested inside `comic` it used to inherit the halftone.
  it("resets a property the chosen skin does not set", () => {
    expect(nestedSkinVars("paper")["--skin-gloss"]).toBe(
      SKIN_DEFAULTS["--skin-gloss"],
    );
    expect(nestedSkinVars("paper")["--skin-gloss"]).not.toBe(
      skinVars("comic")["--skin-gloss"],
    );
  });

  it("keeps what the chosen skin does set", () => {
    expect(nestedSkinVars("comic")["--skin-gloss"]).toBe(
      skinVars("comic")["--skin-gloss"],
    );
  });

  // `default` overrides nothing, which is exactly why it needs the full reset:
  // a section set to `default` inside a `glass` page must not still be glass.
  it("makes default a real choice rather than an absence", () => {
    expect(nestedSkinVars("default")).toEqual(SKIN_DEFAULTS);
  });
});

describe("skinVars", () => {
  // Unchanged on purpose: themeCss keys the page-level skin rule on this
  // record being EMPTY, so an unthemed page emits no style element at all.
  it("still returns nothing for the default skin", () => {
    expect(skinVars("default")).toEqual({});
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter hub test tests/skins.test.ts`
Expected: FAIL — `SKIN_DEFAULTS` and `nestedSkinVars` do not exist.

- [ ] **Step 3: Implement**

In `apps/hub/src/shared/domain/skins.ts`:

```ts
/**
 * What `globals.css` declares for every property a skin can override.
 *
 * **This duplicates values from a stylesheet, which this repo would
 * normally refuse.** It is pinned rather than trusted: `skins.test.ts` parses
 * `globals.css` and fails when the two disagree, the same idiom that file
 * already uses. The duplication buys the only thing that makes a skin nest —
 * see {@link nestedSkinVars}.
 *
 * `--surface` and `--bar` are the composed forms, not the raw colours. A skin
 * changes their ALPHA and never their hue, so the reset has to restore the
 * composition rather than a literal — and `--surface-solid`/`--bar-solid` vary
 * by light and dark mode, which is exactly why this indirection exists.
 */
export const SKIN_DEFAULTS: Record<string, string> = {
  "--skin-round": "1",
  "--skin-border": "1px",
  "--skin-shadow": "none",
  "--skin-gloss": "none",
  "--skin-gloss-size": "auto",
  "--skin-blur": "12px",
  "--skin-backdrop": "none",
  "--skin-font": "var(--font-sans)",
  "--surface": "var(--surface-solid)",
  "--bar": "var(--bar-solid)",
};

/**
 * A skin's properties in FULL, for a scope nested inside another skin.
 *
 * **{@link skinVars} holds differences; this holds the whole set.** At one
 * scope "not set" falls through to `globals.css`, which is right. Nested, "not
 * set" falls through to the ENCLOSING skin — so a `paper` section inside a
 * `comic` page kept comic's halftone, an `outline` page made every section
 * transparent whatever it chose, and a section set to `default` inside a
 * `glass` page was still glass. All three are silent.
 *
 * `skinVars` is deliberately left alone rather than widened: `themeCss` keys
 * the page-level rule on it being empty, so widening it would make an unthemed
 * page start emitting a style element and lose the byte-for-byte guarantee
 * that page carries today.
 *
 * @param skin - the chosen skin.
 * @returns every property a skin can set, the chosen skin's values over the defaults.
 */
export function nestedSkinVars(skin: SkinId): Record<string, string> {
  return { ...SKIN_DEFAULTS, ...skinVars(skin) };
}
```

- [ ] **Step 4: Run**

Run: `pnpm --filter hub test tests/skins.test.ts`
Expected: PASS.

- [ ] **Step 5: Sabotage-verify the pin and the regression**

Two separate sabotages; report both.

1. Change `--skin-blur` in `globals.css` from `12px` to `13px`. The "matches what globals.css declares" test must go **red**. Restore.
2. Make `nestedSkinVars` return `skinVars(skin)` directly (the differences-only shape). "resets a property the chosen skin does not set" and "makes default a real choice" must both go **red**. Restore.

A pin never seen fail is a guess that the two files agree.

- [ ] **Step 6: Gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm check:style && pnpm check:tools`

```bash
git add apps/hub/src/shared/domain/skins.ts apps/hub/tests/skins.test.ts
git commit -m "fix(skins): a skin nested in a skin resets what it does not set"
```

---

### Task 2: The style bag — schema, `0009`, and the public page

**Files:**

- Modify: `apps/hub/src/features/actors/domain/section-schema.ts`
- Modify: `supabase/migrations/0009_actor_profiles.sql`
- Modify: `apps/hub/src/features/actors/presentation/public-sections.tsx`
- Modify: `apps/hub/tests/section-schema.test.ts`, `apps/hub/tests/public-sections.test.tsx`, `apps/hub/tests/section-limits-match-migration.test.ts`

**Interfaces:**

- Consumes: `nestedSkinVars`, `SKIN_DEFAULTS` from Task 1.
- Produces: `sectionStyleSchema`; `FursonaSection.style`.

**Two commits:** the schema and its SQL, then the rendering. Do not stop after the first — a stored key nothing renders is the fault this plan's constraints name.

- [ ] **Step 1: Write the failing schema tests**

`style` is optional; each key is optional; an unknown key is refused; a too-long address is refused; `background_fit` accepts only `cover` and `tile`.

The file already has a `section(over)` helper returning a well-formed section, and it asserts through **`sectionsSchema`** — the array form it already imports. Use both rather than adding an import:

```ts
it("accepts a section with no style at all", () => {
  expect(sectionsSchema.safeParse([section()]).success).toBe(true);
});

it("accepts a style that sets only one thing", () => {
  expect(
    sectionsSchema.safeParse([section({ style: { skin: "comic" } })]).success,
  ).toBe(true);
});

it("refuses a background fit it does not render", () => {
  expect(
    sectionsSchema.safeParse([
      section({ style: { background_fit: "parallax" } }),
    ]).success,
  ).toBe(false);
});

it("refuses a style key nothing reads", () => {
  expect(
    sectionsSchema.safeParse([section({ style: { corner_radius: "8px" } })])
      .success,
  ).toBe(false);
});
```

Note the last one: `z.object` strips unknown keys by default rather than refusing them, so the schema needs `.strict()` for that test to pass. That is deliberate and matches the SQL — a typo must be refused at the write, not stored and silently ignored.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter hub test tests/section-schema.test.ts`

- [ ] **Step 3: Add the schema**

```ts
/**
 * How one section chooses to LOOK. Form only — never colour.
 *
 * Colour is the page's, chosen once in the theme configurator, and that split
 * is what every skin rests on: a skin names no colour of its own. A
 * per-section colour would collapse every pairing of a style and a palette
 * into a colour scheme.
 *
 * Every key is optional and **absent means "inherit the page"** — a real
 * answer, not a gap, exactly as the theme's own keys work.
 */
export const sectionStyleSchema = z.object({
  skin: z.string().max(32).optional(),
  background_url: z.string().max(500).optional(),
  background_fit: z.enum(["cover", "tile"]).optional(),
});
```

`sectionSchema` gains `style: sectionStyleSchema.optional()`.

`skin` is **not** checked against `SKINS` here, matching how `set_actor_theme` treats the page skin: the renderer falls back for a name it does not know, and a list would be a second place to keep in step.

- [ ] **Step 4: Validate it in `0009`, in place**

Inside `set_actor_sections`'s section loop, after the existing checks:

```sql
    if v_section ? 'style' then
      if jsonb_typeof(v_section -> 'style') is distinct from 'object' then
        raise exception 'section %: style must be an object', i using errcode = '22023';
      end if;

      -- Key by key with an unknown-key fallthrough, exactly as
      -- set_actor_theme does: a typo is refused at the write rather than
      -- stored and silently ignored.
      for v_key, v_value in select * from jsonb_each_text(v_section -> 'style') loop
        if v_key = 'skin' then
          if length(v_value) > 32 then
            raise exception 'section %: skin name is too long', i using errcode = '22023';
          end if;
        elsif v_key = 'background_url' then
          if length(v_value) > 500 then
            raise exception 'section %: background address is too long', i using errcode = '22023';
          end if;
        elsif v_key = 'background_fit' then
          if v_value not in ('cover', 'tile') then
            raise exception 'section %: unknown background fit', i using errcode = '22023';
          end if;
        else
          raise exception 'section %: unknown style key %', i, v_key using errcode = '22023';
        end if;
      end loop;
    end if;
```

Declare `v_key`/`v_value` in the function's `declare` block if they are not already there. **Update the `actor_profiles.sections` column comment in the same edit** to describe the `style` object.

- [ ] **Step 5: Commit the schema half**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm check:tools`

```bash
git commit -m "feat(sections): a section may carry its own form"
```

- [ ] **Step 6: Write the failing rendering tests**

A section with a skin renders an element carrying the skin's properties; a section with a background picture paints it; `tile` repeats where `cover` covers; a section with no style adds no wrapper attributes at all.

**Assert the property VALUES, not just that a style attribute exists.** A test asserting `style` is non-empty would pass on a wrapper that emits the wrong skin.

- [ ] **Step 7: Render it**

In `public-sections.tsx`, the section wrapper gains inline custom properties from `nestedSkinVars(style.skin)` when a skin is chosen, plus `background-image`/`background-repeat`/`background-size` when an address is present.

- **The background address goes through `safeHttpUrl`.** It is a pasted address on a page strangers read, and `url(...)` in a style attribute is a sink. Anything it refuses paints nothing.
- **`img-src` already allows any https host**, so this costs nothing in the content security policy.
- A section with **no** `style` must emit **no** extra attributes — an unthemed page stays byte-for-byte what it was.

- [ ] **Step 8: Run, gate, commit**

Run: `pnpm --filter hub test && pnpm typecheck && pnpm lint && pnpm check:style && pnpm check:tools`

```bash
git commit -m "feat(sections): a section wears its own skin and background"
```

---

### Task 3: Prove the nesting actually computes, in a browser

**Files:**

- Modify: `apps/hub/tests/e2e/` — a spec beside the existing ones

**This task exists because the spike's own conclusion was that reading is not running.** The cascade argument is sound and `[class~="border"]` survived months here on reasoning that also sounded fine. Unit tests assert what we _emit_; only a browser proves what the CSS engine _resolves_.

- [ ] **Step 1: Write the assertion**

A public page with a page-level skin and a section carrying a different one. Assert with `getComputedStyle` that:

- the section's `border-radius` **differs** from an element outside it under the page skin;
- a property the section's skin does **not** set has resolved to the `globals.css` default rather than to the page skin's value — this is the regression Task 1 fixed, seen end to end;
- `@utility surface` inside the section reflects the section's `--skin-border`, not the page's.

- [ ] **Step 2: Run it**

Run: `pnpm --filter hub test:e2e`
Expected: PASS. If it fails, the cascade does **not** work the way Task 1 assumes — **stop and report**, because everything after depends on it.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(skins): a nested skin resolves in a real browser, not only on paper"
```

---

### Task 4: The editor's geography

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/section-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/section-card.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/tests/section-editor.test.tsx`, `apps/hub/tests/fursona-editor.test.tsx`

Two independent moves, one commit each.

- [ ] **Step 1: The grip moves inside the card**

`SectionEditor` wraps each row in a flex pair — a handle button, then the card — which is where the empty gutter down the left comes from. The handle moves **into `SectionCard`'s header row**, beside the collapse chevron. `SectionCard` gains a `dragHandleProps` prop; `SectionEditor` stops wrapping.

**The header row wraps deliberately and must keep doing so.** A `select` is as wide as its longest option, and that row — chevron, name, a menu naming thirteen layouts, bin — once forced a 320px screen 150px wider than the phone. `responsive.spec.ts` fails by exactly that margin when the row goes back on one line. Adding the grip must not undo it; re-run that spec.

- [ ] **Step 2: The language strip moves below the theme panel**

Today the order is fields → **language strip** → theme panel → sections.

`lang` appears **once** in `fursona-editor.tsx`, passed to `SectionEditor`, and `fursona-schema.ts` has no `_en`/`_es` fields at all. So the strip governs **only the sections**, while announcing itself above four fields it does not touch and separated from the ones it does by the whole theme panel.

New order: fields → theme panel → **language strip** → sections.

Its `sticky top-(--bar-top-2)` becomes correct as a side effect: it comes into force exactly when the sections are on screen, instead of hovering over somebody picking colours.

**Re-read `writingInHint` in both catalogues after the move.** If it names "the fields below" it is now true; if it names the fursona's own fields it was never true, and this is when that is fixed.

- [ ] **Step 3: Run, gate, commit each**

Run: `pnpm --filter hub test && pnpm typecheck && pnpm lint && pnpm check:tools`

---

### Task 5: The style popup, with a live preview

**Files:**

- Create: `apps/hub/src/features/actors/presentation/section-style-popup.tsx`
- Modify: `apps/hub/src/features/actors/presentation/section-card.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Create: `apps/hub/tests/section-style-popup.test.tsx`

- [ ] **Step 1: Write the failing tests**

Opening the popup shows the skin list and the background fields; choosing a skin writes `style.skin` on **that** section and no other; clearing a choice removes the key rather than storing an empty string; the card behind renders with the chosen skin's properties while the popup is open.

**That last one is the point of the task** — assert the preview element's custom properties, not merely that a popup opened.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

A paintbrush button beside the bin in `SectionCard`'s header row opens it. Fields: the skin list (`SKINS`, names from the catalogue), a background address, and the fit.

- **The preview uses the same `nestedSkinVars` the public page uses**, so it cannot drift from the result. That is the rule the theme configurator already follows by sharing `themeCss`.
- **Persistence rides the ordinary save.** What must be instant is _seeing_ it, not storing it.
- **Clearing a field removes the key.** Storing `""` would be a third state between "inherit" and "chosen", and `absent means inherit` is the contract.
- Test ids on every control — the end-to-end suite runs in Spanish and cannot assert on translated text.
- Colours come from tokens, never literals; every surface is `surface`, never Tailwind's `border`.

- [ ] **Step 4: Run, gate, commit**

---

### Task 6: The documentation this obliges

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-15-section-personality-design.md`

- [ ] **Step 1: The feature note**

Record the per-section form: what a section may set, that **absent means inherit**, and that **colour is page-level and must stay so**. Record the nesting fix and why `skinVars` was left alone — `themeCss` keys the page-level rule on its emptiness.

Record the readability position unchanged from the spec: a section wearing `outline` over a busy picture may be unreadable, and it needs no per-section escape hatch because `PageThemeSwitch` drops **all** of it at once. **Do not add a per-section correction** — the page-level escape hatch is what makes the freedom safe.

- [ ] **Step 2: The spec**

Mark Phase C done. Record that `card_size` moved to Phase D **with the grid that consumes it**, so no schema key ships that nothing renders.

- [ ] **Step 3: Full gate and branch check**

```bash
pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm test:hub:coverage && pnpm check:docs && pnpm check:style && pnpm format:check && pnpm check:tools
git log --oneline origin/main..HEAD
```

Coverage 100%. The log must list only this plan's commits. **Do not push and do not open a pull request.**

---

## What Phase C deliberately does not do

- **No `card_size`, no cards grid, no page background** — Phase D, where the grid that consumes the dial lives.
- **No per-section colour**, now or later.
- **No per-section readability correction.** The page-level escape hatch is the answer; correcting somebody's page behind their back is what `palette.test.ts` asserts against.
