# Fursona studio, phase 5 — the public pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `me.furrycolombia.com/es/42` shows a person's profile and `…/es/42/luna` shows one of their fursonas — to anybody, signed in or not — and both show nothing at all when the actor is private, suspended, deleted, or owned by a suspended person.

**Architecture:** Addressing moves from "a globally unique handle" to "a person address plus a per-owner handle". Four migrations lay that down — the address relation, the handle re-indexing, generalising profiles from fursonas to actors, and two `security definer` read functions granted to `anon`. The app then renders both pages from one component through one anonymous client.

**Tech Stack:** Postgres 17 (partial unique indexes, `security definer`), Next 16 server components, next-intl, `@aeleos/identity`, Vitest, `tests/db/` conformance, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md` (phase 5), and **`apps/hub/src/features/actors/CLAUDE.md`, which is authoritative for addressing** and was written after that spec. Where the two disagree, the feature note wins.

**Supersedes:** this plan's first draft, which used `/@handle` and globally unique handles. `tests/db/public-fursona.test.ts` was written against that draft and is rewritten in task 4 rather than kept.

## Global Constraints

- **Budget is $0.**
- **100% statements, branches, functions and lines** in `apps/hub`.
- **Every export carries TSDoc stating the contract**; `pnpm check:docs` gates it.
- **Every bug found gets a regression test**, sabotage-verified against the original fault.
- **Both catalogues, always**, Spanish differing from English. Write properly accented Spanish: the dictionary rejects unaccented forms and also lacks enclitic verb forms, so rephrase rather than fight it. A file containing Spanish needs a `cspell.json` override, added when the file is created.
- **The red/green cycle for migrations runs in CI**, roughly four minutes a turn. `pnpm test:db` begins with `supabase db reset`, which against the live project would destroy it — never run it locally.
- **Every migration is applied to the live database by hand and verified by querying it**, never by trusting the CLI's exit code. It prints Docker credential noise while succeeding.
- **Migrations are append-only, and the base was consolidated on 2026-08-13.** `0001`–`0010` are the whole schema, **every object defined exactly once**. Keep that property: put a new object in a new file, and when replacing one, the file name already tells you where it lives. `0011` is the next free number.
- **No `@param props`** on a destructured component; `@returns` alone.
- **Do not commit unless a step says to.**

## What changes, in one table

| Before                                     | After                                               |
| ------------------------------------------ | --------------------------------------------------- |
| `unique (lower(handle))` across all actors | partial: global for persons, per-owner for fursonas |
| a fursona is addressed by handle alone     | `/{person_address}/{handle}`                        |
| a person has no public page                | `/{person_address}` is their profile                |
| `fursona_profiles`                         | `actor_profiles` — a person writes sections too     |
| nothing is readable by `anon`              | two `security definer` functions, and only those    |

## Decisions inherited from the feature note

Read `apps/hub/src/features/actors/CLAUDE.md` in full before starting. These are the ones that shape the code below, restated only so a task can be checked against them:

1. **One namespace for addresses.** A vanity may be a number, so a unique constraint per form would let person #500 take the vanity `7` while person #7 exists. One relation, one unique index.
2. **The number is permanent; the vanity is additional.** Both resolve forever. Prefer the vanity when rendering a link and make it canonical; never stop serving the number.
3. **A profile lists only `public` fursonas.** Never unlisted. "List the fursonas they own" is the natural, wrong implementation, and it destroys what `unlisted` means.
4. **A suspension travels to every public page**, the person's own included. `actors_public` already hides a suspended _fursona_ from strangers; a fursona whose _owner_ is suspended is still `active` itself, so this rule exists nowhere today.
5. **Everything hidden answers 404, identically**, and the 404 names nothing.
6. **For a person's own words, English is the fallback.** The chrome falls back to Spanish; content cannot, because `_en` is the required field and `_es` the optional one.

---

### Task 0: Branch

Already cut: `feat/studio-phase-5-public-page`, carrying three documentation commits and the superseded conformance file.

- [ ] **Step 1: Confirm the base**

```bash
git log --oneline origin/main..HEAD
```

Expected: only the `docs(hub):` commits.

---

### Task 1: `0011` — person addresses

**Files:**

- Create: `supabase/migrations/0011_person_addresses.sql`
- Test: `tests/db/person-addresses.test.ts`

**Interfaces:**

- Produces: `public.person_addresses (address text, actor_ref uuid, kind text, created_at timestamptz)`, and `ensure_person_actor()` writing a `number` row.

- [ ] **Step 1: Write the failing conformance tests**

- provisioning a person creates exactly one `kind = 'number'` row for them;
- two people get different numbers;
- calling `ensure_person_actor()` twice creates no second address — it is idempotent today and must stay so;
- **uniqueness is case-insensitive and spans both kinds**: with a `number` row `7` present, a `vanity` row `7` for anybody fails, and `Luna` fails when `luna` exists. Decision 1, and the most important assertion in the file;
- a person may hold at most one `number` row;
- the format check rejects `Luna`, `-luna`, `lu na`, `""` and a 33-character value; it accepts `luna`, `luna-wolf`, `luna_wolf`, `7`, and a 32-character value;
- `anon` and `authenticated` can neither select, insert nor update the table — every read goes through task 4's functions, every write is `service_role`;
- deleting a person cascades their addresses away.

- [ ] **Step 2: Push and watch `conformance` fail**

```bash
git add tests/db/person-addresses.test.ts && git commit && git push
gh run watch
```

Expected: `relation "public.person_addresses" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- 0011 — a person's public address, in one namespace.

