# Section Margins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each top-level section keep or remove its page chrome so a first bleeding section can be a banner and a last bleeding section can be a footer without page-level exceptions.

**Architecture:** Add optional `style.margins` to the shared block style bag, where absent/`true` means today's margins and `false` means none. Move public-page vertical padding and section gaps from `PageShell`/the parent grid onto each depth-0 `data-page-gutter` box, then expose the boolean in the section style popup. Keep `bleed` independent: it controls width; `margins` controls page chrome.

**Tech Stack:** TypeScript, React 19, Next.js 16, Zod, Tailwind CSS v4, Vitest/Testing Library, Playwright, PostgreSQL/Supabase.

## Global Constraints

- Existing pages are byte-compatible: an absent `margins` key keeps today's spacing.
- The only stored opt-out is `margins: false`; checking the control again removes the key.
- `bleed` remains width-only and unchanged.
- The control appears only at depth 0, while the schema/database accept the key at any depth so drag moves do not invalidate a block.
- `PageShell` widths `"column"` and `"wide"` do not change.
- `PageShell` width `"full"` loses only its vertical padding.
- The parent public block grid must not retain `gap-10`; otherwise one section cannot opt out.
- Use whole Tailwind class strings, never interpolated class fragments.
- Edit `supabase/migrations/0009_actor_profiles.sql` in place; after verification, hand-apply the changed `validate_block` body to the live AeleOS project and run schema drift.
- Do not touch or commit the unrelated untracked `apps/hub/.gitignore`.

---

### Task 1: Make `margins` a validated style key

**Files:**

- Modify: `apps/hub/src/features/actors/domain/block-schema.ts:484-512`
- Modify: `apps/hub/src/features/actors/domain/section-schema.ts:175-188`
- Modify: `apps/hub/tests/style-bag-parity.test.ts:29-74`
- Modify: `supabase/migrations/0009_actor_profiles.sql:725-743`
- Modify: `tests/db/blocks.test.ts:1447-1493`

**Interfaces:**

- Produces: `ContainerBlock["style"]["margins"]?: boolean`
- Semantics: `style.margins === false` opts out; absent or `true` keeps margins.
- Database contract: JSON booleans accepted at any depth; strings/numbers/null refused with `margins must be true or false`.

- [ ] **Step 1: Add failing client-schema parity cases**

In `style-bag-parity.test.ts`, add `"margins"` to `EXPECTED_KEYS` and add:

```ts
[
  "margins",
  { accepted: [true, false], refused: ["false", 0, null] },
],
```

Add focused cases to the block schema suite if needed to state the semantics by name:

```ts
expect(
  blockSchema.safeParse(section({ style: { margins: false } })).success,
).toBe(true);
expect(
  blockSchema.safeParse(section({ style: { margins: "false" } })).success,
).toBe(false);
```

- [ ] **Step 2: Run the client schema guard and verify RED**

Run:

```bash
cd apps/hub
pnpm exec vitest run tests/style-bag-parity.test.ts
```

Expected: FAIL because neither style schema accepts `margins`.

- [ ] **Step 3: Add failing database cases**

Beside the `bleed` database suite, add:

```ts
describe("the margins style key", () => {
  const styled = (margins: unknown) => [
    { ...container(), style: { margins } },
    ...IDENTITY_BLOCKS,
  ];

  it("accepts true and false", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled(true)),
    ).toBeNull();
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled(false)),
    ).toBeNull();
  });

  it("refuses a string and a number", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled("false")),
    ).toMatch(/margins must be true or false/);
    expect(await writeExactly(alice.sub, alice.sonaRef, styled(0))).toMatch(
      /margins must be true or false/,
    );
  });

  it("stores it on a nested container too", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, [
        {
          ...container(),
          children: [{ ...container(), style: { margins: false } }],
        },
        ...IDENTITY_BLOCKS,
      ]),
    ).toBeNull();
  });
});
```

- [ ] **Step 4: Run the database case and verify RED**

Run:

```bash
pnpm test:db -- --run tests/db/blocks.test.ts
```

Expected: FAIL with `unknown style key margins`.

