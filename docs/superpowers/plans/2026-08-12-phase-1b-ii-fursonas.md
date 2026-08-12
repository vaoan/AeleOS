# Phase 1b-ii, part 1 — Fursonas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hub from "you are signed in" into "you have fursonas" — the
database operations, the data layer, and the pages to list, create and edit
them.

**Architecture:** Every write to `actors` goes through a `security definer` RPC,
because `0003` revokes all client grants on that table and this plan must not
weaken that. The hub's data layer calls those RPCs through the Clerk-bound
Supabase client; validation lives in a zod schema in the feature's `domain/`
layer so it can be shared by the form and the server action without either
depending on the other.

**Tech Stack:** Next.js 16 Server Actions, React 19, Tailwind CSS 4, next-intl,
`@supabase/supabase-js`, zod, Vitest. **No new dependencies.**

**Supersedes** tasks 1–5 of `2026-08-02-phase-1b-ii-fursonas-and-picker.md`,
which was written for a standalone `aeleos-hub` repository and predates the
merge into this repo, the `[locale]` routing, the i18n catalogues, and the
`features/`+`shared/` layering. The SQL and much of the test design there are
carried forward; the paths, the migration numbering and the harness are not.

**Out of scope, deliberately:** the picker, the `return_to` allowlist, the sync
API consuming apps call, and integrator documentation — tasks 6–9 of the
superseded plan. Those ship as a second PR so the open-redirect surface gets its
own review rather than arriving at the end of a 2000-line diff. Also out of
scope, as before: pronouns (no column in the canonical schema), avatar uploads
(`avatar_url` takes a URL), fursona transfer (Phase 2), and the public directory.

## Global Constraints

- **`supabase/migrations/` is one sequence.** The next number is `0009`. The
  superseded plan's `0100` "hub-local" series existed to separate copied files
  from local ones in a second repository; that distinction died with the
  2026-08-10 decision. Do not create a second numbering scheme.
- **Migrations are append-only.** `0001`–`0008` have been applied to a live
  database. Never edit them; express changes with `create or replace`.
- **The exposure boundary holds.** `owner_ref`, `identity_sub` and
  `author_person_ref` must never reach a client — not through a view, an RPC
  return type, an API response, or an error message.
- **Every `security definer` function gets `revoke all … from public` before its
  grant.** Postgres grants EXECUTE to PUBLIC by default, which on a definer
  function means any role — including `anon` — runs it with the definer's
  privileges. Every function in `0002`, `0006` and `0007` does this; so does
  every function you add.
- **Every user-visible string lives in both catalogues.**
  `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`.
  `i18next/no-literal-string` is an ESLint error, and
  `apps/hub/tests/messages.test.ts` fails the build if a key exists in one
  language and not the other.
- **The layer rules are enforced.** Within `features/actors/`: `domain/` may not
  import from `application`, `infrastructure` or `presentation`;
  `infrastructure/` and `application/` may not import from `presentation`. No
  feature imports another feature — `features/actors` may not import
  `@/features/session`. No `../` imports anywhere in `apps/hub/src`. Everything
  outside a feature reaches it through `@/features/actors`.
- **Coverage is 100% on all four metrics** in both `apps/hub` and
  `packages/identity`. New `.ts` files under `src/features/**` are measured;
  `presentation/**` and `index.ts` are excluded. **Never lower a threshold** —
  if coverage falls, add a test.
- **Every export carries TSDoc stating the contract, not the types.** `pnpm lint`
  fails without it, and again if a parameter is renamed without its `@param`.
- **Every export is tested on its happy path and each failure mode.** A test
  guarding already-correct behaviour must be **verified by sabotage**: break the
  code, watch it go red, restore.
- **Budget: $0.** No new services, no file storage.
- Filenames kebab-case. Work on a branch cut from `origin/main`.
- **Steps marked 🧑 are human-only** and cannot be performed by an agent. An
  agent reaching one stops and reports; it does not attempt it and does not
  skip it silently.

## Two databases, and which one is which

This trips people up, so it is written down rather than inferred.

|                       | Local Supabase (Docker)                                         | Hosted `AeleOS` project                   |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| Used by               | `pnpm test:db`, and CI's `conformance` job via `supabase start` | The running app, in dev and in production |
| Lifecycle             | Destroyed and rebuilt by `supabase db reset` on every run       | Long-lived; holds real people's actors    |
| How migrations arrive | Automatically, on every reset                                   | **By hand — `supabase db push`**          |

The conformance suite must run against a throwaway database because
`supabase db reset` drops everything; it can never point at the hosted project.

The consequence is the trap: **`apps/hub/.env.local` points at the hosted
project**, so the moment a page in Task 5 calls `my_actors()`, it calls it in
the cloud. A `0009` that exists only locally makes every test pass and every
page fail. Task 2 ends with the push for exactly this reason.

## What already exists — do not rebuild it

The superseded plan created these. They are already here:

| Thing                                                                                             | Where                                                                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Database test harness (`admin`, `clientAs`, `newSub`, `closePool`, `withClaims`, `withSuperuser`) | `tests/db/helpers.ts`                                                                   |
| Database test config and global setup                                                             | `vitest.config.integration.ts`, `tests/db/global-setup.ts`                              |
| The `test:db` script                                                                              | root `package.json` — `supabase db reset && vitest run -c vitest.config.integration.ts` |
| Clerk-bound Supabase client                                                                       | `@/shared/infrastructure/supabase-server` → `createServerClient()`                      |
| Person provisioning and reads                                                                     | `@/features/actors` → `ensurePersonActor()`, `getPersonActor()`                         |
| Page chrome                                                                                       | `@/shared/presentation/page-shell` → `PageShell`, `Card`                                |

## Target File Structure

```
supabase/migrations/
└── 0009_actor_self_service.sql          my_actors, create_fursona, update_fursona

tests/db/
├── actor-self-service.test.ts           my_actors
└── fursona-writes.test.ts               create_fursona, update_fursona

apps/hub/src/features/actors/
├── domain/fursona-schema.ts             zod validation — the FIRST domain layer
├── infrastructure/actors.ts             (exists — untouched)
├── infrastructure/fursonas.ts           listMyActors, createFursona, updateFursona
├── presentation/actor-tile.tsx
├── presentation/fursona-form.tsx
└── index.ts                             (exists — gains exports)

apps/hub/src/app/[locale]/(app)/fursonas/
├── page.tsx                             list
├── actions.ts                           server actions
├── new/page.tsx                         create
└── [handle]/edit/page.tsx               edit

apps/hub/tests/
├── fursona-schema.test.ts
└── fursonas.test.ts
```

`domain/fursona-schema.ts` is the first file in a `domain/` layer anywhere in
this repo. The layer rules added in the previous phase govern directories that
did not exist yet; this is where they start doing real work.

---

### Task 1: `my_actors()` — reading your own actors

**Files:**

- Create: `supabase/migrations/0009_actor_self_service.sql`
- Test: `tests/db/actor-self-service.test.ts`

**Interfaces:**

- Consumes: `public.actors`, `public.current_person_ref()` from `0001`/`0007`.
- Produces: `public.my_actors()` returning
  `(actor_ref uuid, kind text, handle text, display_name text, avatar_url text, visibility text, status text)`
  — the caller's person row plus every fursona they own, person row first.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_actor_self_service.sql`:

```sql
-- 0009 — the operations a person performs on their own actors.
--
-- Every write to `actors` lives behind a security definer function because 0003
-- revokes all client grants on the table. This migration does not re-open it;
-- it exposes exactly three narrow operations instead.

-- The caller's own actors: their person row and the fursonas they own.
--
-- Deliberately returns neither owner_ref nor identity_sub. The caller already
-- knows they own these rows, so echoing the linkage back puts the
-- fursona -> person mapping on the wire for no benefit — and this shape is the
-- one other applications will eventually read.
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
  where a.identity_sub = auth.jwt() ->> 'sub'
     or a.owner_ref = public.current_person_ref()
  order by (a.kind = 'person') desc, lower(a.handle)
$$;

revoke all on function public.my_actors() from public;
grant execute on function public.my_actors() to authenticated;
```

The `order by` puts the person row first: the list renders "yourself" as the
leading tile, which makes acting as yourself an ordinary choice rather than an
escape hatch.

Note what `current_person_ref()` already does for you — `0007` filters it to
`status = 'active'`, so a **suspended** person resolves to null and the owner
branch matches nothing. A suspended person sees only their own person row, not
their fursonas. That is the sanction-carrying behaviour the actor model exists
for; do not add a status filter that second-guesses it.

