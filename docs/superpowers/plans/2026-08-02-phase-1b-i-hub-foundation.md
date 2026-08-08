# Phase 1b-i — Hub Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `aeleos-hub` application as far as a signed-in person: a Next.js app authenticating through Clerk, backed by its own Supabase project holding the **authoritative** actor registry, provisioning a person actor on first sign-in.

**Architecture:** `aeleos-hub` is a new single-package repo (not a monorepo — it has one app). It applies the canonical migrations from `aeleos` unchanged, but unlike every consuming app its `actors` table is the source of truth rather than a mirror. Authentication is Clerk via Supabase Third-Party Auth, so the app never holds a Supabase session — it passes the Clerk token straight to PostgREST and RLS resolves the caller. Person provisioning reuses `ensure_person_actor()`, already built and tested in Phase 1a.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, `@clerk/nextjs` 7, `@supabase/supabase-js` 2, TanStack Query 5, Vitest, Playwright, pnpm.

## Global Constraints

- **Budget: $0.** Clerk free plan (50,000 MRU, max 3 social connections). The hub needs a **third Supabase project** — the free plan allows two. Task 3 confirms a slot is actually free before anything depends on it.
- **Depends on Phase 0.** The Clerk instance, its Google + Discord connectors, and the activated Supabase integration must exist before Task 5. See `2026-07-31-phase-0-clerk-idp-standup.md`.
- **The canonical migrations are copied, never rewritten.** `0001`–`0007` come from `Z:\Github\aeleos\supabase\migrations\` byte-identically. If one appears wrong, that is a finding to report — fixing it here would fork the schema every other app depends on.
- **The UUIDv5 namespace in `0006` must stay byte-identical.** It is what makes every app derive the same `actor_ref` for the same person. Changing it forks every identity.
- **Toolchain parity.** Mirror `Z:\Github\aeleos`'s configs exactly — `.prettierrc.json` (`{"endOfLine": "auto"}`), `.gitattributes`, `eslint.config.mjs`, husky + lint-staged, secretlint, `check:tools`. The maintainer upgrades all Furry Colombia projects in one pass; divergence makes that per-repo work.
- **Neither sister repo defaults to `main`** — both use `develop`. Decide the hub's default branch deliberately in Task 1 rather than accepting git's.
- **Secrets never in git.** Clerk and Supabase values live in `.env.local` and `.secrets`, both gitignored. `pnpm secretlint` must pass.
- Filenames kebab-case. Work on a branch; do not merge or open a PR without explicit instruction.
- Steps marked 🧑 are **human-only** (dashboard actions) and cannot be performed by an agent.

## What this plan does NOT cover

Fursona creation, profile editing, the picker, and the app handoff protocol are **Phase 1b-ii**. This plan stops at a signed-in person with a provisioned actor — which is the foundation all of that sits on, and is independently shippable.

---

### Task 1: Scaffold the `aeleos-hub` repo with toolchain parity

**Files:**

- Create: `Z:\Github\aeleos-hub\package.json`
- Create: `Z:\Github\aeleos-hub\tsconfig.json`
- Create: `Z:\Github\aeleos-hub\.gitignore`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`
- Create: `Z:\Github\aeleos-hub\eslint.config.mjs`
- Create: `Z:\Github\aeleos-hub\cspell.json`, `.ls-lint.yml`, `knip.json`, `.jscpd.json`
- Create: `Z:\Github\aeleos-hub\.secretlintrc.json`, `.secretlintignore`
- Create: `Z:\Github\aeleos-hub\pnpm-workspace.yaml`
- Create: `Z:\Github\aeleos-hub\.husky\pre-commit`

**Interfaces:**

- Consumes: nothing.
- Produces: a repo where `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm secretlint` and `pnpm check:tools` all run.

- [ ] **Step 1: Create the repo and choose its default branch**

```bash
mkdir -p Z:/Github/aeleos-hub
cd Z:/Github/aeleos-hub
git init -b develop
```

> `develop`, not `main` — both sister repos default to `develop`, and `aeleos` defaulting to `main` is the odd one out. Matching the majority keeps cross-repo work predictable.

- [ ] **Step 2: Copy the toolchain configs from aeleos**

These are already aligned with puck and libra, so copying them is how parity propagates:

