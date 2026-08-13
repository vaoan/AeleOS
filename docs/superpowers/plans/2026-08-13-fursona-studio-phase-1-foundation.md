# Fursona studio, phase 1 — foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the four pieces the rest of the studio port stands on into the hub — a class-merging helper, a wide page option, a browser Supabase client, and a React Query provider — with nothing user-visible changed.

**Architecture:** Each piece is independent and lands behind its own test. The browser client is an adapter in the hub, not a change to `@aeleos/identity`: the package keeps taking `getToken` as a parameter, so it still never learns the issuer is Clerk. The query provider wraps the localised layout so every signed-in page below it can use hooks in later phases.

**Tech Stack:** Next 16 (App Router, Turbopack), React 19, TypeScript, next-intl, Clerk, supabase-js, Vitest + Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md`

## Global Constraints

- **Budget is $0.** No dependency that needs a paid tier, a card, or a trial.
- **Every export carries TSDoc stating the contract, not the types.** `pnpm lint` fails without it.
- **Every export is tested on its happy path and each failure mode.** The hub gates at **100% statements, branches, functions and lines** (`apps/hub/vitest.config.ts`). The threshold ratchets up, never down.
- **A test that guards already-correct behaviour must be verified by sabotage:** break the code, watch the test go red, restore.
- **Change an implementation, move its documentation.** `pnpm check:docs` runs in pre-commit and fails when a symbol changed and its TSDoc did not. There is no suppression flag.
- **Filenames are kebab-case** (`.ls-lint.yml` enforces this for `.ts`/`.tsx` under `apps/hub/src` and `apps/hub/tests`).
- **`shared/` must never import a feature**, and layers point inward only (`eslint.config.mjs`).
- **`packages/identity` must not import a framework** — no Clerk, no Next, no React. Enforced by `eslint.config.mjs`. Nothing in this phase changes that package.
- **Add a dependency in the phase that uses it.** `nuqs`, `@hello-pangea/dnd`, `react-hook-form`, `@hookform/resolvers` and `lucide-react` belong to phases 2–4 and must **not** be installed here — `knip` reports unused dependencies, and a package sitting unused for three phases is noise that trains people to ignore the report.
- **Versions match Libra's studio**, so a future port does not fight a version gap: `@tanstack/react-query@^5.100.5`, `clsx@^2.1.1`, `tailwind-merge@^3.5.0`.
- **Do not commit unless the plan's step says to**, and never commit secrets.

---

## File Structure

| File                                                     | Responsibility                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/hub/src/shared/infrastructure/cn.ts`               | Merge conditional and conflicting Tailwind classes. Replaces Libra's `cn` from its `ui` package.                                    |
| `apps/hub/src/shared/presentation/page-shell.tsx`        | Gains a `width` prop so a page can leave the 620px column.                                                                          |
| `apps/hub/src/shared/infrastructure/supabase-browser.ts` | Build a Supabase client in the browser from Clerk's client-side token source. The only browser file naming both Clerk and Supabase. |
| `apps/hub/src/shared/presentation/query-provider.tsx`    | Own the React Query client and provide it to the tree.                                                                              |
| `apps/hub/src/app/[locale]/layout.tsx`                   | Wrap its children in the query provider.                                                                                            |

Tests sit beside the suite's existing files in `apps/hub/tests/`, one per unit.

---

### Task 0: Cut the branch from the right base