- [ ] **Step 2: Write the failing test**

Create `tests/db/actor-self-service.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

type Seed = { sub: string; personRef: string; sonaRef: string };

/**
 * Inserts a person with one owned fursona, as the service role.
 *
 * @returns the seeded identity and both actor refs.
 */
async function seed(): Promise<Seed> {
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

let alice: Seed;
let bob: Seed;

beforeAll(async () => {
  alice = await seed();
  bob = await seed();
});

afterAll(async () => {
  await closePool();
});

describe("my_actors", () => {
  it("returns the caller's person and owned fursonas", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).toContain(alice.personRef);
    expect(refs).toContain(alice.sonaRef);
  });

  it("lists the person row first", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    expect((data as { kind: string }[])[0]?.kind).toBe("person");
  });

  // The whole point of the function. A caller must never see another person's
  // actors, and a fursona is often the thing someone most wants kept separate.
  it("never returns another person's actors", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).not.toContain(bob.personRef);
    expect(refs).not.toContain(bob.sonaRef);
  });

  // The exposure boundary, restated at every new surface. A column absent from
  // the return type cannot leak through it.
  it("never exposes ownership columns", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    for (const row of data as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty("owner_ref");
      expect(row).not.toHaveProperty("identity_sub");
    }
  });

  it("returns an empty list for a caller with no actors", async () => {
    const c = await clientAs(newSub());
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd Z:/Github/aeleos && pnpm test:db
```

Expected: FAIL — `my_actors` does not exist. (`test:db` resets the database and
applies every migration first, so a missing migration shows as a missing
function rather than a connection error.)

- [ ] **Step 4: Apply and pass**

Re-run `pnpm test:db`. Expected: the whole `tests/db/` suite passes, including
the pre-existing conformance tests — a migration that breaks an earlier
invariant fails here, which is the point of resetting.

- [ ] **Step 5: Verify by sabotage**

Change the `where` clause to drop the ownership filter entirely:

```sql
  where true
```

Re-run `pnpm test:db`. Expected: **"never returns another person's actors" goes
red.** Restore, and confirm green. A test that has never been red proves
nothing, and this is the one that matters most in the file.

- [ ] **Step 6: Commit**

```bash
cd Z:/Github/aeleos
git add supabase/migrations/0009_actor_self_service.sql tests/db/actor-self-service.test.ts
git commit -m "feat(db): add my_actors, the caller's own actors

Returns the caller's person row and the fursonas they own, person first,
so the list renders acting-as-yourself as an ordinary choice rather than
an escape hatch.

Neither owner_ref nor identity_sub is in the return type. The caller
already knows they own these rows, so echoing the linkage back would put
the fursona-to-person mapping on the wire for nothing — and this is the
shape other applications will eventually read.

Nothing here re-checks suspension: current_person_ref already filters to
active persons, so a suspended person resolves to null and the owner
branch matches nothing. The sanction carries without a second rule to
keep in sync.

Verified by sabotage — widening the where clause to `true` reddens the
cross-tenant test.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `create_fursona` and `update_fursona`

**Files:**

- Modify: `supabase/migrations/0009_actor_self_service.sql`
- Test: `tests/db/fursona-writes.test.ts`

**Interfaces:**

- Consumes: `public.current_person_ref()`, `public.actors`.
- Produces:
  - `public.create_fursona(p_handle text, p_display_name text, p_avatar_url text, p_visibility text) returns uuid` — the new `actor_ref`.
  - `public.update_fursona(p_actor_ref uuid, p_display_name text, p_avatar_url text, p_visibility text) returns void`.

- [ ] **Step 1: Append the write RPCs to the migration**

Append to `supabase/migrations/0009_actor_self_service.sql`:

```sql
-- Creating a fursona.
--
-- The owner comes from the token, never from a parameter, so a caller cannot
-- create a fursona owned by someone else. There is deliberately no p_owner.
create or replace function public.create_fursona(
  p_handle       text,
  p_display_name text,
  p_avatar_url   text,
  p_visibility   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.current_person_ref();
  v_ref   uuid := gen_random_uuid();
begin
  if v_owner is null then
    raise exception 'no person actor for caller' using errcode = '42501';
  end if;

  if p_handle is null or btrim(p_handle) = '' then
    raise exception 'handle is required' using errcode = '22023';
  end if;

  if p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  begin
    insert into public.actors
      (actor_ref, kind, owner_ref, handle, display_name, avatar_url, visibility)
    values
      (v_ref, 'fursona', v_owner, btrim(p_handle),
       nullif(btrim(coalesce(p_display_name, '')), ''),
       nullif(btrim(coalesce(p_avatar_url, '')), ''),
       p_visibility);
  exception when unique_violation then
    -- The unique index is on lower(handle), so this covers case variants too.
    raise exception 'handle already taken' using errcode = '23505';
  end;

  return v_ref;
end;
$$;

-- Editing a fursona. The WHERE clause IS the authorization — ownership is
-- re-derived from the token here rather than trusted from the caller.
--
-- The handle is absent on purpose: it is how a fursona is addressed, and
-- renaming is a separate concern with its own collision and redirect problems.
create or replace function public.update_fursona(
  p_actor_ref    uuid,
  p_display_name text,
  p_avatar_url   text,
  p_visibility   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.current_person_ref();
  v_rows  int;
begin
  if v_owner is null then
    raise exception 'no person actor for caller' using errcode = '42501';
  end if;

  if p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  update public.actors
     set display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
         avatar_url   = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         visibility   = p_visibility
   where actor_ref = p_actor_ref
     and kind      = 'fursona'
     and owner_ref = v_owner;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- The SAME error whether the row does not exist or belongs to someone
    -- else. Distinguishing them would turn this into an oracle for probing
    -- which actor_refs are real.
    raise exception 'fursona not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_fursona(text, text, text, text) from public;
revoke all on function public.update_fursona(uuid, text, text, text) from public;
grant execute on function public.create_fursona(text, text, text, text) to authenticated;
grant execute on function public.update_fursona(uuid, text, text, text) to authenticated;
```

`updated_at` is not set here: `0007` added an `actors_set_updated_at` BEFORE
UPDATE trigger that maintains it. Setting it again would be redundant and would
drift if the trigger's definition ever changed.

- [ ] **Step 2: Write the failing test**

Create `tests/db/fursona-writes.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withSuperuser } from "./helpers";

type Person = { sub: string; personRef: string };

/**
 * Inserts a person actor as the service role.
 *
 * @returns the seeded identity and its actor ref.
 */
async function seedPerson(): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const { error } = await admin()
    .from("actors")
    .insert({
      actor_ref: personRef,
      kind: "person",
      identity_sub: sub,
      handle: `p-${personRef.slice(0, 8)}`,
    });
  if (error) throw error;
  return { sub, personRef };
}

let alice: Person;
let bob: Person;

beforeAll(async () => {
  alice = await seedPerson();
  bob = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

/** A handle unique to this run. @returns the handle. */
const handle = (): string => `sona-${randomUUID().slice(0, 8)}`;

describe("create_fursona", () => {
  it("creates a fursona owned by the caller", async () => {
    const c = await clientAs(alice.sub);
    const h = handle();
    const { data, error } = await c.rpc("create_fursona", {
      p_handle: h,
      p_display_name: "Test Sona",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error).toBeNull();

    const owner = await withSuperuser(async (pc) => {
      const r = await pc.query<{ owner_ref: string }>(
        "select owner_ref from public.actors where actor_ref = $1",
        [data as string],
      );
      return r.rows[0]?.owner_ref;
    });
    expect(owner).toBe(alice.personRef);
  });

  it("rejects a duplicate handle regardless of case", async () => {
    const c = await clientAs(alice.sub);
    const h = handle();
    await c.rpc("create_fursona", {
      p_handle: h,
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    const { error } = await c.rpc("create_fursona", {
      p_handle: h.toUpperCase(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/handle already taken/i);
  });

  it("rejects a blank handle", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "   ",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/handle is required/i);
  });

  it("rejects a visibility outside the allowed set", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "everyone",
    });
    expect(error?.message).toMatch(/invalid visibility/i);
  });

  it("refuses a caller with no person actor", async () => {
    const c = await clientAs(newSub());
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/no person actor/i);
  });

  it("stores blank optional fields as null rather than empty strings", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: "   ",
      p_avatar_url: "",
      p_visibility: "private",
    });
    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{
        display_name: string | null;
        avatar_url: string | null;
      }>(
        "select display_name, avatar_url from public.actors where actor_ref = $1",
        [data as string],
      );
      return r.rows[0];
    });
    expect(row?.display_name).toBeNull();
    expect(row?.avatar_url).toBeNull();
  });
});