```bash
cd Z:/Github/aeleos-hub
for f in .gitattributes .prettierrc.json .secretlintrc.json .secretlintignore .ls-lint.yml .jscpd.json cspell.json; do
  cp "Z:/Github/aeleos/$f" .
done
cp Z:/Github/aeleos/.husky/pre-commit ./husky-pre-commit.tmp
```

Then edit `.ls-lint.yml` — aeleos's version points at `tests/` and `scripts/`, which is wrong here. Replace its `ls:` block with:

```yaml
ls:
  src:
    .ts: kebab-case
    .tsx: kebab-case | regex:^[A-Z][A-Za-z0-9]*$
  tests:
    .ts: kebab-case
```

Leave its `ignore:` block as copied.

- [ ] **Step 3: Write package.json**

```json
{
  "name": "aeleos-hub",
  "version": "0.1.0",
  "private": true,
  "description": "AeleOS Hub — fursona registry and profile management for Furry Colombia.",
  "license": "MIT",
  "type": "module",
  "packageManager": "pnpm@10.32.1+sha512.a706938f0e89ac1456b6563eab4edf1d1faf3368d1191fc5c59790e96dc918e4456ab2e67d613de1043d2e8c81f87303e6b40d4ffeca9df15ef1ad567348f2be",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "next dev -p 5100",
    "build": "next build",
    "start": "next start",
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "lint": "eslint . --no-error-on-unmatched-pattern",
    "lint:fix": "eslint . --fix --no-error-on-unmatched-pattern",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,mjs,json,css,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,mjs,json,css,md}\"",
    "fix:staged": "lint-staged --concurrent false",
    "fix:all": "pnpm format && pnpm lint:fix",
    "typecheck": "tsc --noEmit",
    "check:tools": "cspell \"**/*.{ts,tsx,md,json}\" --no-progress && ls-lint && knip --no-exit-code && jscpd . && (madge --circular --extensions ts,tsx src || true)",
    "secretlint": "secretlint \"**/*\"",
    "prepare": "husky"
  },
  "dependencies": {
    "@clerk/nextjs": "^7.6.4",
    "@supabase/supabase-js": "^2.110.0",
    "@tanstack/react-query": "^5.101.2",
    "lucide-react": "^1.22.0",
    "next": "^16.2.9",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@ls-lint/ls-lint": "^2.3.1",
    "@playwright/test": "^1.61.1",
    "@secretlint/secretlint-rule-preset-recommend": "^12.3.1",
    "@tailwindcss/postcss": "^4.3.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^24.0.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.3",
    "cspell": "^10.0.0",
    "eslint": "^9.39.4",
    "eslint-config-next": "^16.2.4",
    "eslint-config-prettier": "^10.1.5",
    "globals": "^14.0.0",
    "husky": "^9.1.7",
    "jscpd": "^4.0.9",
    "jsdom": "^29.1.1",
    "knip": "^6.7.0",
    "lint-staged": "^16.4.0",
    "madge": "^8.0.0",
    "prettier": "^3.8.3",
    "secretlint": "^12.3.1",
    "supabase": "^2.95.5",
    "tailwindcss": "^4.3.2",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.59.0",
    "vitest": "^4.1.5"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs}": [
      "prettier --check",
      "eslint --max-warnings=0 --no-warn-ignored",
      "secretlint"
    ],
    "*.{json,md,css}": ["prettier --check"]
  }
}
```

> Note what is deliberately **absent**: `@supabase/ssr`. Puck needs it because it uses Supabase Auth and must manage session cookies. The hub has no Supabase session at all — it forwards a Clerk token — so the cookie helpers would be dead weight.

- [ ] **Step 4: Write the remaining configs**

`pnpm-workspace.yaml`:

```yaml
# Settings-only: aeleos-hub is a single package, not a workspace.
onlyBuiltDependencies:
  - esbuild
  - supabase
  - sharp
```

`.gitignore`:

```gitignore
node_modules/
.next/
out/
.env
.env.*
!.env.example
.secrets
supabase/.temp/
supabase/.branches/
*.log
test-results/
playwright-report/
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": true,
    "incremental": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`eslint.config.mjs`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
```

