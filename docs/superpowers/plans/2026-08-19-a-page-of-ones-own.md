# A Page of One's Own — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unweld the three pieces of furniture the app still renders on a public page — the identity header, the fursona list and the page measure — so a person arranges their whole page out of blocks, chooses how wide it is, lets a section run to both edges, and finds the theme switch in the bar rather than in their own content.

**Architecture:** Five new leaf kinds (`avatar`, `handle`, `name`, `owner`, `fursonas`) whose content is resolved from the actor row rather than typed, reached through a `PageContext` threaded exactly where `parentHost` is threaded today. Three of the five are required per page kind, enforced in the database, at the save boundary and in the editor. The page measure becomes a six-stop enum on `ActorTheme`; bleed becomes a depth-0 `style` key, implemented by giving the public route a full-width `main` and letting `PublicBlocks` apply the measure per section.

**Tech Stack:** Next.js App Router (server components), TypeScript strict, zod, Tailwind v4, Supabase Postgres (plpgsql), next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-a-page-of-ones-own-design.md`

## Global Constraints

- **Every export carries TSDoc stating the contract, not the types.** `pnpm lint` fails without it, and again if a parameter is renamed without its `@param`.
- **100% branch coverage.** An untested error branch fails the build. Every guard added here needs its failure case exercised.
- **Every behaviour-guarding test is sabotage-verified.** Break the code, watch the specific new assertion go red, restore. A test never seen red proves nothing.
- **Rule 27 / rule 29 apply throughout.** Before writing a fixture _or_ a sabotage, name the wrong behaviour being excluded and ask whether this fixture could tell it from the right one. Where nothing at that level can discriminate, say so in the report rather than counting it.
- **`pnpm lint` runs from the repository root, never from `apps/hub`.** From the app, `tailwindcss` resolves from the wrong place and nine `better-tailwindcss` rules silently disable themselves.
- **`0009` is edited in place, which never reaches the live database.** After changing any function in it, apply the changed `create or replace` statements to the live project by hand, in their own transaction, then run `pnpm check:schema-drift`.
- **Filenames are kebab-case.** Specs and plans follow `YYYY-MM-DD-*`.
- **A person's own writing is never next-intl.** A missing `title_es` on somebody's block is a person who has not written the Spanish yet and must never be reported as a fault. This applies to the new `fursonas` and `owner` titles.
- **`pnpm test:e2e` does not load `apps/hub/.env.local`.** Source it manually in the same shell invocation.
- **Restart `next dev` after touching the message catalogues.** A running server serves the modules it started with, forever, and the resulting failures look like a bad commit.
- **Branch from an explicit base.** This plan's work happens on `a-page-of-ones-own`, already cut from `origin/main`.

---

## File Structure

**Created:**

| path                                                            | responsibility                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/hub/src/features/actors/domain/required-blocks.ts`        | Which kinds a page kind requires; `missingRequiredKinds`; `withRequiredBlocks` and the default composed section.  |
| `apps/hub/src/features/actors/presentation/identity-leaves.tsx` | The five new leaf renderers, kept out of `blocks.tsx` which is already ~2000 lines.                               |
| `apps/hub/tests/required-blocks.test.ts`                        | Unit coverage for the above.                                                                                      |
| `apps/hub/tests/e2e/page-furniture.spec.ts`                     | Browser proof: measure, bleed, the palette button, and a required block surviving a reload.                       |
| `tests/db/required-blocks.test.ts`                              | Conformance: `set_actor_sections` refuses a tree missing a required kind, and accepts one hiding in an accordion. |

**Modified:**

| path                                                                   | change                                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/hub/src/features/actors/domain/block-schema.ts`                  | Five entries in `LEAF_KINDS`; the measure has no home here.                                                                               |
| `apps/hub/src/features/actors/domain/leaf-fields.ts`                   | Five entries in `LEAF_FIELDS`.                                                                                                            |
| `apps/hub/src/features/actors/domain/actor-theme.ts`                   | `PAGE_MEASURES`, `measure` on `ActorTheme` and `themeSchema`.                                                                             |
| `apps/hub/src/features/actors/presentation/blocks.tsx`                 | `PageContext` replaces `parentHost` throughout; `LEAVES` gains five; `PublicBlocks` applies the measure per section.                      |
| `apps/hub/src/features/actors/presentation/public-profile.tsx`         | Dissolves — header and card list deleted.                                                                                                 |
| `apps/hub/src/features/actors/infrastructure/public-actors.ts`         | `withRequiredBlocks` on the read; owner fields on `PublicActor`.                                                                          |
| `apps/hub/src/features/actors/infrastructure/actor-page.ts`            | `withRequiredBlocks` on the editor's read.                                                                                                |
| `apps/hub/src/features/actors/infrastructure/fursona-arrangement.ts`   | Required-kind check before the RPC.                                                                                                       |
| `apps/hub/src/features/actors/domain/fursona-templates.ts`             | Every template gains the composed section.                                                                                                |
| `apps/hub/src/shared/presentation/page-shell.tsx`                      | `width: "full"`; renders the palette button.                                                                                              |
| `apps/hub/src/shared/presentation/theme-toggle.tsx`                    | Question-mark branch deleted.                                                                                                             |
| `apps/hub/src/shared/presentation/page-theme-switch.tsx`               | Becomes the bar's palette button.                                                                                                         |
| `apps/hub/src/app/[locale]/[person]/page.tsx`, `.../[handle]/page.tsx` | Build `PageContext`; ask for the full-width shell.                                                                                        |
| `supabase/migrations/0009_actor_profiles.sql`                          | `is_block_kind` gains five; `block_kinds_present`; the required check in `set_actor_sections`; the `bleed` style key; the column comment. |
| `supabase/migrations/0012_public_actor_reads.sql`                      | Two gated owner columns on `public_fursona`.                                                                                              |
| `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`        | New leaf labels; `pageTheme*` moves to `controls`; measure labels.                                                                        |

---

## Phase 1 — `PageContext`

A pure refactor. It touches every renderer signature in `blocks.tsx` and must change nothing a visitor can see. Its own value is that Phase 2 becomes small.

### Task 1: Thread `PageContext` in place of `parentHost`

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx`
- Modify: `apps/hub/src/features/actors/presentation/public-profile.tsx`
- Modify: `apps/hub/src/app/[locale]/[person]/page.tsx`
- Modify: `apps/hub/src/app/[locale]/[person]/[handle]/page.tsx`
- Test: `apps/hub/tests/` — whichever suites render `PublicBlocks`; find them with `grep -rl 'parentHost' apps/hub/tests apps/hub/src`

