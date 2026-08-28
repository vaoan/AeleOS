# The page has a source, and the source is shareable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the fursona editor a live, two-way JSON source dock so a page can
be inspected, exported, shared and imported — including pages authored by a
language model against a reference the dock publishes.

**Architecture:** A pure domain module owns the document envelope and its
parse; a hook owns the two-way binding against the existing `react-hook-form`
draft; a non-modal `<dialog>` owns the presentation. Nothing new reaches the
database — an import writes into the form draft, and the existing
`blocksSchema` and `set_actor_sections` remain the only writers. A pre-existing
bug found while writing the spec (the leaf-kind select offers kinds the
database refuses) is fixed first, because its fix is the constant the import
path needs.

**Tech Stack:** TypeScript (strict), React 19, Next.js App Router, zod 4,
react-hook-form, Tailwind v4, vitest, Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-08-27-page-source-and-sharing-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Read it before
Task 1 and re-read it before any commit.

- **Branch from an explicit base.** `git checkout -b page-source-dock origin/main`
  — never bare `git checkout -b`. Verify with
  `git log --oneline origin/main..HEAD`; if it lists commits you did not write,
  the base is wrong.
- **Every commit that touches `apps/hub/src/features/actors/**` MUST also touch
  `apps/hub/src/features/actors/CLAUDE.md`.** `pnpm check:agent-notes --staged`
  runs in pre-commit and fails a change under a note when the note did not
  change. This is not optional and there is no suppression flag. Each task
  below names what its note change says.
- **100% branch coverage.** The `hub` CI job gates on it. Every error branch
  needs a named case; a branch reached only by a property test's random draw is
  not covered (root rule 11).
- **Every export carries TSDoc stating the CONTRACT, not the types.** `pnpm lint`
  fails without it, and fails again if a parameter is renamed without its
  `@param`.
- **Both message catalogues gain the same keys.** `apps/hub/tests/messages.test.ts`
  key-checks `en.json` against `es.json`. **Spanish is this app's fallback
  language**, so a Spanish string is written properly, not left English.
- **The reference body is NOT a message.** It is a generated English string.
  Putting it in the catalogues would demand a Spanish translation of a technical
  specification.
- **No new dependencies.** No JSON editor, no syntax highlighter, no
  clipboard library.
- **Filenames are kebab-case.** Prose is British English (`colour`,
  `serialise`, `recognise`); `cspell` runs over `**/*.{ts,tsx,md,json}`.
- **LF line endings only.** After any script writes a file, run
  `grep -c $'\r' <file>` and expect `0` (root rule 28).
- **Restart the dev server after touching the message catalogues.** A running
  `next dev` serves the modules it started with, forever; new keys render as
  raw keys and widen a `select` past a 320px viewport (root rule 12). The dev
  server is `pnpm dev` on port 5100.
- **Browser runs need secrets or they silently skip.** `pnpm --filter hub test:e2e`
  on a shell that has not sourced `.secrets` runs 48 of 136 cases and prints
  `48 passed`. Always run
  `set -a; . ./.secrets; set +a` in the same invocation, and **compare the case
  count, not the word "passed"** (root rule 31).
- **Sabotage restores by copy, never by `git checkout --`.** A `git checkout --`
  restores to the last commit and silently discards uncommitted work in that
  file (root rule 34). Copy the file aside, mutate, restore the copy, and put
  the restore in a shell `trap`.
- **Committing is licensed by this plan.** The repository's standing rule is not
  to commit unless asked; an approved plan is that approval. Do not open a pull
  request until Task 9 is done.

**Commands used throughout:**

| Purpose            | Command                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| One unit test file | `pnpm --filter hub exec vitest run <path>`                                                       |
| All hub unit tests | `pnpm test:hub`                                                                                  |
| Coverage           | `pnpm --filter hub test:coverage`                                                                |
| Lint               | `pnpm lint`                                                                                      |
| Types              | `pnpm typecheck`                                                                                 |
| One browser spec   | `set -a; . ./.secrets; set +a; pnpm --filter hub exec playwright test --project=chromium <spec>` |
| Notes gate         | `pnpm check:agent-notes --staged`                                                                |

---

## File Structure

| Path                                                             | Responsibility                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/hub/src/features/actors/domain/required-blocks.ts`         | **Modify.** Gains `REFUSED_KIND` and `offerableLeafKinds` beside `REQUIRED_KINDS`.                                        |
| `apps/hub/src/features/actors/domain/page-document.ts`           | **Create.** The envelope, `toDocument`, `parseDocument`, `DocumentProblem`. Pure; no framework.                           |
| `apps/hub/src/features/actors/domain/page-reference.ts`          | **Create.** `pageReference()` — the generated English reference, plus the per-member description tables it is built from. |
| `apps/hub/src/features/actors/application/use-page-source.ts`    | **Create.** The two-way binding: debounce, last-good tracking, focus arbitration.                                         |
| `apps/hub/src/features/actors/presentation/page-source-dock.tsx` | **Create.** The non-modal dock.                                                                                           |
| `apps/hub/src/features/actors/presentation/leaf-editor.tsx`      | **Modify.** Takes `kinds` and renders only those options.                                                                 |
| `apps/hub/src/features/actors/presentation/block-card.tsx`       | **Modify.** Threads `kinds` to `LeafEditor`.                                                                              |
| `apps/hub/src/features/actors/presentation/block-editor.tsx`     | **Modify.** Computes `kinds` from `page.actorKind`, threads it.                                                           |
| `apps/hub/src/features/actors/presentation/identity-leaves.tsx`  | **Modify.** Corrects the stale "unreachable through the editor" sentence.                                                 |
| `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`   | **Modify.** The control that opens the dock.                                                                              |
| `apps/hub/src/features/actors/presentation/fursona-editor.tsx`   | **Modify.** Mounts the dock, wires the hook.                                                                              |
| `apps/hub/src/features/actors/index.ts`                          | **Modify.** Barrel exports.                                                                                               |
| `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`  | **Modify.** The dock's chrome, both languages.                                                                            |
| `apps/hub/tests/page-document.test.ts`                           | **Create.**                                                                                                               |
| `apps/hub/tests/page-reference.test.ts`                          | **Create.**                                                                                                               |
| `apps/hub/tests/use-page-source.test.ts`                         | **Create.**                                                                                                               |
| `apps/hub/tests/page-source-dock.test.tsx`                       | **Create.**                                                                                                               |
| `apps/hub/tests/leaf-kind-options.test.tsx`                      | **Create.** The regression test for the pre-existing bug.                                                                 |
| `apps/hub/tests/block-limits-match-migration.test.ts`            | **Modify.** Pins `REFUSED_KIND` to `0009`.                                                                                |
| `apps/hub/tests/e2e/page-source-dock.spec.ts`                    | **Create.**                                                                                                               |
| `apps/hub/tests/e2e/a11y.spec.ts`                                | **Modify.** Covers the dock.                                                                                              |

---

## Task 1: The refused kind, pinned to the SQL

`set_actor_sections` refuses `owner` on a person's page and `fursonas` on a
fursona's. Nothing in the client knows that rule exists. This task adds it as a
domain constant and pins it to the migration, exactly as `REQUIRED_KINDS`'
siblings are pinned.

**Files:**

- Modify: `apps/hub/src/features/actors/domain/required-blocks.ts`
- Modify: `apps/hub/tests/block-limits-match-migration.test.ts`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`

**Interfaces:**

- Consumes: `ActorKind`, `REQUIRED_KINDS`, `LEAF_KINDS` (all existing).
- Produces:
  - `REFUSED_KIND: Record<ActorKind, LeafKind>`
  - `offerableLeafKinds(kind: ActorKind): readonly LeafKind[]`

- [ ] **Step 1: Write the failing test**

Append to `apps/hub/tests/block-limits-match-migration.test.ts`. Note the
`String.raw` — a plain template literal collapses `\s` and the pattern would
match nothing and pass forever, which this file's own convention guards against
by asserting the match before comparing.

