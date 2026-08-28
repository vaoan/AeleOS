# Era looks, phase 2 — the five documents

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five OS-era looks as page documents — pickable in the editor and
seeded under `/137/` for review — and record, as findings, exactly what the
block model could not be pushed to express.

**Architecture:** Phase 1 made a template a document carrying blocks and a
theme. This adds five of them beside the shipped starters, each naming an
EXISTING skin plus a palette derived from a real capture. No new skin is added:
`retro` already is Windows 98's bevel and `aero` already is Aero glass.

**Tech Stack:** TypeScript, Zod, Vitest, Playwright, `pg` for the seeder.

**Spec:** `docs/superpowers/specs/2026-08-28-era-looks-design.md`

## Global constraints

- **A look is never a default.** Absence keeps meaning what it meant before,
  and no stored page changes appearance.
- **Arrangement and palette, never a logo or a brand asset.** These are
  trademarked visual designs; what is imitated is an era's aesthetic. No
  Microsoft artwork is fetched, embedded or committed. The Win98 capture used
  as reference contains third-party marks in its channel bar — none of that is
  reproduced.
- **Evidence is recorded per look.** Each says whether it was built from a
  capture actually looked at or from knowledge, exactly as the existing eight
  captures and three knowledge-built pastiches already do.
- **No new skin for a look whose chrome already exists.** `retro` is Win98,
  `aero` is Vista and 7. Adding `win98` or `win7` to `SKINS` is the "another
  set of numbers" the repo's bar forbids.
- **Every new vocabulary member gets a meaning in `page-reference.ts`**, which
  `page-reference.test.ts` already gates.
- **Run `pnpm lint` from the repository root.** Source `.secrets` in the same
  invocation as any browser run, and read the case COUNT rather than the word
  "passed".

## What the captures actually showed

Fetched from Wikipedia's `imageinfo` API and **looked at**, not recalled:

| era           | capture                             | what it is                                                      |
| ------------- | ----------------------------------- | --------------------------------------------------------------- |
| Windows 98    | `File:Windows98.png`                | teal ground, `#c0c0c0` raised bevel, navy title bars            |
| Windows XP    | `File:Windows XP Luna.png`          | Luna: blue gradient title bars, top-rounded panels, silver body |
| Windows Vista | `File:Windows Vista.png`            | **dark** translucent glass, heavy blur, green aurora ground     |
| Windows 7     | `File:Windows 7 SP1 screenshot.png` | **light** translucent glass, bright blue ground                 |
| Windows 8     | `File:Start81.png`                  | flat solid tiles in DIFFERENT colours on near-black             |

**Vista and 7 differ by palette, not mechanism** — that is a refinement of the
spec, which called them near-identical. Both are `aero`; one is dark-tinted on
green, the other light-tinted on blue.

**Windows 8 cannot be built faithfully, and this is now evidence rather than
prediction.** Metro is per-tile colour — blue, crimson, green, purple, cyan,
olive, orange in one screen — and per-block colour is refused by design. The
ARRANGEMENT is reachable (`spaces` plus `weights` express the mixed tile
sizes); only the colour is not. It is built as far as the model allows and the
gap is written up, because a pastiche that fails visibly and in a way you can
name is the whole point of the exercise.

---

### Task 1: A template's catalogue entries are guarded

Nothing checks that a shipped template HAS a name and description. The parity
check catches one language missing; a key absent from BOTH renders raw at
somebody. Phase 2 adds five templates, so this widens fivefold — write the
guard first.

**Files:**

- Test: `apps/hub/tests/messages.test.ts`

- [ ] **Step 1: Write the guard**

```ts
// Every shipped template needs a name and a description, in both languages.
// The keys are INTERPOLATED at the call site (`templates.${id}.name`), so
// `message-keys-exist.test.ts` — which reads literal keys — is structurally
// blind to them, and the parity check beside this one only catches a key
// present in one catalogue and absent from the other. A template whose entries
// are missing from BOTH renders its own id at somebody.
it.each(FURSONA_TEMPLATES.map((one) => [one.id] as const))(
  "names and describes the %s template in every language",
  (id) => {
    for (const [language, messages] of Object.entries(CATALOGUES)) {
      const entry = (
        messages as { fursonas?: { templates?: Record<string, unknown> } }
      ).fursonas?.templates?.[id] as
        { name?: string; description?: string } | undefined;
      expect(entry?.name, `${id}.name in ${language}`).toBeTruthy();
      expect(
        entry?.description,
        `${id}.description in ${language}`,
      ).toBeTruthy();
    }
  },
);
```