**Interfaces:**

- Produces: `export interface PageContext` in `blocks.tsx`, and `PublicBlocksProps.page: PageContext` replacing `PublicBlocksProps.parentHost`.

- [ ] **Step 1: Read the current threading**

Run: `grep -n 'parentHost' apps/hub/src/features/actors/presentation/blocks.tsx`

Every hit is a call site that changes. Note the count before you start; you will check it again at the end.

- [ ] **Step 2: Define the type**

In `blocks.tsx`, above `LeafProps`:

```ts
/**
 * Everything a leaf may need that is not in the leaf.
 *
 * **Threaded rather than provided by context, and that is not a preference.**
 * This file is a server component throughout — every container mode is CSS
 * precisely so it stays one — and React context needs a client boundary. So
 * page-level values travel down by hand, which `parentHost` already did alone
 * before the identity leaves needed five more.
 *
 * One object rather than six props: every level of the recursion passes it
 * through untouched, so the cost of adding a field is one line here instead of
 * one line per container mode.
 *
 * `owner` is present on a fursona's page and absent on a person's; `fursonas`
 * is the reverse. A leaf whose data is absent renders nothing — which is only
 * reachable through a page kind that refuses that kind on the write, so it is
 * a belt rather than a state anybody sees.
 */
export interface PageContext {
  /** This deployment's own hostname, for Twitch's `parent=`. */
  parentHost: string;
  /** Which kind of page this is. */
  actorKind: "person" | "fursona";
  /** The actor's raw handle. `isMachineHandle` decides whether it may show. */
  handle: string;
  /** The address this page is reached at. */
  address: string;
  /** The display name, when they set one. */
  displayName: string | null;
  /** Their picture, when they set one. */
  avatarUrl: string | null;
}
```

Leave `owner`, `fursonas` and `fursonasFallbackTitle` out for now — Phase 2 adds them with the leaves that read them. A field nothing reads is the control-that-does-nothing failure.

- [ ] **Step 3: Replace `parentHost` with `page` at every level**

In `LeafProps`, `BlockProps`, `ModeProps`, `PublicBlocksProps` and every mode component, replace the `parentHost: string` field with `page: PageContext`, and each `parentHost={parentHost}` pass-through with `page={page}`. The single consumer — Twitch's `parent=` in the embed leaf — becomes `page.parentHost`.

- [ ] **Step 4: Build it in the two routes**

In `apps/hub/src/app/[locale]/[person]/page.tsx`, replace `parentHost={env.hubHost}` on `PublicProfile` with:

```tsx
page={{
  parentHost: env.hubHost,
  actorKind: "person",
  handle: actor.handle,
  address: actor.address,
  displayName: actor.displayName,
  avatarUrl: actor.avatarUrl,
}}
```

The same in `[handle]/page.tsx` with `actorKind: "fursona"`. `PublicProfile` takes `page: PageContext` in place of `parentHost` and passes it straight through, exactly as it does today.

- [ ] **Step 5: Verify nothing moved**

Run: `cd apps/hub && pnpm test -- --coverage.reporter=text` then `pnpm lint` **from the repository root**.
Expected: PASS, with no snapshot or assertion changes. If a test needed editing beyond renaming the prop, the refactor changed behaviour — stop and find out why.

- [ ] **Step 6: Sabotage-verify the threading**

Change the embed leaf to read a hard-coded `""` instead of `page.parentHost`. Run the suite that covers Twitch in `blocks` tests.
Expected: RED — Twitch degrades to a link. Restore.
This is the only assertion proving the object actually arrives; every other test would pass with the field silently dropped.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src apps/hub/tests
git commit -m "refactor: thread PageContext through the block renderer

parentHost was already a page-level value threaded through every level of
the recursion. It becomes one field on an object so the identity leaves can
join it without six more props per container mode.

No behaviour change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 2 — The five leaf kinds

### Task 2: The owner's gated columns in `public_fursona`

**Files:**

- Modify: `supabase/migrations/0012_public_actor_reads.sql`
- Modify: `apps/hub/src/features/actors/infrastructure/public-actors.ts`
- Test: `tests/db/` — add to whichever suite already covers `public_fursona`

**Interfaces:**

- Produces: `public_fursona` returns `owner_display_name text` and `owner_avatar_url text`; `PublicActor.owner?: { address, displayName, avatarUrl }`.

- [ ] **Step 1: Write the failing conformance test**

In `tests/db/`, beside the existing `public_fursona` coverage. Three cases, and the third is the one that matters:

1. A public fursona whose owner's profile is `public` → `owner_display_name` and `owner_avatar_url` are the owner's.
2. A public fursona whose owner's profile is `unlisted` → same. Unlisted means readable-by-link, not hidden.
3. A public fursona whose owner's profile is **`private`** → both columns are `null`, and `owner_address` is still returned.

Case 3 is the privacy rule. Cases 1 and 2 cannot fail if the gate is simply absent, so **case 3 is the only one that discriminates** — say so when reporting.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:db`
Expected: FAIL — the columns do not exist.

- [ ] **Step 3: Add the gated columns**

In `public_fursona`'s `returns table (…)`, after `owner_address text,`:

```sql
  -- **Gated on the OWNER's own visibility, and the gate is here rather than in
  -- a component.** A fursona's page is governed by the fursona's visibility
  -- (see the note above), so a public character routinely belongs to a person
  -- whose own profile 404s. The ADDRESS is safe — it is already the first
  -- segment of this page's URL — but that person's name and portrait are not,
  -- and returning them would disclose something about somebody who chose
  -- privacy. A renderer deciding this would be a second copy of a privacy rule,
  -- free to drift from the one enforced here.
  owner_display_name text,
  owner_avatar_url   text,
```

and in the `select`, after the `owner_address` subquery:

```sql
    case when o.visibility <> 'private' then o.display_name end
      as owner_display_name,
    case when o.visibility <> 'private' then o.avatar_url end
      as owner_avatar_url,