This has gone wrong twice in this repository (PRs #4 and #11), both times the same way: a bare `git checkout -b` branches from whatever is checked out, which after a session's work is the last feature branch rather than `main`. Merging such a branch silently reverts work already on `main`.

- [ ] **Step 1: Branch from `origin/main` explicitly**

```bash
git fetch origin
git checkout -b feat/studio-phase-1-foundation origin/main
```

- [ ] **Step 2: Confirm the base is clean**

```bash
git log --oneline origin/main..HEAD
```

Expected: **no output**. Any commit listed means the base is wrong; rebuild with `git checkout -B feat/studio-phase-1-foundation origin/main`.

---

### Task 1: The `cn` helper

Libra's studio imports `cn` from its `ui` package. AeleOS has no `ui` package and is not vendoring one, so this is the one piece of that package the port actually needs.

**Files:**

- Create: `apps/hub/src/shared/infrastructure/cn.ts`
- Test: `apps/hub/tests/cn.test.ts`
- Modify: `apps/hub/package.json` (dependencies)

**Interfaces:**

- Consumes: nothing.
- Produces: `cn(...inputs: ClassValue[]): string` — later phases import it from `@/shared/infrastructure/cn`.

- [ ] **Step 1: Install the two dependencies**

```bash
pnpm --filter hub add clsx@^2.1.1 tailwind-merge@^3.5.0
```

- [ ] **Step 2: Write the failing test**

Create `apps/hub/tests/cn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cn } from "@/shared/infrastructure/cn";

describe("cn", () => {
  it("joins plain class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values, so a conditional class can be inlined", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  // The whole reason tailwind-merge is here rather than clsx alone. Two
  // conflicting Tailwind utilities must resolve to the last one, or a caller
  // passing an override gets whichever the CSS happens to order later.
  it("keeps the last of two conflicting Tailwind utilities", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("keeps utilities that do not conflict", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/cn.test.ts`
Expected: FAIL — `Failed to resolve import "@/shared/infrastructure/cn"`.

- [ ] **Step 4: Write the implementation**

Create `apps/hub/src/shared/infrastructure/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, with later Tailwind utilities beating earlier ones.
 *
 * Two layers, and both are load-bearing. `clsx` flattens conditionals so a
 * caller can inline `cond && "..."`; `tailwind-merge` then resolves conflicts,
 * so a component's default `px-2` loses to a caller's `px-4` instead of both
 * landing in the attribute and the winner being decided by CSS order.
 *
 * This is the one thing the port needs from Libra's `ui` package. It is
 * reimplemented rather than vendored because the rest of that package is the
 * theme, which AeleOS deliberately does not take.
 *
 * @param inputs - class names, arrays, or conditional expressions.
 * @returns the merged class attribute.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/cn.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Sabotage-verify the conflict test**

Temporarily change the implementation to `return clsx(inputs);`, then run the test again.
Expected: the "keeps the last of two conflicting Tailwind utilities" test FAILS with `expected 'px-2 px-4' to be 'px-4'` — proving `tailwind-merge` is doing work rather than being decoration. Restore the implementation and re-run: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/shared/infrastructure/cn.ts apps/hub/tests/cn.test.ts apps/hub/package.json pnpm-lock.yaml
git commit -m "feat(hub): add cn, the one thing the port needs from Libra's ui package"
```

---

### Task 2: A wide option on `PageShell`

The list and editor pages leave the 620px column. `PageShell` currently hard-codes `max-w-[620px]` and `justify-center`; the second is right for a short card and wrong for a table, which should start at the top.

**Files:**

- Modify: `apps/hub/src/shared/presentation/page-shell.tsx`
- Test: `apps/hub/tests/page-shell.test.tsx` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `PageShellProps.width?: "column" | "wide"`, defaulting to `"column"`. Phase 2 passes `"wide"` from the fursona list page.

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/page-shell.test.tsx`. `PageShell` is an async server component, so it is awaited and rendered rather than mounted directly:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/shared/presentation/nebula-toggle", () => ({
  NebulaToggle: () => null,
}));
vi.mock("@/shared/presentation/language-toggle", () => ({
  LanguageToggle: () => null,
}));
vi.mock("@/shared/presentation/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

const { PageShell } = await import("@/shared/presentation/page-shell");

/**
 * Renders the shell and returns its `main` element.
 *
 * @param width - the width mode, omitted to exercise the default.
 * @returns the rendered main element.
 */
async function renderShell(width?: "column" | "wide"): Promise<HTMLElement> {
  render(await PageShell({ children: <p>hi</p>, width }));
  return screen.getByTestId("page-content");
}

describe("PageShell width", () => {
  it("holds the page to the reading column by default", async () => {
    const main = await renderShell();
    expect(main.className).toContain("max-w-[620px]");
  });

  // A short card centres in the window; a long table must not, or it starts
  // below the fold on a tall screen.
  it("centres a short page vertically in the column", async () => {
    const main = await renderShell();
    expect(main.className).toContain("justify-center");
  });

  it("goes wide when asked", async () => {
    const main = await renderShell("wide");
    expect(main.className).toContain("max-w-7xl");
    expect(main.className).not.toContain("max-w-[620px]");
  });

  it("starts a wide page at the top rather than centring it", async () => {
    const main = await renderShell("wide");
    expect(main.className).not.toContain("justify-center");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/page-shell.test.tsx`
Expected: FAIL — the two `wide` tests fail, because `width` is ignored and the column classes are always emitted.

- [ ] **Step 3: Add the prop**

In `apps/hub/src/shared/presentation/page-shell.tsx`, add to `PageShellProps`:

```ts
  /**
   * How wide the page column is. `"column"` — the default — is the 620px
   * reading measure every page used before the studio port. `"wide"` is for
   * the pages that hold a table rather than prose, and it also stops the
   * vertical centring: centring is right for a short card and wrong for a long
   * list, which would otherwise start below the fold on a tall window.
   */
  width?: "column" | "wide";
```

Destructure it with a default, alongside the existing props:

```ts
export async function PageShell({
  children,
  trailing,
  nav,
  homeHref = "/",
  width = "column",
}: PageShellProps) {
```

Replace the `main` element's fixed classes:

```tsx
      <main
        className={cn(
          "mx-auto flex w-full flex-1 flex-col px-6 py-10",
          width === "wide" ? "max-w-7xl" : "max-w-[620px] justify-center",
        )}
        {...tid("page-content")}
      >
```

Add the import at the top of the file:

```ts
import { cn } from "@/shared/infrastructure/cn";
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/page-shell.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Update the TSDoc that just went stale**

`pnpm check:docs` will fail the commit otherwise. The shell's doc comment already explains that the header spans the window while the page is held to 620px — that sentence is now conditional. Amend that paragraph to say the reading column is the default and that a wide page opts out of both the measure and the centring.

- [ ] **Step 6: Run the whole hub suite**

Run: `pnpm --filter hub test`
Expected: PASS. Nothing else passes `width`, so every existing page keeps the column.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/shared/presentation/page-shell.tsx apps/hub/tests/page-shell.test.tsx
git commit -m "feat(hub): let a page leave the reading column"
```

---

### Task 3: The browser Supabase client

The hub has only a server client. Phase 2's hooks query from the browser, so an adapter is needed there — and it is the file that decides whether the issuer seam survives.

**Files:**

- Create: `apps/hub/src/shared/infrastructure/supabase-browser.ts`
- Test: `apps/hub/tests/supabase-browser.test.ts`

**Interfaces:**

- Consumes: `createIdentityClient({ getToken, url, anonKey })` from `@aeleos/identity`; `env.supabaseUrl` and `env.supabaseAnonKey` from `@/shared/infrastructure/env`.
- Produces: `useSupabaseBrowserClient(): SupabaseClient` — a hook, because Clerk's browser token source comes from `useAuth()`. Phase 2's query hooks call it.

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/supabase-browser.test.ts`. It mirrors `supabase-client.test.ts`, which tests the server half:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const getToken = vi.fn(async () => "clerk-token");
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken }) }));

const createIdentityClient = vi.fn<(...a: unknown[]) => unknown>(() => ({}));
vi.mock("@aeleos/identity", () => ({
  createIdentityClient: (...a: unknown[]) => createIdentityClient(...a),
}));

vi.mock("@/shared/infrastructure/env", () => ({
  env: { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon-key" },
}));

const { useSupabaseBrowserClient } =
  await import("@/shared/infrastructure/supabase-browser");

describe("useSupabaseBrowserClient", () => {
  beforeEach(() => {
    createIdentityClient.mockClear();
    getToken.mockReset();
    getToken.mockImplementation(async () => "clerk-token");
  });

  it("reaches the project named in the validated env", () => {
    renderHook(() => useSupabaseBrowserClient());
    expect(createIdentityClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://x.supabase.co",
        anonKey: "anon-key",
      }),
    );
  });

  // The same invariant the server adapter has: hand over the token SOURCE, not
  // a token already read. A stale token makes RLS answer as nobody, which is an
  // empty result rather than an error — a silent wrong answer.
  it("forwards Clerk's token source, so each call reads a fresh token", async () => {
    let n = 0;
    getToken.mockImplementation(async () => `clerk-token-${++n}`);
    renderHook(() => useSupabaseBrowserClient());
    const passed = createIdentityClient.mock.calls[0]![0] as {
      getToken: () => Promise<string | null>;
    };
    expect(await passed.getToken()).toBe("clerk-token-1");
    expect(await passed.getToken()).toBe("clerk-token-2");
  });

  // Rebuilding the client on every render would throw away supabase-js's
  // internal state and make each render a different client object, which
  // defeats React Query's caching in phase 2.
  it("returns the same client across renders", () => {
    const { result, rerender } = renderHook(() => useSupabaseBrowserClient());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/supabase-browser.test.ts`
Expected: FAIL — `Failed to resolve import "@/shared/infrastructure/supabase-browser"`.

- [ ] **Step 3: Write the implementation**

Create `apps/hub/src/shared/infrastructure/supabase-browser.ts`:

```ts
"use client";

import { useAuth } from "@clerk/nextjs";
import { createIdentityClient } from "@aeleos/identity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { env } from "@/shared/infrastructure/env";

/**
 * Supabase client for Client Components.
 *
 * The browser counterpart of `createServerClient`, and the only file in the
 * browser bundle that names both Clerk and Supabase. `@aeleos/identity` takes
 * `getToken` as a parameter and so still never learns the issuer — which is
 * what keeps swapping issuers a one-column `identity_sub` backfill. **Do not
 * move the Clerk import into that package to save this adapter.**
 *
 * A hook rather than a function because Clerk's browser token source comes from
 * `useAuth()`. `getToken` is handed over as a function, never as a token this
 * already read: a resolved token goes stale and RLS then answers as nobody,
 * which is an empty result rather than an error.
 *
 * Memoised on the token source, so React Query sees one stable client rather
 * than a new one per render.
 *
 * @returns a client that authenticates as the signed-in person.
 */
export function useSupabaseBrowserClient(): SupabaseClient {
  const { getToken } = useAuth();
  return useMemo(
    () =>
      createIdentityClient({
        getToken,
        url: env.supabaseUrl,
        anonKey: env.supabaseAnonKey,
      }),
    [getToken],
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/supabase-browser.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Sabotage-verify the freshness test**

Temporarily make the adapter cache the first token it reads, which is the realistic version of this mistake:

```ts
let cached: string | null = null;
// ...inside createIdentityClient({ ... })
getToken: async () => (cached ??= await getToken()),
```

Run: `pnpm --filter hub exec vitest run tests/supabase-browser.test.ts`
Expected: the "forwards Clerk's token source" test FAILS, returning `clerk-token-1` on both calls. Restore the implementation and re-run: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/shared/infrastructure/supabase-browser.ts apps/hub/tests/supabase-browser.test.ts
git commit -m "feat(hub): a Supabase client for the browser, with the issuer seam intact"
```

---

### Task 4: The React Query provider

**Files:**

- Create: `apps/hub/src/shared/presentation/query-provider.tsx`
- Test: `apps/hub/tests/query-provider.test.tsx`
- Modify: `apps/hub/src/app/[locale]/layout.tsx`
- Modify: `apps/hub/package.json` (dependencies)

**Interfaces:**

- Consumes: nothing.
- Produces: `QueryProvider({ children }: { children: ReactNode })`. Phase 2's `useFursonas` and mutation hooks rely on a client being in context below it.

- [ ] **Step 1: Install React Query**

```bash
pnpm --filter hub add @tanstack/react-query@^5.100.5
```

- [ ] **Step 2: Write the failing test**

Create `apps/hub/tests/query-provider.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "@/shared/presentation/query-provider";

/** Renders the client's presence as text, so the assertion is on behaviour. */
function Probe() {
  return <span>{useQueryClient() ? "has client" : "no client"}</span>;
}

describe("QueryProvider", () => {
  it("renders its children", () => {
    render(
      <QueryProvider>
        <p>hello</p>
      </QueryProvider>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("puts a query client in context for the tree below it", () => {
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );
    expect(screen.getByText("has client")).toBeInTheDocument();
  });

  // One client for the life of the tree. Constructing it inline in the render
  // body makes a new client on every render, which throws away every cached
  // query — the bug this test exists to prevent.
  it("keeps the same client across re-renders", () => {
    const seen: unknown[] = [];
    function Collect() {
      seen.push(useQueryClient());
      return null;
    }
    const { rerender } = render(
      <QueryProvider>
        <Collect />
      </QueryProvider>,
    );
    rerender(
      <QueryProvider>
        <Collect />
      </QueryProvider>,
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/query-provider.test.tsx`
Expected: FAIL — `Failed to resolve import "@/shared/presentation/query-provider"`.

- [ ] **Step 4: Write the implementation**

Create `apps/hub/src/shared/presentation/query-provider.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** What {@link QueryProvider} wraps. */
export interface QueryProviderProps {
  /** The tree that may use query hooks. */
  children: ReactNode;
}

/**
 * Owns the React Query client for the whole app.
 *
 * The client is created in `useState`'s initialiser rather than in the render
 * body or at module scope, and both alternatives are wrong for different
 * reasons. In the render body it would be rebuilt on every render, discarding
 * every cached query. At module scope it would be shared across requests on the
 * server, where one visitor's cached data would be handed to the next.
 *
 * @param props - the tree to provide to.
 * @returns the provider.
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/query-provider.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Sabotage-verify the stability test**

Temporarily replace `const [client] = useState(() => new QueryClient());` with `const client = new QueryClient();`. The "keeps the same client across re-renders" test must FAIL. Restore and re-run: PASS.

- [ ] **Step 7: Wire it into the localised layout**

In `apps/hub/src/app/[locale]/layout.tsx`, wrap whatever the layout already returns inside `<QueryProvider>`, immediately inside `NextIntlClientProvider` so translations remain available to anything the provider renders. Add the import:

```tsx
import { QueryProvider } from "@/shared/presentation/query-provider";
```

Then extend the layout's TSDoc to say the tree below can use query hooks — `pnpm check:docs` fails the commit otherwise.

- [ ] **Step 8: Verify the app still builds and serves**

Run: `pnpm --filter hub test && pnpm --filter hub build`
Expected: both PASS. The provider adds no visible markup, so no existing test should change.

- [ ] **Step 9: Run the e2e suite, which is a required check**

Run: `pnpm --filter hub test:e2e`
Expected: PASS, 28 tests. This is the only proof that adding a provider to the localised layout did not break rendering for a real browser — the unit suite never mounts the layout.

- [ ] **Step 10: Commit**

```bash
git add apps/hub/src/shared/presentation/query-provider.tsx apps/hub/tests/query-provider.test.tsx "apps/hub/src/app/[locale]/layout.tsx" apps/hub/package.json pnpm-lock.yaml
git commit -m "feat(hub): provide a React Query client to the localised tree"
```

---

### Task 5: Close the phase

**Files:** none beyond what the gates require.

- [ ] **Step 1: Run every gate the CI runs**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm format:check
pnpm --filter hub test:coverage
pnpm --filter @aeleos/identity test:coverage
pnpm check:tools
pnpm check:docs origin/main
pnpm secretlint
pnpm --filter hub build
pnpm --filter hub test:e2e
```

Expected: all exit 0, and coverage reports **100%** on statements, branches, functions and lines.

- [ ] **Step 2: Check `knip` added no unused dependency**

Run: `pnpm exec knip --no-exit-code`
Expected: `clsx`, `tailwind-merge` and `@tanstack/react-query` do **not** appear under "Unused dependencies" — each is imported by a file this phase added. If one does appear, the phase installed something it did not use, which is the mistake the Global Constraints call out.

- [ ] **Step 3: Confirm the branch is based on `origin/main`**

```bash
git log --oneline origin/main..HEAD
```

Expected: only this phase's four commits. Anything else means the branch was cut from the wrong base — rebuild with `git checkout -B <name> origin/main` and cherry-pick.

- [ ] **Step 4: Push and open the pull request**

```bash
git push -u origin feat/studio-phase-1-foundation
gh pr create --base main \
  --title "feat(hub): studio port phase 1 — foundation" \
  --body-file pr-body.md
```

The body must cover four things, because a reviewer seeing no visual change will otherwise ask all four:

1. **Nothing is user-visible**, deliberately — `width` defaults to the existing column and nothing passes `"wide"` yet.
2. **Which decision from the spec each file serves**, linking `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md`.
3. **That `@aeleos/identity` is untouched**, and why that matters: the browser adapter lives in the hub so the package still never learns the issuer is Clerk.
4. **What was sabotage-verified** — the `cn` conflict merge, the token freshness, and the query client's stability — since all three guard behaviour that looks correct by inspection.

Delete `pr-body.md` after creating the PR; it is a scratch file and does not belong in the repository.

- [ ] **Step 5: Wait for all four required checks**

Run: `gh pr checks <number> --watch --required`
Expected: `conformance`, `hub`, `e2e` and `idp-cloud` all pass. A red `e2e` blocks the merge — and note it can fail for reasons outside this change, so read the log before assuming a regression.

---

## What this phase does not do

- No user-visible change. Nothing renders differently; `width` defaults to the existing column and nothing passes `"wide"` yet.
- No database work, no migration, no change to `actors` or to `/api/actors/mine`.
- No `nuqs`, `@hello-pangea/dnd`, `react-hook-form` or `lucide-react` — those arrive in the phases that use them.
- No change to `@aeleos/identity`. If this phase finds itself editing that package, the browser adapter has been put on the wrong side of the seam.

## Known gap, carried from the spec

Everything here is exercised by unit tests and, for the layout change, by the anonymous end-to-end suite. **No signed-in end-to-end test exists in this repository**, so the browser Supabase client is never proven against a real Clerk session by any automated test in this phase. It is first exercised for real by phase 2's list queries, and the first honest proof is the manual signed-in pass that Phase 1b-i still has open.
