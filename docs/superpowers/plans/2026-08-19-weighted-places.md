# Weighted Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A container may declare one weight per place, so a section can lay a narrow side, a wide middle and a narrow side instead of only equal tracks.

**Architecture:** `weights` sits beside `spaces` on the container — a width is the parent's business, never the block's, which is what keeps `moveBlock` and the positional empty place untouched. The renderer emits the track list as an inline custom property (author data, so no build step can see it) while the static Tailwind class keeps the container query and the uniform fallback (an inline style cannot carry a query). Each weighted track carries an `8rem` floor, so a lopsided ratio evens out when there is no room and asserts itself as the container grows.

**Tech Stack:** Next.js (server components), zod 4.4.3, Tailwind v4 container queries, Postgres (`validate_block` in `0009`), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-weighted-places-design.md`

> **Corrections, 2026-08-19 — this plan was executed and three of its
> instructions were wrong.** Each was found by running it, not by arguing with
> it, and each is the kind that fails quietly rather than loudly.
>
> - **Built CSS lives at `apps/hub/.next/static/chunks/*.css` under Turbopack**,
>   not `.next/static/css/`. Step 10's grep pointed at a directory that does
>   not exist — which returns nothing, and nothing is exactly what "the class
>   did not compile" looks like. Fixed in place above. (It compiled.)
> - **`pnpm --filter hub test:e2e -- <name>` does NOT filter.** The `--` is
>   forwarded literally, so Playwright receives `"--" "<name>"` and the WHOLE
>   e2e suite runs — a green that says nothing about the spec you meant to run,
>   and a long one. The working form is `playwright test
tests/e2e/<file>.spec.ts` from `apps/hub`. Fixed in place at both
>   occurrences.
> - **`@testing-library/user-event` is not a dependency of this repo.** The
>   test snippets in Tasks 6 and 7 call `userEvent.selectOptions`, `.clear` and
>   `.type`; the repo uses `fireEvent`, and that is what shipped. The snippets
>   below are left as written so the plan still reads as it was executed
>   against — translate them when copying.

## Global Constraints

- **`weights` is a whole number per place, 1 to 6**, matching `BLOCK_LIMITS.spaces`. `BLOCK_LIMITS.weight` is the single home for the bound.
- **Absent `weights` must emit byte-identical CSS to today.** The uniform track list is the `var()` fallback, never a branch. Any change that makes an unweighted page render differently is a defect.
- **The lenient read never fails on `weights`.** A container that refuses to parse blanks the page — `null` to its owner, `[]` to a stranger. Garbage weights resolve to "no weights".
- **Weights are offered only for `grid`** in the editor, and stored for every mode in the database. See the spec's "the control that must not appear".
- **Every export carries TSDoc stating the contract, not the types.** `pnpm check:docs` fails without it, and again if a parameter is renamed without its `@param`.
- **100% coverage, every failure branch reached by a named case.** A property test does not stand in for a case about one input.
- **Rule 27 governs every fixture here.** `weights: [1,1,1]` renders byte-identically to no weights, and `[1,3,1]` is a palindrome. No fixture may use equal shares, and the order proof must use a non-palindrome.
- **Git:** branch with an explicit base — `git checkout -b weighted-places origin/main`. CLAUDE.md forbids committing unless Heiner asks; the commit steps below are the intended granularity, so get his go-ahead once before the first one and then follow them.
- **`0009` is an applied migration.** Editing it changes what a fresh database builds and nothing about the live project. Task 2 carries the hand-apply step, and the statements must be sent as **LF**.

---

## File Structure

| File                                                            | Responsibility                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/hub/src/features/actors/domain/block-schema.ts`           | `BLOCK_LIMITS.weight`, `weightList`, `ContainerBlock.weights`, the strict length refusal                             |
| `apps/hub/src/features/actors/domain/block-tracks.ts`           | **new** — `trackListFor`: the one place that decides whether a container has usable weights and what CSS they become |
| `apps/hub/src/features/actors/presentation/blocks.tsx`          | `SPACE_CLASS` carries the `var()` fallback; `Grid` emits `--block-tracks`; `LONE_CENTRE` suppressed when weighted    |
| `apps/hub/src/features/actors/domain/block-edits.ts`            | `setSpaces` — writes `spaces` and re-lengths `weights` as one edit                                                   |
| `apps/hub/src/features/actors/presentation/section-shapes.ts`   | **new** — the preset list (name, spaces, weights)                                                                    |
| `apps/hub/src/features/actors/presentation/block-card.tsx`      | the shape control: preset select, per-place steppers, the explanation                                                |
| `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json` | the control's copy, both catalogues                                                                                  |
| `supabase/migrations/0009_actor_profiles.sql`                   | `is_weight_list`, the `validate_block` check, the column comment                                                     |

---

# Phase 1 — Model and renderer

## Task 1: `weights` in the schema

**Files:**

- Modify: `apps/hub/src/features/actors/domain/block-schema.ts`
- Test: `apps/hub/tests/block-schema.test.ts`

**Interfaces:**

- Consumes: `BLOCK_LIMITS`, `spaceCount`, `specialise`, `Strictness` (all already in `block-schema.ts`)
- Produces: `BLOCK_LIMITS.weight: 6`; `ContainerBlock.weights?: number[]`; `WEIGHTS_LENGTH_MESSAGE: string`

- [ ] **Step 1: Write the failing tests**

Add to `apps/hub/tests/block-schema.test.ts`. Note every fixture is asymmetric and the order case is not a palindrome — see the global constraints.

```ts
describe("weights", () => {
  const page = (weights: unknown) => [
    {
      kind: "container",
      mode: "grid",
      spaces: 3,
      name_en: "S",
      weights,
      children: [null, null, null],
    },
  ];

  it("keeps a weight list whose length matches spaces", () => {
    const parsed = blocksSchema.parse(page([1, 3, 1]));
    expect((parsed[0] as ContainerBlock).weights).toEqual([1, 3, 1]);
  });

  it("keeps the order it was given", () => {
    const parsed = blocksSchema.parse(page([3, 1, 2]));
    expect((parsed[0] as ContainerBlock).weights).toEqual([3, 1, 2]);
  });

  it("refuses a weight list whose length is not spaces, by name", () => {
    const result = blocksSchema.safeParse(page([1, 3]));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      WEIGHTS_LENGTH_MESSAGE,
    );
  });

  it("refuses a weight above the bound on the write", () => {
    expect(blocksSchema.safeParse(page([1, 7, 1])).success).toBe(false);
  });

  it("refuses a zero and a fraction on the write", () => {
    expect(blocksSchema.safeParse(page([1, 0, 1])).success).toBe(false);
    expect(blocksSchema.safeParse(page([1, 1.5, 1])).success).toBe(false);
  });

  it("reads a page with no weights at all", () => {
    const parsed = lenientBlocksSchema.parse(page(undefined));
    expect((parsed[0] as ContainerBlock).weights).toBeUndefined();
  });

  it("drops garbage weights on the read rather than failing the page", () => {
    for (const junk of ["wide", 3, { a: 1 }, ["a"], [null]]) {
      const parsed = lenientBlocksSchema.parse(page(junk));
      expect(parsed).toHaveLength(1);
      expect((parsed[0] as ContainerBlock).weights).toBeUndefined();
    }
  });

  it("admits a mismatched length on the read rather than failing the page", () => {
    const parsed = lenientBlocksSchema.parse(page([1, 3]));
    expect(parsed).toHaveLength(1);
  });
});
```

Import `WEIGHTS_LENGTH_MESSAGE` and `ContainerBlock` alongside the file's existing imports.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter hub test -- tests/block-schema.test.ts`
Expected: FAIL — `WEIGHTS_LENGTH_MESSAGE` is not exported, and the strict cases pass `weights` through a `.strict()` object that does not know the key.

- [ ] **Step 3: Add the bound**

In `BLOCK_LIMITS`, directly after the `spaces` entry:

```ts
  /**
   * The largest share one place may take of its container's width.
   *
   * **The same ceiling as {@link BLOCK_LIMITS.spaces} and not by coincidence**
   * — both are "how lopsided may one container be", counted from opposite
   * ends. It bounds the worst ratio anybody can build at 1:6, which is what
   * keeps a slider from producing a sliver on a stranger's screen; the track
   * floor in `block-tracks.ts` then makes even that ratio readable.
   */
  weight: 6,
