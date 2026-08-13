# Fursona studio, phase 2b — the list

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/fursonas` into the studio's list — wide page, header row, rows instead of tiles, search and visibility filters in the URL, drag to reorder, pin, and delete with an inline confirm — on the schema phase 2a already shipped.

**Architecture:** The read path stays server-rendered and is handed to React Query as `initialData`, so the page keeps its instant first paint while every mutation goes through the studio's hook shape. Writes call the `0012` functions directly from the browser client built in phase 1.

**Tech Stack:** Next 16 App Router, React 19, React Query, nuqs, `@hello-pangea/dnd`, lucide-react, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md` — the parity checklist is the acceptance criteria for this phase.

## Global Constraints

- **Budget is $0.**
- **100% statements, branches, functions and lines** in `apps/hub` (`vitest.config.ts`). Note `src/features/*/presentation/**` and `src/app/**` are excluded from that measurement — they still get tests, they just are not what moves the number.
- **Every export carries TSDoc stating the contract**, and `pnpm check:docs` fails the commit when a symbol changes and its documentation does not.
- **Every export is tested on its happy path and each failure mode**, and a test guarding already-correct behaviour is **verified by sabotage**.
- **Both message catalogues, always.** `apps/hub/tests/messages.test.ts` fails on a key added to one language only, and on a Spanish value identical to the English unless it is on the allowlist with a justification.
- **`shared/` never imports a feature**; features are reached through their barrel; layers point inward. `eslint.config.mjs` enforces it.
- **`pnpm add` normalises versions.** After every install, check `apps/hub/package.json` and pin the range this plan states — phase 1 hit this twice.
- **No `@param props`** on a destructured component; this repository's jsdoc rule rejects it. `@returns` alone, with props documented on their interface.
- **Do not commit unless a step says to.**

## Two deliberate deviations from Libra's studio

Both are written down here so a reviewer sees them as choices rather than drift.

**1. The first render is server-rendered, not a skeleton.** The studio fetches its list in the browser and shows `Skeleton` bars while it does. The hub server-renders `/fursonas` today, and dropping that would trade an instant first paint for a spinner on every visit. Instead the server component fetches as it does now and passes the rows to the client component, which seeds React Query with `initialData`. Mutations, refetching and cache invalidation all still go through the hooks, so the studio's shape survives where it earns its keep.

**2. Ordering and pinning are read separately from the actor list.** `my_actors()` returns the actor columns; `sort_order` and `featured` live in `fursona_profiles`. Phase 2a deliberately added no joined view, so the client reads both and merges by `actor_ref`. Two reads rather than one, and worth it: a joined function would have put ordering into the same call `/api/actors/mine` is built on, which is exactly what Decision 2 keeps apart.

## How to read tasks 4–6

Tasks 1–3 give the implementation verbatim, because their behaviour is not
obvious from a name: a filter that drops the person row, a read that must throw
rather than return `[]`, a query that must be a real query so it can be
invalidated.

Tasks 4–6 give the **tests** verbatim and describe the markup. That is
deliberate, not an omission. Those are presentational components whose contract
is exactly what their tests select — a role, an accessible name, a link's
`href`. The arrangement of `<div>`s is genuinely free within that, and dictating
it would only invite a diff that matches the plan while failing the tests. If a
choice there turns out to matter, the test is what should change first.

---

## File Structure