`knip.json`:

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "src/app/**/{page,layout,route,middleware}.{ts,tsx}",
    "src/middleware.ts",
    "tests/**/*.test.{ts,tsx}"
  ],
  "project": ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
  "ignoreDependencies": [
    "@secretlint/secretlint-rule-preset-recommend",
    "@tailwindcss/postcss",
    "tailwindcss"
  ]
}
```

`.prettierignore`:

```gitignore
node_modules
.next
supabase/.branches
supabase/.temp
pnpm-lock.yaml
playwright-report
test-results
```

Move the husky hook into place:

```bash
mkdir -p .husky && mv husky-pre-commit.tmp .husky/pre-commit
```

- [ ] **Step 5: Install and verify every gate runs**

```bash
pnpm install
pnpm secretlint; echo "secretlint=$?"
pnpm format:check; echo "format=$?"
```

Expected: both exit 0. `lint`, `typecheck` and `check:tools` will have nothing to inspect until Task 2 adds source — that is fine here; Task 2 verifies them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold aeleos-hub with sister-repo toolchain parity"
```

> `git add -A` is acceptable **only here**, on the initial commit of an empty repo with `.gitignore` already in place. Every later task uses explicit paths.

---

### Task 2: Next.js app skeleton

**Files:**

- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `next.config.ts`, `postcss.config.mjs`
- Create: `vitest.config.ts`, `tests/setup.ts`
- Test: `tests/smoke.test.tsx`

**Interfaces:**

- Consumes: Task 1's toolchain.
- Produces: a running Next.js app; `pnpm test` executes Vitest with React Testing Library.

- [ ] **Step 1: Write the Next.js config**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

`postcss.config.mjs`:

```js
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

- [ ] **Step 2: Write the app shell**

`src/app/globals.css`:

```css
@import "tailwindcss";
```

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AeleOS",
  description: "Your identity across Furry Colombia.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold">AeleOS</h1>
      <p className="text-neutral-400">Your identity across Furry Colombia.</p>
    </main>
  );
}
```

- [ ] **Step 3: Wire Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write the failing test**

`tests/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("home page", () => {
  it("renders the product name", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "AeleOS" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm test`
Expected: PASS (1 test).

- [ ] **Step 6: Verify the build and every gate**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:tools
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ tests/ next.config.ts postcss.config.mjs vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: add next.js app skeleton with vitest"
```

---

### Task 3: Confirm a Supabase slot, then stand up the registry

**Files:**

- Create: `supabase/config.toml` (generated)
- Create: `supabase/migrations/0001_actors.sql` … `0007_suspension_hardening.sql` (copied)
- Create: `docs/registry.md`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: a local Supabase stack whose `actors` table is the authoritative registry, with `ensure_person_actor()`, `current_person_ref()` and `can_act_as()` available.

- [ ] **Step 1: Confirm a Supabase project slot is actually free** 🧑

The free plan allows **two active projects**. Before anything depends on the hub having its own, check <https://supabase.com/dashboard> and count active (not paused) projects.

- **Fewer than two** — proceed; the hub gets its own project in Phase 1b-ii when hosting is set up.
- **Already two** — **stop and report.** Do not silently put the registry into an app's project: that couples identity to one app and contradicts the design. It is the maintainer's call whether to pause a project, pay, or stay local-only.

Local development works either way, so Tasks 3–9 can complete regardless. Only deployment is gated.

- [ ] **Step 2: Initialise the local stack**

```bash
cd Z:/Github/aeleos-hub
pnpm exec supabase init
pnpm exec supabase start
```

- [ ] **Step 3: Copy the canonical migrations verbatim**

```bash
mkdir -p supabase/migrations
cp Z:/Github/aeleos/supabase/migrations/000*.sql supabase/migrations/
ls supabase/migrations/
```

Expected: `0001_actors.sql` through `0007_suspension_hardening.sql`.

Do **not** edit them. Verify the UUIDv5 namespace survived the copy — it is what makes every app derive the same `actor_ref` for the same person:

```bash
grep -c 'd1f1a0c6-6b3e-5f7a-9c2d-3e4f5a6b7c8d' supabase/migrations/0006_provisioning.sql
```

Expected: `1`.

- [ ] **Step 4: Enable Clerk as the third-party provider**

In `supabase/config.toml`, change the Clerk block to:

```toml
[auth.third_party.clerk]
enabled = true
domain = "env(CLERK_DOMAIN)"
```

- [ ] **Step 5: Apply and verify the schema**

```bash
set -a; . ./.secrets; set +a
pnpm exec supabase db reset
```

Then confirm the helper functions the app depends on actually exist. Capture the
database URL once — the same one-liner is used again in Task 7:

```bash
DB_URL=$(pnpm exec supabase status -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).DB_URL))")
psql "$DB_URL" -c "select proname from pg_proc where proname in ('ensure_person_actor','current_person_ref','can_act_as') order by proname;"
```

Expected: three rows — `can_act_as`, `current_person_ref`, `ensure_person_actor`.

If `psql` is not installed, run the same query through any Postgres client using
`$DB_URL`; the point is confirming the three functions exist before the app
depends on them.

- [ ] **Step 6: Document what makes this repo different**

Create `docs/registry.md`:

````markdown
# The registry in aeleos-hub

Every consuming app keeps a **mirror** of `actors`, synced from here. This repo is
the exception: its `actors` table is **authoritative**. Nothing syncs into it.

The migrations in `supabase/migrations/` are copied byte-identically from
`Z:\Github\aeleos\supabase\migrations\`. Never edit them here — a divergence
would fork the schema every other app depends on. If one looks wrong, fix it in
`aeleos` and re-copy.

## The one value that must never change

`0006_provisioning.sql` derives a person's `actor_ref` from their `identity_sub`
using UUIDv5 over a fixed namespace. Every app computes the same value with no
coordination, which is what keeps one human as one identity across the platform.

Changing that namespace forks every person's identity. The derivation is also
**bootstrap-only**: existing rows keep their stored `actor_ref`, so it is never
recomputed for an existing user.

## Verifying a copy is faithful

```bash
diff -r Z:/Github/aeleos/supabase/migrations/ ./supabase/migrations/
```

Expected: no output.
````

- [ ] **Step 7: Commit**

```bash
git add supabase/ docs/registry.md
git commit -m "feat: add the authoritative actor registry"
```

---

### Task 4: Environment configuration

**Files:**

- Create: `.env.example`
- Create: `src/lib/env.ts`
- Test: `tests/env.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `env` — a validated, typed object exporting `supabaseUrl`, `supabaseAnonKey`. Throws at import time if a required variable is missing.