```

- [ ] **Step 4: Add the list schema and the message**

Directly after `spaceCount`:

```ts
/**
 * What a container's weight list accepts, by which side of the split is being
 * built.
 *
 * **The lenient side never fails.** A weight list is the one key here that a
 * hand-written or skewed payload can make any shape at all, and a container
 * that refuses to parse costs the whole page — `null` to its owner and `[]` to
 * a stranger — over a value that was only ever going to cost a container its
 * proportions. So the lenient build `.catch`es everything to `undefined`,
 * which every reader already treats as "lay uniform tracks".
 *
 * The strict build bounds each share and the list's length; the cross-field
 * check that the length is the container's own `spaces` cannot live here,
 * because a field schema cannot see its siblings — see {@link containerSchema}.
 *
 * @param strictness - which side of the write/read split to build.
 * @returns the weight list schema.
 */
function weightList(strictness: Strictness) {
  const weight = z.number().int().min(1);
  if (strictness !== "strict") {
    return z.array(weight).optional().catch(undefined);
  }
  return z
    .array(weight.max(BLOCK_LIMITS.weight))
    .max(BLOCK_LIMITS.spaces)
    .optional();
}

/**
 * What a container whose weight list is not as long as its places is refused
 * with.
 *
 * **It names the key**, for the reason the depth cap does: a mismatch reported
 * as anything else tells somebody a field they got right is wrong. The same
 * string is what `0009` raises, so the app and the database say one thing
 * about one payload.
 */
export const WEIGHTS_LENGTH_MESSAGE = "weights must have one share per space";
```

- [ ] **Step 5: Wire it into the container**

In `containerSchema`, add the key immediately after `spaces`:

```ts
      spaces: spaceCount(strictness).default(1),
      weights: weightList(strictness),
```

and replace the function's `return specialise(z.object({ … }), strictness);` tail so the object is refined:

```ts
    strictness,
  ).superRefine((value, ctx) => {
    // **Strict only.** The lenient read admits a mismatch and every reader
    // resolves it to uniform tracks — see `trackListFor` — because refusing
    // here would fail the container, then the union, then the page.
    if (strictness !== "strict") return;
    if (value.weights && value.weights.length !== value.spaces) {
      ctx.addIssue({
        code: "custom",
        path: ["weights"],
        message: WEIGHTS_LENGTH_MESSAGE,
      });
    }
  });
```

If TypeScript objects to the `ZodEffects` result where a `ZodObject` was expected further down the union, the fix is to keep the `superRefine` unconditional exactly as written — it already is — and widen the local annotation at the call site rather than reintroducing a branch that returns two different types.

- [ ] **Step 6: Add `weights` to `ContainerBlock`**

Immediately after the `spaces` member:

```ts
  /**
   * One share per place, deciding how wide each is relative to its siblings.
   *
   * **Absent means uniform**, which is what every page stored before this
   * existed means, and the renderer reaches that case through a CSS fallback
   * rather than a branch — so an unweighted page emits exactly the CSS it
   * always did.
   *
   * A width is the PARENT's business: a block dragged from a wide place into
   * a narrow one becomes narrow, because the width was never the block's. That
   * is what keeps a drop an exchange of two places, which a per-child span
   * could not.
   *
   * **A list whose length is not {@link ContainerBlock.spaces} is ignored, not
   * honoured in part.** The strict write refuses one by name; the lenient read
   * admits it and `trackListFor` resolves it to uniform.
   */
  weights?: number[];
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `pnpm --filter hub test -- tests/block-schema.test.ts`
Expected: PASS

- [ ] **Step 8: Sabotage-verify the two cases that could be vacuous**

Rule 27: the order case and the garbage case are the ones a wrong implementation could still pass.

1. Make `weightList`'s lenient branch `z.array(weight).optional()` (drop `.catch`). Run the suite — "drops garbage weights" must go **red**. Restore.
2. In `containerSchema`, change the wired key to `weights: weightList(strictness).transform((w) => w && [...w].reverse())`. Run the suite — "keeps the order it was given" must go **red** and "keeps a weight list whose length matches" must stay green, which is the proof the palindrome would not have given. Restore.

Record both outcomes in the commit body.

- [ ] **Step 9: Run the whole hub suite and the docs check**

Run: `pnpm --filter hub test && pnpm check:docs`
Expected: PASS, 100% coverage maintained.

- [ ] **Step 10: Commit**

```bash
git add apps/hub/src/features/actors/domain/block-schema.ts apps/hub/tests/block-schema.test.ts
git commit -m "A place may declare how wide it is"
```

---

## Task 2: The database learns about weights

**Files:**

- Modify: `supabase/migrations/0009_actor_profiles.sql`
- Test: `apps/hub/tests/block-limits-match-migration.test.ts`, `tests/db/blocks.test.ts`

**Interfaces:**

- Consumes: `BLOCK_LIMITS.weight` and `WEIGHTS_LENGTH_MESSAGE` from Task 1
- Produces: `public.is_weight_list(p_value jsonb, p_max int, p_length int) returns boolean`

- [ ] **Step 1: Write the failing conformance tests**

Add to `tests/db/blocks.test.ts`, following the file's existing helper for calling `set_actor_sections` as an authenticated owner:

```ts
it("stores a weight list whose length is the container's spaces", async () => {
  await expect(
    saveSections([
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "S",
        weights: [1, 3, 1],
        children: [null, null, null],
      },
    ]),
  ).resolves.not.toThrow();
});

it("refuses a weight list of the wrong length, by name", async () => {
  await expect(
    saveSections([
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "S",
        weights: [1, 3],
        children: [null, null, null],
      },
    ]),
  ).rejects.toThrow(/weights must have one share per space/);
});

it("refuses a share above the cap", async () => {
  await expect(
    saveSections([
      {
        kind: "container",
        mode: "grid",
        spaces: 2,
        name_en: "S",
        weights: [1, 7],
        children: [null, null],
      },
    ]),
  ).rejects.toThrow(/weights/);
});

it("refuses a share that is zero or fractional", async () => {
  for (const bad of [
    [1, 0],
    [1, 1.5],
  ]) {
    await expect(
      saveSections([
        {
          kind: "container",
          mode: "grid",
          spaces: 2,
          name_en: "S",
          weights: bad,
          children: [null, null],
        },
      ]),
    ).rejects.toThrow(/weights/);
  }
});

it("stores weights on a mode that lays no tracks", async () => {
  // Dormant rather than refused: switching mode to look at a section and
  // switching back must not lose the shape.
  await expect(
    saveSections([
      {
        kind: "container",
        mode: "carousel",
        spaces: 2,
        name_en: "S",
        weights: [1, 3],
        children: [null, null],
      },
    ]),
  ).resolves.not.toThrow();
});
```

Add to `apps/hub/tests/block-limits-match-migration.test.ts`, matching the file's existing pattern of asserting the regex matched something before comparing:

```ts
it("agrees with the migration on the largest share", () => {
  const match = /c_max_weight\s+constant int := (\d+);/.exec(sql);
  expect(match).not.toBeNull();
  expect(Number(match?.[1])).toBe(BLOCK_LIMITS.weight);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter hub test -- tests/block-limits-match-migration.test.ts`
Expected: FAIL — no `c_max_weight` in the SQL, so `match` is null.

- [ ] **Step 3: Add the validator function**

In `0009_actor_profiles.sql`, immediately after the `revoke` line that follows `is_space_count`:

```sql
-- ---------------------------------------------------------------------------
-- Whether a container's weight list is one it may store.
--
-- **Absent is legal and means uniform**, which is what every page written
-- before weights existed means.
--
-- **The length is checked against the container's own `spaces`**, which is why
-- this takes a third argument where `is_space_count` takes two: a weight list
-- that is not one share per place is ignored on the read, so storing one would
-- silently drop an author's proportions at the moment they changed the count.
--
-- **`jsonb_array_elements` is not used, and that is deliberate.** It is a
-- set-returning function, so a non-array raises rather than answering false;
-- the `case` below settles the type first, for the same reason
-- `is_space_count` uses one.
create or replace function public.is_weight_list(
  p_value jsonb, p_max int, p_length int
)
returns boolean
language sql
immutable
as $$
  select case
    when p_value is null then true
    when jsonb_typeof(p_value) <> 'array' then false
    when jsonb_array_length(p_value) <> p_length then false
    else not exists (
      select 1
      from jsonb_array_elements(p_value) as e(v)
      where jsonb_typeof(v) <> 'number'
         or (v::text)::numeric not between 1 and p_max
         or (v::text)::numeric <> trunc((v::text)::numeric)
    )
  end
$$;

revoke all on function public.is_weight_list(jsonb, int, int) from public, anon;
```

- [ ] **Step 4: Call it from `validate_block`**

Add `c_max_weight constant int := 6;` beside `c_max_spaces` in the declarations, and add this immediately after the existing `is_space_count` check:

```sql
    if not public.is_weight_list(
         p_block -> 'weights',
         c_max_weight,
         coalesce((p_block ->> 'spaces')::int, 1)
       ) then
      raise exception 'block %: weights must have one share per space',
        p_path using errcode = '22023';
    end if;
```

- [ ] **Step 5: Update the column comment**

In the `comment on column public.actor_profiles.sections` string, change the container description from

`{kind: "container", mode, spaces?, name_en?, name_es?, children[], style?}`

to

`{kind: "container", mode, spaces?, weights?, name_en?, name_es?, children[], style?}`

and add this sentence directly after the sentence that ends `…the two counts are unrelated.`:

`weights is one whole share per place, 1 to 6, deciding how wide each place is relative to its siblings; absent means uniform, a list whose length is not spaces is refused on the write and ignored on the read, and it is stored for every mode though only grid lays tracks to spend it on.`

- [ ] **Step 6: Apply the changed statements to the live project, as LF**

`0009` is already applied, so editing the file changes nothing about the live database. Convert line endings first — the repository stores LF and a Windows checkout does not, and `migra` compares function source:

```bash
git config core.autocrlf   # expect "true" on this machine
python -c "import pathlib,sys; p=pathlib.Path(sys.argv[1]); p.write_bytes(p.read_bytes().replace(b'\r\n',b'\n'))" supabase/migrations/0009_actor_profiles.sql
git diff --stat supabase/migrations/0009_actor_profiles.sql   # expect no content change
```

Then apply, in one transaction, exactly three statements copied **verbatim** out of the file — the `create or replace function public.is_weight_list`, the `revoke`, and the whole `create or replace function public.validate_block`. Retyping them is what put a stale probe on the live database once before; copy, do not retype. Finish with the `comment on column` statement, also verbatim.

- [ ] **Step 7: Confirm no drift**

Run: `pnpm check:schema-drift`
Expected: no differences reported. A red result here means the hand-apply missed a statement or sent CRLF.

- [ ] **Step 8: Run the conformance suite**

Run: `pnpm test:db && pnpm --filter hub test -- tests/block-limits-match-migration.test.ts`
Expected: PASS

- [ ] **Step 9: Sabotage-verify the database guard**

`pnpm test:db` resets to a fresh database built from the files, so this is safe and does not touch live. Change `<> p_length` to `< p_length` in `is_weight_list`, run `pnpm test:db`, and watch "refuses a weight list of the wrong length" go red. Restore, re-run, confirm green.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0009_actor_profiles.sql apps/hub/tests/block-limits-match-migration.test.ts tests/db/blocks.test.ts
git commit -m "The database knows how wide a place may be"
```

---

## Task 3: The renderer lays unequal tracks

**Files:**

- Create: `apps/hub/src/features/actors/domain/block-tracks.ts`
- Create: `apps/hub/tests/block-tracks.test.ts`
- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx`
- Test: `apps/hub/tests/blocks.test.tsx`

**Interfaces:**

- Consumes: `ContainerBlock` from Task 1
- Produces: `trackListFor(container: ContainerBlock): string | undefined`; `TRACK_FLOOR = "8rem"`

- [ ] **Step 1: Write the failing unit tests**

Create `apps/hub/tests/block-tracks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { trackListFor } from "@/features/actors/domain/block-tracks";
import type { ContainerBlock } from "@/features/actors/domain/block-schema";

const container = (spaces: number, weights?: number[]): ContainerBlock => ({
  kind: "container",
  mode: "grid",
  spaces,
  weights,
  children: [],
});

describe("trackListFor", () => {
  it("answers nothing when there are no weights, so the CSS fallback is what renders", () => {
    expect(trackListFor(container(3))).toBeUndefined();
  });

  it("answers nothing when the list is not one share per place", () => {
    expect(trackListFor(container(3, [1, 3]))).toBeUndefined();
    expect(trackListFor(container(3, [1, 3, 1, 1]))).toBeUndefined();
  });

  it("answers nothing when every share is the same, because that IS the fallback", () => {
    expect(trackListFor(container(3, [2, 2, 2]))).toBeUndefined();
  });

  it("builds one floored track per share, in order", () => {
    expect(trackListFor(container(3, [1, 3, 1]))).toBe(
      "minmax(min(8rem,100%),1fr) minmax(min(8rem,100%),3fr) minmax(min(8rem,100%),1fr)",
    );
  });

  it("keeps an order a palindrome could not prove", () => {
    expect(trackListFor(container(3, [3, 1, 2]))).toBe(
      "minmax(min(8rem,100%),3fr) minmax(min(8rem,100%),1fr) minmax(min(8rem,100%),2fr)",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub test -- tests/block-tracks.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write `block-tracks.ts`**

```ts
import type { ContainerBlock } from "@/features/actors/domain/block-schema";

