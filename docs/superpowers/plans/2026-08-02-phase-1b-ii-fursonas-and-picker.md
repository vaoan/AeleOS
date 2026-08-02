# Phase 1b-ii — Fursonas, the Picker, and the App Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hub from "you are signed in" into "you are whoever you choose to be" — fursona creation and editing, the Netflix-style picker, and the protocol by which a consuming app asks the hub who the user wants to act as.

**Architecture:** All writes to `actors` go through `security definer` RPCs in a **hub-local** migration, because the canonical migrations revoke every client grant on that table and this plan must not weaken that. Consuming apps never talk to the hub's database — they call one read API with the user's own Clerk token, and they re-validate any actor the hub hands back against their own mirror, so a tampered redirect grants nothing.

**Tech Stack:** Next.js 16 Server Actions, React 19, Tailwind CSS 4, `@supabase/supabase-js`, zod, Vitest, Playwright. No new dependencies beyond Phase 1b-i.

## Global Constraints

- **Depends on Phase 1b-i.** The repo, Clerk auth, `createServerClient()`, `ensurePersonActor()` and the registry must already exist.
- **Canonical migrations `0001`–`0007` are never edited.** Hub-local SQL is numbered from `0100` so the boundary between "copied from aeleos" and "belongs to this app" is visible at a glance.
- **The exposure boundary holds inside the hub too.** `owner_ref`, `identity_sub` and `author_person_ref` must never reach a client — not through a view, an RPC return type, an API response, or an error message. The catalog invariant test in `aeleos` exists because copying apps are where the next leak comes from; the hub is a copying app.
- **`return_to` is an open-redirect vector.** Every redirect target is validated against an explicit origin allowlist. Never redirect to a caller-supplied URL without checking it.
- **Budget: $0.** Clerk free plan, no new paid services, no file storage (avatars are URLs in this phase).
- **Toolchain parity** with `aeleos`, puck and candystore — unchanged from 1b-i.
- **Secrets never in git.** `pnpm secretlint` must pass.
- Filenames kebab-case. Work on a branch; do not merge or open a PR without explicit instruction.

## Out of scope, deliberately

- **Pronouns.** The canonical `actors` table has no pronouns column. Adding one is a change to `aeleos` that every consuming app must then adopt — too wide a blast radius to smuggle into this plan. Recorded as follow-on.
- **Avatar uploads.** `avatar_url` accepts a URL. File storage is a separate concern with its own cost and moderation implications.
- **Fursona transfer.** Phase 2, and it needs the ownership ledger.
- **The public directory.** Spec §11; `visibility` is written here but nothing renders a public listing.

---

### Task 1: Hub-local RPCs for reading your own actors

**Files:**

- Create: `supabase/migrations/0100_hub_actor_rpcs.sql`
- Test: `tests/db/hub-rpcs.test.ts`
- Create: `vitest.config.db.ts`
- Modify: `package.json` (add `test:db`)

**Interfaces:**

- Consumes: `actors`, `current_person_ref()` from the canonical migrations.
- Produces: `public.my_actors()` returning `(actor_ref uuid, kind text, handle text, display_name text, avatar_url text, visibility text, status text)` — the caller's person row plus every fursona they own, and nothing else.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0100_hub_actor_rpcs.sql`:

```sql
-- Hub-local. Numbered from 0100 to keep it visibly separate from the canonical
-- migrations 0001-0007, which are copied from aeleos and must never be edited.

-- Returns the caller's own actors: their person row and the fursonas they own.
--
-- Deliberately does NOT return owner_ref or identity_sub. The caller already
-- knows they own these rows — echoing the linkage back would put the
-- fursona -> person mapping on the wire for no benefit, and this response is
-- consumed by other applications.
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

> The `order by` puts the person row first — the picker renders "yourself" as the
> leading tile, which is what makes acting as yourself an ordinary choice rather
> than an escape hatch.

- [ ] **Step 2: Add a database test suite**

`vitest.config.db.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/db/global-setup.ts"],
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
```

Add to `package.json` `scripts`:

```json
"test:db": "supabase db reset && vitest run -c vitest.config.db.ts"
```

Copy the harness from aeleos, which already mints tokens and runs SQL with claims in scope:

```bash
mkdir -p tests/db
cp Z:/Github/aeleos/tests/db/helpers.ts tests/db/helpers.ts
cp Z:/Github/aeleos/tests/db/global-setup.ts tests/db/global-setup.ts
```

- [ ] **Step 3: Write the failing test**

`tests/db/hub-rpcs.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

