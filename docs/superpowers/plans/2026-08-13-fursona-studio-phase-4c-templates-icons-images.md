# Fursona studio, phase 4c — templates, icons and images

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close editor parity. A section item gets the field its layout will actually render — an icon for `cards`, an image address for `gallery` — and somebody starting a page can begin from a shipped template instead of an empty screen.

**Architecture:** Two of the three columns `0013` already accepts (`icon`, `image_url`) stop being ignored by the editor, shown per layout rather than everywhere. Templates are a frozen array in code — no table, no migration, no rows — whose picker labels come from next-intl and whose seeded section content does not.

**Tech Stack:** react-hook-form, zod, `lucide-react/dynamic`, next-intl, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md` — Decision 4 ("Templates in code"), and the parity checklist's `templates` and `icon picker, image bar` rows.

## Global Constraints

- **Budget is $0.** A template table would cost rows, a migration and a read on every editor open. It buys nothing while the templates are ours to ship.
- **100% statements, branches, functions and lines** in `apps/hub`.
- **Every export carries TSDoc stating the contract**; `pnpm check:docs` gates it, and gates it again when a symbol moves without its documentation.
- **Every bug found gets a regression test**, sabotage-verified against the original fault.
- **A mocked dependency hides its own setup requirements.** This phase mocks `lucide-react/dynamic` in every component test, so `pnpm --filter hub build` is the only thing that proves the real module resolves and bundles. It is not optional.
- **Both catalogues, always**, Spanish differing from English. `messages.test.ts` fails the build otherwise.
- **Spanish in a source file needs a `cspell.json` override** for that file. This has cost time in five previous phases; do it when the file is created, not when the check fails.
- **No `@param props`** on a destructured component; `@returns` alone.
- **Do not commit unless a step says to.**

## Four decisions this phase makes

### 1. The field a layout renders is the only field it offers

Libra shows the icon picker in `cards` and nowhere else, and the image address in `gallery` and nowhere else. Adopted, and it is worth saying why rather than copying it: **a field the public page will never render is a field somebody fills in and then wonders about.** An icon typed onto a gallery item is not rejected, not warned about, and never appears — the worst kind of control, because nothing tells the person it did nothing.

So the item's fields become layout-aware:

| Layout       | Shows                                       |
| ------------ | ------------------------------------------- |
| `cards`      | icon, title, description                    |
| `accordion`  | title, description                          |
| `two-column` | title, description                          |
| `gallery`    | image address + preview, title, description |

`0013` accepts `icon` and `image_url` on any item and continues to — the database is not the place to enforce a presentation rule. Changing a section's layout therefore keeps whatever was already stored rather than dropping it, so switching to `gallery` to look and switching back does not silently erase an icon.

### 2. A template's labels are chrome; the content it seeds is not

This is the line that keeps the two i18n systems from being confused, and it falls in an unobvious place.

- **The picker's template name and description are the app's own words.** They go through next-intl, keyed by template id. A missing Spanish name is a **build failure**, exactly as it should be — we wrote that string, we owe both languages.
- **The section content a template inserts is not.** The instant somebody applies a template, those words are theirs: they edit them, they own them, and they may delete every one. So they live as literal bilingual text in the constant, not in a catalogue. A catalogue key cannot describe a string that is about to be rewritten by somebody else.

The seeded content ships in **both** languages, because we are the author until the moment it is applied.

### 3. Templates must satisfy the schema they seed, and a test proves it

`sectionItemSchema` requires `title_en` and `description_en` to be non-empty. A template of empty scaffolding would therefore be refused by our own editor the moment somebody pressed Save — found by the person, not by us.

That is not a reason to loosen the schema. It is the reason a template ships guidance text rather than blanks: the description tells somebody what belongs there, and they overwrite it. **A test parses every shipped template through `sectionsSchema`**, so a template that could not be saved cannot be shipped.

The same test pins decision 1's consistency: an `icon` only on `cards` items, an `image_url` only on `gallery` items. A template that seeds a field its layout will not show is a template that teaches the trap.

### 4. Two divergences from Libra, both deliberate

- **No popover.** Libra's `IconPicker` uses its `ui` package's `Popover`. There is no such package here, and building one — portal, positioning, focus trap — is a great deal of surface for a control that does not need to overlay anything. The picker is an inline panel below its trigger: keyboard-navigable without any work, dismissed by Escape or by choosing.
- **No `toKebab`.** Libra converts PascalCase because its database holds legacy values. Ours holds only what our own picker wrote, which is already kebab-case. Porting the conversion would carry a defect class — a name that converts wrongly — for data that cannot exist.

  But `icon` is free text as far as `0013` is concerned, so a value that is not a known icon name must not be handed to `DynamicIcon`. An unrecognised name renders as the empty state, and **that is a branch with a test**, not a hope.

  And because `icon` is optional, the picker offers a way back to none. A picker with no clear control makes an optional field permanent after the first touch.

---

## File Structure

| File                                                                | Responsibility                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/hub/src/features/actors/presentation/icon-picker.tsx`         | Choose one lucide icon, search it, or clear it.                    |
| `apps/hub/src/features/actors/presentation/section-item-fields.tsx` | Grows the layout-aware icon and image fields.                      |
| `apps/hub/src/features/actors/domain/fursona-templates.ts`          | The shipped starting layouts, frozen, with bilingual seed content. |
| `apps/hub/src/features/actors/presentation/template-picker.tsx`     | Lists the templates; confirms inline before replacing.             |
| `apps/hub/src/features/actors/presentation/section-editor.tsx`      | Hosts the picker; applies a template to the sections array.        |
| `apps/hub/src/features/actors/presentation/section-card.tsx`        | Passes its own layout down to its items.                           |
| `apps/hub/src/app/[locale]/(app)/fursonas/labels.ts`                | Resolves the new strings, including one label pair per template.   |
| `apps/hub/tests/icon-picker.test.tsx`                               | The picker's behaviour, including the unknown-name branch.         |
| `apps/hub/tests/fursona-templates.test.ts`                          | Decision 3's guard.                                                |
| `apps/hub/tests/template-picker.test.tsx`                           | Listing, the inline confirm, and declining it.                     |