- [ ] **Step 5: Implement both validators**

Add to both TypeScript style shapes:

```ts
// Meaningful at depth 0 only. Absent/true keeps the page's ordinary chrome;
// false is the explicit choice to remove it.
margins: z.boolean().optional(),
```

Add next to SQL's `bleed` branch:

```sql
elsif v_key = 'margins' then
  if jsonb_typeof(p_block -> 'style' -> 'margins') <> 'boolean' then
    raise exception 'block %: margins must be true or false', p_path
      using errcode = '22023';
  end if;
```

Update the migration's `actor_profiles.sections` comment where it lists style keys so it names `margins` and its depth-0 meaning.

- [ ] **Step 6: Run schema tests and verify GREEN**

Run:

```bash
cd apps/hub
pnpm exec vitest run tests/style-bag-parity.test.ts
cd ../..
pnpm test:db -- --run tests/db/blocks.test.ts
```

Expected: both PASS.

- [ ] **Step 7: Sabotage-verify the type guard**

Temporarily change SQL's `jsonb_typeof(...) <> 'boolean'` check to compare `v_value not in ('true', 'false')`; run the string-refusal case and confirm it goes RED because the string is wrongly accepted. Restore the JSON-type check and rerun GREEN.

- [ ] **Step 8: Commit Task 1**

```bash
git add \
  apps/hub/src/features/actors/domain/block-schema.ts \
  apps/hub/src/features/actors/domain/section-schema.ts \
  apps/hub/tests/style-bag-parity.test.ts \
  supabase/migrations/0009_actor_profiles.sql \
  tests/db/blocks.test.ts
git commit -m "feat(actors): validate per-section margins"
```

### Task 2: Move public spacing onto each section

**Files:**

- Modify: `apps/hub/src/shared/presentation/page-shell.tsx:174-193`
- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx:2135-2265`
- Modify: `apps/hub/tests/page-shell.test.tsx:26-84`
- Modify: `apps/hub/tests/blocks.test.tsx:2819-2941`

**Interfaces:**

- Consumes: `style.margins?: boolean` from Task 1.
- Produces: depth-0 section wrapper classes derived from `(position, total, bleed, margins)`.
- `margins !== false` means on.

- [ ] **Step 1: Write failing PageShell test**

Extend `renderShell` to admit `"full"`:

```ts
async function renderShell(
  width?: "column" | "wide" | "full",
): Promise<HTMLElement> { ... }
```

Add:

```ts
it("leaves vertical page chrome to sections when full", async () => {
  const classes = (await renderShell("full")).className.split(/\s+/);
  expect(classes).not.toContain("py-6");
  expect(classes).not.toContain("sm:py-10");
});
```

- [ ] **Step 2: Write failing section-class tests**

Build a helper that renders three containers and returns each `data-page-gutter` class list. Add these discriminating cases:

```ts
it("puts top, between, and bottom chrome on the sections that own it", () => {
  const [first, middle, last] = gutters([{}, {}, {}]);
  expect(first).toEqual(expect.arrayContaining(["pt-6", "sm:pt-10"]));
  expect(first).not.toContain("mt-10");
  expect(middle).toContain("mt-10");
  expect(last).toEqual(expect.arrayContaining(["mt-10", "pb-6", "sm:pb-10"]));
});

it("gives one ordinary section both page edges", () => {
  const [only] = gutters([{}]);
  expect(only).toEqual(
    expect.arrayContaining(["pt-6", "sm:pt-10", "pb-6", "sm:pb-10"]),
  );
});

it("removes all page chrome only from a section with margins false", () => {
  const [flush, ordinary] = gutters([{ style: { margins: false } }, {}]);
  expect(flush).not.toEqual(
    expect.arrayContaining(["px-4", "pt-6", "mt-10", "pb-6"]),
  );
  expect(ordinary).toEqual(expect.arrayContaining(["px-4", "mt-10", "pb-6"]));
});