- [ ] **Step 1: Write the example file**

`.env.example`:

```bash
# Copy to .env.local and fill in. .env.local is gitignored.

# Clerk — Dashboard > API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx

# Supabase — from `pnpm exec supabase status`
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-the-anon-key-from-supabase-status
```

- [ ] **Step 2: Write the failing test**

`tests/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readEnv } from "@/lib/env";

describe("readEnv", () => {
  it("returns typed values when all variables are present", () => {
    const result = readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(result.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(result.supabaseAnonKey).toBe("anon-key");
  });

  it("names the missing variable rather than failing vaguely", () => {
    expect(() =>
      readEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("rejects a URL that is not a URL", () => {
    expect(() =>
      readEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `@/lib/env` does not exist.

- [ ] **Step 4: Implement**

`src/lib/env.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

/**
 * Validates raw environment values. Exported separately from `env` so tests can
 * exercise it without mutating process.env.
 */
export function readEnv(raw: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${names}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export const env: Env = readEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
```

> Clerk's own keys are read by its SDK from `process.env` directly and are not
> re-validated here — duplicating that would mean two sources of truth for the
> same failure.

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add .env.example src/lib/env.ts tests/env.test.ts
git commit -m "feat: add validated environment configuration"
```

---

### Task 5: Clerk authentication

**Depends on Phase 0** — the Clerk instance must exist with Google and Discord enabled and the Supabase integration activated.

**Files:**

- Create: `src/middleware.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/me/page.tsx`

**Interfaces:**

- Consumes: `env` (Task 4).
- Produces: a protected `/me` route; unauthenticated visitors are redirected to `/sign-in`.

- [ ] **Step 1: Fill in local secrets** 🧑

Copy `.env.example` to `.env.local` and fill in the Clerk publishable and secret keys from the Phase 0 instance, plus the Supabase values from `pnpm exec supabase status`.

- [ ] **Step 2: Add the middleware**

`src/middleware.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything except the marketing home page and the sign-in flow requires auth.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, but always run for API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 3: Wrap the app in the Clerk provider**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AeleOS",
  description: "Your identity across Furry Colombia.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Add the sign-in route**

`src/app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 5: Add the authenticated shell and a placeholder /me**

`src/app/(app)/layout.tsx`:

```tsx
import { UserButton } from "@clerk/nextjs";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <span className="font-semibold">AeleOS</span>
        <UserButton />
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12">{children}</main>
    </div>
  );
}
```

`src/app/(app)/me/page.tsx`:

```tsx
import { currentUser } from "@clerk/nextjs/server";

export default async function MePage() {
  const user = await currentUser();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Signed in</h1>
      <p className="text-neutral-400">Clerk subject: {user?.id}</p>
    </section>
  );
}
```

- [ ] **Step 6: Verify the flow by hand** 🧑

```bash
pnpm dev
```

Visit `http://localhost:5100/me`. Expected: redirected to `/sign-in`; after signing in with Google or Discord, `/me` renders and shows a Clerk subject starting `user_`.

- [ ] **Step 7: Verify the gates**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/middleware.ts src/app/
git commit -m "feat: add clerk authentication and protected routes"
```

---

### Task 6: Supabase clients bound to the Clerk token

**Files:**

- Create: `src/lib/supabase-server.ts`
- Test: `tests/supabase-client.test.ts`

**Interfaces:**

- Consumes: `env` (Task 4), Clerk session (Task 5).
- Produces: `createServerClient(): Promise<SupabaseClient>` — for Server Components and Route Handlers.

> A browser-side client is **not** built here. Nothing in Phase 1b-i runs a
> Supabase query from a Client Component, and an exported-but-unused helper
> would fail `pnpm check:tools` (knip reports unused exports). It arrives in
> Phase 1b-ii, where the fursona editor needs it.

- [ ] **Step 1: Write the failing test**

`tests/supabase-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ getToken: async () => "clerk-token-abc" })),
}));