```

joining the owner row as `o` on `s.owner_ref = o.actor_ref`. Read the existing `from`/`join` clauses first and follow their aliasing; do not invent a second join if the owner is already reachable.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:db`
Expected: PASS, all three cases.

- [ ] **Step 5: Apply to live and check drift**

`0012` is an applied migration edited in place, so the change has not reached the live database. Execute the changed `create or replace function public.public_fursona(…)` statement verbatim from the file against the live project, in its own transaction.

Run: `pnpm check:schema-drift`
Expected: no drift. If it reports the function as changed, the hand-apply did not take.

- [ ] **Step 6: Carry it into `PublicActor`**

In `public-actors.ts`, add to `PublicActor`:

```ts
  /**
   * The owner of this fursona, on a fursona's page only.
   *
   * `displayName` and `avatarUrl` are `null` unless the owner's OWN profile is
   * readable — the gate is in `public_fursona`, not here. The address is always
   * present, because it is already the first segment of this page's URL.
   */
  owner?: {
    address: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
```

`toPublicActor` takes an `owner` parameter and `readPublicFursona` builds it from the three columns; `readPublicPerson` passes `undefined`.

- [ ] **Step 7: Run the unit suite and commit**

Run: `cd apps/hub && pnpm test` and `pnpm lint` from the root.

```bash
git add supabase/migrations/0012_public_actor_reads.sql apps/hub/src tests/db
git commit -m "feat: public_fursona returns the owner, gated on their own visibility

A fursona's page is governed by the fursona's visibility, so a public
character routinely belongs to a person whose profile is private. The
address is already in the URL; their name and portrait are not, and are
returned only when their own profile is readable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 3: The five kinds in the vocabulary

**Files:**

- Modify: `apps/hub/src/features/actors/domain/block-schema.ts:115-135`
- Modify: `apps/hub/src/features/actors/domain/leaf-fields.ts:131-145`
- Modify: `supabase/migrations/0009_actor_profiles.sql:321-357`
- Test: `apps/hub/tests/block-limits-match-migration.test.ts` (existing — it will fail until both sides match)

**Interfaces:**

- Produces: `"avatar" | "handle" | "name" | "owner" | "fursonas"` as members of `LeafKind`.

- [ ] **Step 1: Run the drift guard to see it green first**

Run: `cd apps/hub && pnpm test block-limits-match-migration`
Expected: PASS. You need to know it was green before you make it red, or its later red proves nothing.

- [ ] **Step 2: Add the kinds to `LEAF_KINDS` only**

Append to the array in `block-schema.ts`, with a comment above them:

```ts
  // **The identity leaves, whose content comes from the ACTOR ROW rather than
  // from fields somebody typed.** They are the first kinds in this list for
  // which `LEAF_FIELDS` names no content field at all: a renderer resolves
  // them from `PageContext`. `fursonas` and `owner` are the two exceptions and
  // read their `title` — the heading over somebody's characters is their own
  // words, not a catalogue string.
  //
  // `owner` is required on a fursona's page and refused on a person's;
  // `fursonas` is the reverse. See `domain/required-blocks.ts`.
  "avatar",
  "handle",
  "name",
  "owner",
  "fursonas",
```

- [ ] **Step 3: Run the drift guard to verify it fails**

Run: `cd apps/hub && pnpm test block-limits-match-migration`
Expected: FAIL — the client vocabulary is ahead of `is_block_kind()`. This is the guard doing its job and is the proof it covers this list.

- [ ] **Step 4: Add them to `is_block_kind()`**

In `0009`, inside the `select p_kind in (…)`, after the existing groups:

```sql
    -- The identity leaves. Their content is the ACTOR's, resolved by the
    -- renderer, so a validator has nothing kind-specific to check here — the
    -- generic field rules below cover the title `fursonas` and `owner` read.
    -- Which of them a page must carry is `set_actor_sections`' business, not
    -- this function's: this says which names exist, not which are required.
    'avatar', 'handle', 'name', 'owner', 'fursonas',
```

- [ ] **Step 5: Run the drift guard to verify it passes**

Run: `cd apps/hub && pnpm test block-limits-match-migration`
Expected: PASS.

- [ ] **Step 6: Add the field sets**

In `leaf-fields.ts`, inside the `Object.entries({…})`:

```ts
    // No content fields: the renderer resolves these from the actor row.
    avatar: NONE,
    handle: NONE,
    name: NONE,
    // These two DO read a title — their heading is the author's own words.
    owner: TITLE_ONLY,
    fursonas: TITLE_ONLY,
```

and define the two field sets above `LEAF_FIELDS`, beside `PLAIN` and `RETRO`. Read `PLAIN`'s definition and the `LeafFields` interface first, and set every optional flag `false` for `NONE`; `TITLE_ONLY` is `NONE` with whatever flag governs the title. If `LeafFields` has no "title" flag because every kind has always had one, `TITLE_ONLY` and `NONE` differ only in `description: false` and both are correct — say which you found.

- [ ] **Step 7: Apply `0009` to live, check drift, run everything, commit**

Hand-apply the changed `create or replace function public.is_block_kind(text)` to the live project.

Run: `pnpm check:schema-drift`, then `cd apps/hub && pnpm test`, then `pnpm lint` from the root.

```bash
git add apps/hub/src supabase/migrations/0009_actor_profiles.sql
git commit -m "feat: five identity leaf kinds in the vocabulary

avatar, handle, name, owner and fursonas. Nothing renders them yet and
nothing requires them; this is the name half only, kept in step across the
client and 0009 by the existing drift guard.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 4: The five renderers

**Files:**

- Create: `apps/hub/src/features/actors/presentation/identity-leaves.tsx`
- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx` (the `LEAVES` map and `PageContext`)
- Test: `apps/hub/tests/identity-leaves.test.tsx`

**Interfaces:**

- Consumes: `PageContext` (Task 1), `PublicActor.owner` (Task 2), `LeafKind` (Task 3).
- Produces: `AvatarLeaf`, `HandleLeaf`, `NameLeaf`, `OwnerLeaf`, `FursonasLeaf`, each a `LeafRenderer`.

- [ ] **Step 1: Extend `PageContext` with what these read**

Add the three fields Phase 1 deliberately left out:

```ts
  /** The owner, on a fursona's page only. Absent on a person's. */
  owner?: PublicActor["owner"];
  /** The public fursonas, on a person's page only. Absent on a fursona's. */
  fursonas?: PublicFursonaSummary[];
  /**
   * The catalogue heading a `fursonas` block falls back to.
   *
   * The block's own `title` wins — that heading is the author's own words. This
   * is what a block with none shows, resolved by the route because a server
   * component in this file cannot read a locale.
   */
  fursonasFallbackTitle: string;