it("keeps bleed independent from margins", () => {
  const [bled, banner] = gutters([
    { style: { bleed: true } },
    { style: { bleed: true, margins: false } },
  ]);
  expect(bled).toEqual(expect.arrayContaining(["pt-6"]));
  expect(banner).not.toEqual(expect.arrayContaining(["px-4", "mt-10", "pb-6"]));
});
```

Also assert the parent block stack does not contain `gap-10`.

- [ ] **Step 3: Run focused renderer tests and verify RED**

Run:

```bash
cd apps/hub
pnpm exec vitest run tests/page-shell.test.tsx tests/blocks.test.tsx
```

Expected: FAIL because `full` still has `py-6 sm:py-10`, the parent still has `gap-10`, and no section owns vertical classes.

- [ ] **Step 4: Implement the class composition**

Change:

```ts
full: "py-6 sm:py-10",
```

to:

```ts
full: "",
```

In `blocks.tsx`, replace the parent `gap-10` with no gap:

```tsx
<div className="grid grid-cols-[minmax(0,1fr)]">
```

Add whole-string class tables:

```ts
const FIRST_MARGIN = "pt-6 sm:pt-10";
const BETWEEN_MARGIN = "mt-10";
const LAST_MARGIN = "pb-6 sm:pb-10";
```

Add a focused helper:

```ts
function pageBoxClass(
  block: BlockNode,
  position: number,
  count: number,
  measureClass: string,
): string {
  const horizontal = bleeds(block) ? BLEED_CLASS : measureClass;
  const hasMargins = !isContainer(block) || block.style?.margins !== false;
  const width = hasMargins
    ? horizontal
    : bleeds(block)
      ? BLEED_CLASS
      : measureClassWithoutGutter;
  if (!hasMargins) return width;
  return cn(
    width,
    position === 0 && FIRST_MARGIN,
    position > 0 && BETWEEN_MARGIN,
    position === count - 1 && LAST_MARGIN,
  );
}
```

Define `measureClassWithoutGutter` through a second whole-string table; do not
strip classes with a regex. The required result is:

- margins on + not bleed: measure + horizontal gutter + vertical chrome;
- margins on + bleed: full width + vertical chrome, no horizontal gutter
  (bleed already removes it so the painted section reaches the edge);
- margins off + not bleed: measure/centering, no horizontal or vertical gutter;
- margins off + bleed: `w-full` only.

Use the helper at the wrapper:

```tsx
className={pageBoxClass(seat.block, position, seats.length, measureClass)}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
cd apps/hub
pnpm exec vitest run tests/page-shell.test.tsx tests/blocks.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Sabotage both mechanisms independently**

1. Put `py-6 sm:py-10` back on `COLUMN.full`; verify the PageShell test goes RED, then restore.
2. Put `gap-10` back on the parent; verify the parent-gap assertion goes RED, then restore.
3. Treat absent margins as off; verify the existing-page/default tests go RED, then restore.

- [ ] **Step 7: Commit Task 2**

```bash
git add \
  apps/hub/src/shared/presentation/page-shell.tsx \
  apps/hub/src/features/actors/presentation/blocks.tsx \
  apps/hub/tests/page-shell.test.tsx \
  apps/hub/tests/blocks.test.tsx
git commit -m "feat(actors): let sections own their page margins"
```

### Task 3: Expose the margins checkbox in the section popup

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/section-style-popup.tsx:64-96,375-402`
- Modify: `apps/hub/src/app/[locale]/(app)/pages/labels.ts:270-290`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json:390-400`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/es.json:390-400`
- Modify: `apps/hub/tests/support/editor-labels.ts:132-150`
- Modify: `apps/hub/tests/section-style-popup.test.tsx`
- Modify: `apps/hub/tests/messages.test.ts`

**Interfaces:**

- Produces: `SectionStylePopupLabels.margins: string`
- Produces: checkbox test id `section-style-margins`
- Writer behavior: checked → omit key; unchecked → `{ margins: false }`.

- [ ] **Step 1: Write failing popup tests**

Add labels fixture `margins: "Margins"`. Add:

```ts
it("offers margins only on a top-level section", () => {
  harness(onePage());
  openPopup();
  expect(screen.getByLabelText("Margins")).toBeChecked();
  expect(screen.getByTestId("section-style-margins")).toBeInTheDocument();
  // Render the nested harness and assert queryByTestId is null there.
});