describe("update_fursona", () => {
  /**
   * Creates a fursona owned by the given person.
   *
   * @param sub - the owner's identity subject.
   * @returns the new actor ref.
   */
  async function makeSona(sub: string): Promise<string> {
    const c = await clientAs(sub);
    const { data, error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: "Before",
      p_avatar_url: null,
      p_visibility: "private",
    });
    if (error) throw error;
    return data as string;
  }

  it("updates a fursona the caller owns", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: "After",
      p_avatar_url: "https://img.example/a.png",
      p_visibility: "public",
    });
    expect(error).toBeNull();

    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{ display_name: string; visibility: string }>(
        "select display_name, visibility from public.actors where actor_ref = $1",
        [ref],
      );
      return r.rows[0];
    });
    expect(row?.display_name).toBe("After");
    expect(row?.visibility).toBe("public");
  });

  // The authorization test. Bob must not be able to edit Alice's fursona even
  // though he holds a valid session and a real actor_ref.
  it("refuses to update a fursona owned by someone else", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(bob.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: "Hijacked",
      p_avatar_url: null,
      p_visibility: "public",
    });
    expect(error?.message).toMatch(/fursona not found/i);

    const name = await withSuperuser(async (pc) => {
      const r = await pc.query<{ display_name: string }>(
        "select display_name from public.actors where actor_ref = $1",
        [ref],
      );
      return r.rows[0]?.display_name;
    });
    expect(name).toBe("Before");
  });

  // Not-found and not-yours must be indistinguishable, or the error becomes an
  // oracle for probing which actor_refs exist.
  it("reports a missing fursona the same way as one it does not own", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(bob.sub);
    const notOurs = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: "x",
      p_avatar_url: null,
      p_visibility: "private",
    });
    const missing = await c.rpc("update_fursona", {
      p_actor_ref: randomUUID(),
      p_display_name: "x",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(missing.error?.message).toBe(notOurs.error?.message);
  });

  it("rejects a visibility outside the allowed set", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "everyone",
    });
    expect(error?.message).toMatch(/invalid visibility/i);
  });

  // A person row is not a fursona. Letting update_fursona touch one would be a
  // path to editing your own identity row through the wrong door.
  it("refuses to update a person actor", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: alice.personRef,
      p_display_name: "Not a sona",
      p_avatar_url: null,
      p_visibility: "public",
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd Z:/Github/aeleos && pnpm test:db
```

Expected: FAIL — `create_fursona` does not exist.

- [ ] **Step 4: Apply and pass**

Re-run `pnpm test:db`. Expected: the whole suite passes.

- [ ] **Step 5: Verify by sabotage — three of them**

Run each, watch the named test go red, restore.

**a.** Drop the ownership conjunct in `update_fursona`:

```sql
   where actor_ref = p_actor_ref
     and kind      = 'fursona'
```

Expected: **"refuses to update a fursona owned by someone else" goes red.**

**b.** Drop the `kind` conjunct:

```sql
   where actor_ref = p_actor_ref
     and owner_ref = v_owner
```

Expected: **"refuses to update a person actor" goes red.**

**c.** Take the owner from a parameter instead of the token — add
`p_owner uuid` to `create_fursona` and use it. Expected: the signature no longer
matches the test's call, which is itself the point; revert immediately. This one
is a design sabotage rather than a behavioural one, so note it in the report and
move on if it costs more than a couple of minutes.

- [ ] **Step 6: Commit**

```bash
cd Z:/Github/aeleos
git add supabase/migrations/0009_actor_self_service.sql tests/db/fursona-writes.test.ts
git commit -m "feat(db): add create_fursona and update_fursona

Both are security definer because 0003 revokes every client grant on
actors. This does not re-open the table; it exposes two narrow operations.

create_fursona takes the owner from the token and has no p_owner
parameter at all, so there is nothing to forge. update_fursona re-derives
ownership the same way and puts it in the WHERE clause, so the query
that finds the row is the same one that authorizes the edit.

Not-found and not-yours raise the identical error. Distinguishing them
would turn the function into an oracle for probing which actor_refs
exist.

Verified by sabotage: dropping the ownership conjunct reddens the
cross-owner test, and dropping the kind conjunct reddens the one that
stops a person row being edited through the fursona door.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Apply `0009` to the hosted project** 🧑

Everything so far has run against the throwaway local database. The hub's
`.env.local` points at the hosted `AeleOS` project, so from Task 5 onward the
pages call these functions **in the cloud**. Until this step runs, `0009` exists
only locally: every test passes and every page fails.

There is no automated push — Phase 0 applied `0001`–`0008` by hand, and
`scripts/run-cloud-idp.mjs` documents "migrations already pushed" as a
precondition rather than doing it.

Ask the repo owner to run, from the repository root:

```bash
npx supabase link --project-ref vmmpssydbrtkgvrlkijh   # once, if not already linked
npx supabase db push
```

`db push` applies only migrations the project has not recorded, so it is safe to
re-run and will report `0009` as the single pending file. **If it lists anything
other than `0009`, stop and report it** — that means the hosted project has
drifted from this repository, which is a bigger problem than this plan.

An agent must not run this: it writes to a live database holding real people's
actors, using credentials an agent should not hold.

Confirm afterwards that `my_actors` exists in the cloud before continuing to
Task 3 — the Supabase dashboard's SQL editor answers it:

```sql
select proname from pg_proc where proname in
  ('my_actors', 'create_fursona', 'update_fursona');
```

Expected: three rows.

---

### Task 3: The fursona domain schema

**Files:**

- Create: `apps/hub/src/features/actors/domain/fursona-schema.ts`
- Test: `apps/hub/tests/fursona-schema.test.ts`

**Interfaces:**

- Consumes: `zod` only. **This is a `domain/` file — it may import nothing from
  `application`, `infrastructure` or `presentation`, and the ESLint layer rules
  enforce that.** It is the first `domain/` file in the repo.
- Produces:
  - `VISIBILITIES: readonly ["private", "unlisted", "public"]`
  - `type Visibility = (typeof VISIBILITIES)[number]`
  - `fursonaSchema` — a zod object over `{ handle, displayName, avatarUrl, visibility }`
  - `type FursonaInput = z.infer<typeof fursonaSchema>`
  - `parseFursona(raw: unknown): { ok: true; value: FursonaInput } | { ok: false; errors: Record<string, string> }`

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/fursona-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  VISIBILITIES,
  parseFursona,
} from "@/features/actors/domain/fursona-schema";

/**
 * A valid input with the given overrides applied.
 *
 * @param over - fields to replace.
 * @returns the raw object to parse.
 */
const input = (over: Record<string, unknown> = {}) => ({
  handle: "sparky",
  displayName: "Sparky",
  avatarUrl: "",
  visibility: "private",
  ...over,
});