type Seed = { sub: string; personRef: string; sonaRef: string };

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

  it("never returns another person's actors", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).not.toContain(bob.personRef);
    expect(refs).not.toContain(bob.sonaRef);
  });

  it("never exposes ownership columns", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    for (const row of data as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty("owner_ref");
      expect(row).not.toHaveProperty("identity_sub");
    }
  });

  it("returns nothing for a caller with no actors", async () => {
    const c = await clientAs(newSub());
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test:db`
Expected: FAIL — `my_actors` does not exist.

- [ ] **Step 5: Apply and re-run**

Run: `pnpm test:db`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0100_hub_actor_rpcs.sql tests/db/ vitest.config.db.ts package.json
git commit -m "feat(db): add my_actors rpc for reading your own actors"
```

---

### Task 2: Hub-local RPCs for creating and editing fursonas

**Files:**

- Modify: `supabase/migrations/0100_hub_actor_rpcs.sql`
- Test: `tests/db/hub-fursona-writes.test.ts`

**Interfaces:**

- Consumes: `current_person_ref()`, `actors`.
- Produces:
  - `public.create_fursona(p_handle text, p_display_name text, p_avatar_url text, p_visibility text) returns uuid` — returns the new `actor_ref`.
  - `public.update_fursona(p_actor_ref uuid, p_display_name text, p_avatar_url text, p_visibility text) returns void`.

- [ ] **Step 1: Append the write RPCs to the migration**

Add to `supabase/migrations/0100_hub_actor_rpcs.sql`:

```sql
-- Creating a fursona. security definer because the canonical migrations revoke
-- every client grant on `actors`; the hub does not re-open that table, it
-- exposes exactly these two narrow operations instead.
--
-- The owner is taken from the token, never from a parameter — a caller cannot
-- create a fursona owned by someone else.
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
    raise exception 'handle already taken' using errcode = '23505';
  end;

  return v_ref;
end;
$$;

-- Editing a fursona. Ownership is re-checked here rather than trusted from the
-- client: the WHERE clause is the authorization.
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
         visibility   = p_visibility,
         updated_at   = now()
   where actor_ref = p_actor_ref
     and kind      = 'fursona'
     and owner_ref = v_owner;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- Same error whether the row is missing or owned by someone else, so this
    -- cannot be used to probe which handles exist.
    raise exception 'fursona not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_fursona(text, text, text, text) from public;
revoke all on function public.update_fursona(uuid, text, text, text) from public;
grant execute on function public.create_fursona(text, text, text, text) to authenticated;
grant execute on function public.update_fursona(uuid, text, text, text) to authenticated;
```

- [ ] **Step 2: Write the failing test**

`tests/db/hub-fursona-writes.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withSuperuser } from "./helpers";

async function seedPerson(): Promise<{ sub: string; personRef: string }> {
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

let alice: { sub: string; personRef: string };
let bob: { sub: string; personRef: string };

beforeAll(async () => {
  alice = await seedPerson();
  bob = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

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
    expect(error?.message).toMatch(/handle already taken/);
  });

  it("rejects a blank handle", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "   ",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/handle is required/);
  });

  it("rejects an invalid visibility", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "everyone",
    });
    expect(error?.message).toMatch(/invalid visibility/);
  });

  it("refuses a caller with no person actor", async () => {
    const c = await clientAs(newSub());
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/no person actor/);
  });
});

describe("update_fursona", () => {
  it("updates a fursona the caller owns", async () => {
    const c = await clientAs(alice.sub);
    const { data: ref } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: "Before",
      p_avatar_url: null,
      p_visibility: "private",
    });

    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref as string,
      p_display_name: "After",
      p_avatar_url: "https://img.example/a.png",
      p_visibility: "public",
    });
    expect(error).toBeNull();

    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{ display_name: string; visibility: string }>(
        "select display_name, visibility from public.actors where actor_ref = $1",
        [ref as string],
      );
      return r.rows[0];
    });
    expect(row?.display_name).toBe("After");
    expect(row?.visibility).toBe("public");
  });

  it("refuses to update someone else's fursona", async () => {
    const aliceClient = await clientAs(alice.sub);
    const { data: ref } = await aliceClient.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: "Alice's",
      p_avatar_url: null,
      p_visibility: "private",
    });

    const bobClient = await clientAs(bob.sub);
    const { error } = await bobClient.rpc("update_fursona", {
      p_actor_ref: ref as string,
      p_display_name: "Hijacked",
      p_avatar_url: null,
      p_visibility: "public",
    });
    expect(error?.message).toMatch(/fursona not found/);

    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{ display_name: string }>(
        "select display_name from public.actors where actor_ref = $1",
        [ref as string],
      );
      return r.rows[0];
    });
    expect(row?.display_name).toBe("Alice's");
  });

  it("gives the same error for a missing ref as for one owned by another", async () => {
    const c = await clientAs(bob.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: randomUUID(),
      p_display_name: "x",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/fursona not found/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test:db`
Expected: FAIL — `create_fursona` does not exist.

- [ ] **Step 4: Apply and re-run**

Run: `pnpm test:db`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0100_hub_actor_rpcs.sql tests/db/hub-fursona-writes.test.ts
git commit -m "feat(db): add create_fursona and update_fursona rpcs"
```

---

### Task 3: The fursona data layer

**Files:**

- Create: `src/lib/fursonas.ts`
- Test: `tests/fursonas.test.ts`

**Interfaces:**

- Consumes: `createServerClient()` from 1b-i.
- Produces:
  - `type Actor = { actorRef: string; kind: "person" | "fursona"; handle: string; displayName: string | null; avatarUrl: string | null; visibility: "private" | "unlisted" | "public"; status: "active" | "suspended" }`
  - `listMyActors(): Promise<Actor[]>`
  - `createFursona(input: FursonaInput): Promise<string>` where `type FursonaInput = { handle: string; displayName: string; avatarUrl: string; visibility: Actor["visibility"] }`
  - `updateFursona(actorRef: string, input: Omit<FursonaInput, "handle">): Promise<void>`

- [ ] **Step 1: Write the failing test**

`tests/fursonas.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
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
    const { listMyActors } = await import("@/lib/fursonas");
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
    const { listMyActors } = await import("@/lib/fursonas");
    await expect(listMyActors()).resolves.toEqual([]);
  });
});