it("stores false when margins are removed and absence when restored", () => {
  const { held } = harness(onePage());
  openPopup();
  fireEvent.click(screen.getByLabelText("Margins"));
  expect(styleOf(held.page)).toEqual({ margins: false });
  fireEvent.click(screen.getByLabelText("Margins"));
  expect(styleOf(held.page)).toEqual({});
});
```

The second click is the discriminator: storing `true` would look correct in the browser and violate the persistence contract.

- [ ] **Step 2: Run popup tests and verify RED**

Run:

```bash
cd apps/hub
pnpm exec vitest run tests/section-style-popup.test.tsx tests/messages.test.ts
```

Expected: FAIL because the label/control do not exist.

- [ ] **Step 3: Implement labels and checkbox**

Add to `SectionStylePopupLabels`:

```ts
/** Toggles the page chrome around a top-level section. */
margins: string;
```

Under the depth-0 `bleed` checkbox, add:

```tsx
<label className="flex items-center gap-2 text-xs font-medium">
  <input
    type="checkbox"
    checked={style.margins !== false}
    onChange={(event) => setField("margins", event.target.checked ? "" : false)}
    {...tid("section-style-margins")}
    className="size-4 rounded-sm surface border-(--edge)/60"
  />
  {labels.margins}
</label>
```

Keep it inside `atTop`, beside `bleed`.

Add catalogue keys:

```json
"sectionStyleMargins": "Margins"
```

```json
"sectionStyleMargins": "Márgenes"
```

Wire `margins: t("sectionStyleMargins")` in `pages/labels.ts` and test fixtures.

- [ ] **Step 4: Run popup/catalogue tests and verify GREEN**

Run:

```bash
cd apps/hub
pnpm exec vitest run \
  tests/section-style-popup.test.tsx \
  tests/messages.test.ts \
  tests/message-keys-exist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Sabotage the restore path**

Temporarily store `true` when checked. Run the second-click test and confirm RED because it expected `{}`. Restore omit-on-checked and rerun GREEN.

- [ ] **Step 6: Commit Task 3**

```bash
git add \
  "apps/hub/src/app/[locale]/(app)/pages/labels.ts" \
  apps/hub/src/features/actors/presentation/section-style-popup.tsx \
  apps/hub/src/shared/infrastructure/i18n/messages/en.json \
  apps/hub/src/shared/infrastructure/i18n/messages/es.json \
  apps/hub/tests/support/editor-labels.ts \
  apps/hub/tests/section-style-popup.test.tsx \
  apps/hub/tests/messages.test.ts
git commit -m "feat(editor): add per-section margins control"
```

### Task 4: Prove banner and footer geometry in Chromium

**Files:**

- Modify: `apps/hub/tests/e2e/page-measure-and-bleed.spec.ts`
- Modify: `apps/hub/tests/e2e/support/blocks.ts` only if a helper type currently rejects `margins`

**Interfaces:**

- Consumes: `style.margins` and public wrapper behavior from Tasks 1–2.
- Proves actual box geometry; no new production interface.

- [ ] **Step 1: Add a discriminating three-section browser fixture**

Seed three sections:

```ts
blocks: [
  container({
    name_en: "Banner",
    style: { bleed: true, margins: false },
    children: [leaf({ title_en: "Top" })],
  }),
  container({
    name_en: "Middle",
    children: [leaf({ title_en: "Body" })],
  }),
  container({
    name_en: "Footer",
    style: { bleed: true, margins: false },
    children: [leaf({ title_en: "Bottom" })],
  }),
],
```

Measure `page-content`, the three `data-page-gutter` boxes, and public sections. Assert:

```ts
expect(banner.y).toBeCloseTo(main.y, 0);
expect(banner.x).toBeCloseTo(0, 0);
expect(banner.width).toBeCloseTo(document.documentElement.clientWidth, 0);

expect(middle.y - (banner.y + banner.height)).toBeGreaterThan(20);

expect(footer.y).toBeCloseTo(middle.y + middle.height, 0);
expect(footer.y + footer.height).toBeCloseTo(main.y + main.height, 0);
expect(footer.x).toBeCloseTo(0, 0);
```