describe("parseFursona", () => {
  it("accepts a valid fursona", () => {
    const result = parseFursona(input());
    expect(result.ok).toBe(true);
  });

  it("trims the handle rather than rejecting padded input", () => {
    const result = parseFursona(input({ handle: "  sparky  " }));
    expect(result.ok && result.value.handle).toBe("sparky");
  });

  it("rejects a blank handle", () => {
    const result = parseFursona(input({ handle: "   " }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.handle).toBeDefined();
  });

  it("rejects a handle that is too long", () => {
    const result = parseFursona(input({ handle: "a".repeat(33) }));
    expect(result.ok).toBe(false);
  });

  // The handle appears in URLs and is compared case-insensitively by the
  // database's unique index. Allowing punctuation would make two visually
  // identical handles route differently.
  it("rejects a handle with characters that are not letters, digits, dash or underscore", () => {
    for (const bad of ["spar ky", "spar/ky", "spar.ky", "spar@ky"]) {
      expect(parseFursona(input({ handle: bad })).ok).toBe(false);
    }
  });

  it("accepts an empty avatar url as absent", () => {
    const result = parseFursona(input({ avatarUrl: "" }));
    expect(result.ok && result.value.avatarUrl).toBe("");
  });

  // An avatar_url is rendered into an <img src>. A javascript: or data: URL
  // there is a script-execution vector, so the allowed schemes are named
  // rather than inferred.
  it("rejects an avatar url that is not http or https", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "not a url",
    ]) {
      expect(parseFursona(input({ avatarUrl: bad })).ok).toBe(false);
    }
  });

  it("accepts an https avatar url", () => {
    const result = parseFursona(
      input({ avatarUrl: "https://img.example/a.png" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a visibility outside the allowed set", () => {
    expect(parseFursona(input({ visibility: "everyone" })).ok).toBe(false);
  });

  it("accepts every visibility the database allows", () => {
    for (const v of VISIBILITIES) {
      expect(parseFursona(input({ visibility: v })).ok).toBe(true);
    }
  });

  it("reports errors keyed by field so a form can render them inline", () => {
    const result = parseFursona(input({ handle: "", visibility: "nope" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "handle",
        "visibility",
      ]);
    }
  });

  it("rejects a non-object input rather than throwing", () => {
    expect(parseFursona(null).ok).toBe(false);
    expect(parseFursona("nope").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd Z:/Github/aeleos/apps/hub && pnpm test
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `apps/hub/src/features/actors/domain/fursona-schema.ts`:

```ts
import { z } from "zod";

/**
 * The visibility values the database accepts.
 *
 * Kept in the same order as the `actors_visibility` check constraint in
 * `0001_actors.sql`. If that constraint changes, this list is the other half
 * of the change — a value accepted here and rejected there surfaces as a
 * database error at submit time rather than a field error in the form.
 */
export const VISIBILITIES = ["private", "unlisted", "public"] as const;

/** One of the visibility values the database accepts. */
export type Visibility = (typeof VISIBILITIES)[number];

/** Characters a handle may contain. Also what makes it safe in a URL path. */
const HANDLE_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Schemes an avatar URL may use. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Whether a string is a URL we are willing to put in an `img` tag.
 *
 * Naming the allowed schemes rather than rejecting known-bad ones is
 * deliberate: `javascript:` and `data:` are script-execution vectors in an
 * `src`, and a denylist is a promise to have thought of every scheme.
 *
 * @param value - the candidate URL.
 * @returns true when it parses and uses http or https.
 */
function isSafeUrl(value: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Validation for the fursona form, shared by the form and the server action.
 *
 * It lives in `domain/` so both can depend on it without depending on each
 * other — the client form imports it to render inline errors, and the server
 * action imports it to re-validate, because a client-side check is a
 * convenience and never a control.
 */
export const fursonaSchema = z.object({
  handle: z.string().trim().min(1).max(32).regex(HANDLE_PATTERN),
  displayName: z.string().trim().max(64),
  avatarUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || isSafeUrl(v)),
  visibility: z.enum(VISIBILITIES),
});

/** A validated fursona, as the form collects it. */
export type FursonaInput = z.infer<typeof fursonaSchema>;

/**
 * What a submitted form gets back: error codes keyed by field name.
 *
 * Lives here rather than beside the server action because both the action and
 * the form component need it, and a type owned by either one would make the
 * other depend on it — the form is in `presentation/` and the action is in
 * `app/`, so that dependency would run the wrong way through the layers.
 */
export type FursonaFormState = { errors: Record<string, string> };

/** The result of validating raw form input. */
export type ParseResult =
  | { ok: true; value: FursonaInput }
  | { ok: false; errors: Record<string, string> };

/**
 * Validates raw form input, returning field-keyed errors rather than throwing.
 *
 * The error map is keyed by field name so a form can render each message
 * beside its input. Messages are error *codes*, not prose: the caller
 * translates them, because this module has no locale and must not acquire one.
 *
 * @param raw - unvalidated input, typically from `FormData`.
 * @returns the parsed value, or the errors keyed by field.
 */
export function parseFursona(raw: unknown): ParseResult {
  const parsed = fursonaSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) errors[key] = issue.code;
  }
  // A non-object input produces an issue with an empty path and would
  // otherwise yield an empty error map, which a form would render as "valid".
  if (Object.keys(errors).length === 0) errors.handle = "invalid_type";
  return { ok: false, errors };
}
```

- [ ] **Step 4: Run the tests**

```bash
cd Z:/Github/aeleos/apps/hub && pnpm test:coverage
```

Expected: all pass, coverage still 100/100/100/100.

- [ ] **Step 5: Verify by sabotage**

Remove the `refine` on `avatarUrl` so any string is accepted. Expected: **"rejects
an avatar url that is not http or https" goes red.** Restore and confirm green.

- [ ] **Step 6: Prove the layer rule binds this file**

This is the first `domain/` file in the repo, and the rule that governs it has
only ever been tested against scratch files. Add a temporary import to
`fursona-schema.ts`:

```ts
import { createServerClient } from "@/shared/infrastructure/supabase-server";
```

Run `cd Z:/Github/aeleos && pnpm lint`. Expected: **an error naming the layer
violation.** Remove the import and confirm lint is clean. Record the exact
message in your report.

- [ ] **Step 7: Commit**

```bash
cd Z:/Github/aeleos
git add apps/hub/src/features/actors/domain/ apps/hub/tests/fursona-schema.test.ts
git commit -m "feat(hub): add the fursona domain schema

Validation lives in domain/ so the form and the server action can both
depend on it without depending on each other. The client check is a
convenience; the action re-validates, because a client-side check is
never a control.

Returns field-keyed error codes rather than prose. This module has no
locale and must not acquire one — the caller translates.

Avatar URLs are checked against a scheme allowlist rather than a
denylist: the value lands in an img src, where javascript: and data: are
script-execution vectors, and a denylist is a promise to have thought of
every scheme.

The first domain/ file in the repo, so it is also the first real exercise
of the layer rule added last phase.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The fursona data layer

**Files:**

- Create: `apps/hub/src/features/actors/infrastructure/fursonas.ts`
- Modify: `apps/hub/src/features/actors/index.ts`
- Test: `apps/hub/tests/fursonas.test.ts`

**Interfaces:**

- Consumes: `createServerClient` from `@/shared/infrastructure/supabase-server`;
  `Visibility` and `FursonaInput` from `@/features/actors/domain/fursona-schema`.
- Produces:
  - `type Actor = { actorRef: string; kind: "person" | "fursona"; handle: string; displayName: string | null; avatarUrl: string | null; visibility: Visibility; status: "active" | "suspended" }`
  - `listMyActors(): Promise<Actor[]>`
  - `createFursona(input: FursonaInput): Promise<string>`
  - `updateFursona(actorRef: string, input: Omit<FursonaInput, "handle">): Promise<void>`
  - `class HandleTakenError extends Error`

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/fursonas.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn<(...a: unknown[]) => unknown>();
vi.mock("@/shared/infrastructure/supabase-server", () => ({
  createServerClient: vi.fn(async () => ({ rpc })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listMyActors", () => {
  it("maps snake_case rows to the Actor shape", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          actor_ref: "ref-p",
          kind: "person",
          handle: "u-abc",
          display_name: "Heiner",
          avatar_url: null,
          visibility: "private",
          status: "active",
        },
      ],
      error: null,
    });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors()).resolves.toEqual([
      {
        actorRef: "ref-p",
        kind: "person",
        handle: "u-abc",
        displayName: "Heiner",
        avatarUrl: null,
        visibility: "private",
        status: "active",
      },
    ]);
  });

  it("returns an empty list rather than throwing when there are none", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors()).resolves.toEqual([]);
  });

  it("treats a null payload as empty rather than crashing the page", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors()).resolves.toEqual([]);
  });

  it("throws when the read fails, rather than rendering an empty list", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors()).rejects.toThrow(/boom/);
  });
});

describe("createFursona", () => {
  it("passes trimmed values through to the rpc", async () => {
    rpc.mockResolvedValueOnce({ data: "new-ref", error: null });
    const { createFursona } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(
      createFursona({
        handle: "  Sparky  ",
        displayName: " Sparky ",
        avatarUrl: "",
        visibility: "private",
      }),
    ).resolves.toBe("new-ref");
    expect(rpc).toHaveBeenCalledWith("create_fursona", {
      p_handle: "Sparky",
      p_display_name: "Sparky",
      p_avatar_url: null,
      p_visibility: "private",
    });
  });

  it("surfaces a taken handle as a typed error the form can catch", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "handle already taken" },
    });
    const { createFursona, HandleTakenError } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(
      createFursona({
        handle: "taken",
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      }),
    ).rejects.toBeInstanceOf(HandleTakenError);
  });

  it("rethrows any other failure rather than reporting a taken handle", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "no person actor for caller" },
    });
    const { createFursona, HandleTakenError } =
      await import("@/features/actors/infrastructure/fursonas");
    const err = await createFursona({
      handle: "x",
      displayName: "",
      avatarUrl: "",
      visibility: "private",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(HandleTakenError);
  });
});

describe("updateFursona", () => {
  it("sends the actor ref and the editable fields", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { updateFursona } =
      await import("@/features/actors/infrastructure/fursonas");
    await updateFursona("ref-1", {
      displayName: "New",
      avatarUrl: "https://img.example/a.png",
      visibility: "public",
    });
    expect(rpc).toHaveBeenCalledWith("update_fursona", {
      p_actor_ref: "ref-1",
      p_display_name: "New",
      p_avatar_url: "https://img.example/a.png",
      p_visibility: "public",
    });
  });

  it("throws when the update is refused, so the caller cannot report success", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "fursona not found" },
    });
    const { updateFursona } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(
      updateFursona("ref-1", {
        displayName: "x",
        avatarUrl: "",
        visibility: "private",
      }),
    ).rejects.toThrow(/fursona not found/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd Z:/Github/aeleos/apps/hub && pnpm test
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `apps/hub/src/features/actors/infrastructure/fursonas.ts`:

```ts
import { createServerClient } from "@/shared/infrastructure/supabase-server";
import type {
  FursonaInput,
  Visibility,
} from "@/features/actors/domain/fursona-schema";

/**
 * An actor as the caller's own list exposes it.
 *
 * Carries no `owner_ref` and no `identity_sub`: `my_actors()` omits them by
 * construction, so the fursona-to-person mapping never reaches a client.
 */
export type Actor = {
  actorRef: string;
  kind: "person" | "fursona";
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  visibility: Visibility;
  status: "active" | "suspended";
};

/** Raised when a handle is already in use, so a form can say which field. */
export class HandleTakenError extends Error {
  /** @param message - the database's message. */
  constructor(message: string) {
    super(message);
    this.name = "HandleTakenError";
  }
}

/** The empty string means "absent" on the wire; the database wants null. */
const orNull = (value: string): string | null => value.trim() || null;

/**
 * Every actor the signed-in person may act as, their own person row first.
 *
 * @returns the caller's actors, or an empty list when they have none.
 * @throws when the read fails. Absence is an empty list; a failure must not
 * masquerade as one, or a transient error renders as "you have no fursonas"
 * and invites the person to create a duplicate.
 */
export async function listMyActors(): Promise<Actor[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_actors");
  if (error) throw new Error(`Could not read your actors: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    actorRef: row.actor_ref as string,
    kind: row.kind as Actor["kind"],
    handle: row.handle as string,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    visibility: row.visibility as Visibility,
    status: row.status as Actor["status"],
  }));
}

/**
 * Creates a fursona owned by the signed-in person.
 *
 * The owner is not a parameter here and is not one in the database either —
 * `create_fursona` derives it from the token, so there is nothing to forge.
 *
 * @param input - the validated fursona fields.
 * @returns the new actor's platform ID.
 * @throws {HandleTakenError} when the handle is already in use, in any case.
 * @throws on any other failure.
 */
export async function createFursona(input: FursonaInput): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_fursona", {
    p_handle: input.handle.trim(),
    p_display_name: orNull(input.displayName),
    p_avatar_url: orNull(input.avatarUrl),
    p_visibility: input.visibility,
  });

  if (error) {
    if (/handle already taken/i.test(error.message))
      throw new HandleTakenError(error.message);
    throw new Error(`Could not create the fursona: ${error.message}`);
  }
  return data as string;
}

/**
 * Edits a fursona the signed-in person owns.
 *
 * The handle is absent by design — it addresses the fursona, and renaming is a
 * separate concern. Ownership is re-checked in the database, so passing another
 * person's `actorRef` fails there rather than being trusted here.
 *
 * @param actorRef - the fursona's platform ID.
 * @param input - the editable fields.
 * @throws when the fursona does not exist or is not the caller's — the database
 * reports both identically, so this cannot be used to probe which refs are real.
 */
export async function updateFursona(
  actorRef: string,
  input: Omit<FursonaInput, "handle">,
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_fursona", {
    p_actor_ref: actorRef,
    p_display_name: orNull(input.displayName),
    p_avatar_url: orNull(input.avatarUrl),
    p_visibility: input.visibility,
  });
  if (error) throw new Error(`Could not update the fursona: ${error.message}`);
}
```

- [ ] **Step 4: Export through the barrel**

Append to `apps/hub/src/features/actors/index.ts`:

```ts
export {
  listMyActors,
  createFursona,
  updateFursona,
  HandleTakenError,
  type Actor,
} from "@/features/actors/infrastructure/fursonas";
export {
  VISIBILITIES,
  parseFursona,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";
```

- [ ] **Step 5: Run the tests**

```bash
cd Z:/Github/aeleos/apps/hub && pnpm test:coverage
```

Expected: all pass, coverage 100/100/100/100.

- [ ] **Step 6: Verify by sabotage**

Change the error branch in `listMyActors` to `return []` instead of throwing.
Expected: **"throws when the read fails" goes red.** Restore. This is the
absence-versus-failure distinction the repo already guards in `getPersonActor`;
it matters more here, because the failure mode invites a duplicate.

- [ ] **Step 7: Commit**

```bash
cd Z:/Github/aeleos
git add apps/hub/src/features/actors/ apps/hub/tests/fursonas.test.ts
git commit -m "feat(hub): add the fursona data layer

listMyActors, createFursona and updateFursona over the 0009 RPCs, mapping
the database's snake_case into the Actor shape the pages consume.

A failed read throws rather than returning an empty list. The two are
different answers and the wrong one is worse than it looks: a transient
error rendering as \"you have no fursonas\" invites the person to create a
duplicate of one they already have.

A taken handle becomes a typed error so the form can put the message
beside the handle field instead of at the top of the page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The fursona list page

**Files:**

- Create: `apps/hub/src/features/actors/presentation/actor-tile.tsx`
- Create: `apps/hub/src/app/[locale]/(app)/fursonas/page.tsx`
- Modify: `apps/hub/src/features/actors/index.ts`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json`, `es.json`
- Modify: `apps/hub/src/app/[locale]/(app)/me/page.tsx` (add a link)

**Interfaces:**

- Consumes: `listMyActors`, `Actor` from `@/features/actors`; `Card` from
  `@/shared/presentation/page-shell`; `Link` from
  `@/shared/infrastructure/i18n/navigation`.
- Produces: `ActorTile` — a presentational tile taking an `Actor` plus already-
  translated labels as props.

- [ ] **Step 1: Add the message keys to both catalogues**

`en.json`, as a new top-level `fursonas` block:

```json
  "fursonas": {
    "title": "Your fursonas",
    "subtitle": "The characters you can act as across Furry Colombia.",
    "empty": "You have no fursonas yet.",
    "create": "New fursona",
    "edit": "Edit",
    "you": "You",
    "visibility": {
      "private": "Private",
      "unlisted": "Unlisted",
      "public": "Public"
    }
  },
```

`es.json`, the same keys:

```json
  "fursonas": {
    "title": "Tus fursonas",
    "subtitle": "Los personajes con los que puedes actuar en Furry Colombia.",
    "empty": "Aún no tienes fursonas.",
    "create": "Nueva fursona",
    "edit": "Editar",
    "you": "Tú",
    "visibility": {
      "private": "Privada",
      "unlisted": "No listada",
      "public": "Pública"
    }
  },
```

Add the `me.fursonasLink` key to both while you are here — `"Your fursonas"` /
`"Tus fursonas"` — under the existing `profile` block.

`apps/hub/tests/messages.test.ts` fails if a key exists in one language and not
the other. Run `pnpm --filter hub test` after this step and before writing any
component; a missing Spanish key is cheaper to find now.

- [ ] **Step 2: Write the tile**

Create `apps/hub/src/features/actors/presentation/actor-tile.tsx`:

```tsx
import type { Actor } from "@/features/actors/infrastructure/fursonas";

/** What {@link ActorTile} needs to render one actor. */
export interface ActorTileProps {
  /** The actor to show. */
  actor: Actor;
  /** Translated label marking the caller's own person row. */
  youLabel: string;
  /** Translated name of the actor's visibility. */
  visibilityLabel: string;
}

/**
 * One actor, as a tile in the list.
 *
 * Takes translated strings as props rather than calling a translation hook, so
 * the component stays renderable in a test without an i18n provider — the same
 * props-injection rule the shared packages follow.
 *
 * The avatar is a plain `img`: `avatar_url` is a URL the person supplied, and
 * `next/image` would need every possible host in its remote allowlist. The URL
 * is scheme-checked in `fursona-schema` before it is ever stored.
 *
 * @param props - the actor and its translated labels.
 * @returns the tile.
 */
export function ActorTile({
  actor,
  youLabel,
  visibilityLabel,
}: ActorTileProps) {
  return (
    <li className="flex items-center gap-4 rounded-xl border border-[var(--edge)]/40 p-4">
      {actor.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={actor.avatarUrl}
          alt=""
          className="size-12 rounded-full object-cover ring-2 ring-[var(--ring)]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="size-12 rounded-full bg-[var(--bar)] ring-2 ring-[var(--ring)]"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {actor.displayName ?? actor.handle}
        </span>
        <span className="block truncate text-sm text-[var(--muted)]">
          @{actor.handle}
        </span>
      </span>
      <span className="text-xs text-[var(--muted)]">
        {actor.kind === "person" ? youLabel : visibilityLabel}
      </span>
    </li>
  );
}
```

Export it from the barrel alongside the data layer:

```ts
export {
  ActorTile,
  type ActorTileProps,
} from "@/features/actors/presentation/actor-tile";
```

- [ ] **Step 3: Write the page**

Create `apps/hub/src/app/[locale]/(app)/fursonas/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Card } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { ActorTile, listMyActors } from "@/features/actors";

/**
 * The list of actors the signed-in person may act as.
 *
 * Reads through `my_actors()`, which returns the person row first, so
 * "yourself" is the leading tile rather than a special case in this component.
 *
 * @returns the fursona list page.
 */
export default async function FursonasPage() {
  const actors = await listMyActors();
  const t = await getTranslations("fursonas");

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <Link
          href="/fursonas/new"
          className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]"
        >
          {t("create")}
        </Link>
      </div>

      {actors.length === 1 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">{t("empty")}</p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {actors.map((actor) => (
            <ActorTile
              key={actor.actorRef}
              actor={actor}
              youLabel={t("you")}
              visibilityLabel={t(`visibility.${actor.visibility}`)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
```

`actors.length === 1` rather than `=== 0`: every signed-in person has a person
row, so one actor means no fursonas. If that ever stops being true the empty
state is wrong rather than dangerous — but say so in a comment so the next
reader does not "fix" it to `=== 0`.

- [ ] **Step 4: Link it from the profile page**

In `apps/hub/src/app/[locale]/(app)/me/page.tsx`, add a link to `/fursonas`
inside the bordered section that currently holds only the sign-out control, using
the `profile.fursonasLink` key added in Step 1 and the same `Link` import as
above. Keep the sign-out control last.

- [ ] **Step 5: Run every gate**

```bash
cd Z:/Github/aeleos && pnpm lint && pnpm typecheck
cd apps/hub && pnpm test:coverage && pnpm build
```

Expected: all pass. `i18next/no-literal-string` will catch any string you
hardcoded; `messages.test.ts` will catch any key missing from Spanish.

- [ ] **Step 6: Commit**

```bash
cd Z:/Github/aeleos
git add apps/hub/src apps/hub/tests
git commit -m "feat(hub): list the actors you can act as

The person row comes first because my_actors orders it first, so acting
as yourself is the leading tile rather than a special case in the
component.

ActorTile takes translated strings as props instead of calling a
translation hook, so it renders in a test without an i18n provider — the
same props-injection rule the shared packages follow.

The avatar is a plain img rather than next/image: the URL is
person-supplied and next/image would need every possible host in its
remote allowlist. The scheme is checked before the value is stored.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Creating a fursona

**Files:**

- Create: `apps/hub/src/features/actors/presentation/fursona-form.tsx`
- Create: `apps/hub/src/app/[locale]/(app)/fursonas/actions.ts`
- Create: `apps/hub/src/app/[locale]/(app)/fursonas/new/page.tsx`
- Modify: `apps/hub/src/features/actors/index.ts`, both message catalogues

**Interfaces:**

- Consumes: `parseFursona`, `createFursona`, `HandleTakenError`, `VISIBILITIES`
  from `@/features/actors`.
- Produces: `FursonaForm` — a client component taking translated labels, an
  optional initial value, and a server action; `createFursonaAction(prev, formData)`
  returning `{ errors: Record<string, string> } | never` (it redirects on success).

- [ ] **Step 1: Add the message keys to both catalogues**

Under the existing `fursonas` block in `en.json`:

```json
    "form": {
      "handle": "Handle",
      "handleHint": "Letters, digits, dash and underscore. This is how the fursona is addressed.",
      "displayName": "Display name",
      "avatarUrl": "Avatar URL",
      "visibilityLabel": "Who can find this fursona",
      "submitCreate": "Create fursona",
      "submitSave": "Save changes",
      "errors": {
        "handle": "Use 1–32 letters, digits, dashes or underscores.",
        "handleTaken": "That handle is already taken.",
        "displayName": "Keep this under 64 characters.",
        "avatarUrl": "Enter an http or https image address, or leave it empty.",
        "visibility": "Choose one of the options."
      }
    },
```

And the Spanish equivalents in `es.json`. Translate rather than transliterate —
`"handleTaken"` is `"Ese identificador ya está en uso."`, not a calque.

- [ ] **Step 2: Write the form**

Create `apps/hub/src/features/actors/presentation/fursona-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  VISIBILITIES,
  type FursonaFormState,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";

/** Translated strings {@link FursonaForm} renders. */
export interface FursonaFormLabels {
  handle: string;
  handleHint: string;
  displayName: string;
  avatarUrl: string;
  visibilityLabel: string;
  submit: string;
  visibility: Record<Visibility, string>;
  errors: Record<string, string>;
}

/** What {@link FursonaForm} needs to render and submit. */
export interface FursonaFormProps {
  /** The server action to submit to. */
  action: (
    state: FursonaFormState,
    formData: FormData,
  ) => Promise<FursonaFormState>;
  /** Already-translated labels and error messages. */
  labels: FursonaFormLabels;
  /** Existing values when editing; absent when creating. */
  initial?: Partial<FursonaInput>;
  /** False when editing — the handle is then shown but not submitted. */
  handleEditable: boolean;
  /** The fursona being edited, sent back so the action knows which row. */
  actorRef?: string;
}

/**
 * The create and edit form for a fursona.
 *
 * Takes translated strings as props rather than calling a translation hook: it
 * is a client component, and passing the strings in keeps the catalogue lookup
 * on the server where the locale already is.
 *
 * Error messages are looked up from `labels.errors` by the **code** the server
 * action returns, so the wording lives in the catalogues and the action stays
 * locale-free.
 *
 * @param props - the action, the labels, and any existing values.
 * @returns the form.
 */
export function FursonaForm({
  action,
  labels,
  initial,
  handleEditable,
  actorRef,
}: FursonaFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });

  /**
   * The error message for a field, if it has one.
   *
   * @param field - the field name.
   * @returns the translated message, or undefined.
   */
  const errorFor = (field: string): string | undefined => {
    const code = state.errors[field];
    if (!code) return undefined;
    // Codes the action invents (handleTaken) and codes zod produces both land
    // here; fall back to the field's generic message for the latter.
    return labels.errors[code] ?? labels.errors[field];
  };

  return (
    <form action={formAction} className="mt-8 grid gap-6">
      {actorRef ? (
        <input type="hidden" name="actorRef" value={actorRef} />
      ) : null}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.handle}</span>
        {handleEditable ? (
          <input
            name="handle"
            defaultValue={initial?.handle ?? ""}
            required
            maxLength={32}
            aria-invalid={Boolean(errorFor("handle"))}
            aria-describedby="handle-hint"
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
          />
        ) : (
          // Read-only text, not a disabled input: a disabled input submits
          // nothing, and the update action does not want the handle anyway.
          <span className="px-3 py-2 font-mono text-sm text-[var(--muted)]">
            @{initial?.handle}
          </span>
        )}
        <span id="handle-hint" className="text-xs text-[var(--muted)]">
          {errorFor("handle") ?? labels.handleHint}
        </span>
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.displayName}</span>
        <input
          name="displayName"
          defaultValue={initial?.displayName ?? ""}
          maxLength={64}
          aria-invalid={Boolean(errorFor("displayName"))}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
        />
        {errorFor("displayName") ? (
          <span className="text-xs text-[var(--accent)]">
            {errorFor("displayName")}
          </span>
        ) : null}
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.avatarUrl}</span>
        <input
          name="avatarUrl"
          type="url"
          defaultValue={initial?.avatarUrl ?? ""}
          aria-invalid={Boolean(errorFor("avatarUrl"))}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
        />
        {errorFor("avatarUrl") ? (
          <span className="text-xs text-[var(--accent)]">
            {errorFor("avatarUrl")}
          </span>
        ) : null}
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.visibilityLabel}</span>
        <select
          name="visibility"
          defaultValue={initial?.visibility ?? "private"}
          aria-invalid={Boolean(errorFor("visibility"))}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {labels.visibility[v]}
            </option>
          ))}
        </select>
        {errorFor("visibility") ? (
          <span className="text-xs text-[var(--accent)]">
            {errorFor("visibility")}
          </span>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
```

Export `FursonaForm` and `FursonaFormLabels` from the feature barrel.

- [ ] **Step 3: Write the server action**

Create `apps/hub/src/app/[locale]/(app)/fursonas/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import {
  HandleTakenError,
  createFursona,
  parseFursona,
} from "@/features/actors";

/** What the fursona form renders back after a submit. */
export type FursonaFormState = { errors: Record<string, string> };

/**
 * Creates a fursona from submitted form data.
 *
 * **Re-validates on the server.** The form validates too, but that is a
 * convenience for the person typing — this is the control. Anything reaching
 * this function is unvalidated input regardless of what the client did.
 *
 * @param _prev - the previous form state, unused.
 * @param formData - the submitted fields.
 * @returns field-keyed error codes, or redirects to the list on success.
 */
export async function createFursonaAction(
  _prev: FursonaFormState,
  formData: FormData,
): Promise<FursonaFormState> {
  const parsed = parseFursona({
    handle: formData.get("handle"),
    displayName: formData.get("displayName") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
    visibility: formData.get("visibility"),
  });
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createFursona(parsed.value);
  } catch (error) {
    if (error instanceof HandleTakenError)
      return { errors: { handle: "handleTaken" } };
    throw error;
  }

  redirect("/fursonas");
}
```

`redirect` throws by design in Next, so it must sit outside the `try` — inside
it, the `catch` would swallow the redirect and the person would see the form
again after a successful create. Put a comment saying so.

- [ ] **Step 4: Write the page**

Create `apps/hub/src/app/[locale]/(app)/fursonas/new/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Card } from "@/shared/presentation/page-shell";
import { FursonaForm, type FursonaFormLabels } from "@/features/actors";
import { createFursonaAction } from "../actions";

/**
 * Resolves every label the form needs, on the server where the locale is.
 *
 * @returns the translated labels.
 */
async function labels(): Promise<FursonaFormLabels> {
  const t = await getTranslations("fursonas");
  return {
    handle: t("form.handle"),
    handleHint: t("form.handleHint"),
    displayName: t("form.displayName"),
    avatarUrl: t("form.avatarUrl"),
    visibilityLabel: t("form.visibilityLabel"),
    submit: t("form.submitCreate"),
    visibility: {
      private: t("visibility.private"),
      unlisted: t("visibility.unlisted"),
      public: t("visibility.public"),
    },
    errors: {
      handle: t("form.errors.handle"),
      handleTaken: t("form.errors.handleTaken"),
      displayName: t("form.errors.displayName"),
      avatarUrl: t("form.errors.avatarUrl"),
      visibility: t("form.errors.visibility"),
    },
  };
}

/**
 * The page for creating a fursona.
 *
 * @returns the create page.
 */
export default async function NewFursonaPage() {
  const t = await getTranslations("fursonas");
  return (
    <Card>
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {t("create")}
      </h1>
      <FursonaForm
        action={createFursonaAction}
        labels={await labels()}
        handleEditable
      />
    </Card>
  );
}
```

`labels()` is duplicated by the edit page with a different `submit` key. Leave
the duplication rather than lifting it into the feature: it is a mapping from
catalogue keys to props, and a shared helper would have to take the submit key
as a parameter, which is more indirection than the four lines it saves. If a
third caller appears, lift it then.

- [ ] **Step 5: Test the action**

Create `apps/hub/tests/fursona-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const createFursona = vi.fn<(...a: unknown[]) => unknown>();
const updateFursona = vi.fn<(...a: unknown[]) => unknown>();
const redirect = vi.fn<(...a: unknown[]) => never>(() => {
  // Next's redirect signals by throwing. Modelling that is the whole point of
  // this mock: a test with a silent redirect would not catch the action
  // swallowing it inside a try block.
  throw new Error("NEXT_REDIRECT");
});

class HandleTakenError extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => redirect(...a),
}));
vi.mock("@/features/actors", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/actors/domain/fursona-schema")
  >("@/features/actors/domain/fursona-schema");
  return {
    parseFursona: actual.parseFursona,
    createFursona: (...a: unknown[]) => createFursona(...a),
    updateFursona: (...a: unknown[]) => updateFursona(...a),
    HandleTakenError,
  };
});

