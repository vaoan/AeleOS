# Fursona studio, phase 3 — the section content model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a fursona composable, bilingual content — the sections the editor will edit in phase 4 and the public page will render in phase 5 — with a shape the database refuses to hold wrong.

**Architecture:** One migration, `0013`. `fursona_profiles` gains `sections jsonb`, and a security-definer `set_fursona_sections` validates the whole structure before it lands. Validation in the function rather than a check constraint, because the errors have to be legible and the ownership rule already lives in `owns_active_fursona`.

**Tech Stack:** Postgres 15 (Supabase), plpgsql, RLS, Vitest against a real database (`tests/db/`).

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md` — Decision 2, "The section shape".

## Global Constraints

- **Budget is $0.** This is the phase where an unbounded column could quietly become a bill: see Task 2.
- **Migrations are append-only.** `0001`–`0012` are applied to the live database. `0013` is a new file.
- **`actors` gains no column** and **`/api/actors/mine` gains no field.** Sections are the hub's own content and must not enter the cross-app contract.
- **Every security-definer function follows revoke-then-grant**, and raises the same opaque `fursona not found` for a row that is missing, someone else's, or inactive.
- **Every rule gets a conformance test**, watched red before the migration that satisfies it.
- **The red/green cycle runs in CI.** `pnpm test:db` starts with `supabase db reset` against a local Postgres this environment does not have, and pointing it at the live project would destroy it. Push the failing test, watch `conformance` go red, push the migration, watch it go green. About four minutes a cycle; the red commits are the evidence.
- **Do not commit unless a step says to.**

## The shape, and why it is Libra's exactly

```
section: { name_en, name_es, type, sort_order, items[] }
item:    { title_en, title_es, description_en, description_es,
           icon?, image_url?, sort_order }
type:    cards | accordion | two-column | gallery
```

Adopted unchanged from Libra's `products.sections`. Divergence here is precisely what would make a future port stop being mechanical, which is the whole reason Decision 1 chose the heavier client stack.

**This is not next-intl.** next-intl translates the app's own chrome from catalogues the repository owns. These are a person's own words about their own character, stored as data. A missing `title_es` is somebody who has not written one yet — it must never fail a build, never fall back to a catalogue, and never be filled in by anybody but its author.

## RLS: there is nothing new to write

The spec says this phase ships "sections and its RLS", which is easy to read as a new policy. It is not. `sections` is a **column on `fursona_profiles`**, and `0012` already put three policies on that table resolving ownership through `owns_active_fursona`. A new column inherits them.

So the RLS work here is to **prove the inheritance rather than add to it**: a test that somebody else cannot read or write another person's sections, failing for the same reason it fails for `sort_order`. If a task in this phase finds itself writing `create policy`, something has been misunderstood — check whether the column landed on the right table first.

## How to read the tasks

Phase 2a's plan gave its SQL verbatim and that went well. This one gives the **rules** verbatim — every assertion the tests must make, every validation the function must perform — and leaves the plpgsql to the implementer.

That is a deliberate difference, not a lapse. The validation here is a dozen near-identical shape checks over a `jsonb` tree, and spelling each one out would produce a plan longer than the migration while pinning nothing the enumerated rules do not already pin. The tests are the contract; the SQL is whatever satisfies them. If a rule below turns out to be ambiguous when somebody writes it, the rule is what should change.

---

## File Structure

| File                                            | Responsibility                                                 |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `supabase/migrations/0013_fursona_sections.sql` | The `sections` column, its limits, and `set_fursona_sections`. |
| `tests/db/fursona-sections.test.ts`             | The shape it accepts, everything it refuses, and the limits.   |

---

### Task 0: Branch and open a draft pull request

- [ ] **Step 1: Cut from `origin/main` and confirm the base**

```bash
git fetch origin
git checkout -b feat/studio-phase-3-sections origin/main
git log --oneline origin/main..HEAD
```

Expected: no output.

- [ ] **Step 2: Open the draft, so the CI cycle has somewhere to run**

```bash
git commit --allow-empty -m "chore: open phase 3"
git push -u origin feat/studio-phase-3-sections
gh pr create --base main --draft \
  --title "feat(db): studio port phase 3 — the section content model" \
  --body "Draft. Red intermediate commits are the CI-based red/green cycle; see the plan."