/**
 * The narrowest a weighted track may be laid, whatever its share works out to.
 *
 * **It is what makes a lopsided shape survive a small container.** At the
 * width where a three-place grid is first laid at all, a 1:6:1 split would
 * give its sides about 3.75rem — a sliver, because the container-query
 * thresholds were tuned for tracks that are all the same size. With a floor,
 * the sides take this and the middle takes the remainder, and as the container
 * grows the shares overtake the floor and the author's ratio asserts itself.
 *
 * **8rem is the largest value that fits inside every existing threshold**
 * with its gutters — 2 places need 17rem of the 20rem `@xs` allows, 6 need
 * 53rem of `@5xl`'s 64rem — and the headroom is spent on the section's own
 * padding, which the query does not measure. It is arithmetic rather than a
 * measurement, so `weighted-places.spec.ts` watches all five in a browser.
 */
export const TRACK_FLOOR = "8rem";

/**
 * The `grid-template-columns` a container's weights come to, or nothing.
 *
 * **Nothing is the common answer and it is not a failure.** It means "lay the
 * uniform tracks", which the caller reaches through a CSS `var()` fallback
 * rather than a branch — so a page with no weights emits exactly the CSS it
 * emitted before weights existed. Three separate cases resolve here: no
 * weights at all, a list whose length is not the container's `spaces`, and a
 * list whose shares are all equal.
 *
 * **The equal-share case is deliberate rather than an optimisation.** Uniform
 * weights and no weights are the same page, and answering the same thing for
 * both is what keeps the two from being distinguishable by a test that then
 * pins an accident.
 *
 * A width belongs to the place: this reads the container and never a child.
 *
 * @param container - the container whose places are being laid.
 * @returns the track list, or `undefined` to lay uniform tracks.
 */
