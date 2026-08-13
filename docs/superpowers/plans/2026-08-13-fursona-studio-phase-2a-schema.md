# Fursona studio, phase 2a — the schema the list needs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the database everything the studio-shaped fursona list will need — ordering, a pinned flag, and a delete that does not free a handle — with every rule proved by a conformance test.

**Architecture:** One migration, `0012`. A new `fursona_profiles` table keyed by `actor_ref` keeps ordering and pinning off `actors`, which is the schema every app copies. Soft delete is a third `status` value, which means widening a check constraint and then repairing the two readers that were written when `suspended` was the only non-active state.

**Tech Stack:** Postgres 15 (Supabase), plpgsql security-definer functions, RLS, Vitest against a real database (`tests/db/`).

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md` — Decisions 2, 3 and 4.

## Global Constraints

- **Budget is $0.** No new managed service.
- **Migrations are append-only.** `0001`–`0011` are applied to a live database. Everything here is a new file, `0012`, expressed with `create or replace` / `alter` — never by editing an earlier migration.
- **`actors` gains no column.** Decision 2. Ordering and pinning live in `fursona_profiles`. A phase that adds a column to `actors` has broken the cross-app contract and must stop.
- **`/api/actors/mine` gains no field.** It may change what it _omits_ — that is Decision 3 — but not its shape.
- **Every security-definer function follows the revoke-then-grant discipline**: `revoke all ... from public` then `grant execute ... to authenticated`. `0010` exists because that was once missed.
- **Errors must not become an oracle.** `update_fursona` raises the same `fursona not found` whether the row is missing, someone else's, or suspended, so a caller cannot probe which `actor_ref`s are real. Anything added here matches that.
- **Every rule gets a conformance test** in `tests/db/`, and each test is watched red before the migration that satisfies it exists.
- **Filenames are kebab-case**; migrations are `NNNN_snake_case.sql` matching `0001`–`0011`.
- **Do not commit unless a step says to**, and never commit secrets.

## How this phase is tested — read before starting

`pnpm test:db` runs `supabase db reset` against a **local** Postgres in Docker. This environment is cloud-only and Docker is not running, and pointing that command at the live project would **destroy it** — `db reset` is not a metaphor.

So the red/green cycle runs **in CI**:

1. Write the failing test, commit, push.
2. Watch `conformance` on the pull request go red, and read the failure to confirm it failed for the stated reason rather than a typo.
3. Write the migration, commit, push.
4. Watch `conformance` go green.

Each cycle is about four minutes. That is the cost of the constraint and it is accepted deliberately; a branch with red intermediate commits is the _evidence_, not a mess to hide. Do not squash away the red ones locally — the PR squashes on merge anyway.

**Never run `pnpm test:db` against the live database.** There is no flag that makes it safe.

### One thing to watch: `jscpd`

Tasks 1 and 2 each define a `seedPerson` helper, and the two are similar enough that `pnpm check:tools` may report them as a clone. If it does, **do not** extract a shared helper reflexively — the existing `tests/db/` files each seed their own fixtures on purpose, so that reading one test file tells you what it set up. Prefer letting the two differ honestly: task 2's fixture needs a `public` fursona (its `actors_public` assertions depend on visibility) while task 1's needs only a private one. If the report persists after that, note it in the pull request rather than restructuring the suite.

---

## File Structure

| File                                                 | Responsibility                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/0012_fursona_studio_schema.sql` | The whole phase: widen `status`, create `fursona_profiles`, add the three RPCs, repair the two readers. |
| `tests/db/fursona-profiles.test.ts`                  | The new table, its RLS, and the ordering and pinning RPCs.                                              |
| `tests/db/fursona-delete.test.ts`                    | Soft delete and every consequence of the third `status` value.                                          |
| `docs/integrating.md`                                | One sentence: a deleted fursona stops arriving in a sync.                                               |

---

### Task 0: Cut the branch from the right base

- [ ] **Step 1: Branch explicitly**

```bash
git fetch origin
git checkout -b feat/studio-phase-2a-schema origin/main
```

- [ ] **Step 2: Confirm the base**

```bash
git log --oneline origin/main..HEAD
```

Expected: **no output**.

- [ ] **Step 3: Open a draft pull request immediately**

The CI cycle needs a pull request to run against, so it exists before the first test.