```

---

### Task 1: The column, and a validated write

**Files:**

- Create: `tests/db/fursona-sections.test.ts`
- Create: `supabase/migrations/0013_fursona_sections.sql`

**Interfaces:**

- Consumes: `public.owns_active_fursona(uuid)` and `public.fursona_profiles` (both `0012`).
- Produces: `public.fursona_profiles.sections jsonb not null default '[]'`, and `public.set_fursona_sections(p_actor_ref uuid, p_sections jsonb) returns void`.

- [ ] **Step 1: Write the failing test**

Create `tests/db/fursona-sections.test.ts`. Seed with the same idiom as `tests/db/fursona-profiles.test.ts`. Assert, at minimum:

1. An owner writes a well-formed sections array and reads it back unchanged.
2. Writing replaces rather than appends — a second write of one section leaves one section.
3. A fursona with no profile row gets one on first write (the functions upsert, as `0012`'s do).
4. Somebody else's fursona raises `fursona not found`, with a message naming neither owner nor reason.
5. A section whose `type` is not one of the four is refused.
6. A section that is not an object, and a `sections` that is not an array, are refused.
7. A missing `name_en` is refused; a **missing `name_es` is accepted**, because a person may not have written the Spanish yet.
8. `sections` defaults to `[]` for a profile row created by `set_fursona_order`, so phase 2b's rows are valid without migration.

- [ ] **Step 2: Commit, push, watch `conformance` go red**

Confirm from the log that it failed because `set_fursona_sections` does not exist — not for a typo.

- [ ] **Step 3: Write the migration**

`0013` adds the column, then the function. The function validates before writing:

- `p_sections` must be a JSON array.
- Each element must be an object with a text `name_en`, a `type` in the four values, and an integer `sort_order`.
- `items` must be an array; each item an object with text `title_en` and `description_en`, and an integer `sort_order`.
- `name_es`, `title_es`, `description_es`, `icon` and `image_url` are optional.

Raise `errcode = '22023'` with a message naming **which** rule failed and **where** — `section 2: unknown type` beats `invalid sections`, because the editor has to tell somebody what to fix. That is a different judgement from the ownership error, which stays opaque on purpose: the shape of a person's own submission is not a secret, but whose fursona a ref belongs to is.

- [ ] **Step 4: Commit, push, watch `conformance` go green**

---

### Task 2: Limits, before this becomes a bill

An unbounded `jsonb` reachable by any signed-in caller is the same class of hazard `0011`'s quota closed, and this one is worse: a fursona row costs a handle, but a sections blob costs storage per write with no natural ceiling at all.

**Files:**

- Modify: `tests/db/fursona-sections.test.ts` (append)
- Modify: `supabase/migrations/0013_fursona_sections.sql` (append)

- [ ] **Step 1: Append the failing tests**

Assert that each limit refuses at the boundary and accepts just under it:

| Limit                     | Value | Why this number                                                   |
| ------------------------- | ----- | ----------------------------------------------------------------- |
| sections per fursona      | 20    | A page somebody reads; past this it is a document, not a profile. |
| items per section         | 50    | A gallery of fifty is already a lot to scroll.                    |
| characters per text field | 2000  | Long enough for a real description, short enough to bound a row.  |
| total serialised bytes    | 64 KB | The backstop that does not depend on getting the others right.    |

Each is a **product knob, not a safety law** — same framing as `0011`'s fursona limit. Nothing else in the schema depends on the numbers.

- [ ] **Step 2: Commit, push, watch it go red**

- [ ] **Step 3: Append the limits to the migration**

Check the total size **last**, on the serialised value, so it catches anything the field-by-field rules miss.

- [ ] **Step 4: Commit, push, watch it go green**

---

### Task 3: Close the phase

- [ ] **Step 1: Run every gate that needs no database**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm format:check
pnpm secretlint && pnpm check:tools && pnpm check:docs origin/main
```

- [ ] **Step 2: Mark ready and confirm all four required checks**

```bash
gh pr ready
gh pr checks --watch --required
```

- [ ] **Step 3: After merge, apply `0013` to the live database**

```bash
set -a; . ./.secrets; set +a
pnpm exec supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
```

`db push` prints Docker "error getting credentials" noise while failing to cache its catalogue. That is a warning, not a failed migration.

- [ ] **Step 4: Verify by querying, not by the exit code**

Confirm the column exists with its default, that `set_fursona_sections` is present and excludes `anon` from its ACL, and that `create_fursona`'s ACL is still intact — `create or replace` preserves ACLs, and `0010` exists because that was once missed.

---

## What this phase does not do

- **No editor.** Phase 4 builds the UI that writes these.
- **No public page.** Phase 5. Nothing renders sections to anybody yet, which is why this phase ships no user-visible change at all.
- **No images.** `image_url` is a URL somebody pastes until phase 6 adds storage.
- **No moderation of section content.** A moderator can suspend a fursona, which hides everything; reviewing individual sections has no owner and is out of scope, as the spec says.