```

and populate them in both routes.

- [ ] **Step 2: Write the failing tests**

`apps/hub/tests/identity-leaves.test.tsx`. The cases, each with the wrong behaviour it excludes named in a comment:

```tsx
// Excludes: rendering the provisioned handle. A person minted as
// `u-<actor_ref>` must show their ADDRESS — the raw handle is the owner_ref
// of every fursona they own. A fursona's handle is chosen and shows as-is.
it("renders a person's address, never their provisioned handle", () => { … });
it("renders a fursona's chosen handle", () => { … });

// Excludes: a required block that draws a hole. `name` is the one optional
// kind and the one that may legitimately draw nothing.
it("renders nothing when the display name is null", () => { … });

// Excludes: leaking the owner's identity past the privacy gate. The context
// carries nulls; the renderer must not substitute the address for the NAME
// while still linking to it.
it("links to the owner by address and shows no name when it is null", () => { … });

// Excludes: the catalogue string beating the author's own words.
it("prefers the block's own title over the fallback heading", () => { … });
it("falls back to the catalogue heading when the block has no title", () => { … });
```

For the handle cases, use a real `u-` handle — `isMachineHandle`'s actual predicate, read from `domain/actor-content.ts`, not a guess at its shape.

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/hub && pnpm test identity-leaves`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Write the renderers**

`identity-leaves.tsx`, exporting five `LeafRenderer`s. They are server components. Each carries TSDoc stating what it resolves and from where.

`AvatarLeaf` renders `page.avatarUrl` as an `<img>` with the same
`eslint-disable @next/next/no-img-element` comment and reasoning
`public-profile.tsx` carries today — the address is arbitrary and pasted, so
`next/image` would try to optimise a host it has never been configured for —
and the dashed-border placeholder when it is null.

`HandleLeaf` renders `isMachineHandle(page.handle) ? page.address : page.handle`.

`NameLeaf` renders `page.displayName`, or `null` when there is none.

`OwnerLeaf` renders a link to `/{page.owner.address}`, labelled with the
block's title or a fallback, showing the owner's name and avatar only when they
are non-null.

`FursonasLeaf` renders `FursonaCardList` with `address={page.address}`,
`fursonas={page.fursonas ?? []}` and
`title={contentFor(leaf.title_en, leaf.title_es, locale) || page.fursonasFallbackTitle}`
— read `contentFor`'s real signature out of `blocks.tsx` rather than assuming
this one.

Every colour comes from a token — `--edge`, `--muted`, `--surface` — and never
from a literal, which is what lets a person's theme reach them. Card-shaped
leaves use the existing `LEAF_CARD` constant rather than a new class list.

- [ ] **Step 5: Register them**

In `blocks.tsx`'s `LEAVES` map, add the five entries. The `satisfies Record<LeafKind, LeafRenderer>` will fail to compile until all five are present, which is the guard that a kind cannot be added to the vocabulary without a renderer.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/hub && pnpm test identity-leaves`
Expected: PASS.

- [ ] **Step 7: Sabotage-verify the two that matter**

Make `HandleLeaf` return `page.handle` unconditionally.
Expected: RED on the person case, green on the fursona case. Restore.

Make `OwnerLeaf` fall back to `page.owner.address` for the _name_ when `displayName` is null.
Expected: RED on the privacy case. Restore.
Note: this sabotage looks harmless and is the actual leak — a page that says "belongs to 42" reads identically whether the name was withheld or never set, so the assertion must be on the absence of a name element, not on the absence of the string.

- [ ] **Step 8: Coverage and commit**

Run: `cd apps/hub && pnpm test -- --coverage.reporter=text`
Expected: `identity-leaves.tsx` does not appear in the table, which means fully covered — read `coverage-final.json` to confirm rather than trusting the absence, since that reporter omits clean files and not-instrumented files identically.