```ts
import {
  REFUSED_KIND,
  REQUIRED_KINDS,
} from "@/features/actors/domain/required-blocks";

/**
 * Reads one branch of `set_actor_sections`' per-kind rules out of the
 * migration.
 *
 * @param branch - the SQL that opens the branch, as it appears in `0009`.
 * @returns the required kinds and the refused one the database declares.
 */
function kindRules(branch: string): { required: string[]; refused: string } {
  const found = sql.match(
    new RegExp(
      branch +
        String.raw`\s+v_required := array\[([^\]]+)\];\s+v_refused\s+:= '([a-z]+)';`,
    ),
  );
  if (!found?.[1] || !found[2])
    throw new Error(
      `The per-kind rules were not found after "${branch}" in 0009. If that ` +
        `block was rewritten, this guard is now checking nothing and must be ` +
        `updated with it.`,
    );
  return {
    required: found[1].split(",").map((one) => one.trim().replaceAll("'", "")),
    refused: found[2],
  };
}

describe("the per-actor-kind block rules match the migration", () => {
  it("agrees with 0009 about a person's page", () => {
    const sqlRules = kindRules(String.raw`v_actor_kind = 'person' then`);
    expect(sqlRules.required).toEqual([...REQUIRED_KINDS.person]);
    expect(sqlRules.refused).toBe(REFUSED_KIND.person);
  });

  it("agrees with 0009 about a fursona's page", () => {
    const sqlRules = kindRules(String.raw`else`);
    expect(sqlRules.required).toEqual([...REQUIRED_KINDS.fursona]);
    expect(sqlRules.refused).toBe(REFUSED_KIND.fursona);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm --filter hub exec vitest run tests/block-limits-match-migration.test.ts`

Expected: FAIL — `REFUSED_KIND` is not exported from
`@/features/actors/domain/required-blocks`.

- [ ] **Step 3: Add the constant and the helper**

In `apps/hub/src/features/actors/domain/required-blocks.ts`, directly beneath
`REQUIRED_KINDS`:

```ts
/**
 * The leaf kind a page of each actor kind may NOT carry.
 *
 * The mirror of {@link REQUIRED_KINDS}, and until this constant existed it was
 * enforced **only** in `set_actor_sections`: the client knew what a page must
 * have and nothing about what it may not. So `owner` could be chosen from the
 * leaf-kind select on a person's page, and the save came back as a database
 * exception with no block marked and no reason named.
 *
 * `owner` and `fursonas` refuse each other's pages because neither has
 * anything to render on the other — a person has no owner and a fursona has no
 * characters of its own.
 *
 * `block-limits-match-migration.test.ts` pins this to `0009`, because a
 * vocabulary written down in two languages needs the test that says so in the
 * same change.
 */
export const REFUSED_KIND = {
  person: "owner",
  fursona: "fursonas",
} as const satisfies Record<ActorKind, LeafKind>;

/**
 * The leaf kinds a page of this actor kind may hold.
 *
 * Every kind but the one its actor kind refuses. Exported so the editor's kind
 * select can withdraw the option rather than offering a choice the database
 * will reject, and so an import can name a block it must report.
 *
 * @param kind - which kind of actor's page it is.
 * @returns the offerable kinds, in {@link LEAF_KINDS} order.
 */
export function offerableLeafKinds(kind: ActorKind): readonly LeafKind[] {
  return LEAF_KINDS.filter((one) => one !== REFUSED_KIND[kind]);
}
```

Add `LEAF_KINDS` to the existing import from
`@/features/actors/domain/block-schema` if it is not already there.

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm --filter hub exec vitest run tests/block-limits-match-migration.test.ts`

Expected: PASS.

- [ ] **Step 5: Sabotage-verify the pin**

Copy `0009` aside, change `v_refused := 'owner';` in the person branch to
`v_refused := 'name';`, re-run, watch the person case go red, restore from the
copy.

```bash
cp supabase/migrations/0009_actor_profiles.sql /tmp/0009.bak
trap 'cp /tmp/0009.bak supabase/migrations/0009_actor_profiles.sql' EXIT
sed -i "s/v_refused  := 'owner';/v_refused  := 'name';/" supabase/migrations/0009_actor_profiles.sql
pnpm --filter hub exec vitest run tests/block-limits-match-migration.test.ts
```

Expected: the person case FAILS, the fursona case passes. Then restore and
re-run: both pass.

**Do not use `git checkout --` to restore** — it would discard every
uncommitted change in that file, including any you meant to keep (root rule 34).

- [ ] **Step 6: Update the feature note**

In `apps/hub/src/features/actors/CLAUDE.md`, in the section describing required
blocks, add:

> **A page also REFUSES one kind, and the client knows it now.**
> `REFUSED_KIND` is the mirror of `REQUIRED_KINDS` — `owner` is refused on a
> person's page and `fursonas` on a fursona's, because neither has anything to
> render on the other. It lived only in `set_actor_sections` until 2026-08-27,
> which is why the kind select offered a choice the database rejected. It is
> pinned to `0009` by `block-limits-match-migration.test.ts` like every other
> vocabulary written down twice.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/features/actors/domain/required-blocks.ts \
        apps/hub/tests/block-limits-match-migration.test.ts \
        apps/hub/src/features/actors/CLAUDE.md
git commit -m "feat(actors): the client learns which leaf kind its page refuses"
```

---

## Task 2: The kind select withdraws what the database refuses

The bug itself. `leaf-editor.tsx` maps over all of `LEAF_KINDS` with no filter,
so a person can pick `owner` on `/me/edit` today and get an unexplained save
failure.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/leaf-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-card.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/identity-leaves.tsx`
- Create: `apps/hub/tests/leaf-kind-options.test.tsx`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`

**Interfaces:**

- Consumes: `offerableLeafKinds`, `REFUSED_KIND` from Task 1.
- Produces: `LeafEditorProps.kinds: readonly LeafKind[]`, and the same prop on
  `BlockCardProps`.

- [ ] **Step 1: Write the failing regression test**

Create `apps/hub/tests/leaf-kind-options.test.tsx`. It renders the real
`LeafEditor` and reads the `<option>` values out of the kind select — the level
the bug actually lives at.

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeafEditor } from "@/features/actors/presentation/leaf-editor";
import { offerableLeafKinds } from "@/features/actors/domain/required-blocks";
import type { LeafBlock } from "@/features/actors/domain/block-schema";
import { leafEditorLabels } from "./support/editor-labels";

const leaf: LeafBlock = {
  kind: "text",
  title_en: "A title",
  description_en: "",
};

/**
 * The values the kind select offers, in the order it offers them.
 *
 * Reads `value` rather than the visible label, because the label is a
 * translated string and this is a test about the vocabulary.
 *
 * @returns every option value, enabled and disabled alike.
 */
function offeredKinds(): string[] {
  const select = screen.getByRole("combobox", { name: /kind/i });
  return [...select.querySelectorAll("option")].map((one) => one.value);
}

describe("the leaf-kind select offers only what the page may hold", () => {
  it("withholds `owner` on a person's page", () => {
    render(
      <LeafEditor
        leaf={leaf}
        path={[0, 0]}
        apply={() => {}}
        lang="en"
        labels={leafEditorLabels}
        problems={[]}
        dragHandle={null}
        kinds={offerableLeafKinds("person")}
      />,
    );
    expect(offeredKinds()).not.toContain("owner");
    // The positive half, so the negative one cannot pass by rendering nothing
    // — an empty select would satisfy every `not.toContain` in this file.
    expect(offeredKinds()).toContain("fursonas");
    expect(offeredKinds()).toContain("text");
  });

  it("withholds `fursonas` on a fursona's page", () => {
    render(
      <LeafEditor
        leaf={leaf}
        path={[0, 0]}
        apply={() => {}}
        lang="en"
        labels={leafEditorLabels}
        problems={[]}
        dragHandle={null}
        kinds={offerableLeafKinds("fursona")}
      />,
    );
    expect(offeredKinds()).not.toContain("fursonas");
    expect(offeredKinds()).toContain("owner");
  });

  it("still shows a stored kind this build cannot offer, disabled", () => {
    render(
      <LeafEditor
        leaf={{ ...leaf, kind: "from-a-newer-build" }}
        path={[0, 0]}
        apply={() => {}}
        lang="en"
        labels={leafEditorLabels}
        problems={[]}
        dragHandle={null}
        kinds={offerableLeafKinds("fursona")}
      />,
    );
    const option = screen.getByRole("option", { name: "from-a-newer-build" });
    expect(option).toBeDisabled();
  });
});
```

If `tests/support/editor-labels.ts` does not exist, create it exporting a
`leafEditorLabels` object satisfying `LeafEditorLabels` with every string set to
its own key name, and a `leafKinds` record built from `LEAF_KINDS`. Read the
interface in `leaf-editor.tsx` and satisfy it exactly — TypeScript will name
anything missing.

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm --filter hub exec vitest run tests/leaf-kind-options.test.tsx`

Expected: FAIL — `kinds` is not a prop of `LeafEditor` (a type error), and both
`not.toContain` assertions fail once the prop is accepted.

- [ ] **Step 3: Add the prop and use it**

In `leaf-editor.tsx`, add to `LeafEditorProps`:

```ts
  /**
   * The leaf kinds this page may hold, already narrowed to its actor kind.
   *
   * A list rather than an actor kind, so this component never learns what a
   * person or a fursona is — which of them a page refuses is
   * `required-blocks.ts`'s business and is pinned to the SQL there. Offering a
   * kind `set_actor_sections` refuses is a control that accepts a press and
   * produces an unexplained failure one save later, which is what this prop
   * exists to end.
   */
  kinds: readonly LeafKind[];
```