```bash
git commit --allow-empty -m "chore: open phase 2a"
git push -u origin feat/studio-phase-2a-schema
gh pr create --base main --draft \
  --title "feat(db): studio port phase 2a — the schema the list needs" \
  --body "Draft. Red commits are the evidence of the CI-based red/green cycle; see the plan."
```

---

### Task 1: `fursona_profiles`, and its RLS

**Files:**

- Create: `tests/db/fursona-profiles.test.ts`
- Create: `supabase/migrations/0012_fursona_studio_schema.sql`

**Interfaces:**

- Consumes: `public.current_person_ref()` (0002, filtered to active people by 0007); `public.actors`.
- Produces: table `public.fursona_profiles (actor_ref uuid primary key, sort_order int, featured boolean not null default false, updated_at timestamptz not null default now())`, with RLS.

- [ ] **Step 1: Write the failing test**

Create `tests/db/fursona-profiles.test.ts`. Follow the idiom in `tests/db/fursona-writes.test.ts`: `admin()` for service-role seeding, `clientAs(sub)` for a caller.

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

type Person = { sub: string; personRef: string; sonaRef: string };

/**
 * Seeds a person and one fursona they own, as the service role.
 *
 * @returns the identity, its person ref, and the fursona's actor ref.
 */
async function seedPerson(): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const sonaRef = randomUUID();
  const a = admin();

  const { error: pErr } = await a.from("actors").insert({
    actor_ref: personRef,
    kind: "person",
    identity_sub: sub,
    handle: `p-${personRef.slice(0, 8)}`,
  });
  if (pErr) throw pErr;

  const { error: sErr } = await a.from("actors").insert({
    actor_ref: sonaRef,
    kind: "fursona",
    owner_ref: personRef,
    handle: `s-${sonaRef.slice(0, 8)}`,
    visibility: "private",
  });
  if (sErr) throw sErr;

  return { sub, personRef, sonaRef };
}

let alice: Person;
let mallory: Person;