describe("createFursona", () => {
  it("passes trimmed values through to the rpc", async () => {
    rpc.mockResolvedValueOnce({ data: "new-ref", error: null });
    const { createFursona } = await import("@/lib/fursonas");
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

  it("surfaces a taken handle as a typed error", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "handle already taken" },
    });
    const { createFursona, HandleTakenError } = await import("@/lib/fursonas");
    await expect(
      createFursona({
        handle: "taken",
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      }),
    ).rejects.toBeInstanceOf(HandleTakenError);
  });
});

describe("updateFursona", () => {
  it("sends the actor ref and fields", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { updateFursona } = await import("@/lib/fursonas");
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `@/lib/fursonas` does not exist.

- [ ] **Step 3: Implement**

`src/lib/fursonas.ts`:

```ts
import { createServerClient } from "@/lib/supabase-server";

export type Actor = {
  actorRef: string;
  kind: "person" | "fursona";
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  visibility: "private" | "unlisted" | "public";
  status: "active" | "suspended";
};

export type FursonaInput = {
  handle: string;
  displayName: string;
  avatarUrl: string;
  visibility: Actor["visibility"];
};

/** Thrown when a handle collides. Callers render a field-level message. */
export class HandleTakenError extends Error {
  constructor() {
    super("That handle is already taken.");
    this.name = "HandleTakenError";
  }
}

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

type Row = {
  actor_ref: string;
  kind: Actor["kind"];
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  visibility: Actor["visibility"];
  status: Actor["status"];
};

export async function listMyActors(): Promise<Actor[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_actors");
  if (error) throw new Error(`Could not load your actors: ${error.message}`);

  return ((data ?? []) as Row[]).map((row) => ({
    actorRef: row.actor_ref,
    kind: row.kind,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    visibility: row.visibility,
    status: row.status,
  }));
}

export async function createFursona(input: FursonaInput): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_fursona", {
    p_handle: input.handle.trim(),
    p_display_name: blankToNull(input.displayName),
    p_avatar_url: blankToNull(input.avatarUrl),
    p_visibility: input.visibility,
  });

  if (error) {
    if (error.message.includes("handle already taken")) {
      throw new HandleTakenError();
    }
    throw new Error(`Could not create fursona: ${error.message}`);
  }
  return data as string;
}

export async function updateFursona(
  actorRef: string,
  input: Omit<FursonaInput, "handle">,
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_fursona", {
    p_actor_ref: actorRef,
    p_display_name: blankToNull(input.displayName),
    p_avatar_url: blankToNull(input.avatarUrl),
    p_visibility: input.visibility,
  });
  if (error) throw new Error(`Could not update fursona: ${error.message}`);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS (15 tests — 10 from 1b-i plus 5 here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fursonas.ts tests/fursonas.test.ts
git commit -m "feat: add the fursona data layer"
```

---

### Task 4: Fursona list and creation

**Files:**

- Create: `src/lib/fursona-schema.ts`
- Create: `src/app/(app)/fursonas/page.tsx`
- Create: `src/app/(app)/fursonas/actions.ts`
- Create: `src/app/(app)/fursonas/new/page.tsx`
- Create: `src/components/fursona-form.tsx`
- Test: `tests/fursona-schema.test.ts`

**Interfaces:**

- Consumes: `listMyActors`, `createFursona`, `HandleTakenError`, `ensurePersonActor`.
- Produces: `fursonaSchema` (zod), `type FursonaFormState = { error?: string; fieldErrors?: Record<string, string> }`, and the server action `createFursonaAction(prev: FursonaFormState, formData: FormData): Promise<FursonaFormState>`.

- [ ] **Step 1: Write the failing schema test**

`tests/fursona-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fursonaSchema } from "@/lib/fursona-schema";

describe("fursonaSchema", () => {
  it("accepts a minimal valid fursona", () => {
    const result = fursonaSchema.safeParse({
      handle: "sparky",
      displayName: "",
      avatarUrl: "",
      visibility: "private",
    });
    expect(result.success).toBe(true);
  });

  it("rejects handles with characters that would break a URL", () => {
    for (const handle of ["spar ky", "spar/ky", "spar?ky", "spär ky"]) {
      expect(
        fursonaSchema.safeParse({
          handle,
          displayName: "",
          avatarUrl: "",
          visibility: "private",
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a handle shorter than 3 or longer than 32", () => {
    expect(
      fursonaSchema.safeParse({
        handle: "ab",
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      }).success,
    ).toBe(false);
    expect(
      fursonaSchema.safeParse({
        handle: "a".repeat(33),
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      }).success,
    ).toBe(false);
  });

  it("rejects an avatar that is not an https URL", () => {
    expect(
      fursonaSchema.safeParse({
        handle: "sparky",
        displayName: "",
        avatarUrl: "javascript:alert(1)",
        visibility: "private",
      }).success,
    ).toBe(false);
    expect(
      fursonaSchema.safeParse({
        handle: "sparky",
        displayName: "",
        avatarUrl: "http://img.example/a.png",
        visibility: "private",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty avatar", () => {
    expect(
      fursonaSchema.safeParse({
        handle: "sparky",
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown visibility", () => {
    expect(
      fursonaSchema.safeParse({
        handle: "sparky",
        displayName: "",
        avatarUrl: "",
        visibility: "everyone",
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `@/lib/fursona-schema` does not exist.

- [ ] **Step 3: Implement the schema**

`src/lib/fursona-schema.ts`:

```ts
import { z } from "zod";

/**
 * Handles become public URLs later (spec §11), so they are restricted to
 * characters that survive a path segment unescaped. Minting them now with the
 * eventual constraint avoids a rename migration once a directory exists.
 */
export const fursonaSchema = z.object({
  handle: z
    .string()
    .min(3, "At least 3 characters.")
    .max(32, "At most 32 characters.")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
      "Letters, numbers, hyphens and underscores only.",
    ),
  displayName: z.string().max(64, "At most 64 characters.").default(""),
  avatarUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .refine((v) => v.startsWith("https://"), "Must start with https://"),
    ])
    .default(""),
  visibility: z.enum(["private", "unlisted", "public"]),
});