Because `seedPage` appends required identity sections, either include required blocks explicitly or scope/count using named sections so the fixture's intended footer is genuinely last. A "footer" followed by seeded identity is not a footer and cannot prove the bottom claim.

- [ ] **Step 2: Run browser case and verify RED before renderer implementation if executing tasks linearly**

Run:

```bash
cd apps/hub
set -a; . ../../.secrets; set +a
pnpm exec playwright test tests/e2e/page-measure-and-bleed.spec.ts --reporter=list
```

Expected before Task 2: FAIL because `main` keeps top/bottom padding and the parent keeps `gap-10`. Expected after Tasks 1–3: PASS.

- [ ] **Step 3: Sabotage-verify both historical owners**

1. Restore `py-6 sm:py-10` on `COLUMN.full`; banner-to-main assertion must RED.
2. Restore parent `gap-10`; footer-to-middle assertion must RED.
3. Restore code and rerun GREEN.

- [ ] **Step 4: Run the scoped blast radius**

Run:

```bash
cd apps/hub
pnpm exec vitest run \
  tests/blocks.test.tsx \
  tests/page-shell.test.tsx \
  tests/section-style-popup.test.tsx \
  tests/style-bag-parity.test.ts \
  tests/messages.test.ts \
  tests/message-keys-exist.test.ts
pnpm exec playwright test \
  tests/e2e/page-measure-and-bleed.spec.ts \
  tests/e2e/responsive.spec.ts \
  --reporter=list
```

Expected: all PASS; responsive suite reports no horizontal overflow.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/hub/tests/e2e/page-measure-and-bleed.spec.ts apps/hub/tests/e2e/support/blocks.ts
git commit -m "test(e2e): prove flush banner and footer geometry"
```

### Task 5: Move documentation and synchronize the live schema

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md:2304-2351`
- Modify: `CLAUDE.md` current-state page-layout bullet
- Verify: `supabase/migrations/0009_actor_profiles.sql`

**Interfaces:**

- No new interface; documents the final ownership of public page spacing.

- [ ] **Step 1: Update the feature note**

Under “How wide a page is”, state:

- `bleed` opts out of width only;
- `margins: false` opts out of depth-0 page chrome;
- `PageShell` full has no vertical padding;
- each `data-page-gutter` owns first/between/last spacing;
- banner = first + bleed + no margins;
- footer = last + bleed + no margins.

Delete or replace the sentence saying the shell keeps vertical padding. Grep for `py-6 sm:py-10`, “vertical padding”, and `gap-10` claims before considering docs complete.

- [ ] **Step 2: Run documentation and static gates**

Run:

```bash
pnpm check:docs origin/main
pnpm lint
pnpm typecheck
pnpm format:check
```

Expected: all PASS.

- [ ] **Step 3: Hand-apply the changed migration body**

Load `.secrets`, extract the complete `create or replace function public.validate_block(...)` statement verbatim from `0009_actor_profiles.sql`, and execute it inside a transaction against the AeleOS project. Do not retype the function and do not run against Libra.

Expected: transaction commits successfully.

- [ ] **Step 4: Verify live schema parity**

Run:

```bash
set -a; . ./.secrets; set +a
pnpm check:schema-drift
```

Expected: live database matches `supabase/migrations/`.

- [ ] **Step 5: Run final verification**

Run:

```bash
pnpm test:db
pnpm --filter hub test:coverage
pnpm --filter hub build
```

Expected: all PASS, including 100% branch coverage.

- [ ] **Step 6: Commit documentation**

```bash
git add CLAUDE.md apps/hub/src/features/actors/CLAUDE.md
git commit -m "docs: move page spacing ownership to sections"
```

Do not commit again if pre-commit hooks only verify and make no modifications. If a hook modifies these files after a successful commit, follow the repository's amend rules; if the commit fails, fix and create a new commit rather than amending.