describe("createServerClient", () => {
  it("supplies the Clerk token to Supabase via accessToken", async () => {
    const { createServerClient } = await import("@/lib/supabase-server");
    const client = await createServerClient();
    // supabase-js stores the callback; asserting the client constructs proves
    // the option shape is accepted by this version.
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("passes a null token through rather than throwing", async () => {
    const clerk = await import("@clerk/nextjs/server");
    vi.mocked(clerk.auth).mockResolvedValueOnce({
      getToken: async () => null,
    } as unknown as Awaited<ReturnType<typeof clerk.auth>>);

    const { createServerClient } = await import("@/lib/supabase-server");
    await expect(createServerClient()).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `@/lib/supabase-server` does not exist.

- [ ] **Step 3: Implement the server client**

`src/lib/supabase-server.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase client for Server Components and Route Handlers.
 *
 * There is no Supabase session. Supabase trusts Clerk directly via Third-Party
 * Auth, so the Clerk token is forwarded and RLS resolves the caller from it.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const { getToken } = await auth();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => (await getToken()) ?? null,
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase-server.ts tests/supabase-client.test.ts
git commit -m "feat: add a supabase client bound to the clerk token"
```

---

### Task 7: Person provisioning on first sign-in

This is the moment a Clerk identity becomes an actor in the registry. It reuses `ensure_person_actor()`, already built and tested in Phase 1a.

**Files:**

- Create: `src/lib/actors.ts`
- Modify: `src/app/(app)/me/page.tsx`
- Test: `tests/actors.test.ts`

**Interfaces:**

- Consumes: `createServerClient` (Task 6).
- Produces:
  - `ensurePersonActor(): Promise<string>` — returns the caller's `actor_ref`, provisioning it if absent. Idempotent.
  - `getPersonActor(actorRef: string): Promise<PersonActor | null>` where `type PersonActor = { id: string; actorRef: string; handle: string; displayName: string | null; avatarUrl: string | null }`.

- [ ] **Step 1: Write the failing test**

`tests/actors.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase-server", () => ({
  createServerClient: vi.fn(async () => ({ rpc, from })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensurePersonActor", () => {
  it("returns the actor_ref the database reports", async () => {
    rpc.mockResolvedValueOnce({ data: "ref-123", error: null });
    const { ensurePersonActor } = await import("@/lib/actors");
    await expect(ensurePersonActor()).resolves.toBe("ref-123");
    expect(rpc).toHaveBeenCalledWith("ensure_person_actor");
  });

  it("throws with the database message when provisioning fails", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "no authenticated subject" },
    });
    const { ensurePersonActor } = await import("@/lib/actors");
    await expect(ensurePersonActor()).rejects.toThrow(
      /no authenticated subject/,
    );
  });
});

describe("getPersonActor", () => {
  it("maps snake_case columns to the camelCase shape", async () => {
    single.mockResolvedValueOnce({
      data: {
        id: "local-1",
        actor_ref: "ref-123",
        handle: "u-abc",
        display_name: "Aeleos",
        avatar_url: "https://img.example/a.png",
      },
      error: null,
    });
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("ref-123")).resolves.toEqual({
      id: "local-1",
      actorRef: "ref-123",
      handle: "u-abc",
      displayName: "Aeleos",
      avatarUrl: "https://img.example/a.png",
    });
  });

  it("returns null when no row matches rather than throwing", async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } });
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("missing")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `@/lib/actors` does not exist.

- [ ] **Step 3: Implement**

`src/lib/actors.ts`:

```ts
import { createServerClient } from "@/lib/supabase-server";

export type PersonActor = {
  id: string;
  actorRef: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Ensures the signed-in person has an actor row, returning its `actor_ref`.
 *
 * Idempotent and safe to call on every request: the database derives the ref
 * deterministically from the identity claim and returns the stored value.
 */
export async function ensurePersonActor(): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("ensure_person_actor");
  if (error)
    throw new Error(`Could not provision person actor: ${error.message}`);
  return data as string;
}

/** Reads a person actor through the safe projection. Null when not found. */
export async function getPersonActor(
  actorRef: string,
): Promise<PersonActor | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("actors_public")
    .select("id, actor_ref, handle, display_name, avatar_url")
    .eq("actor_ref", actorRef)
    .single();

  if (error || !data) return null;

  return {
    id: data.id as string,
    actorRef: data.actor_ref as string,
    handle: data.handle as string,
    displayName: (data.display_name as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}
```

> Reads go through `actors_public`, never the base table — that view is the
> exposure boundary, and `owner_ref` and `identity_sub` are absent from it by
> construction.

- [ ] **Step 4: Wire it into /me**

Replace `src/app/(app)/me/page.tsx`:

```tsx
import { currentUser } from "@clerk/nextjs/server";
import { ensurePersonActor, getPersonActor } from "@/lib/actors";

export default async function MePage() {
  const user = await currentUser();
  const actorRef = await ensurePersonActor();
  const actor = await getPersonActor(actorRef);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {actor?.displayName ?? user?.firstName ?? "Your identity"}
      </h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Handle</dt>
        <dd>{actor?.handle ?? "—"}</dd>
        <dt className="text-neutral-500">Platform ID</dt>
        <dd className="font-mono text-xs break-all">{actorRef}</dd>
      </dl>
      <p className="text-sm text-neutral-500">
        This ID is the same in every Furry Colombia app.
      </p>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS (10 tests).

- [ ] **Step 6: Verify against the real stack** 🧑

With `pnpm exec supabase start` running and `.env.local` filled in:

```bash
pnpm dev
```

Sign in, visit `/me`, and confirm a handle and platform ID render. Then confirm exactly one row exists and that a reload does not create a second:

```bash
DB_URL=$(pnpm exec supabase status -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).DB_URL))")
psql "$DB_URL" -c "select kind, handle, identity_sub from public.actors;"
```

Expected: exactly one row, `kind = person`, `identity_sub` starting `user_`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actors.ts src/app/\(app\)/me/page.tsx tests/actors.test.ts
git commit -m "feat: provision a person actor on first sign-in"
```

---

### Task 8: End-to-end test of the sign-in flow

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/auth.spec.ts`
- Modify: `.gitignore` (already covers `test-results/`, `playwright-report/`)

**Interfaces:**

- Consumes: the running app from Tasks 5–7.
- Produces: `pnpm test:e2e`.

- [ ] **Step 1: Write the Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Write the test**

`tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("authentication gate", () => {
  test("the home page is public", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AeleOS" })).toBeVisible();
  });

  test("an anonymous visitor cannot reach /me", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("the sign-in page offers Google and Discord", async ({ page }) => {
    await page.goto("/sign-in");
    // Clerk renders social buttons with the provider name in the accessible name.
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /discord/i })).toBeVisible();
  });
});
```

> These three cases need no credentials, so they run anywhere. Testing a
> completed social sign-in would require driving Google's or Discord's own
> login, which is brittle and outside our control — that path stays the manual
> check in Task 7 Step 6.

- [ ] **Step 3: Install the browser and run**

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: 3 passed.

If the Google or Discord button is missing, the Phase 0 connector configuration is incomplete — fix it in the Clerk dashboard rather than relaxing the test.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/auth.spec.ts package.json pnpm-lock.yaml
git commit -m "test: add e2e coverage for the authentication gate"
```

---

### Task 9: CI and the adoption README

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**

- Consumes: every script from Tasks 1–8.
- Produces: CI that gates the same checks as the sister repos.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [develop]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0

      # No `version:` input: packageManager pins pnpm with a sha512, and
      # action-setup errors if a version is supplied in both places.
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4.4.0

      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm secretlint
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm check:tools
      - run: pnpm test
```

> All actions are pinned by SHA to majors that target `node24`, matching aeleos,
> puck and libra. E2E is deliberately absent: it needs a Clerk instance and
> real credentials, so it stays a local check rather than a CI gate.

- [ ] **Step 2: Write the README**

`README.md`:

````markdown
# AeleOS Hub

The fursona registry and profile manager for Furry Colombia — the user-facing
half of AeleOS.

Identity itself lives in **Clerk**; this app never stores credentials. What it
owns is the **actor registry**: the people and fursonas that every Furry
Colombia app renders. See `docs/registry.md` for why this repo's `actors` table
is authoritative while every other app holds a mirror.

Design lives in the `aeleos` repo under `docs/superpowers/specs/`.

## Running locally

Requires Docker, and a Clerk instance from Phase 0.

```bash
pnpm install
cp .env.example .env.local     # fill in Clerk and Supabase values
pnpm exec supabase start
pnpm exec supabase db reset
pnpm dev                       # http://localhost:5100
```

## Checks

```bash
pnpm test          # unit
pnpm test:e2e      # end-to-end (needs the app running)
pnpm typecheck && pnpm lint && pnpm format:check && pnpm secretlint && pnpm check:tools
```

## What exists today

Phase 1b-i: sign in with Google or Discord, and a person actor is provisioned in
the registry with a platform ID stable across every app.

Fursona creation, profile editing and the actor picker are Phase 1b-ii.

## Migrations are copied, not authored

`supabase/migrations/` is copied byte-identically from `aeleos`. Never edit it
here — see `docs/registry.md`.
````

- [ ] **Step 3: Verify every gate one final time**

```bash
pnpm install --frozen-lockfile
pnpm secretlint && pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:tools && pnpm test
```

Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: add quality gates and adoption readme"
```

---

## Verification checklist

- [ ] `pnpm test` passes (10 unit tests).
- [ ] `pnpm test:e2e` passes (3 tests) with the app running.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm secretlint`, `pnpm check:tools` all pass.
- [ ] `diff -r Z:/Github/aeleos/supabase/migrations/ ./supabase/migrations/` produces no output.
- [ ] Signing in twice creates exactly one `actors` row.
- [ ] No Clerk key or Supabase service-role key appears anywhere in git history.
- [ ] The repo's default branch is `develop`.

## Deliberate deviations from the spec

1. **Clerk owns the person profile; the hub does not write through.** Spec §5 has
   the hub write person `name`/`picture` back to the IdP's Management API. Clerk
   ships a hosted Account Portal that already edits those fields, so building a
   write-through path would duplicate it and add a credential to hold. The hub
   owns fursonas; Clerk owns the person. Revisit only if person fields need to
   diverge from what Clerk stores.

2. **Single package, not a monorepo.** Puck and libra are monorepos because
   they host several apps. The hub is one app; `aeleos` is likewise single-package.

3. **No `@supabase/ssr`.** It exists to manage Supabase session cookies. Under
   Third-Party Auth there is no Supabase session — the Clerk token is forwarded
   per request — so it would be dead weight.

## Follow-on work

- **Phase 1b-ii** — fursona creation and editing, the Netflix-style picker, and
  the active-actor handoff protocol apps consume.
- **Hosting** — gated on a free Supabase project slot (Task 3 Step 1) and on the
  hub hostname, still open as actor-model spec §18.1. `me.furrycolombia.com` is
  the standing suggestion, since `id.` belongs to the IdP.
- **App integration** — per-app active-actor session storage lives in each app's
  own repo, not here.