/**
 * Form data for a fursona, with overrides applied.
 *
 * @param over - fields to replace.
 * @returns the populated FormData.
 */
function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields = {
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: "",
    visibility: "private",
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createFursonaAction", () => {
  it("returns field errors without touching the database", async () => {
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await createFursonaAction(
      { errors: {} },
      form({ handle: "" }),
    );
    expect(state.errors.handle).toBeDefined();
    expect(createFursona).not.toHaveBeenCalled();
  });

  // The client validates too, but that is a convenience. If this test can be
  // deleted without anything else failing, the action has stopped being the
  // control it is supposed to be.
  it("re-validates on the server even when the client would have passed", async () => {
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await createFursonaAction(
      { errors: {} },
      form({ avatarUrl: "javascript:alert(1)" }),
    );
    expect(state.errors.avatarUrl).toBeDefined();
    expect(createFursona).not.toHaveBeenCalled();
  });

  it("reports a taken handle against the handle field", async () => {
    createFursona.mockRejectedValueOnce(new HandleTakenError("taken"));
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await createFursonaAction({ errors: {} }, form());
    expect(state.errors).toEqual({ handle: "handleTaken" });
  });

  it("redirects to the list on success", async () => {
    createFursona.mockResolvedValueOnce("new-ref");
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(createFursonaAction({ errors: {} }, form())).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(redirect).toHaveBeenCalledWith("/fursonas");
  });

  it("lets an unexpected failure propagate rather than showing a field error", async () => {
    createFursona.mockRejectedValueOnce(new Error("no person actor"));
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(createFursonaAction({ errors: {} }, form())).rejects.toThrow(
      /no person actor/,
    );
  });
});
```

The `redirect` mock throws on purpose. Next's real `redirect` signals by
throwing, and a mock that returned quietly would let the action swallow it
inside a `try` block with every test still green — which is exactly the defect
Step 6 sabotages for.

- [ ] **Step 6: Run every gate, then sabotage**

```bash
cd Z:/Github/aeleos && pnpm lint && pnpm typecheck
cd apps/hub && pnpm test:coverage && pnpm build
```

Then move the `redirect("/fursonas")` call inside the `try` block. Expected:
**"redirects to the list on success" goes red** — the redirect's control-flow
exception is caught by the `catch`, which does not recognise it as a
`HandleTakenError` and rethrows it as a plain error, so `redirect` never
appears to have succeeded. Restore and confirm green.

- [ ] **Step 7: Commit**

```bash
cd Z:/Github/aeleos
git add apps/hub/src apps/hub/tests
git commit -m "feat(hub): create a fursona