export type FursonaValues = z.infer<typeof fursonaSchema>;
```

- [ ] **Step 4: Write the server action**

`src/app/(app)/fursonas/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createFursona, HandleTakenError, updateFursona } from "@/lib/fursonas";
import { fursonaSchema } from "@/lib/fursona-schema";

export type FursonaFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parse(formData: FormData) {
  return fursonaSchema.safeParse({
    handle: String(formData.get("handle") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    avatarUrl: String(formData.get("avatarUrl") ?? ""),
    visibility: String(formData.get("visibility") ?? "private"),
  });
}

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createFursonaAction(
  _prev: FursonaFormState,
  formData: FormData,
): Promise<FursonaFormState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  try {
    await createFursona(parsed.data);
  } catch (error) {
    if (error instanceof HandleTakenError) {
      return { fieldErrors: { handle: error.message } };
    }
    return { error: (error as Error).message };
  }

  revalidatePath("/fursonas");
  redirect("/fursonas");
}

export async function updateFursonaAction(
  actorRef: string,
  _prev: FursonaFormState,
  formData: FormData,
): Promise<FursonaFormState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  try {
    await updateFursona(actorRef, parsed.data);
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath("/fursonas");
  redirect("/fursonas");
}
```

- [ ] **Step 5: Write the shared form component**

`src/components/fursona-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { FursonaFormState } from "@/app/(app)/fursonas/actions";

type Props = {
  action: (
    prev: FursonaFormState,
    formData: FormData,
  ) => Promise<FursonaFormState>;
  submitLabel: string;
  defaults?: {
    handle?: string;
    displayName?: string;
    avatarUrl?: string;
    visibility?: string;
  };
  handleLocked?: boolean;
};