Accept it in the destructure, and replace the map at the options:

```tsx
{
  kinds.map((one) => (
    <option key={one} value={one}>
      {labels.leafKinds[one]}
    </option>
  ));
}
```

Change the `known` check on the line above so a stored kind is judged against
what may be offered as well as what exists:

```ts
const known = kinds.includes(kind as LeafKind);
```

Import `LeafKind` as a type if it is not already imported.

- [ ] **Step 4: Thread the prop from the two call sites**

`block-card.tsx` renders `LeafEditor` at roughly line 1040 and
`block-editor.tsx` at roughly line 650. Add the same `kinds: readonly LeafKind[]`
prop to `BlockCardProps` (with TSDoc: _"Passed straight to `LeafEditor` — see
its own note. `BlockCard` never reads it."_), thread it through, and in
`block-editor.tsx` compute it once beside the existing `locked`:

```ts
const locked = lockedKinds(blocks, page.actorKind);
const kinds = offerableLeafKinds(page.actorKind);
```

Pass `kinds={kinds}` at both `LeafEditor` sites and at every `BlockCard` site.

- [ ] **Step 5: Run and verify it passes**

Run: `pnpm --filter hub exec vitest run tests/leaf-kind-options.test.tsx`

Expected: PASS, all three cases.

- [ ] **Step 6: Sabotage-verify**

Name the wrong behaviour being excluded: _a select that offers every kind
regardless of the page's actor kind_. Restore the unfiltered map and check the
case reddens.

```bash
cp apps/hub/src/features/actors/presentation/leaf-editor.tsx /tmp/leaf.bak
trap 'cp /tmp/leaf.bak apps/hub/src/features/actors/presentation/leaf-editor.tsx' EXIT
# Replace `kinds.map(` with `LEAF_KINDS.map(` by hand, then:
pnpm --filter hub exec vitest run tests/leaf-kind-options.test.tsx
```

Expected: the first two cases FAIL. Restore from the copy and re-run: PASS.

- [ ] **Step 7: Correct the stale sentence**

In `identity-leaves.tsx`, the `owner` renderer's TSDoc currently says the state
is _"unreachable through the editor"_. That was false. Replace that paragraph
with:

```
 * It renders nothing on a person's page, where `owner` is absent.
 *
 * **That state was reachable through the editor until 2026-08-27, and this
 * comment said it was not.** `set_actor_sections` refuses `owner` on a
 * person's page, but the kind select offered every leaf kind on every page —
 * so somebody could pick it, and the save came back as a database exception
 * with no block marked. The select is narrowed by `offerableLeafKinds` now and
 * `leaf-kind-options.test.tsx` is what keeps it narrowed. This branch is a
 * belt again rather than a case anybody meets, which is what it always claimed
 * to be.
```

- [ ] **Step 8: Run the whole hub suite and lint**

Run: `pnpm test:hub && pnpm lint && pnpm typecheck`

Expected: all pass. `check:docs` will demand the TSDoc move you just made;
if it names another symbol, move that documentation too rather than suppressing
it — there is no suppression flag.

- [ ] **Step 9: Update the feature note and commit**

Add to `apps/hub/src/features/actors/CLAUDE.md`, beside the note from Task 1:

> The kind select is narrowed by `offerableLeafKinds` and shows a stored kind
> it cannot offer as a disabled option, so a page saved by a newer build is not
> silently retyped. `leaf-kind-options.test.tsx` carries a positive assertion
> beside each negative one, because an empty select satisfies every
> `not.toContain` ever written.

```bash
git add apps/hub/src/features/actors/presentation/ \
        apps/hub/tests/leaf-kind-options.test.tsx \
        apps/hub/tests/support/ \
        apps/hub/src/features/actors/CLAUDE.md
git commit -m "fix(actors): the kind select stops offering what the database refuses"
```

---

## Task 3: The document — envelope, export, parse

**Files:**

- Create: `apps/hub/src/features/actors/domain/page-document.ts`
- Create: `apps/hub/tests/page-document.test.ts`
- Modify: `apps/hub/src/features/actors/index.ts`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`

**Interfaces:**

- Consumes: `blocksSchema`, `BLOCK_LIMITS`, `Block` from `block-schema`;
  `parseTheme`, `ActorTheme` from `actor-theme`; `BlockPath` from `block-edits`;
  `blockProblems` from `block-problems`; `REFUSED_KIND`, `ActorKind` from
  `required-blocks`.
- Produces:
  - `DOCUMENT_VERSION: 1`
  - `PASTE_LIMIT_BYTES: number`
  - `type DocumentProblem`
  - `type DocumentParse`
  - `toDocument(theme: ActorTheme, blocks: Block[]): string`
  - `parseDocument(text: string, kind: ActorKind): DocumentParse`

- [ ] **Step 1: Write the failing tests**

Create `apps/hub/tests/page-document.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_VERSION,
  PASTE_LIMIT_BYTES,
  parseDocument,
  toDocument,
} from "@/features/actors/domain/page-document";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import type {
  Block,
  ContainerBlock,
} from "@/features/actors/domain/block-schema";

/**
 * A page whose shape a wrong answer cannot reproduce by accident.
 *
 * Deliberately asymmetric, because a round-trip over a default page passes
 * whether or not the parse does anything (root rules 27 and 29):
 *
 *  * `weights` is `[1, 3, 2]` — not a palindrome, so a renderer or parser that
 *    reverses the array fails, where `[1, 3, 1]` would pass.
 *  * `spaces` is 3, not the default of 1.
 *  * three sections, because a shift and a swap leave the same page when there
 *    are two.
 *  * a container nested to the depth cap, so a parse that silently flattens is
 *    visible.
 */
const PAGE: Block[] = [
  {
    kind: "container",
    mode: "grid",
    spaces: 3,
    weights: [1, 3, 2],
    children: [
      { kind: "text", title_en: "First", description_en: "one" },
      null,
      {
        kind: "container",
        mode: "stack",
        spaces: 1,
        children: [
          {
            kind: "container",
            mode: "stack",
            spaces: 1,
            children: [
              { kind: "text", title_en: "Deepest", description_en: "three" },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: "container",
    mode: "list",
    spaces: 1,
    children: [{ kind: "avatar", title_en: "Portrait", description_en: "" }],
  },
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    children: [
      { kind: "handle", title_en: "Handle", description_en: "" },
      { kind: "owner", title_en: "Owner", description_en: "" },
    ],
  },
];

describe("toDocument", () => {
  it("emits the object form with a version marker", () => {
    const parsed: unknown = JSON.parse(toDocument(DEFAULT_THEME, PAGE));
    expect(parsed).toMatchObject({ aeleos: DOCUMENT_VERSION });
    expect(Object.keys(parsed as object)).toEqual([
      "aeleos",
      "theme",
      "blocks",
    ]);
  });

  it("round-trips a page unchanged", () => {
    const back = parseDocument(toDocument(DEFAULT_THEME, PAGE), "fursona");
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.blocks).toEqual(PAGE);
    expect(back.theme).toEqual(DEFAULT_THEME);
  });
});

describe("parseDocument", () => {
  it("accepts a bare array as blocks, and touches no theme", () => {
    const back = parseDocument(JSON.stringify(PAGE), "fursona");
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.blocks).toEqual(PAGE);
    expect(back.theme).toBeNull();
  });

  it("reads an absent theme as leave-mine-alone", () => {
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: PAGE }),
      "fursona",
    );
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.theme).toBeNull();
  });

  it("refuses an unrecognised version by name", () => {
    const back = parseDocument(
      JSON.stringify({ aeleos: 99, blocks: PAGE }),
      "fursona",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toEqual([
      { at: "envelope", message: "unknown version 99" },
    ]);
  });

  it("refuses an object form with no version marker", () => {
    const back = parseDocument(JSON.stringify({ blocks: PAGE }), "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems[0]).toMatchObject({ at: "envelope" });
  });

  it("reports a syntax failure as a position and no path", () => {
    const back = parseDocument('{ "aeleos": 1, "blocks": [', "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems[0]).toMatchObject({ at: "syntax" });
    expect(back.problems[0]).not.toHaveProperty("path");
  });

  it("reports a schema refusal as a path into the tree", () => {
    // `Block` is a union, so each step down needs the container cast —
    // TypeScript cannot narrow an index into a fixture, however fixed its
    // shape is two dozen lines above.
    const broken = structuredClone(PAGE);
    const section = broken[0] as ContainerBlock;
    const nested = section.children[2] as ContainerBlock;
    const deeper = nested.children[0] as ContainerBlock;
    // The deepest leaf's title, which the write schema requires.
    delete (deeper.children[0] as { title_en?: string }).title_en;
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: broken }),
      "fursona",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toContainEqual({
      at: "block",
      path: [0, 2, 0, 0],
      field: "title_en",
    });
  });

  it("reports a leaf the destination's actor kind refuses", () => {
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: PAGE }),
      "person",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toContainEqual({
      at: "refused-kind",
      path: [2, 1],
      kind: "owner",
    });
  });

  it("refuses an oversized paste without parsing it", () => {
    const huge = "x".repeat(PASTE_LIMIT_BYTES + 1);
    const back = parseDocument(huge, "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toEqual([
      { at: "envelope", message: "too large to read" },
    ]);
  });

  it("does not let a `__proto__` key reach anything", () => {
    const back = parseDocument(
      '{ "aeleos": 1, "__proto__": { "polluted": true }, "blocks": [] }',
      "fursona",
    );
    expect(back.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("normalises a hostile theme rather than trusting it", () => {
    const back = parseDocument(
      JSON.stringify({
        aeleos: 1,
        blocks: PAGE,
        theme: {
          accent: "javascript:alert(1)",
          canvasColours: Array.from({ length: 5000 }, () => "#ff0000"),
          density: 9e9,
          skin: "not-a-skin",
        },
      }),
      "fursona",
    );
    expect(back.ok).toBe(true);
    if (!back.ok || !back.theme) return;
    expect(back.theme.accent).toBeNull();
    expect(back.theme.canvasColours?.length ?? 0).toBeLessThan(50);
    expect(back.theme.density).toBeLessThanOrEqual(1);
    expect(back.theme.skin).toBe(DEFAULT_THEME.skin);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm --filter hub exec vitest run tests/page-document.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the module**

Create `apps/hub/src/features/actors/domain/page-document.ts`:

```ts
import {
  BLOCK_LIMITS,
  blocksSchema,
  isContainer,
  type Block,
} from "@/features/actors/domain/block-schema";
import {
  DEFAULT_THEME,
  parseTheme,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import type { BlockPath } from "@/features/actors/domain/block-edits";
import { blockProblems } from "@/features/actors/domain/block-problems";
import {
  REFUSED_KIND,
  type ActorKind,
} from "@/features/actors/domain/required-blocks";

/** The envelope version this build writes and is the only one it reads. */
export const DOCUMENT_VERSION = 1;

const utf8 = new TextEncoder();

/**
 * The largest paste this will look at, in bytes.
 *
 * **Checked before `JSON.parse`, never after**, which is the whole reason it is
 * a separate number from {@link BLOCK_LIMITS.bytes}. The dock parses after
 * every burst of typing, so a very large paste would be parsed repeatedly and
 * freeze the tab — and the size cannot be learned from a parse that cannot be
 * afforded.
 *
 * Twice the block budget, derived rather than written, so it cannot drift from
 * it. The theme is a fixed set of fields with its own caps, so one block budget
 * of headroom is generous. The real caps still apply after the parse: this only
 * bounds what is worth reading.
 */
export const PASTE_LIMIT_BYTES = BLOCK_LIMITS.bytes * 2;

/**
 * One thing wrong with a pasted document.
 *
 * **Four kinds, because they are found by different machinery and only two of
 * them have a path.** A `syntax` failure never parsed, so there is no tree to
 * point into and claiming a path would be inventing one; an `envelope` problem
 * is about the document rather than any block in it.
 */
export type DocumentProblem =
  /**
   * The text never parsed. The engine's own message carries the position —
   * `"Unexpected token } in JSON at position 42"` — and it is passed through
   * verbatim rather than picked apart, because the format of that string is
   * the engine's to change and a parser for it would be a second thing to
   * keep in step.
   */
  | { at: "syntax"; message: string }
  | { at: "envelope"; message: string }
  | { at: "block"; path: BlockPath; field: string }
  | { at: "refused-kind"; path: BlockPath; kind: string };

/**
 * What a paste turned out to be.
 *
 * `theme` is null when the document carried none, which means **leave the
 * current one alone** rather than reset it — absence is inherit everywhere
 * else in this model.
 */
export type DocumentParse =
  | { ok: true; theme: ActorTheme | null; blocks: Block[] }
  | { ok: false; problems: DocumentProblem[] };

/**
 * The page as a document somebody can copy out.
 *
 * Always the object form with a version marker, so every document this app
 * produces can be recognised by a build that has never seen it. Indented,
 * because it is read and edited by people.
 *
 * @param theme - the page's theme as the form holds it.
 * @param blocks - the page's tree as the form holds it.
 * @returns the document as JSON text.
 */
export function toDocument(theme: ActorTheme, blocks: Block[]): string {
  return JSON.stringify({ aeleos: DOCUMENT_VERSION, theme, blocks }, null, 2);
}

/**
 * Every leaf in a tree whose kind the destination refuses, by path.
 *
 * @param blocks - the parsed tree.
 * @param kind - the actor kind of the page it is going into.
 * @returns one problem per refused leaf, outermost first.
 */
function refusedLeaves(
  blocks: readonly (Block | null)[],
  kind: ActorKind,
  at: readonly number[] = [],
): DocumentProblem[] {
  const found: DocumentProblem[] = [];
  for (const [index, block] of blocks.entries()) {
    if (block === null) continue;
    const path = [...at, index];
    if (isContainer(block)) {
      found.push(...refusedLeaves(block.children, kind, path));
    } else if (block.kind === REFUSED_KIND[kind]) {
      found.push({ at: "refused-kind", path, kind: block.kind });
    }
  }
  return found;
}

/**
 * Reads a pasted document.
 *
 * **The size is checked before the parse** — see {@link PASTE_LIMIT_BYTES}.
 *
 * **The theme goes through `parseTheme`, never through `themeSchema`.** The
 * form's schema is loose on colours, the cursor and the three dials, and its
 * own documentation gives the reason: nothing else is reachable through a
 * colour input, and a slider cannot produce anything else. Both sentences are
 * statements about CONTROLS, and a paste has none — so an imported theme is
 * stored data arriving from a stranger, which is exactly what the read path
 * was written for.
 *
 * A bare array is accepted as shorthand for `{ blocks: [...] }`, because a
 * model asked for a page very often emits the array alone. That is leniency
 * about the envelope's SHAPE and never about validation: the blocks still go
 * through `blocksSchema`, and `set_actor_sections` still sees them at the save.
 *
 * @param text - whatever is in the box.
 * @param kind - the actor kind of the page this is going into, which decides
 *   which leaf kind is refused.
 * @returns the parsed halves, or every problem found.
 */
export function parseDocument(text: string, kind: ActorKind): DocumentParse {
  if (utf8.encode(text).length > PASTE_LIMIT_BYTES)
    return {
      ok: false,
      problems: [{ at: "envelope", message: "too large to read" }],
    };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problems: [
        {
          at: "syntax",
          message: error instanceof Error ? error.message : "unreadable",
        },
      ],
    };
  }

  let rawBlocks: unknown;
  let rawTheme: unknown;
  if (Array.isArray(raw)) {
    rawBlocks = raw;
    rawTheme = undefined;
  } else if (typeof raw === "object" && raw !== null) {
    const envelope = raw as Record<string, unknown>;
    if (envelope.aeleos !== DOCUMENT_VERSION)
      return {
        ok: false,
        problems: [
          {
            at: "envelope",
            message:
              envelope.aeleos === undefined
                ? "no version marker"
                : `unknown version ${String(envelope.aeleos)}`,
          },
        ],
      };
    rawBlocks = envelope.blocks;
    rawTheme = envelope.theme;
  } else {
    return {
      ok: false,
      problems: [{ at: "envelope", message: "not a document" }],
    };
  }

  const parsed = blocksSchema.safeParse(rawBlocks);
  if (!parsed.success) {
    const problems = blockProblems(
      // `blockProblems` walks react-hook-form's own error shape, which is what
      // a zod error flattened by field path already is.
      parsed.error.format(),
    ).map((one): DocumentProblem => ({
      at: "block",
      path: one.path,
      field: one.field,
    }));
    return {
      ok: false,
      problems:
        problems.length > 0
          ? problems
          : [
              {
                at: "envelope",
                message: parsed.error.issues[0]?.message ?? "refused",
              },
            ],
    };
  }

  const refused = refusedLeaves(parsed.data, kind);
  if (refused.length > 0) return { ok: false, problems: refused };

  return {
    ok: true,
    blocks: parsed.data,
    theme: rawTheme === undefined ? null : parseTheme(rawTheme),
  };
}
```

`DEFAULT_THEME` is imported only if the implementation ends up needing it; if
not, remove the import rather than leaving it — `knip` runs in `check:tools`.

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm --filter hub exec vitest run tests/page-document.test.ts`

Expected: PASS. If the `blockProblems` adaptation does not produce the expected
path, **read `block-problems.ts` and adapt the error shape rather than changing
the expected path** — the path is the contract the editor already marks blocks
with, and a different one would mean two path languages in one app.

- [ ] **Step 5: Measure the parse-depth threshold and write it down**

The spec says this is measured rather than assumed. Run:

```bash
node -e '
for (const depth of [100, 1000, 5000, 10000, 50000, 100000]) {
  const text = "[".repeat(depth) + "]".repeat(depth);
  try { JSON.parse(text); console.log(depth, "ok"); }
  catch (e) { console.log(depth, e.constructor.name, e.message.slice(0, 40)); }
}'
```

Record the first depth that throws in the TSDoc of `parseDocument`, as a
sentence naming the number and the date it was measured. If nothing throws at
100000, say that instead — an honest "no ceiling found up to N" is a
measurement and a guessed number is not.

Then add a case to `page-document.test.ts` asserting a tree nested past
`MAX_DEPTH` is refused with a problem rather than throwing, using a depth
comfortably under whatever the parser ceiling turned out to be.

- [ ] **Step 6: Export from the barrel, update the note, commit**

Add the module's public names to `apps/hub/src/features/actors/index.ts`.

Add to `apps/hub/src/features/actors/CLAUDE.md`, a new section:

> **A page has a document, and an imported theme uses the READ path.**
> `page-document.ts` owns `{ aeleos, theme, blocks }` — the two `jsonb` columns
> of `actor_profiles`, with identity deliberately absent so an imported page
> renders with the importer's own portrait and name. An imported theme goes
> through `parseTheme` and never through `themeSchema`, because the form
> schema's looseness is justified by controls a paste does not have. The size
> is checked before `JSON.parse`, never after. Read the spec
> `2026-08-27-page-source-and-sharing-design.md` before changing any of it.

```bash
git add apps/hub/src/features/actors/domain/page-document.ts \
        apps/hub/tests/page-document.test.ts \
        apps/hub/src/features/actors/index.ts \
        apps/hub/src/features/actors/CLAUDE.md
git commit -m "feat(actors): a page has a document, and a paste is read like storage"
```

---

## Task 4: The generated reference, with a completeness gate

**Files:**

- Create: `apps/hub/src/features/actors/domain/page-reference.ts`
- Create: `apps/hub/tests/page-reference.test.ts`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`

**Interfaces:**

- Consumes: `CONTAINER_MODES`, `LEAF_KINDS`, `MAX_DEPTH`, `BLOCK_LIMITS`,
  `BLOCK_STYLE_LIMITS`; `PAGE_MEASURES`, `PAGE_FONTS`, `PAGE_SPACINGS`, `SKINS`;
  `REQUIRED_KINDS`, `REFUSED_KIND`; `DOCUMENT_VERSION`, `PASTE_LIMIT_BYTES`.
- Produces:
  - `MODE_MEANINGS: Record<ContainerMode, string>`
  - `KIND_MEANINGS: Record<LeafKind, string>`
  - `pageReference(kind: ActorKind): string`

- [ ] **Step 1: Write the failing completeness gate**

Create `apps/hub/tests/page-reference.test.ts`:

````ts
import { describe, expect, it } from "vitest";
import {
  KIND_MEANINGS,
  MODE_MEANINGS,
  pageReference,
} from "@/features/actors/domain/page-reference";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  MAX_DEPTH,
} from "@/features/actors/domain/block-schema";

describe("the reference describes every member of every vocabulary", () => {
  it("has a meaning for each container mode", () => {
    for (const mode of CONTAINER_MODES) {
      expect(
        MODE_MEANINGS[mode],
        `no meaning written for mode "${mode}"`,
      ).toBeTruthy();
    }
    expect(Object.keys(MODE_MEANINGS)).toHaveLength(CONTAINER_MODES.length);
  });

  it("has a meaning for each leaf kind", () => {
    for (const kind of LEAF_KINDS) {
      expect(
        KIND_MEANINGS[kind],
        `no meaning written for kind "${kind}"`,
      ).toBeTruthy();
    }
    expect(Object.keys(KIND_MEANINGS)).toHaveLength(LEAF_KINDS.length);
  });
});

describe("the reference is built from the constants rather than typed out", () => {
  it("names every mode and kind it may emit", () => {
    const text = pageReference("fursona");
    for (const mode of CONTAINER_MODES) expect(text).toContain(mode);
    for (const kind of LEAF_KINDS) expect(text).toContain(kind);
  });

  it("names the depth cap as a number rather than a word", () => {
    expect(pageReference("fursona")).toContain(String(MAX_DEPTH));
  });

  it("tells a person's page and a fursona's apart", () => {
    expect(pageReference("person")).toContain("fursonas");
    expect(pageReference("person")).toContain("owner");
    // A person's page refuses `owner`; the reference has to say so, or a model
    // reading it will emit one and the import will report a refusal the
    // document we handed them never warned about.
    expect(pageReference("person")).toMatch(/(refuses|refused)[^.]*owner/i);
    expect(pageReference("fursona")).toMatch(/(refuses|refused)[^.]*fursonas/i);
  });

  it("carries a complete worked example that this build can read", () => {
    const example = pageReference("fursona").match(/```json\n([\s\S]*?)```/);
    expect(
      example?.[1],
      "the reference has no fenced JSON example",
    ).toBeTruthy();
    // Proves the example is not merely plausible: it goes through the real
    // parser. An example a model copies that this build refuses is worse than
    // no example at all.
    const parsed = parseDocument(example![1], "fursona");
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });
});
````

Add the `parseDocument` import from `@/features/actors/domain/page-document`.

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm --filter hub exec vitest run tests/page-reference.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the module**

Create `apps/hub/src/features/actors/domain/page-reference.ts`. The two
`Record` constants carry one written line each; `pageReference` interpolates
every list and cap from the exported constants. Write real sentences — this is
the text a model reads.

```ts
/**
 * What each container mode DOES, in one line, for a reader who has never seen
 * this model.
 *
 * **Hand-written, and gated.** Every list and cap in the reference is
 * interpolated from the constants that are already authoritative, so it cannot
 * go stale; a mode's MEANING cannot be derived from a type, so it is written
 * here and `page-reference.test.ts` fails the build when a mode is added
 * without one. A reference that has gone stale is worse than none, because the
 * thing reading it believes it completely.
 *
 * `satisfies Record<ContainerMode, string>` is what makes the gate structural
 * as well as tested: adding a mode stops this file compiling.
 */
export const MODE_MEANINGS = {
  stack: "one after another down the page; the resting arrangement",
  list: "a stack with a hairline between rows and no gap — a feed",
  grid: "uniform tracks across, wrapping into more rows as children are added",
  masonry:
    "packs by height, so a long entry and a short one leave no ragged gap",
  carousel: "scrolls sideways at every width",
  tabs: "one child visible at a time, chosen by a tab",
  accordion: "each child collapsible; any number may be open at once",
  timeline: "a sequence, drawn as one",
} as const satisfies Record<ContainerMode, string>;
```

Write `KIND_MEANINGS` the same way, one line per member of `LEAF_KINDS`. Read
each kind's own TSDoc in `block-schema.ts` for what it actually does — but
**write a fresh line, do not copy the TSDoc**, which carries history and
corrections and is written for maintainers.

Then `pageReference(kind)` returns a document with these sections, every list
built by mapping a constant:

1. What a document is — the three keys, the version marker, the bare-array
   shorthand, and that an absent `theme` leaves the existing one alone.
2. Containers: the mode table from `MODE_MEANINGS`, `spaces` (a WIDTH, never a
   capacity — narrowing re-wraps and loses nothing), `weights` (one whole share
   per space, on the parent), `children` (`null` is an empty place that keeps
   its width and draws nothing).
3. Leaves: the kind table from `KIND_MEANINGS`, and that `title_en` is required
   on every leaf.
4. The identity kinds, which draw the ACTOR rather than typed text — so a
   document is a template and a real page at once.
5. The rules for this actor kind: what `REQUIRED_KINDS[kind]` demands and that
   `REFUSED_KIND[kind]` is refused.
6. The caps: `MAX_DEPTH`, `BLOCK_LIMITS.blocks`, `BLOCK_LIMITS.bytes`,
   `BLOCK_LIMITS.spaces`, `PASTE_LIMIT_BYTES`.
7. The theme: `SKINS`, `PAGE_MEASURES`, `PAGE_FONTS`, `PAGE_SPACINGS`, and that
   colours are `#rrggbb` and anything else is dropped.
8. One fenced ```json worked example — a complete small document that
   `parseDocument` accepts, which the test above proves.

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm --filter hub exec vitest run tests/page-reference.test.ts`

Expected: PASS.

- [ ] **Step 5: Sabotage-verify the gate**

Name the wrong behaviour: _a vocabulary member with no written meaning reaching
the reference_. Add a ninth entry to `CONTAINER_MODES` in `block-schema.ts`
without touching `MODE_MEANINGS`.

```bash
cp apps/hub/src/features/actors/domain/block-schema.ts /tmp/schema.bak
trap 'cp /tmp/schema.bak apps/hub/src/features/actors/domain/block-schema.ts' EXIT
# Add "spiral" to CONTAINER_MODES by hand, then:
pnpm --filter hub exec vitest run tests/page-reference.test.ts
pnpm typecheck
```

Expected: the completeness case FAILS **and** `typecheck` fails on the
`satisfies`. Both are wanted — the type stops it compiling and the test says
why. Restore from the copy.

Note in your report that `block-limits-match-migration.test.ts` also reddens
here, which is correct and is a different guard doing its own job.

- [ ] **Step 6: Update the note and commit**

Add to `apps/hub/src/features/actors/CLAUDE.md`:

> **The reference is generated, and its meanings are gated.** `page-reference.ts`
> interpolates every list and cap from the constants; the one-line meaning of
> each mode and kind is hand-written and `page-reference.test.ts` fails the
> build when a vocabulary member has none. Its worked example is run through
> the real `parseDocument`, because an example a model copies and this build
> refuses is worse than no example.

```bash
git add apps/hub/src/features/actors/domain/page-reference.ts \
        apps/hub/tests/page-reference.test.ts \
        apps/hub/src/features/actors/CLAUDE.md
git commit -m "feat(actors): a reference an agent can read, gated against going stale"
```

---

## Task 5: The live binding

**Files:**

- Create: `apps/hub/src/features/actors/application/use-page-source.ts`
- Create: `apps/hub/tests/use-page-source.test.ts`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`

**Interfaces:**

- Consumes: `toDocument`, `parseDocument`, `DocumentProblem` from Task 3.
- Produces:

```ts
export interface PageSourceState {
  /** What is in the box. */
  text: string;
  /** Everything wrong with it, empty when it is good. */
  problems: readonly DocumentProblem[];
  /** True when the page is showing an older tree than the text describes. */
  stale: boolean;
  /** True when the page moved under a text that is being edited. */
  drifted: boolean;
  /** Types into the box. */
  onChange: (next: string) => void;
  /** The box took or lost focus; the arbitration reads this. */
  onFocusChange: (focused: boolean) => void;
  /** Throws the box away and re-reads the page. */
  resync: () => void;
}

export function usePageSource(options: {
  theme: ActorTheme;
  blocks: Block[];
  actorKind: ActorKind;
  apply: (next: { theme: ActorTheme | null; blocks: Block[] }) => void;
  debounceMs?: number;
}): PageSourceState;
```

- [ ] **Step 1: Write the failing tests**

Create `apps/hub/tests/use-page-source.test.ts` using
`@testing-library/react`'s `renderHook` and `vi.useFakeTimers()`. Cover:

1. **It serialises the page into the box on mount.** `text` parses back to the
   given blocks.
2. **A valid edit reaches `apply` after the debounce and not before.** Type,
   assert `apply` not called, advance timers past `debounceMs`, assert called
   once with the parsed halves.
3. **An invalid edit never calls `apply` and sets `stale`.** Type a broken
   document, advance timers, assert `apply` not called and `stale` true and
   `problems` non-empty.
4. **Recovering clears `stale`.** Type valid text again, advance, assert `stale`
   false and `apply` called.
5. **An identical value does not re-enter the loop.** Re-render with the same
   blocks; assert `apply` was not called again. This is the loop guard.
6. **The page refreshes the box only when the box is unfocused.** With
   `onFocusChange(false)`, re-render with different blocks and assert `text`
   changed. With `onFocusChange(true)`, re-render with different blocks and
   assert `text` is unchanged and `drifted` is true.
7. **`resync` throws the box away.** After a drift, call `resync` and assert
   `text` matches the current page and `drifted` is false.

Write each as a named `it`, with a real assertion — no shared "it works" case.

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm --filter hub exec vitest run tests/use-page-source.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the hook**

Create the module. The shape:

- `useState` for `text`, `problems`, `focused`, `drifted`.
- A `useRef` holding the last serialisation this hook itself produced or
  accepted (`mirror`). **Every write compares against `mirror` before acting**,
  which is what stops the loop.
- A `useEffect` on `[theme, blocks]`: serialise; if the result equals `mirror`,
  do nothing; if the box is focused, set `drifted`; otherwise set `text` and
  `mirror`.
- `onChange` sets `text` and schedules a debounced parse (`setTimeout`, cleared
  on each keystroke, default `debounceMs = 250`).
- The debounced parse calls `parseDocument(text, actorKind)`; on `ok` it sets
  `problems` to `[]`, sets `mirror` to the text, and calls `apply`; on failure
  it sets `problems` and leaves everything else alone — **the page keeps the
  last good tree because nothing is applied**, which is the whole rule and
  needs no separate "last good" store.
- `stale` is `problems.length > 0`.
- `resync` re-serialises from the current props, sets `text` and `mirror`, and
  clears `drifted` and `problems`.

Give every exported name TSDoc stating the contract. State in the hook's own
TSDoc that **the page holding the last good tree is a consequence of not
applying, not a stored copy** — a stored copy would be a second source of truth
able to disagree with the form.

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm --filter hub exec vitest run tests/use-page-source.test.ts`

Expected: PASS, all seven.

- [ ] **Step 5: Sabotage-verify the loop guard and the focus rule**

Two separate sabotages, each naming what it excludes.

_The loop guard_ — excludes _a hook that re-applies its own serialisation_.
Remove the `mirror` comparison in the effect. Case 5 must redden. If it does
not, the fixture's two renders produce identical blocks and cannot
discriminate; make the second render's blocks different.

_The focus rule_ — excludes _a page edit clobbering text being typed_. Make the
effect write `text` unconditionally. Case 6's focused half must redden.

Restore each by copy, not by `git checkout --`.

- [ ] **Step 6: Update the note and commit**

Add to `apps/hub/src/features/actors/CLAUDE.md` a paragraph naming the two
rules — the `mirror` comparison and the focus arbitration — and that the last
good tree is the absence of an apply rather than a stored copy.

```bash
git add apps/hub/src/features/actors/application/use-page-source.ts \
        apps/hub/tests/use-page-source.test.ts \
        apps/hub/src/features/actors/CLAUDE.md
git commit -m "feat(actors): the source and the page are bound, and the box wins while focused"
```

---

## Task 6: The dock

**Files:**

- Create: `apps/hub/src/features/actors/presentation/page-source-dock.tsx`
- Create: `apps/hub/tests/page-source-dock.test.tsx`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`

**Interfaces:**

- Consumes: `PageSourceState` from Task 5, `pageReference` from Task 4,
  `CHROME_SCOPE` from `@/shared/domain/chrome`, `tid` from
  `@/shared/infrastructure/test-id`.
- Produces:

```ts
export interface PageSourceDockLabels {
  title: string;
  close: string;
  collapse: string;
  expand: string;
  copyReference: string;
  copied: string;
  referenceTitle: string;
  resync: string;
  drifted: string;
  stale: string;
  sourceLabel: string;
  resize: string;
}

export interface PageSourceDockProps {
  open: boolean;
  onClose: () => void;
  source: PageSourceState;
  reference: string;
  labels: PageSourceDockLabels;
}
```

- [ ] **Step 1: Write the failing tests**

Create `apps/hub/tests/page-source-dock.test.tsx`. Cover, each as its own `it`:

1. **It is non-modal.** The rendered `<dialog>` has `open` and
   `getByRole("dialog")` does **not** have `aria-modal="true"`. Assert the
   component calls `show()` and never `showModal()` by spying on both on
   `HTMLDialogElement.prototype`.
2. **Escape closes it.** Fire `keydown` `Escape`; `onClose` was called.
3. **Tab is not trapped in the textarea.** Fire `keyDown` `Tab` on the textarea
   and assert `defaultPrevented` is false — a textarea that swallows Tab is an
   accessibility failure, and this is the only place it would be introduced.
4. **The textarea is labelled**, by `sourceLabel`, reachable with
   `getByRole("textbox", { name: labels.sourceLabel })`.
5. **Typing goes to `onChange`.**
6. **The error strip names a syntax problem's message and no path**, and a
   block problem's path as `blocks[0].children[1].kind`. Two cases; assert the
   rendered text of each.
7. **The stale state is announced.** With `stale: true`, the strip is present
   and carries `aria-live="polite"`.
8. **The drift state offers `resync`**, and pressing it calls `source.resync`.
9. **The reference renders and copies.** Stub `navigator.clipboard.writeText`;
   press the copy control; assert it was called with the reference text and the
   label switches to `copied`.
10. **Collapsing hides the body and keeps the header.** Press collapse; the
    textarea is gone, the title remains, and the control now reads `expand`.
11. **It wears `CHROME_SCOPE`.** The root element's `className` contains it.
    This is what makes the hide-controls rule remove it by class with nothing to
    remember.

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm --filter hub exec vitest run tests/page-source-dock.test.tsx`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the component**

Create `apps/hub/src/features/actors/presentation/page-source-dock.tsx`.
Structure:

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Copy, PanelRightClose, X } from "lucide-react";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";
import type { PageSourceState } from "@/features/actors/application/use-page-source";
```

Key implementation rules, each of which a test above pins:

- **`show()`, never `showModal()`.** A `useEffect` on `open` calls
  `dialogRef.current?.show()` and `close()`. `showModal` would add a backdrop
  and an inert page, which is the one thing this dock must not do.
- **Ground is `bg-(--menu)`**, opaque in both modes. Never a translucent token:
  what is behind this control is a colour the author chose and may be anything.
- **Root className includes `CHROME_SCOPE`.**
- Positioned `fixed` to the inline end, `top-(--bar-top)`, `bottom-0`, with a
  width from a `useState` in `px`, `min-w-[20rem] max-w-[min(48rem,80vw)]`.
- **The resize grip is a `<div role="separator" aria-orientation="vertical">`
  with `tabIndex={0}`** handling `pointermove` and Left/Right arrow keys, so
  resizing is reachable by keyboard. Announce with `aria-label={labels.resize}`.
- **At `max-md` it becomes a sheet:** `max-md:inset-x-0 max-md:w-full`. The
  width state is ignored there.
- The textarea is `font-mono text-xs`, `spellCheck={false}`,
  `autoCorrect="off"`, `autoCapitalize="off"`, `aria-label={labels.sourceLabel}`,
  and **no `onKeyDown` handler for Tab at all** — the absence is the feature.
- The error strip is a `<p aria-live="polite">` rendering, per problem:
  `at === "syntax"` → the message alone; `at === "envelope"` → the message
  alone; `at === "block"` → `blocks[0].children[1].field`; `at ===
"refused-kind"` → the path and the kind.
- The reference sits in a `<details>` beneath the textarea with the copy
  control in its `<summary>` row, so it costs no height until wanted.
- Copy uses `navigator.clipboard.writeText` inside a `try`/`catch`; on failure
  it leaves the label alone rather than claiming success. **Both branches need
  a test** for the coverage gate — add a twelfth case with `writeText`
  rejecting.

Write the path formatter as a small exported function so the test asserts the
same code the strip uses:

```ts
/**
 * A block path as the strip shows it.
 *
 * Spelled the way the document is written rather than the way the tree is
 * walked — `blocks[0].children[1]` — so somebody can find the block by reading
 * along their own JSON.
 *
 * @param path - the path, outermost index first.
 * @param field - the refused field, appended when there is one.
 * @returns the address as text.
 */
export function sourceAddress(path: readonly number[], field?: string): string {
  const body = path
    .map((index, at) => (at === 0 ? `blocks[${index}]` : `children[${index}]`))
    .join(".");
  return field ? `${body}.${field}` : body;
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm --filter hub exec vitest run tests/page-source-dock.test.tsx`

Expected: PASS.

- [ ] **Step 5: Sabotage-verify the two that matter**

_Non-modality_ — excludes _a dock that inerts the page behind it_. Change
`show()` to `showModal()`. Case 1 must redden.

_Tab_ — excludes _a textarea that swallows Tab to insert one_. Add an
`onKeyDown` that calls `preventDefault()` on Tab. Case 3 must redden.

Restore both by copy.

- [ ] **Step 6: Update the note and commit**

Add to `apps/hub/src/features/actors/CLAUDE.md` a paragraph on the dock: that
it is non-modal by `show()` and why, that `--menu` is a guarantee rather than a
preference, that Tab is deliberately unhandled, and that `CHROME_SCOPE` is what
makes the hide-controls rule reach it.

```bash
git add apps/hub/src/features/actors/presentation/page-source-dock.tsx \
        apps/hub/tests/page-source-dock.test.tsx \
        apps/hub/src/features/actors/CLAUDE.md
git commit -m "feat(actors): a dock that shows the page's source without covering the page"
```

---

## Task 7: Wiring, and both languages

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/src/app/[locale]/(app)/pages/labels.ts`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/es.json`
- Modify: `apps/hub/src/features/actors/index.ts`
- Modify: `apps/hub/src/features/actors/CLAUDE.md`

- [ ] **Step 1: Add the strings to both catalogues**

Under `fursonas` in `en.json`:

```json
"source": {
  "open": "Page source",
  "title": "Page source",
  "close": "Close the page source",
  "collapse": "Collapse",
  "expand": "Expand",
  "copyReference": "Copy the format reference",
  "copied": "Copied",
  "referenceTitle": "The format, for an assistant",
  "resync": "Reload from the page",
  "drifted": "The page changed while you were typing.",
  "stale": "Showing your last valid version.",
  "sourceLabel": "This page as JSON",
  "resize": "Resize the panel"
}
```

And in `es.json`, written properly — Spanish is this app's fallback, not an
afterthought:

```json
"source": {
  "open": "Código de la página",
  "title": "Código de la página",
  "close": "Cerrar el código de la página",
  "collapse": "Contraer",
  "expand": "Expandir",
  "copyReference": "Copiar la referencia del formato",
  "copied": "Copiado",
  "referenceTitle": "El formato, para un asistente",
  "resync": "Recargar desde la página",
  "drifted": "La página cambió mientras escribías.",
  "stale": "Mostrando tu última versión válida.",
  "sourceLabel": "Esta página como JSON",
  "resize": "Cambiar el tamaño del panel"
}
```

- [ ] **Step 2: Restart the dev server**

Kill any running `pnpm dev` and start it again. A server that predates a
catalogue change serves the modules it started with and renders new keys raw —
which then widens a `select` and fails `responsive.spec.ts` honestly, about a
page that genuinely is broken, for a reason in no diff (root rule 12).

- [ ] **Step 3: Run the catalogue tests**

Run: `pnpm --filter hub exec vitest run tests/messages.test.ts tests/message-keys-exist.test.ts`

Expected: PASS. If a key is missing from one language the first fails by name.

- [ ] **Step 4: Add the toolbar control**

In `editor-toolbar.tsx`, add to `EditorToolbarLabels`:

```ts
/** Opens the panel showing the page as JSON. */
openSource: string;
```

and to `EditorToolbarProps`:

```ts
  /**
   * Opens the page-source dock.
   *
   * A callback rather than a link, for the reason `onHideControls` is one: it
   * changes how this page is being looked at and goes nowhere, so there is no
   * address for it to have.
   */
  onOpenSource: () => void;
```

Render it beside `hideControls`, with `{...tid("editor-open-source")}` and an
accessible name from `labels.openSource`. Use the `Braces` icon from
`lucide-react`.

- [ ] **Step 5: Mount the dock in the editor**

In `fursona-editor.tsx`:

- `const [sourceOpen, setSourceOpen] = useState(false);`
- Watch the blocks alongside the existing `theme` watch.
- Build the binding:

```tsx
const source = usePageSource({
  theme: liveTheme as ActorTheme,
  blocks: liveBlocks,
  actorKind,
  apply: ({ theme, blocks }) => {
    setValue("sections", blocks, { shouldDirty: true });
    if (theme) setValue("theme", theme, { shouldDirty: true });
  },
});
```

- `const reference = useMemo(() => pageReference(actorKind), [actorKind]);`
- Render `<PageSourceDock open={sourceOpen} onClose={() => setSourceOpen(false)}
source={source} reference={reference} labels={labels.source} />` as a sibling
  of the toolbar, **outside `ThemeScope`'s styled content but inside the
  editor's own tree**, so `CHROME_SCOPE` governs it.

Add `source: PageSourceDockLabels` to `FursonaEditorLabels`, nested like
`theme` is, and populate it in `pages/labels.ts` from the new namespace.

The form field holding the tree is named `sections` — confirm the exact name by
reading the `useForm` `defaultValues` in `fursona-editor.tsx` before writing
`setValue`, and use whatever is actually there.

- [ ] **Step 6: Check the whole thing by hand, once**

Run `pnpm dev`, sign in, open a fursona's editor, press the new control.
Confirm: the dock opens beside the page, the page is still scrollable, the JSON
matches, editing `title_en` in the box changes the page, breaking a brace shows
the strip and leaves the page alone, and closing and pressing Cancel loses
everything.

- [ ] **Step 7: Run every gate**

Run: `pnpm test:hub && pnpm lint && pnpm typecheck && pnpm check:docs`

Expected: all pass. `check:docs` will demand documentation moves for every
interface you widened.

- [ ] **Step 8: Commit**

```bash
git add apps/hub/src apps/hub/tests
git commit -m "feat(actors): the editor opens its own source"
```

---

## Task 8: The browser proof

**Files:**

- Create: `apps/hub/tests/e2e/page-source-dock.spec.ts`
- Modify: `apps/hub/tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Read the existing helpers first**

Read `apps/hub/tests/e2e/helpers.ts` and `apps/hub/tests/e2e/support/`, and
`editor-saves-page.spec.ts` for how a page is seeded and an editor opened.
**Use `seedPage` rather than building a page through the UI**, and remember that
every seeded page carries the required identity blocks — count with
`+ SEEDED_IDENTITY_SECTIONS` rather than a bare number.

- [ ] **Step 2: Write the spec**

Cases, each with the wrong behaviour it excludes named in a comment:

1. **The dock opens and the page stays interactive.** Open it, then scroll the
   page behind it and assert the scroll position changed. _Excludes: a modal
   with a backdrop._
2. **A text edit moves the real page.** Change a leaf's `title_en` in the box;
   assert the rendered heading behind the dock changes. _Excludes: a dock bound
   to a copy of the page._
3. **Broken text holds the last good tree.** Seed the asymmetric page from Task 3. Break the JSON **by deleting a whole section's closing brace**, so a
   parser that applied the fragment would render a visibly different page;
   assert the section count is unchanged and the strip appears. _Excludes:
   applying a partial parse. A fixture that breaks the JSON in a way leaving the
   page identical could not tell those apart._
4. **A page edit refreshes the box when it is not focused.** Click away from the
   textarea, change a title through the ordinary control, assert the box's text
   contains the new title.
5. **A page edit does not clobber a focused box.** Focus the box, type, then
   drive a control edit; assert the box still holds what was typed and the
   drift notice is showing.
6. **A round trip through copy and paste reproduces the page.** Read the box's
   value, navigate to a second fursona's editor, paste it, save, and assert the
   public page renders the same section count and the same weighted grid.
   _Excludes: an export that loses `weights` or `spaces` — which is why the
   fixture's weights are `[1, 3, 2]` and not a palindrome._
7. **A hostile document does not break the page and is still refused at Save.**
   Paste a document whose theme carries `accent: "javascript:alert(1)"` and a
   5000-entry `canvasColours`; assert the page renders, then paste one carrying
   an `owner` leaf on a person's page and assert the strip names it and Save is
   refused with the block marked.
8. **Escape closes and focus returns** to the control that opened it.

9. **Hostile text is ugly, not page-breaking — the containment proof the spec
   owes.** The spec descopes defending against bidirectional overrides,
   zero-width joiners and long combining-mark stacks, on the argument that they
   are reachable by typing and so belong at render for everyone rather than at
   this door. What it does **not** descope is proving the containment holds, and
   this is that proof: paste a document whose `title_en` values carry, in three
   separate leaves,

   - a right-to-left override followed by ASCII —
     `"‮" + "testing"`, written as an **escape and never as a literal**,
     because a raw control character pasted into a source file is the hazard
     `check-source-bytes` exists for and a reviewer cannot see it,
   - a run of zero-width joiners between ordinary letters,
     `"a" + "‍".repeat(50) + "b"`,
   - a single character carrying two hundred combining marks,
     `"e" + "́".repeat(200)`,

   then assert, at the narrowest viewport the suite uses:

   - `document.documentElement.scrollWidth` is not greater than its
     `clientWidth` — **the page does not scroll sideways**, which is the
     failure a stack of combining marks would actually cause;
   - the section containing them still has its expected bounding box width, so
     the text is clipped by its own container rather than pushing the layout;
   - the page still renders every other section, so one hostile leaf has not
     taken the page down.

   _Excludes: text that escapes its block and breaks the page's geometry._ It
   deliberately asserts **nothing about how the characters look** — they are
   allowed to look wrong, that is what "ugly rather than page-breaking" means,
   and an assertion about appearance would be a defence this feature explicitly
   declined to build. Record in the spec's own out-of-scope section that this
   case is where the containment claim is now measured rather than argued.

- [ ] **Step 3: Run it with secrets, and read the case count**

```bash
set -a; . ./.secrets; set +a
pnpm --filter hub exec playwright test --project=chromium tests/e2e/page-source-dock.spec.ts
```

Expected: every case passes and **none is skipped**. A skipped case reports
green (root rule 31) — read the count, not the word.

- [ ] **Step 4: Extend `a11y.spec.ts`**

Add a case that opens the dock and runs the existing `AxeBuilder` configuration
over the page with it open. Do not add `withRules` — `AxeBuilder` cannot mix
`withTags` and `withRules`, and adopting `best-practice` would flag
`empty-table-header`, which `TableLeaf` emits on purpose (root rule 19).

- [ ] **Step 5: Sabotage-verify case 3**

Excludes _a dock that applies a partial parse_. Make the debounced parse apply
`blocks` even when `parseDocument` fails, using whatever it managed to read.
Case 3 must redden on the section count. Restore by copy.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/tests/e2e
git commit -m "test(actors): the source dock proved in a browser"
```

---

## Task 9: Close the loop

- [ ] **Step 1: Grep the suites for this phase's own name**

Root rule 21: a dormant guard names the conditions under which it wakes and
somebody has to read them.

```bash
grep -rn "page-source\|pageSource\|import\b.*dock" apps/hub/tests --include=*.ts --include=*.tsx | grep -i "skip\|todo\|fixme"
```

Fix or remove anything found.

- [ ] **Step 2: Re-read the feature note against every change**

`apps/hub/src/features/actors/CLAUDE.md` opens with a standing rule requiring
exactly this. Read it end to end and correct anything the six tasks made stale
— particularly any sentence claiming a leaf kind cannot be chosen, or that a
page cannot be edited except through controls.

- [ ] **Step 3: Update the root `CLAUDE.md`**

Add a bullet in **Current state** describing the feature, and add a rule to
**The rules. Each was paid for.** for the finding this work produced:

> **A write path's looseness is often justified by a CONTROL, and an import
> deletes the control.** `themeSchema` documents its own looseness with "nothing
> else is reachable through a colour input" and "a slider cannot produce
> anything else" — both true, and both statements about a user interface rather
> than about the data. The moment a paste box exists, every such justification
> is void and the READ path's guards are the correct ones. The giveaway is a
> schema comment whose reason names a widget.

Also record the second finding: the leaf-kind select offered kinds the database
refused, and `identity-leaves.tsx` documented that as impossible.

- [ ] **Step 4: Run every gate the way CI does**

```bash
pnpm lint && pnpm typecheck && pnpm test:hub && \
pnpm --filter hub test:coverage && pnpm check:tools && \
pnpm check:docs && pnpm check:agent-notes
set -a; . ./.secrets; set +a
pnpm --filter hub test:e2e
```

Expected: all green, coverage at 100%, and the browser run's case count at or
above the count on `main` plus the cases added here.

If coverage is short, run `pnpm --filter hub exec vitest run --coverage.reporter=text`
to have the uncovered line NAMED — `text-summary` reports the percentage and
never the line (root rule 11).

- [ ] **Step 5: Open the pull request, and photograph it**

Confirm identity first, then push and open:

```bash
set -a; . ./.secrets; set +a
gh api user --jq .login
git push -u origin page-source-dock
gh pr create --fill
```

Then take the pictures. **Unset `PLAYWRIGHT_BASE_URL` first** or point it at a
preview of this branch — a picture of production is not proof of this commit.
Photograph: the dock open beside a real page; a live edit mid-flight; the error
strip on broken JSON with the page intact behind it; the reference expanded;
the dock as a sheet at 320px; and the kind select on `/me/edit` no longer
offering `owner`.

Post them as a **comment on the PR** with `gh pr comment`, each captioned with
the claim it proves. Do not commit the images; delete `shot-*.png` afterwards.

- [ ] **Step 6: Read the pictures back**

A separate pass, asking a different question: not "does this show what I
claimed" but **"what else is in this frame, and is any of it wrong"**. Walk the
whole frame — edges, corners, anything overlapping anything, anything clipped,
a control landed on another, a raw message key, a colour that did not apply.
The dock is a new fixed-position panel and the toolbar is already sticky, so
**overlap is the specific risk here**. Correct anything found on the thread
rather than quietly.

---

## Notes for whoever executes this

- **One agent per working tree.** If two are running, give each a worktree —
  a whole-tree `pnpm lint` red on somebody else's errors is how work gets
  "fixed" that was not yours (root rule 22).
- **A test that passes in its file and fails alone has an isolation defect, and
  the defect is evidence about the suite** — but check first that the file under
  test is still what you think it is (root rules 34 and 35).
- **Never widen a timeout to make a flake stop.** Find the mechanism (root rule
  33). Naming an explicit ceiling with the readings written beside it is the
  opposite act and is allowed.