The server action re-validates with the same schema the form uses. The
client check is a convenience for the person typing; this one is the
control, and anything arriving here is unvalidated input regardless of
what the client did.

redirect() sits outside the try block on purpose: it signals by throwing,
so inside the catch it would be swallowed and a successful create would
render the form again. Verified by sabotage.

A taken handle comes back keyed to the handle field, so the message lands
beside the input rather than at the top of the page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Editing a fursona

**Files:**

- Create: `apps/hub/src/app/[locale]/(app)/fursonas/[handle]/edit/page.tsx`
- Modify: `apps/hub/src/app/[locale]/(app)/fursonas/actions.ts`
- Modify: `apps/hub/src/features/actors/presentation/actor-tile.tsx` (edit link)
- Test: `apps/hub/tests/fursona-actions.test.ts`

**Interfaces:**

- Consumes: `listMyActors`, `updateFursona`, `parseFursona` from
  `@/features/actors`.
- Produces: `updateFursonaAction(prev, formData)` — reads `actorRef` from a
  hidden field, re-validates, and redirects to the list.

- [ ] **Step 1: Add the update action**

Append to `apps/hub/src/app/[locale]/(app)/fursonas/actions.ts`:

```ts
/**
 * Edits a fursona from submitted form data.
 *
 * **The `actorRef` in the form is not trusted.** `update_fursona` re-derives
 * ownership from the token in the database and reports "missing" and "not
 * yours" identically, so a tampered hidden field fails there. Deliberately no
 * second ownership check here: two checks drift, and the one in SQL is the one
 * that cannot be bypassed.
 *
 * The handle is not editable, so a placeholder that satisfies the shared schema
 * is supplied and then discarded — reusing one schema keeps the validation
 * rules in a single place rather than forking a nearly-identical one.
 *
 * @param _prev - the previous form state, unused.
 * @param formData - the submitted fields, including `actorRef`.
 * @returns field-keyed error codes, or redirects to the list on success.
 */
export async function updateFursonaAction(
  _prev: FursonaFormState,
  formData: FormData,
): Promise<FursonaFormState> {
  const actorRef = String(formData.get("actorRef") ?? "");
  if (!actorRef) return { errors: { handle: "invalid_type" } };

  const parsed = parseFursona({
    // Not submitted and not editable; a valid placeholder keeps one schema.
    handle: "placeholder",
    displayName: formData.get("displayName") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
    visibility: formData.get("visibility"),
  });
  if (!parsed.ok) {
    // A handle error here can only come from the placeholder, so it is a bug in
    // this function rather than something the person typed. Never show it.
    const { handle: _ignored, ...errors } = parsed.errors;
    return { errors };
  }

  const { handle: _discard, ...fields } = parsed.value;
  await updateFursona(actorRef, fields);

  redirect("/fursonas");
}
```