create sequence public.person_number_seq as bigint start 1;

create table public.person_addresses (
  address    text primary key
               check (address ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  actor_ref  uuid not null references public.actors (actor_ref)
               on delete cascade,
  kind       text not null check (kind in ('number', 'vanity')),
  created_at timestamptz not null default now()
);

-- ONE namespace across both kinds. A vanity may BE a number, so a unique
-- constraint per kind — or per column, had these been two columns on `actors` —
-- would let person #500 take the vanity `7` while person #7 already exists, and
-- /7/luna would then address two different people. Two constraints look correct
-- here and are not.
create unique index person_addresses_lower_idx
  on public.person_addresses (lower(address));

-- At most one number each. A person's number is permanent, so a second would be
-- a second permanent address with no rule saying which one is theirs.
create unique index person_addresses_one_number_idx
  on public.person_addresses (actor_ref) where kind = 'number';

create index person_addresses_actor_idx on public.person_addresses (actor_ref);

-- Client roles get NOTHING. Reads go through 0014's functions, which answer with
-- one row for an address the caller already has; a direct select would hand anon
-- an enumerator over every person on the platform.
revoke all on public.person_addresses from public, anon, authenticated;
grant select, insert, update, delete on public.person_addresses to service_role;
```

Then `create or replace function public.ensure_person_actor()` — `0006_provisioning.sql`'s body unchanged except that after the `insert … on conflict do nothing` it inserts the number address, itself `on conflict do nothing` so the function stays idempotent. Restate the whole function; `create or replace function` replaces it whole.

The comment must say **why an address is not a column on `actors`**: a vanity is a second address for the same person, and a column cannot hold two values without becoming a list that nothing can index uniquely.

- [ ] **Step 4: Push, watch `conformance` go green, apply to live, verify by querying**

```bash
supabase db push
```

```sql
select address, kind from public.person_addresses limit 5;
select relname, relacl from pg_class where relname = 'person_addresses';
```

- [ ] **Step 5: Commit**

---

### Task 2: `0012` — handles become unique per owner

**Files:**

- Create: `supabase/migrations/0012_per_owner_handles.sql`
- Test: `tests/db/per-owner-handles.test.ts`
- Modify: `docs/integrating.md`

- [ ] **Step 1: Write the failing conformance tests**

- two different people may each own a fursona called `luna`;
- one person may not own two called `luna`, nor `Luna` and `luna`;
- **two persons may still not share a handle** — the assertion that catches the NULL trap below, and it must exist;
- `create_fursona` refuses a duplicate of the caller's own and succeeds where the clash is a stranger's;
- the refusal no longer asserts anything about other people's accounts.

- [ ] **Step 2: Push and watch it fail**

- [ ] **Step 3: Write the migration**

```sql
-- 0012 — a fursona handle is unique per owner; a person handle stays global.

drop index if exists public.actors_handle_lower_idx;

-- TWO PARTIAL INDEXES, not one composite. A person has owner_ref IS NULL, and
-- Postgres treats NULLs as distinct in a unique index by default — so
-- `unique (owner_ref, lower(handle))` alone would silently allow two people to
-- share a person handle. Postgres 17 has `nulls not distinct`, but a modifier
-- somebody has to notice is worse than two indexes that say what they mean.
create unique index actors_person_handle_idx
  on public.actors (lower(handle)) where kind = 'person';

create unique index actors_fursona_handle_idx
  on public.actors (owner_ref, lower(handle)) where kind = 'fursona';
```

Then `create or replace function public.create_fursona(...)` — `0007_fursona_self_service.sql`'s body unchanged except:

- the conflict test is scoped to `owner_ref = v_person`;
- the raised message stops asserting anything about a stranger's account;
- **the quota comment is corrected.** It currently justifies itself with "every row permanently consumes a handle from a GLOBAL unique namespace, and nothing reclaims them". That has stopped being true. **The quota stays** — it is the free-tier abuse bound and it also counts suspended and deleted rows so a sanction cannot be evaded — but the comment must stop claiming a reason that no longer holds.

- [ ] **Step 4: Push, green, apply to live, verify**

```sql
select indexname from pg_indexes
 where tablename = 'actors' and indexname like '%handle%';
```

- [ ] **Step 5: Say it in `docs/integrating.md`**

One paragraph: **a handle is unique per person, not globally.** The contract already tells apps to key off `actor_ref` and never the handle, so nothing breaks — but an app that quietly used `handle` as a key would begin colliding across users, silently, in a different repository. State it rather than trusting the existing sentence to be read that way.

- [ ] **Step 6: Commit**

---

### Task 3: `0013` — profiles belong to actors, not fursonas

**Files:**

- Create: `supabase/migrations/0013_actor_profiles.sql`
- Test: `tests/db/actor-profiles.test.ts`

- [ ] **Step 1: Write the failing conformance tests**

- a **person** may write their own sections and read them back — the capability that does not exist today;
- a person may not write somebody else's;
- everything `fursona-profiles.test.ts` and `fursona-sections.test.ts` assert still holds for fursonas;
- `owns_active_fursona` keeps working for its fursona-only callers — ordering and pinning stay fursona concepts, because a person has nothing to be ordered among.

- [ ] **Step 2: Push and watch it fail**

- [ ] **Step 3: Write the migration**

`alter table public.fursona_profiles rename to actor_profiles;`, then restate every policy, function and grant that named it. Add `owns_active_actor(uuid)` — `owns_active_fursona` without the `kind = 'fursona'` test — and repoint the profile policies at it, leaving `owns_active_fursona` for `set_fursona_order` and `set_fursona_featured`.

`set_fursona_sections` becomes `set_actor_sections`, keeping a thin `set_fursona_sections` that calls it so the app does not break in the same commit as the schema. **The shim is removed in task 6, not here** — and removing it is a step in that task, not a hope.

- [ ] **Step 4: Push, green, apply to live, verify**

- [ ] **Step 5: Commit**

---

### Task 4: `0014` — the anonymous read surface

**Files:**

- Create: `supabase/migrations/0014_public_actor_reads.sql`
- Rewrite: `tests/db/public-fursona.test.ts`
- Create: `tests/db/public-person.test.ts`

**Interfaces:**

- `public.public_person(p_address text)` → `(handle, display_name, avatar_url, address, listed, sections, fursonas jsonb)`
- `public.public_fursona(p_address text, p_handle text)` → `(handle, display_name, avatar_url, owner_address, listed, sections)`

Both granted to `anon`. **These are the first functions in the schema granted to `anon`.** `0010_client_grants.sql` is the complete client surface and `anon` appears nowhere in it, so this must arrive as a visible edit to that file — the migration must say so where somebody will read it.

- [ ] **Step 1: Rewrite `public-fursona.test.ts`, write `public-person.test.ts`**

The existing file's _rules_ survive; its _signature_ does not. Keep every hiding assertion and add the addressing ones.

For both — resolves by **number** and by **vanity**, identically; case-insensitive; hides private, suspended, deleted and owner-suspended; zero rows for an unknown address; exactly the named columns and never `identity_sub`, `owner_ref`, raw `visibility` or raw `status`; `anon` may execute it while `my_actors()` and `actors_public` stay denied.

For `public_fursona` — the handle resolves **within that person only**, so two people's `luna` return different rows for the same handle, and a handle belonging to a different person than the address returns nothing.

For `public_person` — **`fursonas` contains only `public` ones.** Seed one public, one unlisted, one private, one suspended and one deleted, and assert the array holds exactly the public one. Decision 3; the assertion the natural implementation fails; write it before the function exists.

- [ ] **Step 2: Push and watch both fail**

- [ ] **Step 3: Write the migration**

Both functions resolve the address through `person_addresses`, so `number` and `vanity` need no separate code path. `public_person` aggregates with `jsonb_agg` over the same visibility filter the fursona function applies to a single row — write that filter so it reads identically in both places, because two copies of a visibility rule is how one of them drifts.

Return `address` (the canonical one: the vanity if there is one, else the number) so the page can emit `rel="canonical"` without a second query.

- [ ] **Step 4: Push, green, apply to live, verify**

- [ ] **Step 5: Commit**

---

### Task 5: Reading it from the app

**Files:**

- Create: `apps/hub/src/features/actors/infrastructure/public-actors.ts`
- Create: `apps/hub/src/features/actors/domain/actor-content.ts`
- Test: `apps/hub/tests/public-actors.test.ts`, `apps/hub/tests/actor-content.test.ts`

- [ ] **Step 1: Write the failing tests**

`contentFor` (decision 6): returns the locale's field; falls back to English when the locale's is empty **and** when it is absent; returns `""` when both are missing; **never** falls back the other way, because `_en` is the required one.

`readPublicPerson` / `readPublicFursona`: call their functions; return `undefined` for no rows; parse `sections` through `sectionsSchema` and yield `[]` rather than throwing when a stored value fails it, so a page written before a schema change still renders its header.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

The client is `createIdentityClient({ getToken: async () => null, … })`. Not a workaround: `GetToken`'s own documentation says a null token authenticates as `anon`, and this is the first caller that wants exactly that. Say so in the TSDoc, because everywhere else in this app a null token would be a bug.

- [ ] **Step 4: Green, then commit**

---

### Task 6: The renderers

**Files:**

- Create: `apps/hub/src/features/actors/presentation/public-sections.tsx`
- Create: `apps/hub/src/features/actors/presentation/public-profile.tsx`
- Create: `apps/hub/src/features/actors/presentation/fursona-card-list.tsx`
- Modify: `apps/hub/src/features/actors/infrastructure/fursona-arrangement.ts` — call `set_actor_sections`
- Test: one suite each

- [ ] **Step 1: Write the failing tests**

- each layout renders what its editor offered: `cards` shows icons, `gallery` shows images with the item title as `alt` and **skips items with no address** rather than rendering a broken one, `accordion` is `<details>`/`<summary>`, `two-column` is title and description;
- an `icon` that is not a lucide name renders the card **without** an icon rather than failing — the same rule `IconPicker` has, needing its own test here because this component does not use that one;
- every layout picks the locale's language and falls back to English;
- `PublicProfile` renders header and sections with no fursona list when given none, and with one when given some;
- an actor with no sections renders its header and no empty scaffolding.

- [ ] **Step 2: Fail, implement, pass**

`accordion` as `<details>` is deliberate: this is the one page a stranger might reach on a hostile network or an old browser, and a disclosure widget needing no script is free.

- [ ] **Step 3: Drop `0013`'s shim**

Once nothing calls `set_fursona_sections`, remove it in a follow-up migration. Grep for the name first; a shim nobody deleted is a second definition of the same rule.

- [ ] **Step 4: Commit**

---

### Task 7: The two routes

**Files:**

- Create: `apps/hub/src/app/[locale]/[person]/page.tsx`
- Create: `apps/hub/src/app/[locale]/[person]/[handle]/page.tsx`
- Modify: `apps/hub/src/features/session/infrastructure/public-routes.ts`
- Test: `apps/hub/tests/public-person-route.test.tsx`, `apps/hub/tests/public-fursona-route.test.tsx`, `apps/hub/tests/public-routes.test.ts`

- [ ] **Step 1: Write the failing tests**

- `/es/42` renders the profile; `/es/42/luna` renders the fursona;
- an address or handle the reader does not return calls `notFound()`;
- `generateMetadata` titles each page and sets `robots: index false` when `listed` is false;
- **`generateMetadata` for something not returned names nothing** — no address in the title, no description. A 404's metadata is the leak nobody looks for;
- it emits `alternates.canonical` pointing at the canonical address;
- in `public-routes.test.ts`: both shapes are public for every locale, and `/me`, `/es/fursonas`, `/es/picker` are still **not**.

- [ ] **Step 2: Fail, implement, pass**

`PUBLIC_ROUTES` needs patterns for one and two segments under a locale. **Mind the boundary lesson that file already records** — `/sign-in(.*)` also matching `/sign-in-admin`. A bare `` `/${locale}/(.*)` `` would make _every_ page public, `/es/fursonas` included, so the entry must match a person segment and stop. The assertion that a protected route stays protected is the whole safety net here; do not skip it because the happy path passes.

- [ ] **Step 3: Commit**

---

### Task 8: Browser proof, catalogues, and the whole gate

**Files:**

- Create: `apps/hub/tests/e2e/public-pages.spec.ts`
- Modify: both catalogues; `cspell.json` as needed

- [ ] **Step 1: Write the end-to-end test**

**This is the first part of the studio work a browser can reach.** Phases 1–4 render only for a signed-in person, and driving a real social login is outside our control.

Two facts, neither needing a seeded row:

- `/es/nobody-has-this` and `/es/nobody-has-this/luna` both answer **200 with the not-found page** and **do not redirect to sign-in**. That proves the whole public path at once: the proxy let it through, the locale middleware ran, the page rendered, and the anon client reached the database and got nothing.
- The not-found page **contains no part of the address**, asserted where a real browser can see the rendered text.

Say plainly in the test's own comment what is still unproven: **no end-to-end test renders a real page**, because no fursona row exists in the live database and seeding one from the e2e job is a larger change than this phase. Tasks 1–4 prove the rules against a real Postgres; nothing yet proves the two halves meet.

- [ ] **Step 2: Both catalogues**, Spanish differing and accented.

- [ ] **Step 3: Run the whole gate**

```bash
pnpm --filter hub test:coverage
pnpm --filter hub typecheck
pnpm --filter hub build
pnpm lint
pnpm check:docs
pnpm check:tools
pnpm check:contrast
pnpm --filter hub test:e2e
```

Coverage still 100% on all four metrics.

- [ ] **Step 4: Mark the pull request ready**

The body must say three things plainly: this phase **closes a hole that is live today** (decision 4 — a suspended person's public pages would keep serving); it **replaces the unique index on `lower(handle)` that `actors` has carried from the beginning**; and **no end-to-end test renders a real actor's page**.

---

## What this phase does not do

- **No image upload.** `image_url` is still a typed address. Phase 6 is Supabase Storage, and must decide what happens to an image when an actor is soft-deleted.
- **No admin surface for vanities.** They are granted with `service_role` by hand. A page for it is worth building when there is somebody to grant one to.
- **No discovery.** There is no directory of public actors, and `public_person` takes an address precisely so that it cannot be walked.
- **No rename of a fursona handle.** Still permanent. If it is ever added, the old handle is retired to the same fursona rather than freed.