export function trackListFor(container: ContainerBlock): string | undefined {
  const weights = container.weights;
  if (!weights || weights.length !== container.spaces) return undefined;
  if (weights.every((weight) => weight === weights[0])) return undefined;
  return weights
    .map((weight) => `minmax(min(${TRACK_FLOOR},100%),${weight}fr)`)
    .join(" ");
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter hub test -- tests/block-tracks.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing renderer tests**

Add to `apps/hub/tests/blocks.test.tsx`:

```ts
it("emits the track list as a custom property on a weighted grid", () => {
  const { container } = renderPage([
    {
      kind: "container",
      mode: "grid",
      spaces: 3,
      name_en: "S",
      weights: [1, 3, 1],
      children: [null, null, null],
    },
  ]);
  const grid = container.querySelector("[data-testid='block-grid']");
  expect(grid?.getAttribute("style")).toContain(
    "--block-tracks: minmax(min(8rem,100%),1fr) minmax(min(8rem,100%),3fr) minmax(min(8rem,100%),1fr)",
  );
});

it("emits no custom property at all when there are no weights", () => {
  const { container } = renderPage([
    {
      kind: "container",
      mode: "grid",
      spaces: 3,
      name_en: "S",
      children: [null, null, null],
    },
  ]);
  const grid = container.querySelector("[data-testid='block-grid']");
  expect(grid?.getAttribute("style") ?? "").not.toContain("--block-tracks");
});

it("keeps the uniform fallback in the class, so an unweighted grid is unchanged", () => {
  const { container } = renderPage([
    {
      kind: "container",
      mode: "grid",
      spaces: 3,
      name_en: "S",
      children: [null, null, null],
    },
  ]);
  const grid = container.querySelector("[data-testid='block-grid']");
  expect(grid?.className).toContain(
    "@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]",
  );
});

it("does not centre a lone last block in a weighted grid", () => {
  const { container } = renderPage([
    {
      kind: "container",
      mode: "grid",
      spaces: 3,
      name_en: "S",
      weights: [1, 3, 1],
      children: [leaf("a"), leaf("b"), leaf("c"), leaf("d")],
    },
  ]);
  const grid = container.querySelector("[data-testid='block-grid']");
  expect(grid?.className).not.toContain("col-start-2");
});

it("still centres a lone last block in an unweighted grid", () => {
  const { container } = renderPage([
    {
      kind: "container",
      mode: "grid",
      spaces: 3,
      name_en: "S",
      children: [leaf("a"), leaf("b"), leaf("c"), leaf("d")],
    },
  ]);
  const grid = container.querySelector("[data-testid='block-grid']");
  expect(grid?.className).toContain("col-start-2");
});
```

Use the file's existing `renderPage` and leaf helpers rather than new ones.

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm --filter hub test -- tests/blocks.test.tsx`
Expected: FAIL — the class is still `@lg:grid-cols-3` and nothing emits a custom property.

- [ ] **Step 7: Rewrite `SPACE_CLASS`**

Replace the map's entries, keeping the thresholds exactly as they are:

```ts
const SPACE_CLASS = new Map<number, string>([
  [1, ""],
  [
    2,
    "@xs:[grid-template-columns:var(--block-tracks,repeat(2,minmax(0,1fr)))]",
  ],
  [
    3,
    "@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]",
  ],
  [
    4,
    "@2xl:[grid-template-columns:var(--block-tracks,repeat(4,minmax(0,1fr)))]",
  ],
  [
    5,
    "@4xl:[grid-template-columns:var(--block-tracks,repeat(5,minmax(0,1fr)))]",
  ],
  [
    6,
    "@5xl:[grid-template-columns:var(--block-tracks,repeat(6,minmax(0,1fr)))]",
  ],
]);
```

Add to its TSDoc, after the paragraph beginning "**Still a static class per count…**":

```
 * **The class owns the QUERY and the property owns the TRACKS**, and the split
 * is forced rather than chosen. Weights are author data, so no build step can
 * ever see them and no class can be generated for them; an inline
 * `grid-template-columns` would carry no query and so would apply at 320px,
 * flattening the collapse. So the inline style sets `--block-tracks` — a
 * static value needing no query — and the fallback here is the uniform list,
 * which means an unweighted container emits the same declaration it always
 * did and reaches it without a branch.
```

- [ ] **Step 8: Emit the property in `Grid`**

```tsx
function Grid(props: ModeProps): ReactNode {
  const across = SPACE_CLASS.get(props.container.spaces) ?? "";
  const tracks = trackListFor(props.container);
  // **Not centred when weighted.** Centring gives a lone block one leftover
  // track each side, which is not something unequal tracks can be divided into.
  const lone = tracks ? "" : (LONE_CENTRE.get(props.container.spaces) ?? "");
  return (
    <div
      className={`grid grid-cols-1 gap-4 ${across} ${lone}`}
      style={
        tracks ? ({ "--block-tracks": tracks } as CSSProperties) : undefined
      }
      {...tid("block-grid")}
    >
      {seatsOf(props).map((seat) => placeIn(props, seat))}
    </div>
  );
}
```

Add `trackListFor` to the imports and `CSSProperties` to the `react` type import. Add to `LONE_CENTRE`'s TSDoc: `**A weighted grid is never centred** — see {@link Grid}.`

- [ ] **Step 9: Run them and watch them pass**

Run: `pnpm --filter hub test -- tests/blocks.test.tsx`
Expected: PASS

- [ ] **Step 10: Prove the arbitrary-value class actually compiles**

Rule 1 — a newly leaned-on tool is not believed until it is watched to work. This class shape (an arbitrary property whose value is a `var()` with a comma-bearing fallback) is not used anywhere in this repo yet.

```bash
pnpm --filter hub build
grep -rn "grid-template-columns:var(--block-tracks" apps/hub/.next/static/chunks/ | head
```

Expected: at least one match, inside an `@container` rule. **If there is no match the class did not compile**, and the fallback is five hand-written rules in `globals.css` — one per count — which must go **inside a cascade layer**, because an unlayered rule beats every Tailwind utility silently and forever.

- [ ] **Step 11: Sabotage-verify the renderer**

1. Drop the `style` prop from `Grid`. "emits the track list as a custom property" must go red; the unweighted cases stay green. Restore.
2. Make `lone` unconditional again. "does not centre a lone last block in a weighted grid" must go red and "still centres" stay green. Restore.

- [ ] **Step 12: Run the whole suite**

Run: `pnpm --filter hub test && pnpm check:docs && pnpm lint`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add apps/hub/src/features/actors/domain/block-tracks.ts apps/hub/src/features/actors/presentation/blocks.tsx apps/hub/tests/block-tracks.test.ts apps/hub/tests/blocks.test.tsx
git commit -m "A section lays the widths its author chose"
```

---

## Task 4: Browser proof of the floor, the ratio and the collapse

**Files:**

- Create: `apps/hub/tests/e2e/weighted-places.spec.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–3

None of this is visible without a browser: a container query, a track floor and a collapse are all resolved by layout, and every unit assertion so far has read a string that a browser never evaluated.

- [ ] **Step 1: Write the spec**

Read `apps/hub/tests/e2e/block-drag.spec.ts` first and copy its page-seeding helper and sign-in fixture verbatim — do not invent a second way to put a page in front of a browser.

```ts
// Widths are read from the resolved grid rather than from a class, because a
// class naming a custom property proves the property was named and not that
// anything read it.
const trackWidths = async (page: Page) =>
  page
    .locator("[data-testid='block-grid']")
    .first()
    .evaluate((el) =>
      getComputedStyle(el)
        .gridTemplateColumns.split(" ")
        .map(Number.parseFloat),
    );

test("lays the author's ratio once there is room for it", async ({ page }) => {
  await seedPage(page, [section({ spaces: 3, weights: [1, 3, 1] })]);
  await page.setViewportSize({ width: 1280, height: 900 });
  const [left, middle, right] = await trackWidths(page);
  expect(middle / left).toBeGreaterThan(2.5);
  expect(middle / right).toBeGreaterThan(2.5);
});

test("puts the wide place where the author put it, which a palindrome cannot prove", async ({
  page,
}) => {
  await seedPage(page, [section({ spaces: 3, weights: [3, 1, 2] })]);
  await page.setViewportSize({ width: 1280, height: 900 });
  const [first, second, third] = await trackWidths(page);
  expect(first).toBeGreaterThan(third);
  expect(third).toBeGreaterThan(second);
});

test("floors a sliver when there is not much room", async ({ page }) => {
  await seedPage(page, [section({ spaces: 3, weights: [1, 6, 1] })]);
  // Just above @lg (32rem), where the shares alone would give the sides 3.75rem.
  await page.setViewportSize({ width: 540, height: 900 });
  const [left, , right] = await trackWidths(page);
  expect(left).toBeGreaterThanOrEqual(120);
  expect(right).toBeGreaterThanOrEqual(120);
});

test("does not overflow at any threshold", async ({ page }) => {
  for (const [spaces, width] of [
    [2, 340],
    [3, 530],
    [4, 690],
    [5, 910],
    [6, 1040],
  ] as const) {
    await seedPage(page, [
      section({ spaces, weights: [1, ...Array(spaces - 1).fill(6)] }),
    ]);
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `spaces=${spaces} at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("collapses to one track and keeps stored order on a phone", async ({
  page,
}) => {
  await seedPage(page, [
    section({ spaces: 3, weights: [1, 3, 1], titles: ["one", "two", "three"] }),
  ]);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await trackWidths(page)).toHaveLength(1);
  const order = await page
    .locator("[data-testid='block-grid'] h3")
    .allInnerTexts();
  expect(order).toEqual(["one", "two", "three"]);
});
```

- [ ] **Step 2: Run it**

Run: `playwright test tests/e2e/weighted-places.spec.ts` from `apps/hub`
Expected: PASS. **If "does not overflow at any threshold" fails, the fix is a smaller `TRACK_FLOOR`, not a larger threshold** — the thresholds are tuned for readability and moving one changes unweighted pages that are correct today. Drop to `7rem`, re-run, and record the measured number in `TRACK_FLOOR`'s TSDoc in place of the arithmetic.

- [ ] **Step 3: Sabotage-verify each claim**

Rule 23 — find which assertion is the one that goes red, and record it.

1. Remove the floor (`minmax(0,${weight}fr)`) in `block-tracks.ts`. "floors a sliver" must go red; "lays the author's ratio" must stay green. Restore.
2. Reverse the array in `trackListFor`. "puts the wide place where the author put it" must go red; "lays the author's ratio" stays green, because 1:3:1 reversed is itself. Restore.
3. Drop the `@lg:` prefix from the three-place class so the tracks apply at every width. "collapses to one track" must go red. Restore.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/tests/e2e/weighted-places.spec.ts
git commit -m "A browser agrees about the widths"
```

---

# Phase 2 — The editor control

## Task 5: `spaces` and `weights` change as one edit

**Files:**

- Modify: `apps/hub/src/features/actors/domain/block-edits.ts`
- Test: `apps/hub/tests/block-edits.test.ts`

**Interfaces:**

- Consumes: `patchContainer`, `ContainerBlock`
- Produces: `setSpaces(blocks: readonly Block[], path: BlockPath, spaces: number): Block[]`

- [ ] **Step 1: Write the failing tests**

```ts
describe("setSpaces", () => {
  const page = (spaces: number, weights?: number[]) => [
    {
      kind: "container",
      mode: "grid",
      spaces,
      weights,
      name_en: "S",
      children: [leaf("a"), leaf("b"), leaf("c")],
    } as ContainerBlock,
  ];

  it("keeps every child when the width narrows", () => {
    const next = setSpaces(page(3, [1, 3, 1]), [0], 2)[0] as ContainerBlock;
    expect(next.children).toHaveLength(3);
  });

  it("truncates the weights to the new width", () => {
    const next = setSpaces(page(3, [1, 3, 1]), [0], 2)[0] as ContainerBlock;
    expect(next.weights).toEqual([1, 3]);
  });

  it("pads the weights with an even share when the width grows", () => {
    const next = setSpaces(page(3, [1, 3, 1]), [0], 5)[0] as ContainerBlock;
    expect(next.weights).toEqual([1, 3, 1, 1, 1]);
  });

  it("leaves a container with no weights without any", () => {
    const next = setSpaces(page(3), [0], 2)[0] as ContainerBlock;
    expect(next.weights).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter hub test -- tests/block-edits.test.ts`
Expected: FAIL — `setSpaces` is not exported.

- [ ] **Step 3: Implement**

```ts
/**
 * The page with a container's width written, and its weights trimmed or padded to
 * match.
 *
 * **This exists because the two are one fact.** A weight list whose length is
 * not the container's `spaces` is ignored by every reader and refused by the
 * write, so changing the count and leaving the list stale would silently drop
 * an author's proportions at the moment they touched the control — and it
 * would do it without an error, because ignoring is not failing.
 *
 * **It cannot lose content, and that is `patchContainer` doing the work rather
 * than a rescue here.** `children` is not among the fields either function
 * writes, so narrowing re-wraps the same children into more rows.
 *
 * A container with no weights stays without any: uniform is a real answer and
 * not a gap to fill in.
 *
 * @param blocks - the whole page.
 * @param path - the container.
 * @param spaces - how many places across it should now lay.
 * @returns the new page.
 */
export function setSpaces(
  blocks: readonly Block[],
  path: BlockPath,
  spaces: number,
): Block[] {
  return updateAt(blocks, path, (block) => {
    if (!block || !isContainer(block)) return block;
    const weights = block.weights
      ? Array.from({ length: spaces }, (_, at) => block.weights?.[at] ?? 1)
      : undefined;
    return { ...block, spaces, weights };
  });
}
```

- [ ] **Step 4: Run and watch pass**

Run: `pnpm --filter hub test -- tests/block-edits.test.ts`
Expected: PASS

- [ ] **Step 5: Sabotage-verify the one that could be vacuous**

The truncate and the pad cases both pass if `weights` is simply rebuilt as all-ones. Change the mapper to `() => 1` and confirm **"truncates the weights"** and **"pads the weights"** both go red — if either stays green the fixture cannot tell a rebuild from a re-length, and it needs a first share that is not `1`. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/domain/block-edits.ts apps/hub/tests/block-edits.test.ts
git commit -m "Changing the width keeps the shape"
```

---

## Task 6: The shape control

**Files:**

- Create: `apps/hub/src/features/actors/presentation/section-shapes.ts`
- Modify: `apps/hub/src/features/actors/presentation/block-card.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json`, `.../es.json`
- Test: `apps/hub/tests/block-card.test.tsx`, `apps/hub/tests/messages.test.ts` (already key-checks both catalogues)

**Interfaces:**

- Consumes: `setSpaces` (Task 5), `patchContainer`, `trackListFor`
- Produces: `SECTION_SHAPES: readonly SectionShape[]` where `SectionShape = { id: string; spaces: number; weights?: number[] }`

- [ ] **Step 1: Add the copy to both catalogues**

`en.json`, under `fursonas`:

```json
"sectionShape": "Shape",
"sectionShapeEven": "Even",
"sectionShapeWideMiddle": "Wide middle",
"sectionShapeSidebarLeft": "Narrow left",
"sectionShapeSidebarRight": "Narrow right",
"sectionShapeWideLeft": "Wide left",
"sectionShapeCustom": "Custom",
"sectionWeight": "Width of place {place}",
"sectionWeightsHint": "These set how wide each place is next to the others. When there is little room they even out, and on a narrow screen the places stack in the order they are in here."
```

`es.json`, the same keys:

```json
"sectionShape": "Forma",
"sectionShapeEven": "Iguales",
"sectionShapeWideMiddle": "Centro ancho",
"sectionShapeSidebarLeft": "Izquierda estrecha",
"sectionShapeSidebarRight": "Derecha estrecha",
"sectionShapeWideLeft": "Izquierda ancha",
"sectionShapeCustom": "Personalizada",
"sectionWeight": "Ancho del espacio {place}",
"sectionWeightsHint": "Definen qué tan ancho es cada espacio junto a los demás. Cuando hay poco lugar se emparejan, y en una pantalla angosta los espacios se apilan en el orden en que están aquí."
```

- [ ] **Step 2: Run the catalogue test**

Run: `pnpm --filter hub test -- tests/messages.test.ts`
Expected: PASS — it fails if a key exists in one language and not the other.

- [ ] **Step 3: Write `section-shapes.ts`**

```ts
/**
 * One shape offered in the section's shape control.
 *
 * `weights` absent is the even shape, and it is absent rather than a list of
 * ones so that picking "Even" stores what an unweighted section stores —
 * otherwise the same page would be two different rows depending on which
 * control had been touched.
 */
export interface SectionShape {
  /** Stable across a session; the message-key suffix and the React key. */
  id: string;
  /** How many places across the section lays. */
  spaces: number;
  /** One share per place, or absent for even. */
  weights?: number[];
}

/**
 * The shapes offered before anybody reaches for the per-place dials.
 *
 * **Every entry is a page somebody actually wants**, which is the same bar
 * `SECTION_PRESETS` sets itself. The dials underneath make anything else
 * reachable, so this list does not have to be complete — it has to be short
 * enough to read.
 */
export const SECTION_SHAPES: readonly SectionShape[] = [
  { id: "Even", spaces: 3 },
  { id: "WideMiddle", spaces: 3, weights: [1, 3, 1] },
  { id: "SidebarLeft", spaces: 2, weights: [1, 3] },
  { id: "SidebarRight", spaces: 2, weights: [3, 1] },
  { id: "WideLeft", spaces: 3, weights: [3, 1, 1] },
];
```

- [ ] **Step 4: Write the failing card tests**

Add to `apps/hub/tests/block-card.test.tsx`:

```tsx
it("offers the shape control for a grid", () => {
  renderCard(container({ mode: "grid", spaces: 3 }));
  expect(screen.getByTestId("section-shape")).toBeInTheDocument();
});

it("does not offer it for a mode that lays no tracks", () => {
  for (const mode of [
    "stack",
    "carousel",
    "tabs",
    "accordion",
    "timeline",
    "masonry",
  ]) {
    const { unmount } = renderCard(container({ mode, spaces: 3 }));
    expect(screen.queryByTestId("section-shape")).toBeNull();
    unmount();
  }
});

it("writes spaces and weights together when a shape is picked", async () => {
  const onChange = vi.fn();
  renderCard(container({ mode: "grid", spaces: 3 }), onChange);
  await userEvent.selectOptions(
    screen.getByTestId("section-shape"),
    "WideMiddle",
  );
  const next = onChange.mock.calls.at(-1)?.[0][0];
  expect(next.spaces).toBe(3);
  expect(next.weights).toEqual([1, 3, 1]);
});

it("shows one dial per place, seeded from the shape", () => {
  renderCard(container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }));
  const dials = screen.getAllByTestId(/^section-weight-/);
  expect(dials.map((d) => (d as HTMLInputElement).value)).toEqual([
    "1",
    "3",
    "1",
  ]);
});

it("writes one place's share without touching the others", async () => {
  const onChange = vi.fn();
  renderCard(
    container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }),
    onChange,
  );
  await userEvent.clear(screen.getByTestId("section-weight-0"));
  await userEvent.type(screen.getByTestId("section-weight-0"), "2");
  expect(onChange.mock.calls.at(-1)?.[0][0].weights).toEqual([2, 3, 1]);
});

it("re-lengths the weights when the width changes", async () => {
  const onChange = vi.fn();
  renderCard(
    container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }),
    onChange,
  );
  await userEvent.selectOptions(screen.getByTestId("section-spaces"), "2");
  expect(onChange.mock.calls.at(-1)?.[0][0].weights).toEqual([1, 3]);
});

it("explains what the shares do", () => {
  renderCard(container({ mode: "grid", spaces: 3 }));
  expect(screen.getByTestId("section-weights-hint")).toBeInTheDocument();
});
```

Use the file's existing `renderCard` and `container` helpers.

- [ ] **Step 5: Run and watch fail**

Run: `pnpm --filter hub test -- tests/block-card.test.tsx`
Expected: FAIL — no such test ids.

- [ ] **Step 6: Build the control**

In `block-card.tsx`, beside the existing `spaces` select and rendered **only when `block.mode === "grid"`**:

- A `<select>` with `{...tid("section-shape")}` listing `SECTION_SHAPES` by `t(\`sectionShape${shape.id}\`)`, plus a final `sectionShapeCustom`option that is selected — and disabled — when the current`spaces`/`weights`pair matches no entry. Picking one calls`onChange(patchContainer(blocks, path, { spaces: shape.spaces, weights: shape.weights }))`.
- One `<input type="number" min={1} max={BLOCK_LIMITS.weight}>` per place, `{...tid(\`section-weight-${at}\`)}`, labelled `t("sectionWeight", { place: at + 1 })`. Writing one calls `patchContainer`with the whole list, the changed index replaced — never a mutation of`block.weights`.
- The hint paragraph, `{...tid("section-weights-hint")}` and `aria-describedby`-linked from the dial group, carrying `t("sectionWeightsHint")`.

Route the **existing** `spaces` select through `setSpaces` rather than `patchContainer`, which is what makes the last test pass.

Add the ids to the card's id record, both the `section-` and the `nested-` variants, following the pattern at `block-card.tsx:187` and `:197`.

- [ ] **Step 7: Run and watch pass**

Run: `pnpm --filter hub test -- tests/block-card.test.tsx`
Expected: PASS

- [ ] **Step 8: Sabotage-verify**

1. Render the control for every mode. "does not offer it for a mode that lays no tracks" must go red. Restore.
2. Route the `spaces` select back through `patchContainer`. "re-lengths the weights when the width changes" must go red. Restore.
3. Have the per-place dial write `[value, value, value]`. "writes one place's share without touching the others" must go red — if it stays green the fixture's shares are too alike. Restore.

- [ ] **Step 9: Check the editor on a narrow screen**

Run: `playwright test tests/e2e/responsive.spec.ts` from `apps/hub`
Expected: PASS. The editor overflowed 320px once before over a `select` as wide as its longest option — `sectionShapeSidebarRight` / "Izquierda estrecha" are the long ones here. **If the dev server was running when the catalogues changed, restart it**; a server older than the code serves raw keys, which are wider still and fail honestly about a page that is genuinely broken for a reason in no diff.

- [ ] **Step 10: Commit**

```bash
git add apps/hub/src/features/actors/presentation/section-shapes.ts apps/hub/src/features/actors/presentation/block-card.tsx apps/hub/src/shared/infrastructure/i18n/messages/en.json apps/hub/src/shared/infrastructure/i18n/messages/es.json apps/hub/tests/block-card.test.tsx
git commit -m "Somebody can choose the shape of a section"
```

---

# Phase 3 — Places as columns

## Task 7: A place holds a column that grows

**Files:**

- Modify: `apps/hub/src/features/actors/domain/block-edits.ts`
- Modify: `apps/hub/src/features/actors/presentation/block-card.tsx`
- Test: `apps/hub/tests/block-edits.test.ts`, `apps/hub/tests/block-card.test.tsx`

**Interfaces:**

- Consumes: `newContainer`, `updateAt`, `isContainer`, `mayNest` (all in `block-edits.ts`; `mayNest(path)` is the depth guard — there is no `canHoldContainer`), `SECTION_SHAPES`
- Produces: `addToPlace(blocks: readonly Block[], path: BlockPath, block: Block): Block[]`

- [ ] **Step 1: Write the failing tests**

```ts
describe("addToPlace", () => {
  it("fills an empty place directly, adding no container nobody asked for", () => {
    const page = [
      {
        kind: "container",
        mode: "grid",
        spaces: 2,
        name_en: "S",
        children: [null, null],
      } as ContainerBlock,
    ];
    const next = addToPlace(page, [0, 0], leaf("a"))[0] as ContainerBlock;
    expect(next.children[0]).toEqual(leaf("a"));
  });

  it("wraps what is already there in a stack and appends", () => {
    const page = [
      {
        kind: "container",
        mode: "grid",
        spaces: 2,
        name_en: "S",
        children: [leaf("a"), null],
      } as ContainerBlock,
    ];
    const place = (addToPlace(page, [0, 0], leaf("b"))[0] as ContainerBlock)
      .children[0] as ContainerBlock;
    expect(place.kind).toBe("container");
    expect(place.mode).toBe("stack");
    expect(place.children).toEqual([leaf("a"), leaf("b")]);
  });

  it("appends to a stack that is already there rather than nesting another", () => {
    const stack = {
      kind: "container",
      mode: "stack",
      spaces: 1,
      children: [leaf("a")],
    } as ContainerBlock;
    const page = [
      {
        kind: "container",
        mode: "grid",
        spaces: 2,
        name_en: "S",
        children: [stack, null],
      } as ContainerBlock,
    ];
    const place = (addToPlace(page, [0, 0], leaf("b"))[0] as ContainerBlock)
      .children[0] as ContainerBlock;
    expect(place.children).toEqual([leaf("a"), leaf("b")]);
    expect(place.children.some((c) => c && isContainer(c))).toBe(false);
  });

  it("refuses to wrap where a container may not sit, rather than building a tree too deep", () => {
    // A place at the depth cap may hold content and nothing else.
    const deep = [section3Levels()];
    expect(addToPlace(deep, deepestPath(), leaf("b"))).toBe(deep);
  });
});
```

Write `section3Levels()` and `deepestPath()` as local helpers building a section → container → container tree, and check the arithmetic against `mayNest` — two people got this cap wrong from opposite directions on the branch that built it, and a helper nesting two containers is sitting one level above the only place the refusal can happen. Assert `mayNest(deepestPath())` is `false` in the test itself, so a helper that drifts fails as a wrong fixture rather than as a passing test of nothing.

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter hub test -- tests/block-edits.test.ts`
Expected: FAIL — `addToPlace` is not exported.

- [ ] **Step 3: Implement**

```ts
/**
 * The page with a block put in a place, making that place a column if it has
 * to.
 *
 * **A place holds one child, so a column is a `stack` and there is no second
 * mechanism.** An empty place takes the block directly; a place already
 * holding one gets a `stack` wrapping both; a place already holding a `stack`
 * gets an append. That is what makes "sides and a middle" a shape somebody
 * chooses rather than a tree they assemble.
 *
 * **The wrap is refused where a container may not sit**, and the page comes
 * back unchanged — the same array, so a caller comparing by identity sees a
 * no-op. A place at the depth cap may hold content and nothing else, and
 * wrapping there would build a tree the database refuses on save; refusing now
 * is the difference between a control that does nothing visible and a page
 * that cannot be stored.
 *
 * **The editor never removes a stack it made.** An emptied column renders as
 * an empty place, which is what an empty place already does, and it is deleted
 * the way any block is.
 *
 * @param blocks - the whole page.
 * @param path - the place.
 * @param block - what to put there.
 * @returns the new page, or the one given where the wrap is refused.
 */
export function addToPlace(
  blocks: readonly Block[],
  path: BlockPath,
  block: Block,
): Block[] {
  // **The flag exists because the refusal needs both halves of one look.**
  // Whether to wrap depends on what is AT the path, and `updateAt` is the
  // module's only traversal — adding a reader beside it would be a second
  // place to get the walk right. So the updater records the refusal and the
  // caller returns the array it was given, unchanged by identity.
  let refused = false;
  const next = updateAt(blocks, path, (here) => {
    if (!here) return block;
    if (isContainer(here) && here.mode === "stack") {
      return { ...here, children: [...here.children, block] };
    }
    if (!mayNest(path)) {
      refused = true;
      return here;
    }
    return {
      ...newContainer("stack", 1),
      name_en: undefined,
      children: [here, block],
    };
  });
  return refused ? (blocks as Block[]) : next;
}
```

`mayNest` is the existing depth guard and takes the path alone. Do **not** add a `blockAt` reader — `updateAt` is the module's only traversal and a second one is a second place to get the recursion right.

- [ ] **Step 4: Run and watch pass**

Run: `pnpm --filter hub test -- tests/block-edits.test.ts`
Expected: PASS

- [ ] **Step 5: Seed columns from a shape**

In `block-card.tsx`, picking a shape from `SECTION_SHAPES` seeds each place with `newContainer("stack", 1)` **only where the place is currently empty** — a shape change must never wrap or discard content that is already there. Add the test:

```tsx
it("seeds empty places with a column and leaves filled ones alone", async () => {
  const onChange = vi.fn();
  renderCard(
    container({ mode: "grid", spaces: 2, children: [leaf("a"), null] }),
    onChange,
  );
  await userEvent.selectOptions(
    screen.getByTestId("section-shape"),
    "SidebarLeft",
  );
  const next = onChange.mock.calls.at(-1)?.[0][0];
  expect(next.children[0]).toEqual(leaf("a"));
  expect((next.children[1] as ContainerBlock).mode).toBe("stack");
});
```

- [ ] **Step 6: Run and watch pass**

Run: `pnpm --filter hub test -- tests/block-card.test.tsx`
Expected: PASS

- [ ] **Step 7: Sabotage-verify**

1. Drop the `mayNest` guard. "refuses to wrap where a container may not sit" must go red. Restore.
2. Make the stack branch nest instead of append (`children: [here, block]` for a stack too). "appends to a stack that is already there" must go red. Restore.
3. Seed every place regardless of occupancy. "seeds empty places … and leaves filled ones alone" must go red. Restore.

- [ ] **Step 8: Run everything**

Run: `pnpm --filter hub test && pnpm --filter hub test:e2e && pnpm check:docs && pnpm lint && pnpm test:db && pnpm check:schema-drift`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/hub/src/features/actors/domain/block-edits.ts apps/hub/src/features/actors/presentation/block-card.tsx apps/hub/tests/block-edits.test.ts apps/hub/tests/block-card.test.tsx
git commit -m "A place can be a column that grows"
```

---

## Task 8: The notes say what the model now is

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-19-weighted-places-design.md`

A phase is not finished when the code is. Under AI-driven development a stale note is a confident, wrong instruction, and this one contradicts a sentence that is currently load-bearing.

- [ ] **Step 1: Correct the sentence this feature falsifies**

`apps/hub/src/features/actors/CLAUDE.md`, in "A container is its SPACES, and there are no spans", says:

> A wide thing is a container of one space nested where it is wanted, which is the same recursion doing the work rather than a second mechanism beside it.

**That is false and was false when written** — a nested container occupies one place of its parent, so it can only ever be narrower. Replace it with what is true now: a wide thing is a place with a larger share, weights live on the parent, and nesting is what makes a place a column rather than what makes it wide. Keep the `columns`/`span` refusal exactly as it stands — weights are not spans, and the paragraph explaining why must say so.

- [ ] **Step 2: Add what a reader needs before touching this**

In the same file: what `weights` is, that absent means uniform and reaches the uniform case through a CSS fallback rather than a branch, that a mismatched length is refused on the write and ignored on the read, that only `grid` spends them and the editor must not offer the control elsewhere, that `LONE_CENTRE` does not apply when weighted, and the `TRACK_FLOOR` measurement as it came back from Task 4 rather than as the arithmetic predicted it.

- [ ] **Step 3: Add the bullet to the root `CLAUDE.md`**

One entry in "Current state", in the voice of its neighbours, naming the spec and the plan and saying what the feature does and does not do.

- [ ] **Step 4: Mark the spec complete**

Add a status banner to `2026-08-19-weighted-places-design.md` saying it is delivered, and correct anything the implementation settled differently — in particular the `TRACK_FLOOR` value if Task 4 moved it, and the arbitrary-value class if Task 3 Step 10 sent it to `globals.css`. A superseded claim left in place is what rule "a banner is only a banner while somebody updates it" exists for.

- [ ] **Step 5: Grep for what this phase renamed**

```bash
grep -rn "SPACE_CLASS\|grid-cols-3\|LONE_CENTRE" --include=*.md --include=*.ts --include=*.tsx apps/hub/src docs
```

Every hit describing the old class shape is a stale pointer. `pnpm check:docs` cannot catch these, because nothing about the TypeScript moved.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/CLAUDE.md CLAUDE.md docs/superpowers/specs/2026-08-19-weighted-places-design.md
git commit -m "The notes say what a place is now"
```

---

## Self-review notes

**Spec coverage.** Weights on the parent → Task 1. Bounds and the length rule → Tasks 1, 2. The class/property split → Task 3. The track floor → Tasks 3, 4. The collapse and no reordering → Task 4. Places as columns → Task 7. Grid-only control, stored for every mode → Tasks 2, 6. `LONE_CENTRE` → Task 3. Stored data and the hand-apply → Task 2. The rule-27 fixtures → every task's sabotage step. The refusals are decisions, not work, and appear in Task 8's note.

**Known gap, deliberately left.** The spec offers `flex-basis`-style fixed sides (`minmax(220px, 1fr)`) as a later addition; no task implements it, which is intended — the track floor delivers most of it, and it waits for somebody with a page it would fix.