```bash
git add apps/hub/src apps/hub/tests
git commit -m "feat: render the five identity leaves

Their content comes from the actor row through PageContext, not from typed
fields. A person's handle block shows their address; the owner block shows a
name only when the owner's own profile is readable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 3 — The shim, the templates, and `PublicProfile`'s dissolution

### Task 5: `withRequiredBlocks` and the default composed section

**Files:**

- Create: `apps/hub/src/features/actors/domain/required-blocks.ts`
- Create: `apps/hub/tests/required-blocks.test.ts`
- Modify: `apps/hub/src/features/actors/index.ts` (barrel)

**Interfaces:**

- Produces:

  ```ts
  // Task 1 wrote this union inline on `PageContext.actorKind`. Name it here
  // and change that field to use it, so there is one definition rather than
  // two that agree today.
  export type ActorKind = "person" | "fursona";
  export const REQUIRED_KINDS: Readonly<Record<ActorKind, readonly LeafKind[]>>;
  export function missingRequiredKinds(
    blocks: readonly (Block | null)[],
    kind: ActorKind,
  ): LeafKind[];
  export function defaultIdentitySection(kind: ActorKind): ContainerBlock;
  export function withRequiredBlocks(blocks: Block[], kind: ActorKind): Block[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// Excludes: "found it at the top" masquerading as "found it anywhere".
// A required block placed at depth 2, in the LAST place of the LAST section,
// must satisfy the check — so the fixture puts it there rather than first.
it("finds a required kind nested at the cap", () => { … });

// Excludes: counting an empty place as a block. children may hold null.
it("ignores null children when walking", () => { … });

// Excludes: requiring `owner` on a person's page.
it("requires fursonas on a person and owner on a fursona", () => { … });

// Excludes: a shim that prepends unconditionally, duplicating what is there.
it("adds nothing when every required kind is already present", () => { … });
it("returns the very array it was given when nothing is missing", () => { … });

// Excludes: a default section that breaks the model it is written in.
it("produces a default section within MAX_DEPTH and the weight range", () => { … });
```

That last one asserts the default section parses against `blocksSchema` — not against a hand-written shape check. A fixture that hand-checks `spaces === 2` would pass while storing a tree the database refuses.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/hub && pnpm test required-blocks`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the module**

```ts
/**
 * Which leaf kinds a page of each actor kind must carry at least one of.
 *
 * **At least one, not exactly one.** Any number of copies, at any depth, in
 * any container — including a `tabs` or a collapsed `accordion`, which is a
 * known and accepted hole: the guarantee is that the block EXISTS in the tree,
 * not that a visitor sees it. See the spec's own section on this before
 * concluding the rule is stronger than it is.
 *
 * `owner` is required on a fursona's page and `fursonas` on a person's,
 * because neither has anything to render on the other.
 */
export const REQUIRED_KINDS = {
  person: ["avatar", "handle", "fursonas"],
  fursona: ["avatar", "handle", "owner"],
} as const satisfies Record<ActorKind, readonly LeafKind[]>;
```

`missingRequiredKinds` walks the tree with `isContainer`, skipping `null`
children, collecting every leaf `kind` into a `Set`, and returns the required
kinds absent from it — **in `REQUIRED_KINDS` order**, so the message a person
reads is stable rather than depending on traversal order.

`defaultIdentitySection` returns the composed section: a `container` at depth 0,
`mode: "grid"`, `spaces: 2`, `weights: [1, 3]`, children `[avatarLeaf,
container({mode: "stack", spaces: 1, children: [nameLeaf, handleLeaf, …]})]`,
with the `owner` leaf joining the inner stack on a fursona's page. On a
person's page a second top-level section holds the `fursonas` leaf.

`withRequiredBlocks` returns `blocks` **unchanged by identity** when nothing is
missing, and otherwise prepends the composed section (and appends the fursonas
section where that is what is missing). Returning the same array matters: the
editor compares by reference to decide whether a page is dirty.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/hub && pnpm test required-blocks`
Expected: PASS.

- [ ] **Step 5: Sabotage-verify the nesting case**

Change `missingRequiredKinds` to inspect only the top-level array — no recursion.
Expected: RED on the depth-2 case only. Restore.
If the depth-2 case stays green, the fixture is not actually nesting the block; check it against `blocksSchema` and fix the fixture before trusting anything else in this file.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/domain/required-blocks.ts apps/hub/tests/required-blocks.test.ts apps/hub/src/features/actors/index.ts
git commit -m "feat: required-block rules and the default identity section

At least one of each per page kind, found at any depth. The shim treats
absence as the default position rather than as a deletion, so no page needs
migrating and no save can fail on a page its owner did not break.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 6: Apply the shim on every read, and dissolve `PublicProfile`

**Files:**

- Modify: `apps/hub/src/features/actors/infrastructure/public-actors.ts:137-168`
- Modify: `apps/hub/src/features/actors/infrastructure/actor-page.ts`
- Modify: `apps/hub/src/features/actors/presentation/public-profile.tsx`
- Modify: `apps/hub/src/features/actors/domain/fursona-templates.ts`
- Test: existing `public-profile` and `actor-page` suites; `apps/hub/tests/e2e/` public-page specs

- [ ] **Step 1: Write the failing test for the read path**

A page stored with **no** identity blocks — the shape every page in the database has today — read through `readPublicPerson`, comes back with the composed section first and a `fursonas` block present.

Excludes: a shim wired into the renderer instead of the read, which would leave the editor unable to save.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/hub && pnpm test public-actors`
Expected: FAIL.

- [ ] **Step 3: Apply the shim on both read paths**

In `public-actors.ts`, `parseBlocks` gains the actor kind and ends with
`withRequiredBlocks(parsed, kind)`. In `actor-page.ts`, `readActorPage` does the
same, so the editor holds real blocks the moment it opens a page and the first
save writes them explicitly.

- [ ] **Step 4: Delete the welded furniture**

From `public-profile.tsx`, delete the `<header>` and the `FursonaCardList`
call. What remains is `PublicBlocks` and the empty state. Update its TSDoc —
`check:docs` compares each exported symbol against the base branch and will
fail if the code moved and the comment did not; there is no suppression flag.

The empty-state condition changes and this is easy to get wrong: a page can no
longer be empty, because the shim guarantees three blocks. Either the empty
state goes, or it becomes a check on whether anything **other than** the
required blocks is present. Pick one, and write down which in the TSDoc.

- [ ] **Step 5: Add the composed section to every template**

In `fursona-templates.ts`, each `FURSONA_TEMPLATES` entry gains
`defaultIdentitySection("fursona")` as its first block, so a page created from
a template starts arranged rather than starting bare and being shimmed.

- [ ] **Step 6: Run everything**

Run: `cd apps/hub && pnpm test`, then `pnpm check:docs`, then `pnpm lint` from the root, then `pnpm build`.
Expected: PASS. Expect several existing assertions about the header's markup to need rewriting — they were testing chrome that no longer exists. Rewrite them against the blocks; do not delete them.

- [ ] **Step 7: Verify in a browser and record the visual change**

Source `apps/hub/.env.local` in the same shell invocation, then run the public-page e2e specs.

The header is now a two-place grid where it was a wrapping flex row, so the
avatar sits in a place about a fifth of the page wide, and a narrow screen
stacks where it used to wrap. **That is expected.** Take a screenshot at 1280px
and at 360px and attach them to the commit message body or the PR, so the
change is on the record rather than being reported later as a regression.

- [ ] **Step 8: Commit**

```bash
git add apps/hub/src apps/hub/tests
git commit -m "feat: the identity header and fursona list are blocks

withRequiredBlocks synthesises them on every read, so every stored page
renders correctly with no migration and the editor's first save writes them
explicitly. PublicProfile's hard-coded header and card list are deleted.

Every existing page's header changes appearance slightly: a two-place grid
where it was a wrapping flex row. Expected, not a regression.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 4 — Enforcement

### Task 7: `block_kinds_present` and the database rule

**Files:**

- Modify: `supabase/migrations/0009_actor_profiles.sql` (new function; `set_actor_sections` at :848)
- Create: `tests/db/required-blocks.test.ts`

**Interfaces:**

- Produces: `public.block_kinds_present(p_blocks jsonb) returns text[]`.

- [ ] **Step 1: Write the failing conformance tests**

```
1. A tree missing `avatar` → set_actor_sections raises, errcode 22023,
   message naming the missing kind.
2. A tree with every required kind at depth 0 → accepted.
3. A tree whose `owner` block sits at depth 2 inside a grid → accepted.
   (Excludes: a top-level-only scan.)
4. A tree whose `owner` block sits inside a collapsed `accordion` → ACCEPTED.
   This test asserts the known hole is open. It is not a mistake. Without it,
   somebody reads the enforcement code and concludes the guarantee covers
   visibility, which it does not.
5. A person's page containing an `owner` block → raises.
6. A fursona's page containing a `fursonas` block → raises.
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:db`
Expected: FAIL — every save succeeds today.

- [ ] **Step 3: Write the collector**

In `0009`, beside `validate_block`:

```sql
-- Every block kind present anywhere in a page, at any depth.
--
-- **A separate walk rather than a tally threaded through `validate_block`.**
-- That function is what every block passes through, it is immutable, it is
-- revoked from public and anon, and `block-limits-match-migration.test.ts`
-- reads its constants out of this file. Changing its signature to carry a
-- two-line feature spreads the feature across all of that. A second walk over
-- a tree already capped at 500 blocks costs nothing worth saving.
--
-- **It descends only through `children`.** `jsonb_path_query(p_blocks,
-- '$.**.kind')` is the one-liner and it is wrong: it would find a `kind` key
-- anywhere in the payload, so a crafted object under a key nothing validates
-- could satisfy a requirement without ever being a block. Descending through
-- `children` from the top-level array guarantees every node counted is a node
-- `validate_block` also checked.
create or replace function public.block_kinds_present(p_blocks jsonb)
returns text[]
language plpgsql
immutable
as $$
…
$$;

revoke all on function public.block_kinds_present(jsonb) from public, anon;
```

Implement it with an explicit recursion over `jsonb_array_elements`, skipping
`null` entries, collecting `p_block->>'kind'` and recursing into
`p_block->'children'` when it is an array.

- [ ] **Step 4: Add the rule to `set_actor_sections`**

After the validating loop and the `c_max_blocks` check, before the `insert`:

```sql
  -- Which kinds this page MUST carry depends on what kind of actor it is:
  -- `owner` has nothing to render on a person's page and `fursonas` nothing on
  -- a fursona's. `actors.kind` is immutable, so this is a stable fact about
  -- the row rather than something a caller can influence.
  select kind into v_actor_kind from public.actors where actor_ref = p_actor_ref;
```

then compute the required array from `v_actor_kind`, compare against
`public.block_kinds_present(p_sections)`, and raise `22023` naming **every**
missing kind rather than the first — a person who removed two blocks should be
told about two.

Also refuse the wrong-page-kind blocks: `owner` on a person, `fursonas` on a
fursona, each with its own message.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm test:db`
Expected: PASS, all six, case 4 included.

- [ ] **Step 6: Sabotage-verify the recursion**

Change `block_kinds_present` not to recurse into `children`.
Expected: RED on cases 3 and 4 only. Restore.
If case 1 also reddens, the fixture for it is not putting its blocks at depth 0 and is testing something other than what it says.

- [ ] **Step 7: Apply to live, check drift, commit**

Hand-apply the new `block_kinds_present` **and** the changed
`set_actor_sections` to the live project, each in its own transaction, and
grant `block_kinds_present` nothing — it is called by a `security definer`
function and needs no client grant. Check `0010_client_grants.sql` to confirm
nothing there needs a line; if a new function needs a `service_role` grant,
`check:schema-drift` will stay red until it gets one.

Run: `pnpm check:schema-drift`

```bash
git add supabase/migrations/0009_actor_profiles.sql tests/db
git commit -m "feat: the database refuses a page missing a required block

block_kinds_present walks children only, so a crafted key cannot satisfy the
rule. The required set depends on actors.kind. A required block inside a
collapsed accordion is accepted — a test asserts that hole is open, on
purpose.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 8: The save boundary and the editor

**Files:**

- Modify: `apps/hub/src/features/actors/infrastructure/fursona-arrangement.ts:227`
- Modify: `apps/hub/src/features/actors/application/use-fursona-editor.ts`
- Modify: `apps/hub/src/features/actors/presentation/block-card.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Test: `apps/hub/tests/` editor suites

- [ ] **Step 1: Write the failing tests**

The save boundary rejects a tree missing a required kind **before** calling the
RPC — assert the RPC was not called, not merely that an error surfaced. A test
that only checks for an error passes whether the check is local or the server
refused it, which is the two-orderings-look-identical trap.

The editor's remove control is disabled on the **last** copy of a required kind
and enabled on a second copy.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/hub && pnpm test`
Expected: FAIL.

- [ ] **Step 3: Add the check at the save boundary**

In `fursona-arrangement.ts`, before `call(client, "set_actor_sections", …)`,
run `missingRequiredKinds(blocks, kind)` and throw a typed error naming them.
The function needs the actor kind; thread it from the caller rather than
inferring it from the blocks.

- [ ] **Step 4: Disable the editor's remove control**

In `block-card.tsx`, the remove control is disabled when the block is a leaf of
a required kind **and** `missingRequiredKinds` on the tree-without-it is
non-empty. Compute it that way rather than counting copies by hand: it is the
same predicate the database uses, so the two cannot disagree.

Give it a title explaining why, from the catalogue, in both languages.

- [ ] **Step 5: Add the message keys**

Both catalogues, same keys. `messages.test.ts` compares them key by key and a
name absent from both leaves them equal, so add to `en.json` and `es.json` in
the same edit and run that suite.

- [ ] **Step 6: Run to verify they pass, and restart the dev server**

Run: `cd apps/hub && pnpm test`, then `pnpm test messages`.
If you are checking anything in a browser, **restart `next dev` first** — a
server started before the catalogues changed serves the old modules forever,
and the failure looks exactly like a bad commit.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src apps/hub/tests
git commit -m "feat: the save boundary and the editor enforce required blocks

The save refuses without a round trip and names every missing kind; the
editor will not remove the last copy of one. Both ask the same predicate the
database asks, so the three layers cannot disagree.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 5 — The page measure

### Task 9: `measure` on the theme, and the full-width shell

**Files:**

- Modify: `apps/hub/src/features/actors/domain/actor-theme.ts:146+` and `:487-514`
- Modify: `apps/hub/src/shared/presentation/page-shell.tsx:75-82`
- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx` (`PublicBlocks`)
- Modify: both public routes
- Modify: `apps/hub/src/features/actors/presentation/theme-configurator.tsx`
- Test: `apps/hub/tests/` theme suites; `apps/hub/tests/e2e/page-furniture.spec.ts`

**Interfaces:**

- Produces:

  ```ts
  export const PAGE_MEASURES = [
    "narrow",
    "medium",
    "wide",
    "wider",
    "widest",
    "full",
  ] as const;
  export type PageMeasure = (typeof PAGE_MEASURES)[number];
  // ActorTheme gains: measure: PageMeasure | null
  ```

- [ ] **Step 1: Write the failing unit tests**

Assert the class emitted for each of the six stops, **compared verbatim**. This
is the assertion that actually pins the mechanism: a browser test at a chosen
viewport width cannot tell `wider` from `widest` unless the window happens to
sit between them, which is rule 29's measured lesson from the weighted-places
branch. Also assert that a `null` measure emits exactly what an untouched page
emits today.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/hub && pnpm test actor-theme`
Expected: FAIL.

- [ ] **Step 3: Add the field**

`PAGE_MEASURES` and `PageMeasure` in `actor-theme.ts`, `measure: PageMeasure | null`
on `ActorTheme` with TSDoc saying null means the design's own — consistent with
every other nullable field there — and `measure: z.enum(PAGE_MEASURES).nullable()`
on `themeSchema`. Follow how `skin` and `backgroundFit` are parsed and defaulted;
`parseTheme` must fall back per field rather than throwing.

- [ ] **Step 4: Add the shell variant**

`PageShellProps.width` gains `"full"`: no `max-w`, no `mx-auto`, no horizontal
padding on `main`. Do **not** change the `"column"` or `"wide"` branches — the
signed-in pages depend on them.

- [ ] **Step 5: Apply the measure per section in `PublicBlocks`**

The public routes ask for `width="full"`. `PublicBlocks` takes the measure and
wraps each top-level seat in a div carrying `mx-auto w-full`, the measure's
class, and the page padding (`px-4 sm:px-6`, matching what the shell used to
apply). `full` emits no `max-w` class at all.

- [ ] **Step 6: Add the control**

In `theme-configurator.tsx`, a select over `PAGE_MEASURES` beside the skin
picker, with labels from the catalogue in both languages. It writes through the
same live-preview path every other theme control uses, so the preview cannot
drift from the result.

- [ ] **Step 7: Run to verify they pass**

Run: `cd apps/hub && pnpm test`, then `pnpm test messages`, then `pnpm lint` from the root.

- [ ] **Step 8: Sabotage-verify, choosing a break that can be seen**

Swap the classes for `wide` and `wider`.
Expected: RED on the verbatim class assertions. A browser test at 1280px would
**not** catch this reliably, which is the point of asserting the string.

- [ ] **Step 9: Measure in a browser, and take the numbers from the browser**

Add the measure cases to `apps/hub/tests/e2e/page-furniture.spec.ts`. Read the
rendered `main` and section widths at several viewports.

Do not compute the expected widths from the enum's rem values: the
weighted-places branch measured container-query thresholds 32–48px larger than
the arithmetic predicted, because the page's padding sits outside the measured
box. Read what the browser reports and assert against that.

- [ ] **Step 10: Commit**

```bash
git add apps/hub/src apps/hub/tests
git commit -m "feat: a page chooses its own measure

Six named stops on the theme, defaulting to today's 1280px. The public route
takes a full-width main and PublicBlocks applies the measure per section,
which is what Phase 6's bleed needs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 6 — Bleed

### Task 10: A depth-0 section that runs to both edges

**Files:**

- Modify: `apps/hub/src/features/actors/domain/block-schema.ts` (`blockStyleShape`, `BLOCK_STYLE_LIMITS`)
- Modify: `supabase/migrations/0009_actor_profiles.sql` (`validate_block`'s style block; the column comment)
- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx` (`PublicBlocks`)
- Modify: `apps/hub/src/features/actors/presentation/section-style-popup.tsx`
- Test: `apps/hub/tests/e2e/page-furniture.spec.ts`; block-schema suites

- [ ] **Step 1: Write the failing tests**

The style key parses and round-trips; a bled section's rendered width equals the
viewport width and an unbled sibling's does not.

Excludes: a fixture whose page measure is already `full`, where bled and unbled
are the same width and the assertion cannot fail. Set the page to `wider` and
put both kinds of section on it.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/hub && pnpm test block-schema`
Expected: FAIL.

- [ ] **Step 3: Add the style key**

`bleed: z.boolean().optional()` in `blockStyleShape`, with TSDoc saying it is
meaningful at depth 0 only and that absence means the page's measure — matching
how the rest of the bag reads.

- [ ] **Step 4: Add it to `validate_block` and the column comment**

The style block in `validate_block` validates each key; add `bleed` as a
boolean. Update the `actor_profiles.sections` column comment, which is the
readable index of the model — a stale one here is the exact failure `0009`'s
own history records.

- [ ] **Step 5: Apply it in `PublicBlocks`**

A top-level seat whose `style.bleed` is true gets no `mx-auto`, no measure
class and no horizontal padding. Read it only at depth 0; a nested block's
`bleed` is ignored, and the TSDoc says so.

Do **not** implement this with `w-screen` and a negative margin. `100vw`
includes the scrollbar and the centred column does not, so the page gains a
horizontal scrollbar as soon as it is tall enough to need a vertical one. The
full-width `main` from Phase 5 is what makes the honest version possible.

- [ ] **Step 6: Add the control**

A toggle in `section-style-popup.tsx`, shown only for a depth-0 container — a
control offered where it does nothing is the failure this repo keeps catching.

- [ ] **Step 7: Run everything, apply `0009` to live, check drift**

Run: `cd apps/hub && pnpm test`, `pnpm lint` from the root, hand-apply the
changed `validate_block` and the `comment on column`, then `pnpm check:schema-drift`.

- [ ] **Step 8: Sabotage-verify with a scrollbar present**

Implement the `w-screen` version deliberately, on a page long enough to need a
vertical scrollbar, and confirm the horizontal scrollbar appears. Restore the
correct version and confirm it does not. This is the one measurement that
justifies the refusal in the spec rather than leaving it an argument.

- [ ] **Step 9: Commit**

```bash
git add apps/hub/src supabase/migrations/0009_actor_profiles.sql apps/hub/tests
git commit -m "feat: a section may run to both edges

A depth-0 style key. Implemented by giving the public route a full-width main
and applying the measure per section, not by breaking out with w-screen —
measured: the vw version gains a horizontal scrollbar the moment the page is
tall enough to need a vertical one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 7 — The theme selector moves into the bar

### Task 11: The palette button, and the question mark deleted

**Files:**

- Modify: `apps/hub/src/shared/presentation/page-theme-switch.tsx`
- Modify: `apps/hub/src/shared/presentation/theme-toggle.tsx`
- Modify: `apps/hub/src/shared/presentation/page-shell.tsx`
- Modify: both public routes
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Test: `apps/hub/tests/e2e/page-furniture.spec.ts`; `apps/hub/tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Write the failing tests**

On a themed public page: the palette button exists in the bar, is pressed, and
the light/dark toggle shows a sun or a moon and **not** a question mark.
Pressing the light/dark toggle while themed changes the visible background —
this is the assertion that catches a press doing nothing, and it must compare
against the colour before the press rather than merely asserting a class.

On a signed-in page: no palette button.

- [ ] **Step 2: Run to verify they fail**

Run: source `apps/hub/.env.local`, then the e2e specs.
Expected: FAIL.

- [ ] **Step 3: Reshape `PageThemeSwitch` into the palette button**

One button, `aria-pressed`, the palette icon. Pressing it toggles
`data-page-theme` between absent and `"default"`. Keep `getServerSnapshot`
returning the author's theme so the server render matches the pre-paint script
and nothing mismatches on hydration.

- [ ] **Step 4: Delete the question mark**

In `theme-toggle.tsx`, remove `wearingAuthorTheme`, the `authorLabel` prop's
question-mark branch and the icon. Keep the `PAGE_THEME_ATTRIBUTE` entry in
`subscribe`'s `attributeFilter` **only if** something still depends on it;
if nothing does, remove it and say so.

The toggle now writes both attributes when pressed — setting `data-theme` and
clearing `data-page-theme` — which is what `PageThemeSwitch` already did when a
default was chosen. Reuse that code path rather than writing a second one.

- [ ] **Step 5: Render it from the shell**

`PageShellProps.themed` keeps its name and changes its job: it now decides
whether the palette button renders. Rewrite its TSDoc — `check:docs` will fail
otherwise, and this is precisely the "the code moved and the comment did not"
case it exists for.

- [ ] **Step 6: Move the message keys**

The four `publicProfile.pageTheme*` keys move into `controls`;
`controls.authorTheme` changes meaning to the palette button's accessible name.
Both catalogues, same edit, then run `pnpm test messages`. Run `pnpm knip` to
catch anything left referencing the old keys.

- [ ] **Step 7: Move the test id**

`public-theme-switch` moves out of `public-profile.tsx` into the shell. Find
every selector with `grep -rn 'public-theme-switch' apps/hub`.

- [ ] **Step 8: Run everything**

Run: `cd apps/hub && pnpm test`, `pnpm test messages`, `pnpm check:docs`,
`pnpm lint` from the root, `pnpm build`, then source `.env.local` and run the
e2e suite including `a11y.spec.ts`.

- [ ] **Step 9: Sabotage-verify the press**

Make the light/dark toggle write only `data-theme`, leaving the author's theme
on.
Expected: RED on the "pressing changes the visible background" case. Restore.
A test asserting only that the attribute changed would stay green, which is why
the assertion is on the rendered colour.

- [ ] **Step 10: Commit**

```bash
git add apps/hub/src apps/hub/tests
git commit -m "feat: the theme switch moves into the bar

A palette button beside the light/dark toggle, which keeps its sun and moon
on every page. Pressing either always changes something visible. Nothing the
app owns now renders inside SKIN_SCOPE on a public page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Closing the branch

- [ ] **Grep the suites for this phase's own names.** Rule 21: a dormant guard whose restore condition has arrived is a check that has quietly stopped existing and looks exactly like one that is passing. `grep -rn 'skip\|todo' apps/hub/tests | grep -i 'header\|measure\|theme\|fursona'`.
- [ ] **Grep for stale pointers.** The feature note, `docs/integrating.md`, and any TSDoc describing the welded header. A note recording something as unfixed must be deleted by whoever fixes it.
- [ ] **Update `apps/hub/src/features/actors/CLAUDE.md`** — the leaf-kind table, the "two public pages" section's description of the shared renderer, and a new section on the identity leaves and the accepted accountability hole.
- [ ] **Update the root `CLAUDE.md`** current-state list with a bullet for this work.
- [ ] **Mark the spec delivered** with a banner recording what the implementation settled and where it disagreed with the plan.
- [ ] **Confirm the base:** `git log --oneline origin/main..HEAD` lists only this branch's commits.
- [ ] **Run the full gate:** `pnpm test`, `pnpm test:db`, `pnpm lint`, `pnpm check:docs`, `pnpm check:schema-drift`, `pnpm build`, and the e2e suite with `.env.local` sourced.

---

## Self-review notes

**Spec coverage.** Every section of the spec maps to a task: the five kinds → Tasks 3–4; the owner privacy gate → Task 2; mandatory-in-three-places → Tasks 7–8; `PageContext` → Task 1; the measure → Task 9; bleed → Task 10; the theme selector → Task 11; the shim and the templates and `PublicProfile`'s dissolution → Tasks 5–6.

**Two things the plan does not settle, deliberately.** The empty state's fate after the shim guarantees three blocks (Task 6, Step 4) is a genuine ruling the implementer has to make and write down — both answers are defensible and the wrong move is to leave it ambiguous. And `LeafFields` may have no title flag, in which case `NONE` and `TITLE_ONLY` collapse (Task 3, Step 6); the instruction is to report which was found rather than to guess now.

**The riskiest task is 6**, because it deletes chrome that existing assertions test. Expect to rewrite tests rather than delete them, and expect the visual diff.