| File                                                                 | Responsibility                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/hub/src/features/actors/domain/fursona-filters.ts`             | The filter shape and the pure function that applies it.     |
| `apps/hub/src/features/actors/infrastructure/fursona-arrangement.ts` | Read `fursona_profiles`; call the three `0012` functions.   |
| `apps/hub/src/features/actors/application/use-fursonas.ts`           | The list query, seeded from the server.                     |
| `apps/hub/src/features/actors/application/use-fursona-mutations.ts`  | Delete, reorder and pin, each invalidating the list.        |
| `apps/hub/src/features/actors/presentation/fursona-filters-bar.tsx`  | Search box and visibility pills, state in the URL.          |
| `apps/hub/src/features/actors/presentation/fursona-row.tsx`          | One row: drag handle, identity, visibility, actions.        |
| `apps/hub/src/features/actors/presentation/fursona-list.tsx`         | The client list: filters, drag context, rows, empty states. |
| `apps/hub/src/app/[locale]/(app)/fursonas/page.tsx`                  | Server fetch, wide shell, hand off to the list.             |

---

### Task 0: Branch

- [ ] **Step 1: Cut from `origin/main`**

```bash
git fetch origin
git checkout -b feat/studio-phase-2b-list origin/main
git log --oneline origin/main..HEAD
```

Expected: no output from the last command.

---

### Task 1: Filtering, as a pure function

Start here because it is the only part with no React, no network and no DOM — so it can be got exactly right before anything renders it.

**Files:**

- Create: `apps/hub/src/features/actors/domain/fursona-filters.ts`
- Test: `apps/hub/tests/fursona-filters.test.ts`

**Interfaces:**

- Produces:
  - `type FursonaFilters = { q: string; visibility: string }`
  - `applyFursonaFilters(rows: Actor[], filters: FursonaFilters): Actor[]`
  - `isFiltering(filters: FursonaFilters): boolean`

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/fursona-filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyFursonaFilters,
  isFiltering,
} from "@/features/actors/domain/fursona-filters";
import type { Actor } from "@/features/actors";

/**
 * An actor row, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
function actor(over: Partial<Actor> = {}): Actor {
  return {
    actorRef: "ref-1",
    kind: "fursona",
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "private",
    status: "active",
    ...over,
  };
}

const none = { q: "", visibility: "" };

describe("applyFursonaFilters", () => {
  it("returns everything when nothing is filtered", () => {
    const rows = [actor(), actor({ actorRef: "ref-2", handle: "blaze" })];
    expect(applyFursonaFilters(rows, none)).toHaveLength(2);
  });

  it("matches the handle, case-insensitively", () => {
    const rows = [actor({ handle: "sparky" }), actor({ handle: "blaze" })];
    const found = applyFursonaFilters(rows, { q: "SPARK", visibility: "" });
    expect(found.map((a) => a.handle)).toEqual(["sparky"]);
  });

  // Somebody searching for a fursona types the name they gave it, not the
  // handle they registered. Matching only the handle would miss that.
  it("matches the display name too", () => {
    const rows = [
      actor({ handle: "a1", displayName: "Sparky the Dragon" }),
      actor({ handle: "b2", displayName: "Blaze" }),
    ];
    const found = applyFursonaFilters(rows, { q: "dragon", visibility: "" });
    expect(found.map((a) => a.handle)).toEqual(["a1"]);
  });

  it("survives a row with no display name", () => {
    const rows = [actor({ handle: "a1", displayName: null })];
    expect(applyFursonaFilters(rows, { q: "a1", visibility: "" })).toHaveLength(
      1,
    );
  });

  it("filters by visibility", () => {
    const rows = [
      actor({ handle: "a1", visibility: "public" }),
      actor({ handle: "b2", visibility: "private" }),
    ];
    const found = applyFursonaFilters(rows, { q: "", visibility: "public" });
    expect(found.map((a) => a.handle)).toEqual(["a1"]);
  });

  it("applies both at once", () => {
    const rows = [
      actor({ handle: "sparky", visibility: "public" }),
      actor({ handle: "sparky-2", visibility: "private" }),
      actor({ handle: "blaze", visibility: "public" }),
    ];
    const found = applyFursonaFilters(rows, {
      q: "spark",
      visibility: "public",
    });
    expect(found.map((a) => a.handle)).toEqual(["sparky"]);
  });

  // The person row is not a fursona and must never be filtered out of the list
  // — it is the "you" row, and losing it under a filter would read as the
  // account disappearing.
  it("keeps the person row whatever the filter", () => {
    const rows = [
      actor({ kind: "person", handle: "u-abc", displayName: null }),
      actor({ handle: "blaze" }),
    ];
    const found = applyFursonaFilters(rows, { q: "zzz", visibility: "public" });
    expect(found.map((a) => a.kind)).toEqual(["person"]);
  });
});

describe("isFiltering", () => {
  it("is false when nothing is set", () => {
    expect(isFiltering(none)).toBe(false);
  });

  it("is true for a search", () => {
    expect(isFiltering({ q: "a", visibility: "" })).toBe(true);
  });

  it("is true for a visibility", () => {
    expect(isFiltering({ q: "", visibility: "public" })).toBe(true);
  });

  // Whitespace is not a filter. Without this, a stray space in the box would
  // silently disable reordering (see task 5).
  it("ignores a search that is only whitespace", () => {
    expect(isFiltering({ q: "   ", visibility: "" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/fursona-filters.test.ts`
Expected: FAIL — `Failed to resolve import ".../fursona-filters"`.

- [ ] **Step 3: Write the implementation**

Create `apps/hub/src/features/actors/domain/fursona-filters.ts`:

```ts
import type { Actor } from "@/features/actors/infrastructure/fursonas";

/** What the list is currently filtered by. Empty strings mean "no filter". */
export interface FursonaFilters {
  /** Free text, matched against handle and display name. */
  q: string;
  /** One of the visibility values, or "" for all. */
  visibility: string;
}

/**
 * Whether any filter is actually narrowing the list.
 *
 * Whitespace does not count. A stray space would otherwise read as a filter
 * and silently disable drag-to-reorder, which is disabled while filtering
 * because a reorder under a filter has no meaning.
 *
 * @param filters - the current filters.
 * @returns true when the list is narrowed.
 */
export function isFiltering(filters: FursonaFilters): boolean {
  return filters.q.trim() !== "" || filters.visibility !== "";
}

/**
 * Narrows the rows to those matching the filters.
 *
 * **The person row always survives.** It is the "you" row rather than a
 * fursona, and hiding it under a filter would read as the account itself
 * disappearing.
 *
 * Matching is case-insensitive across handle and display name, because
 * somebody looking for a fursona types the name they gave it at least as often
 * as the handle they registered.
 *
 * @param rows - every actor the person owns, person row first.
 * @param filters - the current filters.
 * @returns the rows to render, in the order given.
 */
export function applyFursonaFilters(
  rows: Actor[],
  filters: FursonaFilters,
): Actor[] {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.kind === "person") return true;
    if (filters.visibility && row.visibility !== filters.visibility)
      return false;
    if (!q) return true;
    const haystack = `${row.handle} ${row.displayName ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/fursona-filters.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Sabotage-verify the two rules that are easy to get wrong**

First, drop the person-row exemption — change `if (row.kind === "person") return true;` to `if (false) return true;` — and confirm **"keeps the person row whatever the filter"** fails. Restore.

Then drop the trim in `isFiltering` — `filters.q !== ""` — and confirm **"ignores a search that is only whitespace"** fails. Restore. Re-run: PASS.

- [ ] **Step 6: Export from the feature barrel**

Add to `apps/hub/src/features/actors/index.ts`:

```ts
export {
  applyFursonaFilters,
  isFiltering,
  type FursonaFilters,
} from "@/features/actors/domain/fursona-filters";
```

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/features/actors/domain/fursona-filters.ts \
        apps/hub/tests/fursona-filters.test.ts \
        apps/hub/src/features/actors/index.ts
git commit -m "feat(hub): filter fursonas, as a function with no React in it"
```

---

### Task 2: Reading and writing arrangement

**Files:**

- Create: `apps/hub/src/features/actors/infrastructure/fursona-arrangement.ts`
- Test: `apps/hub/tests/fursona-arrangement.test.ts`
- Modify: `apps/hub/package.json` (dependencies)

**Interfaces:**

- Consumes: `useSupabaseBrowserClient()` from `@/shared/infrastructure/supabase-browser`.
- Produces, each taking the client as its first parameter so the functions stay testable without React:
  - `type Arrangement = { actorRef: string; sortOrder: number | null; featured: boolean }`
  - `readArrangement(client): Promise<Arrangement[]>`
  - `readMyActors(client): Promise<Actor[]>` — the browser's own read of `my_actors()`, mapping the row shape exactly as `listMyActors` does on the server
  - `setFursonaOrder(client, actorRef: string, sortOrder: number): Promise<void>`
  - `setFursonaFeatured(client, actorRef: string, featured: boolean): Promise<void>`
  - `deleteFursona(client, actorRef: string): Promise<void>`

- [ ] **Step 1: Install the dependencies this phase needs**

```bash
pnpm --filter hub add nuqs@^2.8.9 @hello-pangea/dnd@^18.0.1 lucide-react@^1.11.0
```

Then open `apps/hub/package.json` and confirm those exact ranges. pnpm rewrites them to whatever it installed; phase 1 hit this twice.

- [ ] **Step 2: Write the failing test**

Create `apps/hub/tests/fursona-arrangement.test.ts`. Mock only the Supabase client, since these functions are thin by design and the value is in what they send and how they fail:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteFursona,
  readArrangement,
  setFursonaFeatured,
  setFursonaOrder,
} from "@/features/actors/infrastructure/fursona-arrangement";
import type { SupabaseClient } from "@supabase/supabase-js";

const rpc = vi.fn();
const select = vi.fn();

/**
 * A Supabase client stub exposing only what these functions touch.
 *
 * @returns the stub, typed as a client so the call sites type-check.
 */
function client(): SupabaseClient {
  return {
    rpc,
    from: () => ({ select }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  rpc.mockReset();
  select.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  select.mockResolvedValue({ data: [], error: null });
});

describe("readArrangement", () => {
  it("maps the row shape to the domain shape", async () => {
    select.mockResolvedValueOnce({
      data: [{ actor_ref: "ref-1", sort_order: 2, featured: true }],
      error: null,
    });
    await expect(readArrangement(client())).resolves.toEqual([
      { actorRef: "ref-1", sortOrder: 2, featured: true },
    ]);
  });

  it("returns an empty list when nobody has arranged anything", async () => {
    await expect(readArrangement(client())).resolves.toEqual([]);
  });

  // Collapsing a failure into an empty list would silently reset everybody's
  // ordering to whatever the default is, which looks like data loss.
  it("throws rather than reporting no arrangement", async () => {
    select.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await expect(readArrangement(client())).rejects.toThrow(/nope/);
  });
});

describe("the write functions", () => {
  it("orders by actor ref", async () => {
    await setFursonaOrder(client(), "ref-1", 3);
    expect(rpc).toHaveBeenCalledWith("set_fursona_order", {
      p_actor_ref: "ref-1",
      p_sort_order: 3,
    });
  });

  it("pins by actor ref", async () => {
    await setFursonaFeatured(client(), "ref-1", true);
    expect(rpc).toHaveBeenCalledWith("set_fursona_featured", {
      p_actor_ref: "ref-1",
      p_featured: true,
    });
  });

  it("deletes by actor ref", async () => {
    await deleteFursona(client(), "ref-1");
    expect(rpc).toHaveBeenCalledWith("delete_fursona", {
      p_actor_ref: "ref-1",
    });
  });

  it.each([
    ["setFursonaOrder", () => setFursonaOrder(client(), "r", 1)],
    ["setFursonaFeatured", () => setFursonaFeatured(client(), "r", true)],
    ["deleteFursona", () => deleteFursona(client(), "r")],
  ])("%s throws when the database refuses", async (_name, call) => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "fursona not found" },
    });
    await expect(call()).rejects.toThrow(/fursona not found/);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/fursona-arrangement.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Write the implementation**

Create `apps/hub/src/features/actors/infrastructure/fursona-arrangement.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** How one fursona is arranged in its owner's list. */
export interface Arrangement {
  /** The fursona's platform ID. */
  actorRef: string;
  /** Where the owner put it, or null when they never have. */
  sortOrder: number | null;
  /** Whether the owner pinned it first. */
  featured: boolean;
}

/**
 * Reads the caller's arrangement rows.
 *
 * A separate read from the actor list on purpose: `my_actors()` returns the
 * actor columns and `fursona_profiles` holds the arrangement, and phase 2a
 * added no joined view — a joined function would have put ordering into the
 * same call `/api/actors/mine` is built on, which the actor model keeps apart.
 *
 * RLS returns only rows the caller owns, so this needs no filter of its own.
 *
 * @param client - a Supabase client authenticated as the person.
 * @returns one entry per fursona the person has arranged; absent means never
 * arranged, not "first".
 * @throws when the read fails, rather than reporting an empty arrangement —
 * collapsing a failure to `[]` would silently reset everybody's ordering.
 */
export async function readArrangement(
  client: SupabaseClient,
): Promise<Arrangement[]> {
  const { data, error } = await client
    .from("fursona_profiles")
    .select("actor_ref, sort_order, featured");
  if (error) throw new Error(`Could not read arrangement: ${error.message}`);
  return (data ?? []).map((row) => ({
    actorRef: row.actor_ref as string,
    sortOrder: (row.sort_order as number | null) ?? null,
    featured: Boolean(row.featured),
  }));
}

/**
 * Calls one of `0012`'s arrangement functions and turns a refusal into a throw.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param fn - the function name.
 * @param args - its named arguments.
 * @throws with the database's message when the call is refused. Every one of
 * these raises `fursona not found` for a row that is missing, someone else's,
 * or not active — deliberately indistinguishable, so a caller cannot probe
 * which actor_refs are real.
 */
async function call(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
}

/**
 * Moves a fursona to a position in its owner's list.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona to move.
 * @param sortOrder - its new position.
 * @throws when the caller does not own an active fursona with that ref.
 */
export async function setFursonaOrder(
  client: SupabaseClient,
  actorRef: string,
  sortOrder: number,
): Promise<void> {
  await call(client, "set_fursona_order", {
    p_actor_ref: actorRef,
    p_sort_order: sortOrder,
  });
}

/**
 * Pins or unpins a fursona.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona to pin.
 * @param featured - whether it should be pinned.
 * @throws when the caller does not own an active fursona with that ref.
 */
export async function setFursonaFeatured(
  client: SupabaseClient,
  actorRef: string,
  featured: boolean,
): Promise<void> {
  await call(client, "set_fursona_featured", {
    p_actor_ref: actorRef,
    p_featured: featured,
  });
}

/**
 * Deletes a fursona.
 *
 * **This never frees the handle.** `0012` marks the row deleted and keeps it,
 * so a retired fursona's name cannot be registered by somebody else — and the
 * row keeps occupying its owner's quota, or deleting would become a way to buy
 * allowance back.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona to delete.
 * @throws when the caller does not own an active fursona with that ref.
 */
export async function deleteFursona(
  client: SupabaseClient,
  actorRef: string,
): Promise<void> {
  await call(client, "delete_fursona", { p_actor_ref: actorRef });
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/fursona-arrangement.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Sabotage-verify the failure path**

Change `readArrangement` to `return (data ?? []).map(...)` without the `if (error) throw`, and confirm **"throws rather than reporting no arrangement"** fails. Restore.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/features/actors/infrastructure/fursona-arrangement.ts \
        apps/hub/tests/fursona-arrangement.test.ts \
        apps/hub/package.json pnpm-lock.yaml
git commit -m "feat(hub): read and write a fursona's arrangement"
```

---

### Task 3: The query and mutation hooks

**Files:**

- Create: `apps/hub/src/features/actors/application/use-fursonas.ts`
- Create: `apps/hub/src/features/actors/application/use-fursona-mutations.ts`
- Test: `apps/hub/tests/use-fursonas.test.tsx`

**Interfaces:**

- Produces:
  - `FURSONAS_QUERY_KEY = "fursonas"`
  - `useFursonas(initial: Actor[]): { rows: Actor[]; arrangement: Arrangement[] }`
  - `useFursonaMutations(): { remove, reorder, pin }` — each a React Query mutation invalidating `FURSONAS_QUERY_KEY`.

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/use-fursonas.test.tsx`. Wrap in a real `QueryClientProvider` so the invalidation is asserted against React Query itself rather than a mock of it:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const readArrangement = vi.fn();
const readMyActors = vi.fn();
const deleteFursona = vi.fn();
vi.mock("@/features/actors/infrastructure/fursona-arrangement", () => ({
  readArrangement: (...a: unknown[]) => readArrangement(...a),
  readMyActors: (...a: unknown[]) => readMyActors(...a),
  deleteFursona: (...a: unknown[]) => deleteFursona(...a),
  setFursonaOrder: vi.fn(),
  setFursonaFeatured: vi.fn(),
}));
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

const { useFursonas } =
  await import("@/features/actors/application/use-fursonas");
const { useFursonaMutations } =
  await import("@/features/actors/application/use-fursona-mutations");

let queryClient: QueryClient;

/**
 * A provider wrapper with a fresh client per test.
 *
 * @param props - the tree under test.
 * @returns the wrapped tree.
 */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const rows = [
  {
    actorRef: "ref-1",
    kind: "fursona" as const,
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "private" as const,
    status: "active" as const,
  },
];

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  readArrangement.mockReset();
  readArrangement.mockResolvedValue([]);
  readMyActors.mockReset();
  readMyActors.mockResolvedValue(rows);
  deleteFursona.mockReset();
  deleteFursona.mockResolvedValue(undefined);
});