Read the file first for how it names its catalogues — it already imports both —
and reuse that binding rather than inventing `CATALOGUES`.

- [ ] **Step 2: Run it; it must PASS today**

```bash
pnpm --filter hub exec vitest run tests/messages.test.ts
```

A guard written before the thing it guards passes on arrival. That is correct
here and must be confirmed rather than assumed.

- [ ] **Step 3: Sabotage it**

Delete `templates.reference-sheet.description` from `es.json`, run, confirm it
reddens naming that template and language, restore by copying the file back.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/tests/messages.test.ts
git commit -m "test(actors): a shipped template owes a name and a description"
```

---

### Task 2: The era looks module

**Files:**

- Create: `apps/hub/src/features/actors/domain/era-looks.ts`
- Test: `apps/hub/tests/era-looks.test.ts`

**Interfaces:**

- Consumes: `ChosenPage`, `FursonaTemplate` from
  `@/features/actors/domain/fursona-templates`; `DEFAULT_THEME` and
  `ActorTheme` from `@/features/actors/domain/actor-theme`; block builders from
  `@/features/actors/domain/block-schema`.
- Produces: `ERA_LOOKS: readonly FursonaTemplate[]`, each `id` prefixed `era-`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ERA_LOOKS } from "@/features/actors/domain/era-looks";
import {
  parseDocument,
  toDocument,
} from "@/features/actors/domain/page-document";
import { SKINS } from "@/shared/domain/skins";

describe("ERA_LOOKS", () => {
  it("ships the five eras", () => {
    // Anti-vacuity: every case below iterates.
    expect(ERA_LOOKS.map((one) => one.id)).toEqual([
      "era-win98",
      "era-winxp",
      "era-vista",
      "era-win7",
      "era-win8",
    ]);
  });

  it.each(["fursona", "person"] as const)(
    "ships pages a %s's own parser accepts",
    (kind) => {
      for (const look of ERA_LOOKS) {
        const parsed = parseDocument(
          toDocument(look.theme!, [...look.blocks]),
          kind,
        );
        expect(parsed.ok, `${look.id} parses for a ${kind}`).toBe(true);
      }
    },
  );

  // **The whole point of a look**, and what separates one from a starter.
  it.each(ERA_LOOKS.map((one) => [one.id, one] as const))(
    "%s carries a theme, because a look IS mostly theme",
    (_id, look) => {
      expect(look.theme).not.toBeNull();
    },
  );

  // No new skin was added for a look whose chrome already exists.
  it.each(ERA_LOOKS.map((one) => [one.id, one] as const))(
    "%s names a skin that already exists",
    (_id, look) => {
      expect(SKINS as readonly string[]).toContain(look.theme!.skin);
    },
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter hub exec vitest run tests/era-looks.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Build the five**

Each is `{ id, blocks, theme }`. Derive each palette from its capture; the
table in "What the captures actually showed" is the source. Concretely:

- `era-win98` — `skin: "retro"`, teal background, silver surfaces, navy
  headings, `radius: "square"`, `heading: "bar"`, `font: "system"`.
- `era-winxp` — `skin: "default"`, Luna blue, `heading: "gradient"`,
  `radius: "soft"`.
- `era-vista` — `skin: "aero"`, dark green-teal gradient, `spacing` left null.
- `era-win7` — `skin: "aero"`, bright blue gradient, light surfaces.
- `era-win8` — `skin: "default"`, near-black background, `radius: "square"`,
  `chrome: "bare"` on its blocks, `spacing: "compact"`, mixed `weights`.

Use `DEFAULT_THEME` as the base and override only what the look needs, so a key
nobody sets keeps meaning what it meant.

**Every block tree must satisfy `withRequiredBlocks`' kinds** — a look is a
fursona page, so it names `avatar`, `handle` and `owner`. Build them into the
tree rather than relying on the shim, because these are documents somebody
pastes and a document missing a required kind is refused by
`set_actor_sections`.

- [ ] **Step 4: Run and watch it pass**

```bash
pnpm --filter hub exec vitest run tests/era-looks.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/domain/era-looks.ts apps/hub/tests/era-looks.test.ts
git commit -m "feat(actors): five era looks, as documents"
```

---

### Task 3: The looks join the picker

**Files:**

- Modify: `apps/hub/src/features/actors/domain/fursona-templates.ts`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/es.json`
- Test: `apps/hub/tests/fursona-templates.test.ts`