Add `updateFursona` and `FursonaFormState` to the imports at the top of the file.

- [ ] **Step 2: Write the edit page**

Create `apps/hub/src/app/[locale]/(app)/fursonas/[handle]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/shared/presentation/page-shell";
import {
  FursonaForm,
  listMyActors,
  type FursonaFormLabels,
} from "@/features/actors";
import { updateFursonaAction } from "../../actions";

/**
 * Resolves every label the form needs, on the server where the locale is.
 *
 * @returns the translated labels.
 */
async function labels(): Promise<FursonaFormLabels> {
  const t = await getTranslations("fursonas");
  return {
    handle: t("form.handle"),
    handleHint: t("form.handleHint"),
    displayName: t("form.displayName"),
    avatarUrl: t("form.avatarUrl"),
    visibilityLabel: t("form.visibilityLabel"),
    submit: t("form.submitSave"),
    visibility: {
      private: t("visibility.private"),
      unlisted: t("visibility.unlisted"),
      public: t("visibility.public"),
    },
    errors: {
      handle: t("form.errors.handle"),
      handleTaken: t("form.errors.handleTaken"),
      displayName: t("form.errors.displayName"),
      avatarUrl: t("form.errors.avatarUrl"),
      visibility: t("form.errors.visibility"),
    },
  };
}

/**
 * The page for editing one of your fursonas.
 *
 * The route is keyed by **handle** rather than `actor_ref`: a handle is what a
 * person recognises in a URL, and a UUID means nothing to them.
 *
 * Resolution goes through `listMyActors()`, which returns only the caller's own
 * actors — so a handle belonging to someone else is simply not found. That is
 * the authorization, and it is the same code path as the happy one, so there is
 * no separate ownership check to forget.
 *
 * @returns the edit page, or a 404 when no owned fursona matches.
 */
export default async function EditFursonaPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const actors = await listMyActors();
  const actor = actors.find(
    (a) =>
      a.kind === "fursona" && a.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (!actor) notFound();

  const t = await getTranslations("fursonas");

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {t("edit")}
      </h1>
      <FursonaForm
        action={updateFursonaAction}
        labels={await labels()}
        handleEditable={false}
        actorRef={actor.actorRef}
        initial={{
          handle: actor.handle,
          displayName: actor.displayName ?? "",
          avatarUrl: actor.avatarUrl ?? "",
          visibility: actor.visibility,
        }}
      />
    </Card>
  );
}
```