export function FursonaForm({
  action,
  submitLabel,
  defaults,
  handleLocked = false,
}: Props) {
  const [state, formAction, pending] = useActionState<
    FursonaFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-400">Handle</span>
        <input
          name="handle"
          defaultValue={defaults?.handle}
          readOnly={handleLocked}
          required
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 read-only:opacity-60"
        />
        {handleLocked ? (
          <span className="text-xs text-neutral-500">
            Handles cannot be changed — other apps may already link to it.
          </span>
        ) : null}
        {state.fieldErrors?.handle ? (
          <span className="text-sm text-red-400">
            {state.fieldErrors.handle}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-400">Display name</span>
        <input
          name="displayName"
          defaultValue={defaults?.displayName}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
        />
        {state.fieldErrors?.displayName ? (
          <span className="text-sm text-red-400">
            {state.fieldErrors.displayName}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-400">Avatar URL</span>
        <input
          name="avatarUrl"
          defaultValue={defaults?.avatarUrl}
          placeholder="https://…"
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
        />
        {state.fieldErrors?.avatarUrl ? (
          <span className="text-sm text-red-400">
            {state.fieldErrors.avatarUrl}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-400">Visibility</span>
        <select
          name="visibility"
          defaultValue={defaults?.visibility ?? "private"}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
        >
          <option value="private">Private — only you</option>
          <option value="unlisted">Unlisted — anyone with the link</option>
          <option value="public">Public</option>
        </select>
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-100 px-4 py-2 font-medium text-neutral-900 disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Write the list and new pages**

`src/app/(app)/fursonas/page.tsx`:

```tsx
import Link from "next/link";
import { ensurePersonActor } from "@/lib/actors";
import { listMyActors } from "@/lib/fursonas";

export default async function FursonasPage() {
  await ensurePersonActor();
  const actors = await listMyActors();
  const fursonas = actors.filter((a) => a.kind === "fursona");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your fursonas</h1>
        <Link
          href="/fursonas/new"
          className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900"
        >
          New fursona
        </Link>
      </div>

      {fursonas.length === 0 ? (
        <p className="text-neutral-400">
          You have no fursonas yet. You can still act as yourself anywhere.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fursonas.map((f) => (
            <li
              key={f.actorRef}
              className="flex items-center justify-between rounded border border-neutral-800 px-4 py-3"
            >
              <span className="flex flex-col">
                <span className="font-medium">{f.displayName ?? f.handle}</span>
                <span className="text-sm text-neutral-500">
                  @{f.handle} · {f.visibility}
                  {f.status === "suspended" ? " · suspended" : ""}
                </span>
              </span>
              <Link
                href={`/fursonas/${f.handle}/edit`}
                className="text-sm text-neutral-300 underline"
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`src/app/(app)/fursonas/new/page.tsx`:

```tsx
import { FursonaForm } from "@/components/fursona-form";
import { createFursonaAction } from "@/app/(app)/fursonas/actions";

export default function NewFursonaPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New fursona</h1>
      <FursonaForm action={createFursonaAction} submitLabel="Create" />
    </section>
  );
}
```

- [ ] **Step 7: Drop the dependency nothing uses**

Phase 1b-i added `eslint-config-next` to `devDependencies`, but `eslint.config.mjs`
never wired it in — so it has been dead weight since. This is the first task to
add JSX, which is when it would have mattered, and the flat config here is
deliberately minimal.

Remove `"eslint-config-next": "^16.2.4"` from `devDependencies`, then:

```bash
pnpm install
pnpm exec knip
```

Expected: knip reports no unused dependencies. (`check:tools` runs knip with
`--no-exit-code`, so this would never have failed CI — it would just have sat
there being wrong.)

- [ ] **Step 8: Run the tests and gates**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: 21 tests pass (15 plus 6 schema tests); all gates exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/lib/fursona-schema.ts src/components/fursona-form.tsx "src/app/(app)/fursonas" tests/fursona-schema.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add fursona listing and creation"
```

---

### Task 5: Fursona editing

**Files:**

- Create: `src/app/(app)/fursonas/[handle]/edit/page.tsx`

**Interfaces:**

- Consumes: `listMyActors`, `updateFursonaAction`, `FursonaForm`.
- Produces: nothing new.

- [ ] **Step 1: Write the edit page**

`src/app/(app)/fursonas/[handle]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { FursonaForm } from "@/components/fursona-form";
import { updateFursonaAction } from "@/app/(app)/fursonas/actions";
import { listMyActors } from "@/lib/fursonas";

export default async function EditFursonaPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const actors = await listMyActors();

  // Resolved from the caller's own actors, so a handle they do not own is a
  // 404 rather than an authorization error — no existence oracle.
  const fursona = actors.find(
    (a) =>
      a.kind === "fursona" && a.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (!fursona) notFound();

  const action = updateFursonaAction.bind(null, fursona.actorRef);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit @{fursona.handle}</h1>
      <FursonaForm
        action={action}
        submitLabel="Save"
        handleLocked
        defaults={{
          handle: fursona.handle,
          displayName: fursona.displayName ?? "",
          avatarUrl: fursona.avatarUrl ?? "",
          visibility: fursona.visibility,
        }}
      />
    </section>
  );
}
```

- [ ] **Step 2: Verify by hand** 🧑

```bash
pnpm dev
```

Create a fursona, then edit it. Confirm: the handle field is read-only, changes persist after redirect, and visiting `/fursonas/<a-handle-you-do-not-own>/edit` returns 404 rather than an error page.

- [ ] **Step 3: Run the gates**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: all pass, 21 tests.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/fursonas"
git commit -m "feat: add fursona editing"
```

---

### Task 6: The return-to allowlist

The picker redirects a user back to whichever app sent them. That is an open-redirect vector, so it gets its own task and its own tests before any redirect exists.

**Files:**

- Create: `src/lib/return-to.ts`
- Modify: `src/lib/env.ts`, `.env.example`
- Test: `tests/return-to.test.ts`

**Interfaces:**

- Consumes: `env`.
- Produces: `isAllowedReturnTo(candidate: string): boolean` and `allowedOrigins(): string[]`.

- [ ] **Step 1: Add the allowlist variable**

Append to `.env.example`:

```bash
# Comma-separated origins the picker may redirect back to.
# Exact origin match — scheme, host and port. No wildcards.
AELEOS_ALLOWED_RETURN_ORIGINS=http://localhost:5000,http://localhost:5100
```

In `src/lib/env.ts`, add to the zod object:

```ts
  AELEOS_ALLOWED_RETURN_ORIGINS: z.string().min(1),
```

add to the `Env` type:

```ts
  allowedReturnOrigins: string[];
```

and to the returned object in `readEnv`:

```ts
    allowedReturnOrigins: parsed.data.AELEOS_ALLOWED_RETURN_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
```

and to the `env` construction at the bottom:

```ts
  AELEOS_ALLOWED_RETURN_ORIGINS: process.env.AELEOS_ALLOWED_RETURN_ORIGINS,
```

- [ ] **Step 2: Write the failing test**

`tests/return-to.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    supabaseUrl: "http://127.0.0.1:54321",
    supabaseAnonKey: "anon",
    allowedReturnOrigins: [
      "https://puck.furrycolombia.com",
      "http://localhost:5000",
    ],
  },
}));

const { isAllowedReturnTo } = await import("@/lib/return-to");

describe("isAllowedReturnTo", () => {
  it("accepts an exact allowed origin", () => {
    expect(isAllowedReturnTo("https://puck.furrycolombia.com/callback")).toBe(
      true,
    );
    expect(isAllowedReturnTo("http://localhost:5000/x?y=1")).toBe(true);
  });

  it("rejects a different host", () => {
    expect(isAllowedReturnTo("https://evil.example/callback")).toBe(false);
  });

  it("rejects a subdomain of an allowed origin", () => {
    expect(isAllowedReturnTo("https://evil.puck.furrycolombia.com/x")).toBe(
      false,
    );
  });

  it("rejects an allowed host under a different scheme", () => {
    expect(isAllowedReturnTo("http://puck.furrycolombia.com/callback")).toBe(
      false,
    );
  });

  it("rejects a host that merely starts with an allowed one", () => {
    expect(
      isAllowedReturnTo("https://puck.furrycolombia.com.evil.example/x"),
    ).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(isAllowedReturnTo("javascript:alert(1)")).toBe(false);
    expect(isAllowedReturnTo("data:text/html,<script>")).toBe(false);
  });

  it("rejects a protocol-relative URL", () => {
    expect(isAllowedReturnTo("//evil.example/x")).toBe(false);
  });

  it("rejects garbage rather than throwing", () => {
    expect(isAllowedReturnTo("not a url")).toBe(false);
    expect(isAllowedReturnTo("")).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `@/lib/return-to` does not exist.

- [ ] **Step 4: Implement**

`src/lib/return-to.ts`:

```ts
import { env } from "@/lib/env";

export function allowedOrigins(): string[] {
  return env.allowedReturnOrigins;
}

/**
 * Whether the picker may redirect to this URL.
 *
 * Compares the parsed origin exactly — scheme, host and port together. String
 * prefix matching is what makes `https://puck.furrycolombia.com.evil.example`
 * look allowed, so it is deliberately not used.
 */
export function isAllowedReturnTo(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  return allowedOrigins().includes(url.origin);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS (29 tests — 21 plus 8 here).

- [ ] **Step 6: Commit**

```bash
git add src/lib/return-to.ts src/lib/env.ts .env.example tests/return-to.test.ts
git commit -m "feat: add a strict return-to origin allowlist"
```

---

### Task 7: The picker

**Files:**

- Create: `src/app/(app)/picker/page.tsx`
- Create: `src/app/(app)/picker/actions.ts`
- Create: `src/components/actor-tile.tsx`

**Interfaces:**

- Consumes: `listMyActors`, `ensurePersonActor`, `isAllowedReturnTo`.
- Produces: the server action `chooseActorAction(returnTo: string, formData: FormData): Promise<void>`.

- [ ] **Step 1: Write the tile component**

`src/components/actor-tile.tsx`:

```tsx
type Props = {
  actorRef: string;
  label: string;
  sublabel: string;
  avatarUrl: string | null;
  disabled?: boolean;
};

export function ActorTile({
  actorRef,
  label,
  sublabel,
  avatarUrl,
  disabled = false,
}: Props) {
  return (
    <button
      type="submit"
      name="actorRef"
      value={actorRef}
      disabled={disabled}
      className="flex w-40 flex-col items-center gap-3 rounded-lg border border-neutral-800 p-4 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {/* A plain <img>, not next/image: avatars are arbitrary external URLs in
          this phase, and next/image needs per-host remotePatterns that cannot
          be enumerated in advance. */}
      <img
        src={avatarUrl ?? "/actor-placeholder.svg"}
        alt=""
        width={72}
        height={72}
        className="h-18 w-18 rounded-full bg-neutral-800 object-cover"
      />
      <span className="flex flex-col items-center">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-neutral-500">{sublabel}</span>
      </span>
    </button>
  );
}
```

Also create `public/actor-placeholder.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72">
  <circle cx="36" cy="36" r="36" fill="#262626" />
  <circle cx="36" cy="28" r="12" fill="#404040" />
  <path d="M12 68a24 24 0 0 1 48 0z" fill="#404040" />
</svg>
```

- [ ] **Step 2: Write the action**

`src/app/(app)/picker/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { isAllowedReturnTo } from "@/lib/return-to";
import { listMyActors } from "@/lib/fursonas";

/**
 * Hands the chosen actor back to the calling app.
 *
 * The consuming app must still verify the actor against its own mirror — this
 * redirect is a suggestion, not an authorization. Both checks here are belt and
 * braces: they stop the hub being used to bounce a user somewhere unexpected,
 * and stop it naming an actor the caller does not own.
 */
export async function chooseActorAction(
  returnTo: string,
  formData: FormData,
): Promise<void> {
  if (!isAllowedReturnTo(returnTo)) {
    throw new Error("That application is not allowed to receive a redirect.");
  }

  const actorRef = String(formData.get("actorRef") ?? "");
  const actors = await listMyActors();
  const chosen = actors.find((a) => a.actorRef === actorRef);

  if (!chosen) {
    throw new Error("You cannot act as that identity.");
  }
  if (chosen.status !== "active") {
    throw new Error("That identity is suspended.");
  }

  const target = new URL(returnTo);
  target.searchParams.set("actor_ref", chosen.actorRef);
  redirect(target.toString());
}
```

- [ ] **Step 3: Write the picker page**

`src/app/(app)/picker/page.tsx`:

```tsx
import { ensurePersonActor } from "@/lib/actors";
import { listMyActors } from "@/lib/fursonas";
import { isAllowedReturnTo } from "@/lib/return-to";
import { ActorTile } from "@/components/actor-tile";
import { chooseActorAction } from "./actions";

export default async function PickerPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; app?: string }>;
}) {
  const { return_to: returnTo, app } = await searchParams;

  if (!returnTo || !isAllowedReturnTo(returnTo)) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Who do you want to be?</h1>
        <p role="alert" className="text-red-400">
          This link did not come from a recognised Furry Colombia app, so there
          is nowhere safe to send you back to.
        </p>
      </section>
    );
  }

  await ensurePersonActor();
  const actors = await listMyActors();
  const action = chooseActorAction.bind(null, returnTo);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Who do you want to be?</h1>
        <p className="text-sm text-neutral-500">
          {app ? `Continuing to ${app}.` : "Choose an identity to continue."}{" "}
          You can be someone different in each app.
        </p>
      </div>

      <form action={action} className="flex flex-wrap gap-4">
        {actors.map((actor) => (
          <ActorTile
            key={actor.actorRef}
            actorRef={actor.actorRef}
            label={actor.displayName ?? actor.handle}
            sublabel={actor.kind === "person" ? "You" : `@${actor.handle}`}
            avatarUrl={actor.avatarUrl}
            disabled={actor.status !== "active"}
          />
        ))}
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Verify by hand** 🧑

```bash
pnpm dev
```

- `http://localhost:5100/picker` with no `return_to` → the refusal message, no tiles.
- `http://localhost:5100/picker?return_to=https://evil.example/x` → the same refusal.
- `http://localhost:5100/picker?return_to=http://localhost:5000/cb&app=Puck` → tiles render, yourself first; clicking one redirects to `http://localhost:5000/cb?actor_ref=…`.

- [ ] **Step 5: Run the gates**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: all pass, 29 tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/picker" src/components/actor-tile.tsx public/actor-placeholder.svg
git commit -m "feat: add the actor picker with a validated handoff"
```

---

### Task 8: The sync API consuming apps call

**Files:**

- Create: `src/app/api/actors/mine/route.ts`
- Test: `tests/api-actors-mine.test.ts`

**Interfaces:**

- Consumes: `listMyActors`.
- Produces: `GET /api/actors/mine` → `200 { actors: Actor[] }`, or `401` when unauthenticated.

- [ ] **Step 1: Write the failing test**

`tests/api-actors-mine.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMyActors = vi.fn();
vi.mock("@/lib/fursonas", () => ({ listMyActors }));

const auth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/actors/mine", () => {
  it("returns the caller's actors", async () => {
    auth.mockResolvedValueOnce({ userId: "user_abc" });
    listMyActors.mockResolvedValueOnce([
      {
        actorRef: "ref-1",
        kind: "person",
        handle: "u-abc",
        displayName: "Heiner",
        avatarUrl: null,
        visibility: "private",
        status: "active",
      },
    ]);

    const { GET } = await import("@/app/api/actors/mine/route");
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      actors: [
        {
          actorRef: "ref-1",
          kind: "person",
          handle: "u-abc",
          displayName: "Heiner",
          avatarUrl: null,
          visibility: "private",
          status: "active",
        },
      ],
    });
  });

  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValueOnce({ userId: null });
    const { GET } = await import("@/app/api/actors/mine/route");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listMyActors).not.toHaveBeenCalled();
  });

  it("never includes ownership fields in the response body", async () => {
    auth.mockResolvedValueOnce({ userId: "user_abc" });
    listMyActors.mockResolvedValueOnce([
      {
        actorRef: "ref-1",
        kind: "fursona",
        handle: "sparky",
        displayName: null,
        avatarUrl: null,
        visibility: "private",
        status: "active",
      },
    ]);

    const { GET } = await import("@/app/api/actors/mine/route");
    const body = await (await GET()).text();
    expect(body).not.toMatch(/owner_ref|ownerRef|identity_sub|identitySub/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Implement**

`src/app/api/actors/mine/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listMyActors } from "@/lib/fursonas";

/**
 * The one endpoint consuming apps call. They pass the user's own Clerk token,
 * so there is no shared secret to distribute and no service account to leak —
 * a caller can only ever read their own actors.
 *
 * Apps upsert these rows into their local `actors` mirror.
 */
export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const actors = await listMyActors();
  return NextResponse.json(
    { actors },
    { headers: { "cache-control": "no-store" } },
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS (32 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/actors/mine/route.ts tests/api-actors-mine.test.ts
git commit -m "feat: add the actor sync endpoint for consuming apps"
```

---

### Task 9: Integrator documentation and end-to-end coverage

**Files:**

- Create: `docs/integrating.md`
- Create: `tests/e2e/picker.spec.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the contract another app's engineer implements against.

- [ ] **Step 1: Write the integrator guide**

`docs/integrating.md`:

````markdown
# Integrating an app with AeleOS

Your app already trusts Clerk via Supabase Third-Party Auth, and already has the
canonical `actors` mirror from the Phase 1a seam. This describes the two things
the hub adds: getting mirror rows, and letting a user choose who to be.

## 1. Sync the user's actors

On sign-in, call the hub with the user's own Clerk token:

```ts
const response = await fetch("https://me.furrycolombia.com/api/actors/mine", {
  headers: { Authorization: `Bearer ${await getToken()}` },
  cache: "no-store",
});
const { actors } = await response.json();
```

Upsert each row into your local `actors` table keyed on `actor_ref`. Your
`identity_sub` column stays as it is — the hub never sends it, and never sends
`owner_ref` either. Those columns exist for moderation and must not travel.

There is no shared secret and no service account. A caller can only ever read
their own actors, because authorization is the user's own token.

## 2. Send the user to the picker

```
https://me.furrycolombia.com/picker?return_to=<your-callback-url>&app=<your-app-name>
```

`return_to` must be an **exact origin match** against the hub's allowlist —
scheme, host and port. Ask the maintainer to add your origin before it works.

The user is returned to `return_to?actor_ref=<uuid>`.

## 3. Verify what comes back — this part is not optional

**Treat `actor_ref` as a suggestion, never as authorization.** It arrives in a
query string and anyone can edit it. Verify it against your own mirror before
storing it:

```sql
select public.can_act_as(id) from public.actors where actor_ref = $1;
```

If that is false, ignore the value and re-prompt. Because verification happens
in your database against the user's own token, a tampered redirect gains
nothing — which is exactly why no signature is needed on the handoff.

Store the verified actor in **your app's own session**, not in a cookie shared
across apps. Being a fursona in one app and yourself in another is the intended
behaviour (spec §6).

## 4. Re-prompt when the choice may be stale

Send the user back to the picker when:

- a new session begins;
- their actor list changed since last sync (a new or transferred fursona);
- the inactivity threshold has passed — **still undecided, spec §18.2**. Pick a
  value for your app and record it; the platform-wide default is pending.

Always render the active actor's name and avatar at the point of action. The
common failure is not forgetting who you are — it is being confidently wrong.
````

- [ ] **Step 2: Write the e2e test**

`tests/e2e/picker.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("picker safety", () => {
  test("refuses a picker link with no return_to", async ({ page }) => {
    await page.goto("/picker");
    await expect(page.getByRole("alert")).toContainText(
      /not come from a recognised/i,
    );
  });

  test("refuses a return_to outside the allowlist", async ({ page }) => {
    const target = encodeURIComponent("https://evil.example/x");
    await page.goto(`/picker?return_to=${target}`);
    await expect(page.getByRole("alert")).toContainText(
      /not come from a recognised/i,
    );
  });

  test("refuses a lookalike host", async ({ page }) => {
    // An allowed origin as a prefix of an attacker-controlled host — the case
    // that string comparison would wave through.
    const target = encodeURIComponent("https://localhost:5000.evil.example/x");
    await page.goto(`/picker?return_to=${target}`);
    await expect(page.getByRole("alert")).toContainText(
      /not come from a recognised/i,
    );
  });
});
```

> These run unauthenticated: the refusal is rendered before any actor lookup, so
> it is reachable without credentials. Testing a completed pick needs a real
> social sign-in, which stays the manual check in Task 7 Step 4.

- [ ] **Step 3: Update the README**

In `README.md`, replace the "What exists today" section with:

```markdown
## What exists today

Sign in with Google or Discord; a person actor is provisioned with a platform ID
stable across every app. Create and edit fursonas, and choose which identity to
act as when an app sends you to the picker.

See `docs/integrating.md` for wiring an app up, and `docs/registry.md` for why
this repo's `actors` table is authoritative.

Fursona transfer is Phase 2. The public directory is not built.
```

- [ ] **Step 4: Run everything**

```bash
pnpm test && pnpm test:db && pnpm typecheck && pnpm lint && pnpm format:check && pnpm secretlint && pnpm check:tools && pnpm build
pnpm test:e2e
```

Expected: 32 unit, 13 db, 6 e2e (3 from 1b-i plus 3 here); every gate exits 0.

- [ ] **Step 5: Commit**

```bash
git add docs/integrating.md tests/e2e/picker.spec.ts README.md
git commit -m "docs: add the integrator guide and picker e2e coverage"
```

---

## Verification checklist

- [ ] `pnpm test` passes (32 tests).
- [ ] `pnpm test:db` passes (13 tests).
- [ ] `pnpm test:e2e` passes (6 tests).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm secretlint`, `pnpm check:tools` all pass.
- [ ] `diff -r Z:/Github/aeleos/supabase/migrations/ ./supabase/migrations/` shows **only** `0100_hub_actor_rpcs.sql` as extra — the canonical files are untouched.
- [ ] No API response, view or RPC return type exposes `owner_ref`, `identity_sub` or `author_person_ref`.
- [ ] A `return_to` outside the allowlist is refused, including lookalike hosts.

## Design decisions worth knowing

**Writes go through RPCs, not re-granted table access.** Migration `0003` revokes
every client grant on `actors`, and that lockdown is what makes the linkability
boundary hold. Re-opening the table here — even column-scoped — would create a
second place where that guarantee lives. Two narrow `security definer` functions
keep it in one.

**The handoff is unsigned on purpose.** A signed token would need a shared secret
distributed to every app. Instead the app re-verifies the actor against its own
mirror using the user's own token, so tampering with `actor_ref` yields an actor
the user cannot act as, and the check fails. Fewer secrets, same guarantee.

**Handles cannot be edited.** They are minted at creation with the character set
a public URL will eventually need (spec §11), because renaming one after other
apps have linked to it is the expensive kind of change.

**`update_fursona` returns the same error for "missing" and "not yours."**
Otherwise it is an oracle for which handles exist.

## Follow-on work

- **Pronouns** — needs a column on the canonical `actors` table in `aeleos`, which
  every consuming app must then adopt. Deliberately not smuggled in here.
- **Avatar uploads** — currently a URL field. Storage brings cost and moderation.
- **The inactivity threshold** — spec §18.2, still undecided; `docs/integrating.md`
  tells integrators to pick one and record it until the platform default lands.
- **Capability gating and inline elevation** — spec §7.5. When someone acting as a
  fursona hits a person-only action (CandyStore checkout), the app prompts them to
  continue as themselves. That lives in each consuming app, not the hub, so it is
  out of scope here — but no app has built it yet, and it is the visible half of
  "permissions attach to the person."
- **Phase 2** — fursona transfer and the append-only ownership ledger.
- **The public directory** — spec §11. `visibility` is written but nothing lists.