describe("useFursonas", () => {
  // The deviation from the studio that this phase is built on: the server
  // already fetched these, so the first render must show them rather than a
  // skeleton.
  it("shows the server's rows immediately, with no fetch first", () => {
    const { result } = renderHook(() => useFursonas(rows), { wrapper });
    expect(result.current.rows).toEqual(rows);
    expect(readMyActors).not.toHaveBeenCalled();
  });

  // The rows must be a real query, not a pass-through of `initial`. A
  // pass-through has nothing for the mutations to invalidate, so a deleted
  // fursona would stay on screen until a full page reload — which reads as the
  // delete having silently failed.
  it("refetches the rows when the list is invalidated", async () => {
    readMyActors.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useFursonas(rows), { wrapper });
    await queryClient.invalidateQueries({ queryKey: ["fursonas"] });
    await waitFor(() => {
      expect(result.current.rows).toEqual([]);
    });
  });

  it("reads the arrangement", async () => {
    readArrangement.mockResolvedValueOnce([
      { actorRef: "ref-1", sortOrder: 1, featured: true },
    ]);
    const { result } = renderHook(() => useFursonas(rows), { wrapper });
    await waitFor(() => {
      expect(result.current.arrangement).toHaveLength(1);
    });
  });
});

describe("useFursonaMutations", () => {
  it("deletes through the infrastructure function", async () => {
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await result.current.remove.mutateAsync("ref-1");
    expect(deleteFursona).toHaveBeenCalledWith({}, "ref-1");
  });

  // Without the invalidation the row stays on screen after being deleted, and
  // the person clicks again on something that is already gone.
  it("invalidates the list afterwards, so the row leaves the page", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await result.current.remove.mutateAsync("ref-1");
    expect(spy).toHaveBeenCalled();
  });

  it("surfaces a refusal rather than swallowing it", async () => {
    deleteFursona.mockRejectedValueOnce(new Error("fursona not found"));
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await expect(result.current.remove.mutateAsync("ref-1")).rejects.toThrow(
      /fursona not found/,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/use-fursonas.test.tsx`
Expected: FAIL — neither hook module exists.

- [ ] **Step 3: Write `use-fursonas.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import {
  readArrangement,
  type Arrangement,
} from "@/features/actors/infrastructure/fursona-arrangement";
import type { Actor } from "@/features/actors/infrastructure/fursonas";

/** The cache key every fursona query and mutation agrees on. */
export const FURSONAS_QUERY_KEY = "fursonas";

/** What {@link useFursonas} returns. */
export interface FursonaListData {
  /** The person's actors, person row first, exactly as the server sent them. */
  rows: Actor[];
  /** Arrangement for the fursonas that have any. */
  arrangement: Arrangement[];
}

/**
 * The fursona list, seeded from the server render.
 *
 * `initial` is what the server component already fetched, so the first paint
 * shows real rows rather than a skeleton — the one place this port deliberately
 * departs from Libra's studio, which fetches in the browser and shows bars
 * while it does.
 *
 * The arrangement is a second query because it comes from a second table; see
 * `readArrangement` for why phase 2a did not join them.
 *
 * @param initial - the rows the server rendered with.
 * @returns the rows and their arrangement.
 */
export function useFursonas(initial: Actor[]): FursonaListData {
  const client = useSupabaseBrowserClient();

  // A real query rather than passing `initial` straight through, and this is
  // load-bearing: the mutations invalidate this key, and a pass-through has
  // nothing to invalidate — a deleted fursona would sit on screen until a full
  // page reload. `initialData` is what keeps the first paint instant anyway.
  const rows = useQuery({
    queryKey: [FURSONAS_QUERY_KEY, "rows"],
    queryFn: () => readMyActors(client),
    initialData: initial,
  });

  const arrangement = useQuery({
    queryKey: [FURSONAS_QUERY_KEY, "arrangement"],
    queryFn: () => readArrangement(client),
    initialData: [] as Arrangement[],
  });

  return { rows: rows.data, arrangement: arrangement.data };
}
```

Update the import at the top of the file to bring in `readMyActors` alongside `readArrangement`.

- [ ] **Step 4: Write `use-fursona-mutations.ts`**

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import {
  deleteFursona,
  setFursonaFeatured,
  setFursonaOrder,
} from "@/features/actors/infrastructure/fursona-arrangement";
import { FURSONAS_QUERY_KEY } from "@/features/actors/application/use-fursonas";

/** What {@link useFursonaMutations} returns. */
export interface FursonaMutations {
  /** Deletes a fursona by actor ref. */
  remove: ReturnType<typeof useMutation<void, Error, string>>;
  /** Moves a fursona to a position. */
  reorder: ReturnType<
    typeof useMutation<void, Error, { actorRef: string; sortOrder: number }>
  >;
  /** Pins or unpins a fursona. */
  pin: ReturnType<
    typeof useMutation<void, Error, { actorRef: string; featured: boolean }>
  >;
}

/**
 * The three writes the list can perform.
 *
 * Every one invalidates the list on success. Without that a deleted row stays
 * on screen and the next click lands on something already gone — and a
 * reordered list snaps back on the next render, which reads as the drag having
 * failed.
 *
 * None of them swallow a refusal. `0012` raises the same `fursona not found`
 * for a row that is missing, someone else's, or inactive, so the caller cannot
 * tell those apart — by design — but it must still be told that nothing
 * happened.
 *
 * @returns the three mutations.
 */
export function useFursonaMutations(): FursonaMutations {
  const client = useSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [FURSONAS_QUERY_KEY] });

  return {
    remove: useMutation({
      mutationFn: (actorRef: string) => deleteFursona(client, actorRef),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: ({
        actorRef,
        sortOrder,
      }: {
        actorRef: string;
        sortOrder: number;
      }) => setFursonaOrder(client, actorRef, sortOrder),
      onSuccess: invalidate,
    }),
    pin: useMutation({
      mutationFn: ({
        actorRef,
        featured,
      }: {
        actorRef: string;
        featured: boolean;
      }) => setFursonaFeatured(client, actorRef, featured),
      onSuccess: invalidate,
    }),
  };
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/use-fursonas.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Sabotage-verify the invalidation**

Remove `onSuccess: invalidate` from `remove`, and confirm **"invalidates the list afterwards"** fails. Restore.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/features/actors/application/ apps/hub/tests/use-fursonas.test.tsx
git commit -m "feat(hub): the fursona list query and its three writes"
```

---

### Task 4: The row

**Files:**

- Create: `apps/hub/src/features/actors/presentation/fursona-row.tsx`
- Test: `apps/hub/tests/fursona-row.test.tsx`

**Interfaces:**

- Produces: `FursonaRow`, taking `actor`, `labels`, `featured`, `canArrange`, and callbacks `onPin`, `onDelete`.

> **Do not reuse `ActorTile`.** It is the picker's tile and the picker still renders it; changing its shape to serve a table would make one component answer to two layouts. This is a second component that happens to show the same actor, and `actor-tile.test.tsx` stays as it is.

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/fursona-row.test.tsx`. Cover: the identity renders; the person row shows no destructive actions; the edit link points at the handle; delete asks before doing; the confirm calls back; cancel does not.

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { FursonaRow } =
  await import("@/features/actors/presentation/fursona-row");

const labels = {
  you: "You",
  edit: "Edit",
  pin: "Pin",
  unpin: "Unpin",
  remove: "Delete",
  confirm: "Confirm",
  cancel: "Cancel",
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
};

/**
 * An actor row, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
const actor = (over: Record<string, unknown> = {}) => ({
  actorRef: "ref-1",
  kind: "fursona",
  handle: "sparky",
  displayName: "Sparky",
  avatarUrl: null,
  visibility: "public",
  status: "active",
  ...over,
});

describe("FursonaRow", () => {
  it("shows the display name and the handle", () => {
    render(
      <FursonaRow
        actor={actor()}
        labels={labels}
        featured={false}
        canArrange
        onPin={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Sparky")).toBeInTheDocument();
    expect(screen.getByText(/sparky/)).toBeInTheDocument();
  });

  it("links to the edit page by handle", () => {
    render(
      <FursonaRow
        actor={actor()}
        labels={labels}
        featured={false}
        canArrange
        onPin={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/fursonas/sparky/edit",
    );
  });

  // The person row is the account, not a character. Offering delete on it would
  // be offering to delete the person.
  it("offers no edit, pin or delete on the person row", () => {
    render(
      <FursonaRow
        actor={actor({ kind: "person", handle: "u-abc", displayName: null })}
        labels={labels}
        featured={false}
        canArrange
        onPin={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    const onDelete = vi.fn();
    render(
      <FursonaRow
        actor={actor()}
        labels={labels}
        featured={false}
        canArrange
        onPin={vi.fn()}
        onDelete={onDelete}
      />,
    );
    screen.getByRole("button", { name: "Delete" }).click();
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("deletes once confirmed", async () => {
    const onDelete = vi.fn();
    render(
      <FursonaRow
        actor={actor()}
        labels={labels}
        featured={false}
        canArrange
        onPin={vi.fn()}
        onDelete={onDelete}
      />,
    );
    screen.getByRole("button", { name: "Delete" }).click();
    screen.getByRole("button", { name: "Confirm" }).click();
    expect(onDelete).toHaveBeenCalledWith("ref-1");
  });

  it("does not delete when the confirm is dismissed", () => {
    const onDelete = vi.fn();
    render(
      <FursonaRow
        actor={actor()}
        labels={labels}
        featured={false}
        canArrange
        onPin={vi.fn()}
        onDelete={onDelete}
      />,
    );
    screen.getByRole("button", { name: "Delete" }).click();
    screen.getByRole("button", { name: "Cancel" }).click();
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("pins on request", () => {
    const onPin = vi.fn();
    render(
      <FursonaRow
        actor={actor()}
        labels={labels}
        featured={false}
        canArrange
        onPin={onPin}
        onDelete={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: "Pin" }).click();
    expect(onPin).toHaveBeenCalledWith("ref-1", true);
  });

  it("offers to unpin what is already pinned", () => {
    const onPin = vi.fn();
    render(
      <FursonaRow
        actor={actor()}
        labels={labels}
        featured
        canArrange
        onPin={onPin}
        onDelete={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: "Unpin" }).click();
    expect(onPin).toHaveBeenCalledWith("ref-1", false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/fursona-row.test.tsx`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Write the component**

Build `FursonaRow` as a `<li>` with: a drag handle (`GripVertical` from lucide, rendered only when `canArrange`), avatar or initial, display name and `@handle`, a visibility badge, then the actions — pin (`Star`), edit (a `Link`), and delete (`Trash2`) which swaps itself for a Confirm/Cancel pair on first click. The person row renders the identity and the `you` label and none of the actions.

Every interactive control needs an accessible name from `labels`; the tests select by role and name, so an unlabelled icon button fails them.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 8 tests.

- [ ] **Step 5: Sabotage-verify the confirm**

Make the delete button call `onDelete` directly instead of opening the confirm, and check **"asks before deleting"** fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/presentation/fursona-row.tsx apps/hub/tests/fursona-row.test.tsx
git commit -m "feat(hub): a fursona row, with delete behind a confirm"
```

---

### Task 5: The filters bar

**Files:**

- Create: `apps/hub/src/features/actors/presentation/fursona-filters-bar.tsx`
- Test: `apps/hub/tests/fursona-filters-bar.test.tsx`

**Interfaces:**

- Consumes: `useQueryStates` from `nuqs`.
- Produces: `FursonaFiltersBar`, taking `labels` and reading and writing the URL itself.

- [ ] **Step 1: Write the failing test**

Cover: typing does not hit the URL until the debounce elapses; a visibility pill sets the parameter immediately; the active pill is marked with `aria-pressed`; clearing returns to "all". Mock `nuqs` with a local state object and use fake timers, as `route-progress.test.tsx` does.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Write the component**

A search `<input type="search">` with a `Search` icon, debounced at **300ms** — matching the studio's `PRODUCT_SEARCH_DEBOUNCE_MS`, so the two apps feel the same — writing `q` with `history: "replace"` so typing does not fill the back stack. Then one pill per visibility plus "all", writing `visibility` with `history: "push"` so a filter choice _is_ a back-button step.

- [ ] **Step 4: Run it and watch it pass**

- [ ] **Step 5: Sabotage-verify the debounce**

Write `q` on every keystroke instead of on the timer, and confirm the debounce test fails. Restore.

- [ ] **Step 6: Commit**

---

### Task 6: The list, the page, and reordering

**Files:**

- Create: `apps/hub/src/features/actors/presentation/fursona-list.tsx`
- Modify: `apps/hub/src/app/[locale]/(app)/fursonas/page.tsx`
- Test: `apps/hub/tests/fursona-list.test.tsx`
- Modify: `apps/hub/tests/fursona-list-page.test.tsx`

- [ ] **Step 1: Write the failing test for the list**

Cover, in `fursona-list.test.tsx`: rows render in arrangement order with pinned first; the empty state appears when the person owns nothing; a **filtered** empty state appears when a filter matches nothing and says so differently, because "you have no fursonas" is wrong and discouraging when the truth is "none match"; and drag-to-reorder is disabled while filtering.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Write `fursona-list.tsx`**

A client component taking the server's rows. It reads filters from the URL, applies `applyFursonaFilters`, sorts by `featured` then `sortOrder` then handle, and renders `FursonaRow` inside a `DragDropContext`/`Droppable` from `@hello-pangea/dnd`. Dragging is enabled only when `!isFiltering(filters)` and there is more than one fursona — the studio's rule, and it is right: a reorder computed from a filtered view would move rows the person cannot see.

On drop, call `reorder.mutate` once per row whose index changed.

- [ ] **Step 4: Rewrite the page**

`page.tsx` keeps `ensurePersonActor()` and `listMyActors()`, passes `width="wide"` to the shell, renders the header row — title, subtitle, and the "New fursona" link — and hands the rows to `FursonaList`. The suspended branch stays exactly as it is: a suspended person is told so and offered no create link, because offering an action that can only fail is worse than offering none.

- [ ] **Step 5: Run every test and watch them pass**

Run: `pnpm --filter hub test`

- [ ] **Step 6: Sabotage-verify the reorder guard**

Allow dragging while filtering, and confirm the guard test fails. Restore.

- [ ] **Step 7: Commit**

---

### Task 7: Catalogues, then close the phase

- [ ] **Step 1: Add every new key to both catalogues**

`fursonas.search`, `fursonas.filterAll`, `fursonas.pin`, `fursonas.unpin`, `fursonas.remove`, `fursonas.confirmDelete`, `fursonas.cancel`, `fursonas.dragToReorder`, `fursonas.noMatches`. Spanish must differ from English or `messages.test.ts` fails — and if a value genuinely coincides, add it to that test's allowlist **with a justification**, as `nav.fursonas` did.

- [ ] **Step 2: Run every gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm format:check
pnpm --filter hub test:coverage
pnpm check:tools && pnpm check:docs origin/main && pnpm secretlint
pnpm --filter hub build
pnpm --filter hub test:e2e
```

Expected: all exit 0, coverage 100% on all four metrics.

- [ ] **Step 3: Check the new dependencies are pinned as this plan says**

```bash
grep -E "nuqs|hello-pangea|lucide" apps/hub/package.json
```

Expected: `^2.8.9`, `^18.0.1`, `^1.11.0`. pnpm rewrites these on install.

- [ ] **Step 4: Push and open the pull request**

The body must say plainly that **no signed-in end-to-end test exists**, so none of this has browser-level proof, and that the reorder, pin and delete paths have never run against a real person's data — there are still no fursona rows in the live database.

- [ ] **Step 5: Wait for all four required checks**

---

## What this phase does not do

- **No migration.** Phase 2a shipped the schema and it is already applied to the live database.
- **No editor changes.** `/fursonas/new` and `/fursonas/[handle]/edit` keep their card form and server actions until phase 4.
- **No sections.** Phase 3.
- **No change to `ActorTile` or the picker.** The row is a second component; the tile keeps serving the picker unchanged.