---

### Task 0: Branch

- [ ] **Step 1: Cut from `origin/main` and confirm the base**

```bash
git fetch origin
git checkout -b feat/studio-phase-4c-templates-icons origin/main
git log --oneline origin/main..HEAD
```

Expected: no output. Any commits listed mean the base is wrong — rebuild with `git checkout -B ... origin/main`.

---

### Task 1: The icon picker

**Files:**

- Create: `apps/hub/src/features/actors/presentation/icon-picker.tsx`
- Test: `apps/hub/tests/icon-picker.test.tsx`
- Modify: `cspell.json` (only if a word trips it)

**Interfaces:**

- Consumes: nothing from this phase.
- Produces: `IconPicker`, `IconPickerLabels`, `IconPickerProps`.

```ts
interface IconPickerLabels {
  chooseIcon: string;
  searchIcons: string;
  noIconsFound: string;
  clearIcon: string;
  noIcon: string;
}
interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
  labels: IconPickerLabels;
}
```

- [ ] **Step 1: Write the failing tests**

`apps/hub/tests/icon-picker.test.tsx`. Mock `lucide-react/dynamic` with a small fixed name list, so the test is about the picker and not about lucide's catalogue:

```tsx
vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles", "heart", "star", "home", "zap"],
}));
```

Cover, at minimum:

- the trigger renders the current icon;
- an **unknown** stored name (`"NotAnIcon"`) renders the empty state and is never passed to `DynamicIcon` — assert `document.querySelector('[data-icon="NotAnIcon"]')` is `null`;
- an **empty** value renders the empty state;
- the panel is closed until the trigger is pressed, and `aria-expanded` reflects it;
- searching narrows the grid, and a search matching nothing shows `noIconsFound`;
- choosing calls `onChange` with the name and closes the panel;
- clearing calls `onChange` with `""`;
- Escape closes the panel without calling `onChange`.

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter hub test icon-picker
```

Expected: the module does not exist.

- [ ] **Step 3: Write the picker**

Key points, and only these are prescriptive:

- `MAX_VISIBLE = 48`. Rendering all ~1500 icons is slow enough to feel broken; the cap is a multiple of the 8-column grid so the panel never ends ragged.
- `iconNames.includes(value)` decides whether `DynamicIcon` is given the value at all. This is decision 4's branch.
- The panel is a sibling `<div>`, not a portal. The trigger carries `aria-expanded` and `aria-controls`.
- Escape closes: `onKeyDown` on the wrapper, checking `event.key === "Escape"`.
- The clear control sets `""` and closes.

- [ ] **Step 4: Run them and watch them pass**

```bash
pnpm --filter hub test icon-picker
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/presentation/icon-picker.tsx apps/hub/tests/icon-picker.test.tsx
git commit
```

Message: what it is, and that an unrecognised stored name renders as empty rather than being handed to `DynamicIcon`.

---

### Task 2: The item's fields follow its layout

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/section-item-fields.tsx`
- Modify: `apps/hub/src/features/actors/presentation/section-card.tsx`
- Test: `apps/hub/tests/section-item-fields.test.tsx`, `apps/hub/tests/section-card.test.tsx`

**Interfaces:**

- Consumes: `IconPicker`, `IconPickerLabels` from Task 1.
- Produces: `SectionItemFieldsProps` gains `type: SectionType` and `control: Control<T>`; `SectionItemFieldsLabels` extends `IconPickerLabels` and gains `imageUrl` and `imagePreview`.