The handle comparison is case-insensitive because the database's unique index is
on `lower(handle)` — `/fursonas/Sparky/edit` and `/fursonas/sparky/edit` address
the same fursona, and only one of them would work otherwise.

- [ ] **Step 3: Add the edit link to the tile**

Extend `ActorTileProps` with two optional props and render them only for a
fursona:

```tsx
  /** Where the edit page for this actor lives. Absent for a person row. */
  editHref?: string;
  /** Translated label for the edit link. */
  editLabel?: string;
```

and, before the closing `</li>`:

```tsx
{
  actor.kind === "fursona" && editHref ? (
    <Link href={editHref} className="text-sm underline">
      {editLabel}
    </Link>
  ) : null;
}
```

importing `Link` from `@/shared/infrastructure/i18n/navigation`. A person row
gets no link at all rather than a disabled one — a disabled control suggests the
page exists and is temporarily unavailable, which is not true.

Then pass them from the list page:

```tsx
              editHref={`/fursonas/${actor.handle}/edit`}
              editLabel={t("edit")}
```

- [ ] **Step 4: Extend the action tests**

Append to `apps/hub/tests/fursona-actions.test.ts`:

```ts
describe("updateFursonaAction", () => {
  /**
   * Edit form data, with overrides.
   *
   * @param over - fields to replace.
   * @returns the populated FormData.
   */
  function editForm(over: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const fields = {
      actorRef: "ref-1",
      displayName: "After",
      avatarUrl: "",
      visibility: "public",
      ...over,
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("sends the edit to the database and redirects", async () => {
    updateFursona.mockResolvedValueOnce(undefined);
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(
      updateFursonaAction({ errors: {} }, editForm()),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(updateFursona).toHaveBeenCalledWith("ref-1", {
      displayName: "After",
      avatarUrl: "",
      visibility: "public",
    });
  });

  it("returns field errors without touching the database", async () => {
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await updateFursonaAction(
      { errors: {} },
      editForm({ avatarUrl: "javascript:alert(1)" }),
    );
    expect(state.errors.avatarUrl).toBeDefined();
    expect(updateFursona).not.toHaveBeenCalled();
  });

  // The placeholder handle is this function's own invention. Leaking a handle
  // error would show a message about a field the person cannot even see.
  it("never reports an error against the handle it supplied itself", async () => {
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await updateFursonaAction(
      { errors: {} },
      editForm({ visibility: "everyone" }),
    );
    expect(state.errors.handle).toBeUndefined();
  });

  it("rejects a submit with no actor ref rather than guessing one", async () => {
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await updateFursonaAction(
      { errors: {} },
      editForm({ actorRef: "" }),
    );
    expect(updateFursona).not.toHaveBeenCalled();
    expect(state.errors).not.toEqual({});
  });

  // A refusal from the database must not read as success. update_fursona
  // raises when the row is missing OR not the caller's, so this is also the
  // cross-owner case seen from the action's side.
  it("lets a refusal propagate rather than redirecting", async () => {
    updateFursona.mockRejectedValueOnce(new Error("fursona not found"));
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(
      updateFursonaAction({ errors: {} }, editForm()),
    ).rejects.toThrow(/fursona not found/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run every gate**

```bash
cd Z:/Github/aeleos && pnpm lint && pnpm typecheck && pnpm format:check && pnpm check:tools && pnpm check:docs origin/main
cd apps/hub && pnpm test:coverage && pnpm build
cd ../../packages/identity && pnpm test:coverage
cd ../.. && pnpm test:db
```

Expected: all pass. This is the full gate set; `test:db` needs Docker running for
the local Supabase instance.

- [ ] **Step 6: Commit**

```bash
cd Z:/Github/aeleos
git add apps/hub/src apps/hub/tests
git commit -m "feat(hub): edit a fursona

The route is keyed by handle rather than actor_ref: a handle is what a
person recognises in a URL, and resolving it through listMyActors means a
handle the caller does not own simply is not found — no ownership check
to write, and none to forget.

The hidden actorRef field is not trusted. update_fursona re-derives
ownership in the database and reports missing and not-yours identically,
so a tampered field fails there rather than here, where a second check
could drift from the first.

The handle is read-only when editing rather than disabled: a disabled
input submits nothing, and renaming is a separate concern with its own
collision and redirect problems.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done when

- `pnpm test:db` passes, including the pre-existing conformance suite, after a
  full `supabase db reset`.
- A person can create, list and edit fursonas in both languages, and
  `messages.test.ts` proves neither catalogue is missing a key.
- Both hub and package suites are 100/100/100/100, with no threshold lowered.
- `pnpm lint` rejects a `domain/` file importing `infrastructure/` — verified by
  sabotage against a real file rather than a scratch one.
- The exposure boundary holds: no response, error message or rendered page
  contains `owner_ref` or `identity_sub`. Check with
  `grep -rn "owner_ref|identity_sub" apps/hub/src` — expected: no matches.
- The picker, the `return_to` allowlist, the sync API and the integrator guide
  are **not** in this PR. They are the second half, and the plan for them starts
  from tasks 6–9 of the superseded document.