beforeAll(async () => {
  alice = await seedPerson();
  mallory = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

describe("fursona_profiles", () => {
  it("lets an owner read the profile row of a fursona they own", async () => {
    const a = admin();
    const { error } = await a
      .from("fursona_profiles")
      .insert({ actor_ref: alice.sonaRef, sort_order: 1 });
    if (error) throw error;

    const c = await clientAs(alice.sub);
    const { data, error: readErr } = await c
      .from("fursona_profiles")
      .select("actor_ref, sort_order, featured")
      .eq("actor_ref", alice.sonaRef);
    expect(readErr).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.featured).toBe(false);
  });

  // The whole point of the RLS. Without it, one person's ordering is readable
  // by every signed-in caller, and ordering reveals which fursonas somebody has.
  it("hides another person's profile row", async () => {
    const c = await clientAs(mallory.sub);
    const { data, error } = await c
      .from("fursona_profiles")
      .select("actor_ref")
      .eq("actor_ref", alice.sonaRef);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("refuses a write to another person's profile row", async () => {
    const c = await clientAs(mallory.sub);
    const { error } = await c
      .from("fursona_profiles")
      .update({ featured: true })
      .eq("actor_ref", alice.sonaRef);
    // Either a policy denial or zero rows affected is acceptable; what is not
    // acceptable is the row changing. Re-read as the owner to be sure.
    const owner = await clientAs(alice.sub);
    const { data } = await owner
      .from("fursona_profiles")
      .select("featured")
      .eq("actor_ref", alice.sonaRef);
    expect(data?.[0]?.featured).toBe(false);
    expect(error === null || typeof error.message === "string").toBe(true);
  });
});
```

- [ ] **Step 2: Commit and push, then watch CI go red**

```bash
git add tests/db/fursona-profiles.test.ts
git commit -m "test(db): pin fursona_profiles and its RLS, before the table exists"
git push
gh pr checks --watch --required
```

Expected: `conformance` FAILS, reporting that relation `public.fursona_profiles` does not exist. Read the log and confirm that is the reason — a failure for any other reason means the test is wrong, not the schema.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0012_fursona_studio_schema.sql`. Start with the header and this section; later tasks append to the same file.

```sql
-- 0012 — the schema the studio-shaped fursona list needs.
--
-- Migrations are append-only: 0001–0011 are applied to a live database, so
-- everything here is new or expressed with `create or replace`.
--
-- `actors` deliberately gains NO column. It is the canonical actor-model schema
-- every app copies and /api/actors/mine is a written contract; ordering and
-- pinning are the hub's own concern, so they live in a companion table.

create table public.fursona_profiles (
  actor_ref  uuid primary key references public.actors (actor_ref) on delete cascade,
  sort_order int,
  featured   boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.fursona_profiles enable row level security;

-- Same revoke-then-grant discipline as `actors` (0003) and the functions
-- (0010): no client reaches this table except through a policy.
revoke all on public.fursona_profiles from public, anon, authenticated;
grant select, insert, update on public.fursona_profiles to authenticated;

-- Ownership resolves through current_person_ref(), which 0007 filters to
-- ACTIVE people — so a suspended person cannot reorder or pin anything, for
-- the same reason they cannot act as anybody.
create policy fursona_profiles_owner_select on public.fursona_profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.actors a
       where a.actor_ref = fursona_profiles.actor_ref
         and a.owner_ref = public.current_person_ref()
    )
  );

create policy fursona_profiles_owner_insert on public.fursona_profiles
  for insert to authenticated
  with check (
    exists (
      select 1 from public.actors a
       where a.actor_ref = fursona_profiles.actor_ref
         and a.owner_ref = public.current_person_ref()
    )
  );

create policy fursona_profiles_owner_update on public.fursona_profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.actors a
       where a.actor_ref = fursona_profiles.actor_ref
         and a.owner_ref = public.current_person_ref()
    )
  )
  with check (
    exists (
      select 1 from public.actors a
       where a.actor_ref = fursona_profiles.actor_ref
         and a.owner_ref = public.current_person_ref()
    )
  );
```

- [ ] **Step 4: Commit, push, watch CI go green**

```bash
git add supabase/migrations/0012_fursona_studio_schema.sql
git commit -m "feat(db): fursona_profiles, keyed to the actor and owned by its owner"
git push
gh pr checks --watch --required
```

Expected: `conformance` PASSES.

---

### Task 2: Soft delete, and the two readers it breaks

This is the security-sensitive task. Read Decision 3 of the spec before starting.

**Files:**

- Create: `tests/db/fursona-delete.test.ts`
- Modify: `supabase/migrations/0012_fursona_studio_schema.sql` (append)

**Interfaces:**

- Consumes: `public.require_active_person_ref()` (0009), `public.actors_public` (0011), `public.my_actors()` (0009), `public.create_fursona` (0011).
- Produces: `public.delete_fursona(p_actor_ref uuid) returns void`.

- [ ] **Step 1: Write the failing test**

Create `tests/db/fursona-delete.test.ts`. It asserts five things, and the last three are the consequences the spec says must not be missed:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

type Person = { sub: string; personRef: string; sonaRef: string };

/**
 * Seeds a person and one active private fursona they own.
 *
 * @returns the identity, its person ref, and the fursona's actor ref.
 */
async function seedPerson(): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const sonaRef = randomUUID();
  const a = admin();

  const { error: pErr } = await a.from("actors").insert({
    actor_ref: personRef,
    kind: "person",
    identity_sub: sub,
    handle: `p-${personRef.slice(0, 8)}`,
  });
  if (pErr) throw pErr;

  const { error: sErr } = await a.from("actors").insert({
    actor_ref: sonaRef,
    kind: "fursona",
    owner_ref: personRef,
    handle: `s-${sonaRef.slice(0, 8)}`,
    visibility: "public",
  });
  if (sErr) throw sErr;

  return { sub, personRef, sonaRef };
}

let alice: Person;
let mallory: Person;

beforeAll(async () => {
  alice = await seedPerson();
  mallory = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

describe("delete_fursona", () => {
  it("refuses to delete a fursona somebody else owns", async () => {
    const c = await clientAs(mallory.sub);
    const { error } = await c.rpc("delete_fursona", {
      p_actor_ref: alice.sonaRef,
    });
    expect(error?.message).toMatch(/fursona not found/i);
    // The message must be the same one a missing row gets, or it is an oracle
    // for which actor_refs are real.
    expect(error?.message).not.toMatch(/owner|permission|belongs/i);
  });

  it("marks the caller's own fursona deleted", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("delete_fursona", {
      p_actor_ref: alice.sonaRef,
    });
    expect(error).toBeNull();

    const { data } = await admin()
      .from("actors")
      .select("status, handle")
      .eq("actor_ref", alice.sonaRef)
      .single();
    expect(data?.status).toBe("deleted");
    // The handle is still occupied. This is the whole reason delete is soft:
    // freeing it would let somebody register a retired fursona's name.
    expect(data?.handle).toBeTruthy();
  });

  // Consequence 1 of Decision 3.
  it("stops the owner seeing it through actors_public", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("actor_ref")
      .eq("actor_ref", alice.sonaRef);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // Consequence 2. This is also what /api/actors/mine serves, so it is the one
  // place this phase changes something a consuming app can observe.
  it("stops it arriving in my_actors", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).not.toContain(alice.sonaRef);
  });

  // Consequence 3, which 0011 already gets right and must not be "fixed":
  // a deleted fursona keeps consuming quota, or deleting becomes a way to buy
  // allowance back and the sanction-evasion path reopens.
  it("keeps counting against the quota", async () => {
    const { data } = await admin()
      .from("actors")
      .select("actor_ref")
      .eq("owner_ref", alice.personRef)
      .eq("kind", "fursona");
    expect(data).toHaveLength(1);
  });

  // A deleted fursona must not be actable, for the same reason a suspended one
  // is not. 0007's can_act_as already tests `status = 'active'`, so this should
  // pass without new code — it is here to catch a future edit that loosens it.
  it("cannot be acted as", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c.rpc("can_act_as", {
      target: alice.sonaRef,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("cannot be edited afterwards", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: alice.sonaRef,
      p_display_name: "after",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });
});
```

- [ ] **Step 2: Commit, push, watch CI go red**

```bash
git add tests/db/fursona-delete.test.ts
git commit -m "test(db): pin soft delete and every consequence of a third status"
git push
gh pr checks --watch --required
```

Expected: `conformance` FAILS — `delete_fursona` does not exist. Confirm that is the reason.

- [ ] **Step 3: Append the migration**

Append to `supabase/migrations/0012_fursona_studio_schema.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Soft delete.
--
-- A hard delete would free the handle, and handles come from a GLOBAL unique
-- namespace with no reclamation — so a retired fursona's name would become
-- available for somebody else to register and impersonate. Deleting therefore
-- sets a third status and keeps the row.
alter table public.actors
  drop constraint if exists actors_status_check;
alter table public.actors
  add constraint actors_status_check
  check (status in ('active', 'suspended', 'deleted'));

-- The same opacity as update_fursona (0009): one message whether the row is
-- missing, someone else's, or already gone. Distinguishing them would turn this
-- into an oracle for which actor_refs are real.
create or replace function public.delete_fursona(p_actor_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.require_active_person_ref();
  v_rows  int;
begin
  update public.actors
     set status = 'deleted'
   where actor_ref = p_actor_ref
     and kind      = 'fursona'
     and owner_ref = v_owner
     and status    = 'active';

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'fursona not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_fursona(uuid) from public, anon;
grant execute on function public.delete_fursona(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Consequence 1: actors_public.
--
-- 0011's public branch already requires status = 'active', so a deleted fursona
-- is hidden from strangers for free. The OWNER branches have no status test —
-- correct for 'suspended', because somebody must be able to see they were
-- sanctioned, and wrong for 'deleted', which they chose.
--
-- security_barrier restated because this is a replacement, not an edit: this
-- view's WHERE clause is the only thing between a caller and every row, and
-- without the barrier Postgres may push a caller-supplied predicate beneath it.
-- The column list is byte-for-byte 0003's.
create or replace view public.actors_public with (security_barrier = true) as
  select
    a.id,
    a.actor_ref,
    a.kind,
    a.handle,
    a.display_name,
    a.avatar_url,
    a.visibility,
    a.status
  from public.actors a
  where (a.visibility in ('public', 'unlisted') and a.status = 'active')
     or ((a.identity_sub = auth.jwt() ->> 'sub'
          or a.owner_ref = public.current_person_ref())
         and a.status <> 'deleted');

grant select on public.actors_public to authenticated;
grant select on public.actors_public to service_role;

-- ---------------------------------------------------------------------------
-- Consequence 2: my_actors.
--
-- 0009 filtered on ownership alone, so a deleted fursona would keep arriving in
-- the owner's own list and in /api/actors/mine. Everything else is 0009's body
-- unchanged.
create or replace function public.my_actors()
returns table (
  actor_ref    uuid,
  kind         text,
  handle       text,
  display_name text,
  avatar_url   text,
  visibility   text,
  status       text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.actor_ref, a.kind, a.handle, a.display_name, a.avatar_url,
         a.visibility, a.status
  from public.actors a
  where (a.identity_sub = auth.jwt() ->> 'sub'
         or a.owner_ref = public.current_person_ref())
    and a.status <> 'deleted'
  order by (a.kind = 'person') desc, lower(a.handle)
$$;

revoke all on function public.my_actors() from public, anon;
grant execute on function public.my_actors() to authenticated;

-- Consequence 3 is create_fursona's quota, which counts every fursona a person
-- owns regardless of status. That is already correct — a deleted fursona keeps
-- its slot, or deleting becomes a way to buy allowance back. NO CHANGE HERE,
-- deliberately. Do not "fix" it.
```

- [ ] **Step 4: Commit, push, watch CI go green**

```bash
git add supabase/migrations/0012_fursona_studio_schema.sql
git commit -m "feat(db): soft delete, and the two readers a third status broke"
git push
gh pr checks --watch --required
```

Expected: `conformance` PASSES, including the existing `actors-exposure` and `fursona-writes` suites — those cover the suspension rules this task's view change could have broken.

---

### Task 3: Ordering and pinning

**Files:**

- Modify: `tests/db/fursona-profiles.test.ts` (append a describe block)
- Modify: `supabase/migrations/0012_fursona_studio_schema.sql` (append)

**Interfaces:**

- Produces: `public.set_fursona_order(p_actor_ref uuid, p_sort_order int) returns void` and `public.set_fursona_featured(p_actor_ref uuid, p_featured boolean) returns void`.

> **Why two single-row functions rather than one array-reorder call.** Libra's studio reorders by sending the whole list. Here the RLS policies above already restrict writes to rows the caller owns, so the client can update its own rows directly — and a bulk function would need to re-check ownership per element anyway. Two narrow functions keep the ownership check in one place and the client honest. Phase 2b calls them once per moved row.

- [ ] **Step 1: Append the failing tests**

Append to `tests/db/fursona-profiles.test.ts`:

```ts
describe("ordering and pinning", () => {
  it("lets an owner set the order of their own fursona", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("set_fursona_order", {
      p_actor_ref: alice.sonaRef,
      p_sort_order: 3,
    });
    expect(error).toBeNull();

    const { data } = await c
      .from("fursona_profiles")
      .select("sort_order")
      .eq("actor_ref", alice.sonaRef);
    expect(data?.[0]?.sort_order).toBe(3);
  });

  it("creates the profile row on first use rather than requiring one", async () => {
    const fresh = await seedPerson();
    const c = await clientAs(fresh.sub);
    const { error } = await c.rpc("set_fursona_featured", {
      p_actor_ref: fresh.sonaRef,
      p_featured: true,
    });
    expect(error).toBeNull();

    const { data } = await c
      .from("fursona_profiles")
      .select("featured")
      .eq("actor_ref", fresh.sonaRef);
    expect(data?.[0]?.featured).toBe(true);
  });

  it("refuses to order a fursona somebody else owns", async () => {
    const c = await clientAs(mallory.sub);
    const { error } = await c.rpc("set_fursona_order", {
      p_actor_ref: alice.sonaRef,
      p_sort_order: 99,
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });
});
```

- [ ] **Step 2: Commit, push, watch CI go red**

```bash
git add tests/db/fursona-profiles.test.ts
git commit -m "test(db): pin ordering and pinning before the functions exist"
git push
gh pr checks --watch --required
```

Expected: FAIL — `set_fursona_order` does not exist.

- [ ] **Step 3: Append the migration**

```sql
-- ---------------------------------------------------------------------------
-- Ordering and pinning.
--
-- Both upsert, so a fursona needs no profile row until somebody arranges it —
-- every fursona having a row from birth would mean a second write on every
-- create and a row for the majority who never reorder anything.
--
-- Both check ownership through require_active_person_ref() and raise the same
-- `fursona not found` as update_fursona and delete_fursona, for the same
-- reason: a distinct message is an oracle.
create or replace function public.set_fursona_order(
  p_actor_ref  uuid,
  p_sort_order int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.require_active_person_ref();
begin
  if not exists (
    select 1 from public.actors
     where actor_ref = p_actor_ref
       and kind      = 'fursona'
       and owner_ref = v_owner
       and status    = 'active'
  ) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  insert into public.fursona_profiles (actor_ref, sort_order)
  values (p_actor_ref, p_sort_order)
  on conflict (actor_ref)
  do update set sort_order = excluded.sort_order, updated_at = now();
end;
$$;

create or replace function public.set_fursona_featured(
  p_actor_ref uuid,
  p_featured  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.require_active_person_ref();
begin
  if not exists (
    select 1 from public.actors
     where actor_ref = p_actor_ref
       and kind      = 'fursona'
       and owner_ref = v_owner
       and status    = 'active'
  ) then
    raise exception 'fursona not found' using errcode = '42501';
  end if;

  insert into public.fursona_profiles (actor_ref, featured)
  values (p_actor_ref, p_featured)
  on conflict (actor_ref)
  do update set featured = excluded.featured, updated_at = now();
end;
$$;

revoke all on function public.set_fursona_order(uuid, int) from public, anon;
revoke all on function public.set_fursona_featured(uuid, boolean) from public, anon;
grant execute on function public.set_fursona_order(uuid, int) to authenticated;
grant execute on function public.set_fursona_featured(uuid, boolean) to authenticated;
```

- [ ] **Step 4: Commit, push, watch CI go green**

```bash
git add supabase/migrations/0012_fursona_studio_schema.sql
git commit -m "feat(db): order and pin a fursona, ownership checked in one place"
git push
gh pr checks --watch --required
```

---

### Task 4: Say what a consuming app now sees

Decision 3 changes what `/api/actors/mine` omits. `docs/integrating.md` already tells an integrator that a suspended person's fursonas stop arriving, and that a stored choice which stops arriving is a re-prompt rather than an error — so this is one sentence in a section that already exists.

**Files:**

- Modify: `docs/integrating.md`

- [ ] **Step 1: Extend the "It stops arriving at all" bullet**

Find the bullet under "Re-prompt when the choice may be stale" beginning **"It stops arriving at all."** Append to that bullet, after its existing text:

> There is now a second cause: the owner can **delete** a fursona, and a deleted one stops arriving exactly as a suspended person's do. Nothing in the response changed shape — no field was added or removed — so this needs no code on your side beyond the rule above. What it changes is the interpretation: a row that vanishes is not necessarily a bug or a sync failure, and it is not necessarily moderation either. Somebody may simply have retired that character. Treat it the same way regardless: refuse to act as it, and re-prompt.

Then find the sentence beneath those bullets reading **"There is no user-facing delete in the hub today, so suspension is the ordinary cause of both."** That is now false. Replace it with a statement that there is a user-facing delete, that it never frees the handle — so a retired fursona's name cannot be re-registered by somebody else — and that the two rules above hold for deletion and suspension alike.

- [ ] **Step 2: Commit**

```bash
git add docs/integrating.md
git commit -m "docs: a deleted fursona stops arriving, like a suspended one"
```

---

### Task 5: Close the phase

- [ ] **Step 1: Run every gate that does not need a database**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm format:check
pnpm secretlint && pnpm check:tools && pnpm check:docs origin/main
```

Expected: all exit 0.

- [ ] **Step 2: Mark the pull request ready and confirm all four checks**

```bash
gh pr ready
gh pr checks --watch --required
```

Expected: `conformance`, `hub`, `e2e`, `idp-cloud` all green.

- [ ] **Step 3: Apply the migration to the live database, after merge**

No workflow applies migrations. After the pull request merges:

```bash
set -a; . ./.secrets; set +a
pnpm exec supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
```

`db push` prints noisy Docker "error getting credentials" lines while failing to cache its catalogue. **That is a warning, not a failed migration.**

- [ ] **Step 4: Verify against the live database by querying it**

Do not trust the CLI's exit code. Confirm, with a query: `actors_status_check` accepts `'deleted'`; `fursona_profiles` exists with RLS enabled; `my_actors`'s source contains `status <> 'deleted'`; and `create_fursona`'s ACL still excludes `anon` (`create or replace` preserves ACLs, and 0010 exists because that was once missed).

---

## What this phase does not do

- **No UI.** Nothing a person can see changes. Phase 2b builds the list on this.
- **No `sections` column.** Decision 2 puts it in phase 3, so the table does not ship a column nothing writes.
- **No column on `actors`.** Only the `status` check constraint widens.
- **No new field in `/api/actors/mine`.** Only a row that used to arrive and now does not.
- **No hard delete, ever.** There is no function here that removes a row, and adding one would free a handle from a namespace with no reclamation.