- [ ] **Step 1: Fix the test that will break, first**

`fursona-templates.test.ts` asserts EVERY template carries `theme: null`. That
becomes false and the case must be narrowed to starters rather than deleted —
it is the guard that stops a palette being quietly attached to a starting
point:

```ts
it.each(
  FURSONA_TEMPLATES.filter((one) => !one.id.startsWith("era-")).map(
    (one) => [one.id, one] as const,
  ),
)("%s carries no theme, because a STARTER is structure", (_id, template) => {
  expect(template.theme).toBeNull();
});
```

- [ ] **Step 2: Append the looks and add the catalogue entries**

```ts
export const FURSONA_TEMPLATES: readonly FursonaTemplate[] = Object.freeze([
  ...STARTER_LAYOUTS.map((layout) => ({
    id: layout.id,
    blocks: sectionsToBlocks(layout.sections),
    theme: null,
  })),
  ...ERA_LOOKS,
]);
```

Add `templates.era-*.name` and `.description` to BOTH catalogues. Task 1's
guard fails until they are there, which is the point of writing it first.

- [ ] **Step 3: Run the suites**

```bash
pnpm --filter hub test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(actors): the era looks are pickable"
```

---

### Task 4: Seeded under `/137/`

**Files:**

- Modify: `scripts/seed-pastiches.mjs`

- [ ] **Step 1: Seed each look as a page**

The seeder already writes through the product's own RPCs as a real
Clerk-authenticated caller, so a tree the database refuses fails loudly. Add
the five, reusing `ERA_LOOKS`' own blocks and themes rather than restating
them — a second copy would drift from what the picker offers, which is exactly
what this phase exists to compare.

**The seeder owns everything its pages depend on.** Read its header: a seed
that does not restore everything it needs works exactly once, learned the hard
way twice in one session.

- [ ] **Step 2: Run it**

```bash
set -a; . ./.secrets; set +a
node scripts/seed-pastiches.mjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-pastiches.mjs
git commit -m "feat(actors): the era looks are seeded under 137"
```

---

### Task 5: Photograph, compare, and write the findings

**Files:**

- Modify: `docs/superpowers/specs/2026-08-27-pastiche-findings.md`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Photograph each of the five public pages**

At a desktop width and at 320. Then **read every frame back** — walk the whole
frame, not the subject: edges, corners, anything overlapping, anything clipped,
a control landing on another, a raw message key, a colour that did not apply.

- [ ] **Step 2: Compare each against its capture and write what is missing**

One entry per look, naming the mechanism that is absent rather than the feeling
that it is wrong. Windows 8's is written already in essence: per-tile colour.

- [ ] **Step 3: Record the looks as OPTIONS in the feature note**

Never defaults. Absence keeps meaning what it meant before.

- [ ] **Step 4: Run every gate and the whole browser suite**

```bash
pnpm lint && pnpm typecheck && pnpm check:docs && pnpm check:tools && pnpm --filter hub test
set -a; . ./.secrets; set +a; unset PLAYWRIGHT_BASE_URL; pnpm --filter hub test:e2e
```

- [ ] **Step 5: Commit**

---

## Self-review

**Spec coverage.** "Era looks ship as documents" → Task 2. "Pickable" → Task 3.
"Seeded under `/137/`" → Task 4. "The gap list falls out of building them" →
Task 5. "New options get a meaning in the reference" → carried by
`page-reference.test.ts` if any new vocabulary is added; **no new vocabulary
member is planned**, which is itself the finding.

**Placeholders.** The palettes in Task 2 Step 3 are named by role rather than
by hex, deliberately: the hex comes from reading the capture during
implementation, and inventing values here would be the plan asserting a
measurement it has not taken.

**Type consistency.** `ERA_LOOKS` is `readonly FursonaTemplate[]` throughout,
and `FursonaTemplate` already carries `theme: ActorTheme | null` from phase 1 —
looks carry a theme, starters carry null, and the same type admits both.

**One risk named.** XP's Luna needs **top-only rounding**, which no current key
expresses. The plan does NOT add one: whether it earns a place is a judgement
that belongs after seeing how close `radius: "soft"` gets, and adding a
vocabulary member speculatively is what this repo's bar exists to prevent. If
it is added, it is its own change with its own reference meaning.