The icon is not a plain `register` — it is a value chosen by a control, so it needs `useController`. That is why `control` joins the props.

- [ ] **Step 1: Write the failing tests**

In `section-item-fields.test.tsx`, add a `type` to the harness and assert:

- `type="cards"` renders the icon trigger, and no image address field;
- `type="gallery"` renders the image address field, and no icon trigger;
- `type="accordion"` and `type="two-column"` render neither;
- every layout still renders title and description, in the bound language;
- a gallery item with an `image_url` renders a preview `<img>` whose `alt` is the item's title, and one without renders a placeholder instead.

In `section-card.test.tsx`, assert the card passes **its own** `type` down: a card whose section is `gallery` shows the image field on its items. This is the wiring that a props change silently drops.

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter hub test section-item-fields section-card
```

- [ ] **Step 3: Implement**

- `section-item-fields.tsx` takes `type` and `control`; renders `<IconPicker>` bound through `useController({ control, name: \`${path}.icon\` })`when`type === "cards"`, and an image address input plus preview when `type === "gallery"`.
- The preview uses a plain `<img>`; the address is arbitrary and user-supplied, so `next/image` is wrong here — it would try to optimise a host it has never been configured for. Add the `eslint-disable` for `@next/next/no-img-element` with that reason on the line.
- `section-card.tsx` reads its section's current type. It already registers `${path}.type`; use `useWatch` for the live value so switching the layout updates the items without a save.

- [ ] **Step 4: Run them and watch them pass**

- [ ] **Step 5: Commit**

Message: that the field shown is the field the layout will render, and that switching layouts keeps what was stored rather than dropping it.

---

### Task 3: The templates, in code

**Files:**

- Create: `apps/hub/src/features/actors/domain/fursona-templates.ts`
- Test: `apps/hub/tests/fursona-templates.test.ts`
- Modify: `cspell.json` — **the seed content is bilingual, so this file needs the `en,en-GB,es` override. Add it in this task.**

**Interfaces:**

- Consumes: `sectionsSchema`, `FursonaSection` from `section-schema.ts`.
- Produces:

```ts
export interface FursonaTemplate {
  id: string;
  sections: FursonaSection[];
}
export const FURSONA_TEMPLATES: readonly FursonaTemplate[];
```

No `name` or `description` on the template — decision 2 puts those in the catalogue, keyed by `id`.

- [ ] **Step 1: Write the failing test**

`apps/hub/tests/fursona-templates.test.ts`:

```ts
describe("FURSONA_TEMPLATES", () => {
  it("ships at least one template", () => {
    expect(FURSONA_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = FURSONA_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Decision 3. A template the editor would refuse is a template somebody
  // discovers is broken by pressing Save.
  it.each(FURSONA_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s parses as sections the editor would accept",
    (_id, template) => {
      expect(() => sectionsSchema.parse(template.sections)).not.toThrow();
    },
  );

  it.each(FURSONA_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s writes every seeded string in both languages",
    (_id, template) => {
      for (const section of template.sections) {
        expect(section.name_es).toBeTruthy();
        for (const item of section.items) {
          expect(item.title_es).toBeTruthy();
          expect(item.description_es).toBeTruthy();
        }
      }
    },
  );

  // Decision 1: a template must not seed a field its layout will never show.
  it.each(FURSONA_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s seeds icons only on cards and images only on galleries",
    (_id, template) => {
      for (const section of template.sections) {
        for (const item of section.items) {
          if (item.icon) expect(section.type).toBe("cards");
          if (item.image_url) expect(section.type).toBe("gallery");
        }
      }
    },
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter hub test fursona-templates
```

- [ ] **Step 3: Write the templates**

Four, and they are about a character rather than a product — Libra's are a marketplace's and none of them ports:

| id                | Sections                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `reference-sheet` | "The basics" (`cards`: species, pronouns, age) · "Design notes" (`two-column`: markings, colours) |
| `character-story` | "About" (`two-column`: personality, backstory) · "Details" (`accordion`: likes, dislikes, quirks) |
| `art-gallery`     | "Gallery" (`gallery`: three captioned slots) · "Credits" (`accordion`: artists)                   |
| `fursuit`         | "The suit" (`cards`: maker, materials, debut) · "Gallery" (`gallery`: two slots)                  |

Every description is guidance the person overwrites ("Say what your character is — one species, a hybrid, something of your own"), in both languages. Every `sort_order` is set explicitly; do not rely on array position, because `0013` stores the number.

Freeze the array and its contents, and **hand out a `structuredClone` at the point of use, not here** — a shared reference handed to `useFieldArray` would let one person's edits mutate the shipped constant for the rest of the session.

- [ ] **Step 4: Run it and watch it pass**

- [ ] **Step 5: Run the spellcheck before committing**

```bash
pnpm check:tools
```

Expected: zero issues. If Spanish trips it, the override belongs in `cspell.json` in this commit.

- [ ] **Step 6: Commit**

Message: templates in code rather than in a table, why the seeded content is not next-intl, and that the guard test refuses a template the editor would not accept.

---

### Task 4: The template picker

**Files:**

- Create: `apps/hub/src/features/actors/presentation/template-picker.tsx`
- Test: `apps/hub/tests/template-picker.test.tsx`

**Interfaces:**

- Consumes: `FURSONA_TEMPLATES`, `FursonaSection`.
- Produces:

```ts
interface TemplatePickerLabels {
  useTemplate: string;
  templateConfirm: string;
  confirm: string;
  cancel: string;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  /** Already pluralised per template, keyed by id. */
  sectionCounts: Record<string, string>;
}
interface TemplatePickerProps {
  hasSections: boolean;
  labels: TemplatePickerLabels;
  onApply: (sections: FursonaSection[]) => void;
}
```

`names` and `descriptions` are keyed by template id, resolved on the server in `labels.ts`. A template id with no catalogue entry must be visible, not silent — see Step 3.

- [ ] **Step 1: Write the failing tests**

- every shipped template is listed, by its catalogue name;
- choosing one when there are **no** sections applies immediately;
- choosing one when there **are** sections applies nothing yet and shows the confirmation;
- confirming then applies;
- declining leaves the existing sections alone and calls nothing;
- what `onApply` receives is not the shipped array — mutate the received sections and assert `FURSONA_TEMPLATES` is unchanged. This is the clone, and it is the only test that can catch its absence.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

- The inline two-step confirm, matching `fursona-row.tsx`, **not** `globalThis.confirm`. The house pattern is already there and states its reason: the destructive step is the second click, and a browser dialogue is not ours to style, translate or test.
- `onApply(structuredClone(template.sections))`.
- The section count next to each template is `template.sections.length`; put the plural in the catalogue via next-intl's plural syntax resolved in `labels.ts`, so `sectionCount` arrives already formatted per template. That means `labels` carries a `Record<string, string>` for it too, keyed by id, exactly like the names.

- [ ] **Step 4: Run them and watch them pass**

- [ ] **Step 5: Commit**

---

### Task 5: Wire it in, translate it, and prove the whole thing

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/section-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx` (labels type only, if needed)
- Modify: `apps/hub/src/app/[locale]/(app)/fursonas/labels.ts`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Modify: `apps/hub/src/features/actors/index.ts` (barrel, if new types are needed outside the feature)
- Test: `apps/hub/tests/section-editor.test.tsx`

- [ ] **Step 1: Write the failing test**

In `section-editor.test.tsx`: applying a template **replaces** the sections array, and the rendered section names afterwards are the template's. Replacement, not append — a template is a starting point, and appending one onto existing sections produces a page nobody asked for.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

`SectionEditor` already holds the `useFieldArray`; it gains `replace` from it and renders `<TemplatePicker hasSections={fields.length > 0} onApply={replace} …>`.

- [ ] **Step 4: Add both catalogues**

Under `fursonas`, add every new key: the picker's strings, the icon picker's strings, `imageUrl`, `imagePreview`, and `templates.<id>.{name,description}` for all four. Spanish must differ from English — `messages.test.ts` checks the key sets match, and a copy-paste of the English passes that check while being wrong.

- [ ] **Step 5: Resolve them in `labels.ts`**

Build the `names`, `descriptions` and count records by mapping `FURSONA_TEMPLATES`, so adding a template later cannot leave the picker showing a raw key.

- [ ] **Step 6: Run the whole gate**

```bash
pnpm --filter hub test
pnpm --filter hub typecheck
pnpm --filter hub build
pnpm check:docs
pnpm check:tools
pnpm test:e2e
```

All must pass, and coverage must still be 100% on all four metrics. The build is the one that matters most here: it is the only thing that proves `lucide-react/dynamic` resolves, because every component test mocks it away.

- [ ] **Step 7: Commit, push, open the pull request**

The body must say plainly that **this phase has no browser-level proof either** — the icon picker's panel, the template confirm and the image preview are all signed-in surfaces, and no signed-in end-to-end test exists. Phase 5's public page is the first part of this work an end-to-end test can reach.

---

## What this phase does not do

- **No image upload.** `image_url` is an address somebody types. Phase 6 is Supabase Storage — a bucket, size limits, and what happens to an image when a fursona is soft-deleted.
- **No live preview of the public page.** Phase 5 builds the page itself; previewing it before it exists would be guessing at its markup.
- **No template authoring.** Decision 4 of the spec sets the trigger: templates move to a table when somebody other than us needs to write one, and not before.
