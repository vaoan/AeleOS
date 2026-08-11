# Hub Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `me.furrycolombia.com` serves the hub over HTTPS, a person signs in with Discord, and `/me` shows the platform ID backed by the existing AeleOS Supabase project.

**Architecture:** Nothing in the application changes. A production Clerk instance is created with primary domain `furrycolombia.com` and its Frontend API at `clerk.furrycolombia.com`; Vercel serves `apps/hub` at `me.furrycolombia.com`; the existing Supabase project keeps the schema and gains trust for the production Clerk instance. The only repository code change is making the Playwright suite able to point at a deployed URL so the deployment can be smoke-tested.

**Tech Stack:** Vercel Hobby, Clerk (production instance), Cloudflare DNS, Supabase Third-Party Auth, Next.js 16, Playwright, Vitest, pnpm.

## Global Constraints

- **This plan follows `docs/superpowers/specs/2026-08-11-hub-deployment-design.md`.** Read it before starting.
- **Budget: $0. Not "low" — zero.** No card on file anywhere. If any step demands payment, a trial that bills, or a billing account, **stop and report** rather than proceeding. Task 1 exists to find that out before anything depends on it.
- **The Clerk primary domain is `furrycolombia.com`.** The Frontend API is `clerk.furrycolombia.com`. `id.furrycolombia.com` is retired and must not be created.
- **`furrycolombia.com` itself is untouched.** Only new subdomain records are added — no A record, no redirect, no page moves.
- **Every Clerk DNS record in Cloudflare must be "DNS only" (grey cloud).** Clerk validates records with a DNS check that fails behind Cloudflare's proxy.
- **Discord is the only social connection at launch.** Google waits on the GCP billing question; Facebook needs a hosted privacy policy and data-deletion callback that cannot exist before the site does.
- **Password sign-in is off** on the production instance.
- **No `vercel.json`.** `apps/hub` carries no Vercel-specific configuration; that is what keeps a move to Cloudflare a config change rather than a rewrite.
- **No new Supabase project.** The existing AeleOS project (`vmmpssydbrtkgvrlkijh`) already holds the schema and the trust.
- **Whatever issues the tokens production uses is what CI must exercise.** A green `idp-cloud` testing an instance nobody uses is a gate that proves nothing.
- **Branch from an explicit base:** `git checkout -b <name> origin/main`. Confirm with `git log --oneline origin/main..HEAD` before pushing.
- **Secrets never in git.** Real values live in the provider dashboards, `.secrets`, and Vercel's environment settings. `pnpm secretlint` must pass.
- Steps marked 🧑 are **human-only** and cannot be performed by an agent.

## What this plan does NOT cover

Google and Facebook connections, the privacy policy and data-deletion pages Facebook will require, Puck and Libra joining the SSO, and Phase 1b-ii (fursonas and the picker). Each is named in the spec as out of scope.

---

### Task 1: Confirm the design is affordable before building on it

The spec records three unknowns. Two of them can end this plan, so they are answered first. Nothing else in this plan should start until this task is done.

**Files:**

- Create: `docs/deployment.md`

**Interfaces:**

- Consumes: nothing.
- Produces: `docs/deployment.md`, which every later task appends to. Confirmed answers to the three questions in spec §9.

- [ ] **Step 1: Confirm Clerk's free plan includes a production instance with a custom domain** 🧑

In the Clerk Dashboard, begin creating a production instance for the existing application. Before completing it, confirm on the pricing/plan screen that a **production instance** and a **custom domain** are included at $0 with no card required.

**If either requires payment, STOP.** Report it and do not continue — the budget rule is a hard stop, not a preference. The fallback is to reconsider hosting the hub behind the development instance on a `*.vercel.app` URL, which is a different design and needs its own decision.

- [ ] **Step 2: Confirm whether Supabase allows two Clerk integrations** 🧑

In the Supabase Dashboard for project `vmmpssydbrtkgvrlkijh`, open **Authentication → Third-Party Auth**. The development Clerk integration is already there.

Attempt to add a second integration. Record which happens:

- **Both can coexist** → spec §5 resolution 1. Task 4 adds production alongside development and CI is untouched.
- **Only one is allowed** → spec §5 resolution 2. Task 4 replaces it and Task 4 Step 4 changes CI.

- [ ] **Step 3: Record the answers**

Create `docs/deployment.md`:

```markdown
# Hub deployment (human steps)

The design is `docs/superpowers/specs/2026-08-11-hub-deployment-design.md`.
This file records what was actually done and what each value is for, so a
rebuild does not require rediscovering it. It records no secrets.

## 0. Confirmed before starting

| Question                                             | Answer | Confirmed |
| ---------------------------------------------------- | ------ | --------- |
| Clerk free plan includes a production custom domain? |        |           |
| Supabase allows two Clerk Third-Party Auth entries?  |        |           |

Fill both in before continuing. If the first is "no", stop — see the budget
rule in the plan's global constraints.
```

Fill in the two answers from Steps 1 and 2, with the date.

- [ ] **Step 4: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: record the deployment preconditions"
```

---

### Task 2: Production Clerk instance and its DNS

**Files:**

- Modify: `docs/deployment.md`

**Interfaces:**

- Consumes: Task 1's confirmation that this is free.
- Produces: a verified production Clerk instance whose Frontend API is `clerk.furrycolombia.com`, and its publishable/secret keys (`pk_live_…` / `sk_live_…`) for Task 5.

- [ ] **Step 1: Create the production instance** 🧑

In the Clerk Dashboard, create the production instance for the AeleOS application. Set the **primary domain** to `furrycolombia.com` — not `me.furrycolombia.com`. Spec §4 explains why: it is what lets Puck and Libra join SSO with a dashboard entry instead of satellite configuration.

- [ ] **Step 2: Turn password sign-in off** 🧑

**User & Authentication → Email, Phone, Username:** disable password authentication. The platform is social-login-first; a password path would create credentials to migrate later, which is exactly what the design avoids.

- [ ] **Step 3: Add the DNS records in Cloudflare** 🧑

Clerk's **Domains** page lists the records required. Add each in Cloudflare for `furrycolombia.com`.

**Every one must be set to "DNS only" — the grey cloud, not orange.** Clerk validates these with a DNS check that fails when Cloudflare proxies the record. This is the single most likely thing to go wrong in this task.

Do not add, change, or remove any record for `furrycolombia.com` itself.

- [ ] **Step 4: Wait for verification** 🧑

Clerk's Domains page shows each record as verified once propagation completes. DNS can take up to 48 hours, though minutes is typical on Cloudflare.

Confirm the Frontend API answers:

```bash
curl -sI https://clerk.furrycolombia.com/v1/environment | head -1
```

Expected: an HTTP status line, not a DNS failure. A `301`/`400` is fine — it proves the host resolves to Clerk. Connection refused or NXDOMAIN means the CNAME is wrong or still proxied.

- [ ] **Step 5: Record the records** 🧑

Append to `docs/deployment.md`:

```markdown
## 1. Clerk production instance

Primary domain `furrycolombia.com`; Frontend API `clerk.furrycolombia.com`.
Password sign-in is off — the platform is social-login-first.

`id.furrycolombia.com` is **not** used. It belonged to Logto's hosted login
page; Clerk's components render inside the hub, so nobody visits a
Clerk-branded address.

### DNS records

All records are **DNS only** in Cloudflare (grey cloud). Clerk validates them
with a DNS check that fails behind Cloudflare's proxy — if a record shows as
unverified, check this first.

| Type | Name | Purpose |
| ---- | ---- | ------- |

Fill the table from Clerk's Domains page. Do not record record _values_ that
Clerk marks secret; the names and purposes are what a rebuild needs.
```

- [ ] **Step 6: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: record the production Clerk instance and its DNS"
```

---

### Task 3: Discord as the launch connection

**Files:**

- Modify: `docs/deployment.md`

**Interfaces:**

- Consumes: Task 2's verified `clerk.furrycolombia.com`.
- Produces: a working Discord connection on the production instance.

- [ ] **Step 1: Read the callback URL from Clerk** 🧑

In the production instance, **User & Authentication → Social Connections → Discord**, enable it and choose **use custom credentials**. Clerk displays the redirect URI to register — it is on `clerk.furrycolombia.com`, not `clerk.shared.lcl.dev`. Copy it exactly.

- [ ] **Step 2: Create the Discord application** 🧑

In the Discord Developer Portal, create an application. Under **OAuth2**, add the redirect URI from Step 1 exactly as shown — a trailing-slash mismatch is rejected at sign-in time with an opaque error.

Copy the Client ID and Client Secret into Clerk's Discord connection, and save.

- [ ] **Step 3: Verify the connection is live** 🧑

Clerk's Social Connections page shows Discord as enabled with custom credentials. There is nothing to test end-to-end yet — the app is not deployed — so this step ends at configuration.

- [ ] **Step 4: Record it**

Append to `docs/deployment.md`:

```markdown
## 2. Social connections

**Discord only at launch.** Production requires our own OAuth application per
provider, and the ordering is not the obvious one:

| Provider | Why not yet                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Discord  | — it is live                                                                                                             |
| Google   | unresolved: does creating an OAuth client require a GCP billing account? GCP billing is off permanently and deliberately |
| Facebook | needs a privacy policy URL and a data-deletion callback, which can only be hosted once the site is live                  |

Facebook's requirement is circular, which is why it cannot gate launch.
Adding a connection later traps nobody: social-login-first means an affected
person re-links by email on their next sign-in.

The Discord redirect URI is registered against `clerk.furrycolombia.com`.
Changing the Clerk domain later means re-registering it.
```

```bash
git add docs/deployment.md
git commit -m "docs: record the Discord production connection"
```

---

### Task 4: Point Supabase at the production Clerk instance

**Files:**

- Modify: `docs/deployment.md`
- Modify (only if Task 1 Step 2 found one integration allowed): `.github/workflows/db-tests.yml`

**Interfaces:**

- Consumes: Task 1 Step 2's answer; Task 2's production instance.
- Produces: the AeleOS Supabase project trusting the Clerk instance that production uses.

- [ ] **Step 1: Configure Supabase for the production instance** 🧑

In Clerk, open the Supabase integration setup page and follow it for the **production** instance. Then in the Supabase Dashboard, **Authentication → Third-Party Auth**, add the Clerk integration for the production domain.

If Task 1 Step 2 found that two integrations can coexist, **add** it and leave the development one in place. If only one is allowed, **replace** the development one.

- [ ] **Step 2: Verify production tokens are accepted** 🧑

The `idp-cloud` suite is the check. Run it locally against the production instance:

```bash
set -a; . ./.secrets; set +a
pnpm test:idp:cloud
```

Expected: the same suites CI runs, passing — the run prints `[cloud-idp] clerk: user_… role=authenticated`, which is the proof that Supabase accepted a Clerk-issued token.

If `.secrets` still holds development-instance credentials and the development integration was replaced in Step 1, this fails. That is the signal that Step 3 is required, not a reason to skip it.

- [ ] **Step 3: If both integrations coexist, stop here**

CI is unaffected. Skip to Step 5.

- [ ] **Step 4: If only one integration is allowed, move CI to production**

Update the repository secrets so `idp-cloud` mints its user on the production instance: `CLERK_SECRET_KEY` and `CLERK_DOMAIN` must be the production instance's values. 🧑

```bash
gh secret set CLERK_SECRET_KEY
gh secret set CLERK_DOMAIN
```

No workflow file change is needed — `.github/workflows/db-tests.yml` reads both from secrets already. `scripts/run-cloud-idp.mjs` derives a per-run identity from `GITHUB_RUN_ID` and deletes it in a `finally`, so pointing it at a production instance cannot leak users between runs.

Verify by pushing the branch and watching the `idp-cloud` check. It must be **green against production credentials** before this task is done. A skipped or green-but-development run does not count.

- [ ] **Step 5: Record the resolution**

Append to `docs/deployment.md`:

```markdown
## 3. Supabase trust

The AeleOS project (`vmmpssydbrtkgvrlkijh`) is unchanged apart from its
Third-Party Auth entries. No new project, no migration work — the schema and
`ensure_person_actor()` were already live and are proven on every pull request
by `idp-cloud`.

Record which resolution applied:

- [ ] Both development and production Clerk integrations coexist. CI unchanged.
- [ ] Only one allowed; production replaced development, and CI's
      `CLERK_SECRET_KEY` / `CLERK_DOMAIN` secrets now point at production.

**The rule this protects:** whatever issues the tokens production uses is what
CI must exercise. A green `idp-cloud` testing an instance nobody uses proves
nothing.
```

```bash
git add docs/deployment.md
git commit -m "docs: record how Supabase trusts the production instance"
```

---

### Task 5: Let the e2e suite target a deployed URL

The only code in this plan. The Playwright suite hardcodes `http://localhost:5100` and always starts a dev server, so it cannot smoke-test a deployment. This task makes the target configurable, which Task 7 then uses to verify production.

**Files:**

- Create: `apps/hub/e2e-target.ts`
- Create: `apps/hub/tests/e2e-target.test.ts`
- Modify: `apps/hub/playwright.config.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `e2eTarget(env?: NodeJS.ProcessEnv): { baseURL: string; startsServer: boolean }` — exported from `apps/hub/e2e-target.ts`. `playwright.config.ts` consumes it. Task 7 runs the suite with `PLAYWRIGHT_BASE_URL` set.

- [ ] **Step 1: Write the failing test**

`apps/hub/tests/e2e-target.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { e2eTarget } from "../e2e-target";

describe("e2eTarget", () => {
  it("defaults to the local dev server and asks for it to be started", () => {
    expect(e2eTarget({})).toEqual({
      baseURL: "http://localhost:5100",
      startsServer: true,
    });
  });

  it("targets a deployed URL and does not start a server", () => {
    expect(
      e2eTarget({ PLAYWRIGHT_BASE_URL: "https://me.furrycolombia.com" }),
    ).toEqual({ baseURL: "https://me.furrycolombia.com", startsServer: false });
  });

  // An empty or whitespace variable is what a misconfigured CI job produces.
  // Treating it as a deployed target would run the suite against nothing and
  // report a confusing connection error instead of falling back.
  it("ignores an empty variable rather than targeting nothing", () => {
    expect(e2eTarget({ PLAYWRIGHT_BASE_URL: "   " })).toEqual({
      baseURL: "http://localhost:5100",
      startsServer: true,
    });
  });

  it("strips a trailing slash so page.goto('/me') does not double it", () => {
    expect(
      e2eTarget({ PLAYWRIGHT_BASE_URL: "https://me.furrycolombia.com/" })
        .baseURL,
    ).toBe("https://me.furrycolombia.com");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter hub test`
Expected: FAIL — `Failed to resolve import "../e2e-target"`.

- [ ] **Step 3: Implement**

`apps/hub/e2e-target.ts`:

```ts
export type E2ETarget = {
  baseURL: string;
  startsServer: boolean;
};

const LOCAL = "http://localhost:5100";

/**
 * Where the Playwright suite should point.
 *
 * With `PLAYWRIGHT_BASE_URL` set, the suite runs against an already-deployed
 * site and must not start a dev server. Without it, it starts one locally.
 *
 * `Record<string, string | undefined>` rather than `NodeJS.ProcessEnv`: Next
 * augments that interface with a required `NODE_ENV`, so a test could not pass
 * `{}` to exercise the default branch. Narrowing it to the optional-only shape
 * fails too — weak-type detection then rejects `process.env` itself.
 */
export function e2eTarget(
  env: Record<string, string | undefined> = process.env,
): E2ETarget {
  const deployed = env.PLAYWRIGHT_BASE_URL?.trim();
  if (!deployed) return { baseURL: LOCAL, startsServer: true };
  return { baseURL: deployed.replace(/\/+$/, ""), startsServer: false };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter hub test`
Expected: PASS — 35 tests (31 existing plus these 4).

- [ ] **Step 5: Wire it into the Playwright config**

Replace `apps/hub/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
import { e2eTarget } from "./e2e-target";

const target = e2eTarget();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: target.baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(target.startsServer
    ? {
        webServer: {
          command: "pnpm dev",
          url: target.baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
```

- [ ] **Step 6: Verify both modes still work locally**

```bash
pnpm --filter hub test:e2e
```

Expected: `3 passed` — unchanged behaviour, dev server started.

Then prove the deployed mode does not start a server, by pointing it at a URL that is not running:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:9 pnpm --filter hub test:e2e
```

Expected: failures with connection errors **within seconds**. A 120-second web-server startup timeout instead means the branch is not being taken.

- [ ] **Step 7: Verify every gate**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:tools
```

Expected: all exit 0. If `knip` reports `e2e-target.ts` as unused, add `"e2e-target.ts"` to the `apps/hub` `project` array in `knip.json` — it is imported by an entry file, so it should resolve without that.

- [ ] **Step 8: Commit**

```bash
git add apps/hub/e2e-target.ts apps/hub/tests/e2e-target.test.ts apps/hub/playwright.config.ts
git commit -m "test: let the e2e suite target a deployed url"
```

---

### Task 6: The Vercel project

**Files:**

- Modify: `docs/deployment.md`
- Modify: `apps/hub/.env.example`

**Interfaces:**

- Consumes: Task 2's production Clerk keys; the existing Supabase URL and publishable key.
- Produces: a deployment on a `*.vercel.app` URL, verified before a custom domain is attached.

- [x] **Step 1: Create the project** 🧑 — _done 2026-08-11, without a Git link_

**Amended.** This task originally imported the repository through Vercel's
dashboard wizard. It does not. Vercel has no connection to the repository:
the project was created through the API with `framework: nextjs` and
`rootDirectory: apps/hub`, and no Git link. See spec §6.

Human part: create the Vercel account on **Hobby** and confirm no card is
requested. Signing in _with_ GitHub is fine — that authenticates the Vercel
account and is a different thing from installing the Vercel GitHub App, which
is deliberately not installed.

- [x] **Step 2: Add environment variables** — _done 2026-08-11_

Four variables on `production` and `preview`. They are set through the API
rather than the dashboard, so they are recorded here rather than in a UI:

| Variable                            | Value                                           |
| ----------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key                           |
| `CLERK_SECRET_KEY`                  | Clerk secret key                                |
| `NEXT_PUBLIC_SUPABASE_URL`          | the **cloud** AeleOS project, never `127.0.0.1` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | the AeleOS publishable key                      |

`CLERK_SECRET_KEY` must never be prefixed `NEXT_PUBLIC_` — that prefix ships a
value in the browser bundle.

**Interim state:** these hold the _development_ Clerk keys, so the first
deployment is reachable and signable-in before the production instance exists.
The cloud Supabase project already trusts the development Clerk instance —
that is what `idp-cloud` authenticates against — so `/me` provisions a real
actor. Task 7 swaps them for production keys.

- [ ] **Step 3: Deploy through the workflow**

`.github/workflows/deploy.yml` runs on push to `main` and on manual dispatch.
It builds with the Vercel CLI on a Linux runner and uploads only
`.vercel/output`.

**The build must run on Linux.** Next 16 emits symlinks into `.vercel/output`,
and building on Windows produces links that fail to upload:

```
Error: ENOENT: no such file or directory, stat
'.vercel/output/functions/_global-error.segments/__PAGE__.segment.rsc.func'
```

The path exists locally; the symlink does not survive. Do not try to deploy
from a Windows machine.

Watch the run, then open the URL it prints. Expected: the home page renders
"AeleOS", and `/me` redirects to `/sign-in`. The workflow's final step already
asserts the deployment answers `200` — a deployment that uploads but does not
serve would otherwise report success.

- [ ] **Step 4: Annotate the example env file**

Replace `apps/hub/.env.example`:

Keep the existing placeholder values — they show the expected shape. Only the
comments change:

```bash
# Copy to .env.local and fill in. .env.local is gitignored.
#
# These are LOCAL values: the Clerk development instance and a local Supabase
# stack. Production values live in Vercel's environment settings, never here —
# see docs/deployment.md.

# Clerk — Dashboard > API Keys, or from ../../.secrets after `pnpm sync-secrets`
# Development keys are pk_test_/sk_test_; production is pk_live_/sk_live_ and
# belongs only in Vercel.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
# Secret. Never prefix this NEXT_PUBLIC_ — that ships it in the browser bundle.
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx

# Supabase — from `pnpm exec supabase status` at the repository root for a local
# stack, or the AeleOS project settings to point at the hosted database.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-the-anon-key-from-supabase-status
```

- [ ] **Step 5: Record it**

Append to `docs/deployment.md`:

```markdown
## 4. Vercel

Hobby plan, project imported from `vaoan/AeleOS`, **Root Directory `apps/hub`**.
No `vercel.json` — the app carries no Vercel-specific configuration, which is
what keeps a move to Cloudflare a configuration change rather than a rewrite.

Environment variables are set **per environment**. Production uses the
production Clerk keys; Preview uses the development ones, because previews are
served from `*.vercel.app` and the production instance will not serve them.

Hobby has no overage: limits pause the deployment rather than charging. Against
a hard-stop budget that is the correct failure mode — disruptive, never
expensive.
```

- [ ] **Step 6: Commit**

```bash
git add docs/deployment.md apps/hub/.env.example
git commit -m "docs: record the vercel project and annotate the env example"
```

---

### Task 7: `me.furrycolombia.com`, and proving it works

**Files:**

- Modify: `docs/deployment.md`
- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the deployed hub at its real hostname, verified by the e2e suite and by a database check.

- [ ] **Step 1: Add the domain in Vercel** 🧑

Add `me.furrycolombia.com` to the Vercel project and create the DNS record Vercel specifies in Cloudflare.

Vercel's record may be proxied or DNS-only — follow Vercel's instruction for this one. The **DNS-only** rule in the global constraints applies to Clerk's records, not Vercel's.

- [ ] **Step 2: Run the e2e suite against production**

```bash
PLAYWRIGHT_BASE_URL=https://me.furrycolombia.com pnpm --filter hub test:e2e
```

Expected: `3 passed`. This proves, against the real deployment, that the home page is public, that an anonymous visitor at `/me` is redirected to `/sign-in`, and that the Discord button renders.

The third test asserts Google and Facebook buttons too, which are **not** configured yet. Expect it to fail on those. Update `apps/hub/tests/e2e/auth.spec.ts` to assert only what is deployed:

```ts
test("the sign-in page offers the configured social providers", async ({
  page,
}) => {
  await page.goto("/sign-in");
  // Discord is the only production connection at launch — Google waits on the
  // GCP billing question, Facebook on hosted privacy pages. See
  // docs/superpowers/specs/2026-08-11-hub-deployment-design.md §7.
  await expect(page.getByRole("button", { name: /discord/i })).toBeVisible();
});
```

Re-run both locally and against production; both must pass.

- [ ] **Step 3: Sign in and verify the actor** 🧑

Open `https://me.furrycolombia.com`, sign in with Discord, and open `/me`.

Expected: a handle and a platform ID render.

Then **reload `/me`** and confirm no second actor row was created. In the Supabase Dashboard SQL editor for the AeleOS project:

```sql
select kind, handle, identity_sub, created_at from public.actors order by created_at;
```

Expected: exactly one row for you, `kind = person`, `identity_sub` starting `user_`.

This is the verification that Phase 1b-i's Task 7 Step 6 asked for and could never be done without a running stack.

- [ ] **Step 4: Update the repository's current state**

In `CLAUDE.md`, under **Current state**, replace the Phase 1b-i bullet with one recording that the hub is deployed, and add the hostnames. Keep the existing bullets for Phase 1a, Phase 0 and Phase 1b-ii.

```markdown
- **Phase 1b-i (hub foundation) — done and deployed.** `apps/hub` runs at
  `me.furrycolombia.com`, signing people in with Discord through the production
  Clerk instance (`clerk.furrycolombia.com`) and provisioning a person actor on
  first sign-in. Google and Facebook connections are follow-on work — see
  `docs/deployment.md`.
```

- [ ] **Step 5: Record the outcome**

Append to `docs/deployment.md`:

```markdown
## 5. Verification

| Check                        | How                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Build, routing, env          | `*.vercel.app` deployment renders the home page and redirects `/me`           |
| The gate, against production | `PLAYWRIGHT_BASE_URL=https://me.furrycolombia.com pnpm --filter hub test:e2e` |
| Sign-in                      | Discord, by hand, at `me.furrycolombia.com`                                   |
| Provisioning is idempotent   | one `public.actors` row after signing in and reloading `/me`                  |

The e2e suite can be pointed at any deployment, so this is repeatable rather
than a one-time check.
```

- [ ] **Step 6: Verify every gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm secretlint && pnpm check:tools
pnpm --filter hub test
```

Expected: all exit 0.

```bash
git add docs/deployment.md CLAUDE.md apps/hub/tests/e2e/auth.spec.ts
git commit -m "docs: record the deployment and its verification"
```

---

## Verification checklist

- [ ] Clerk's free plan was confirmed to include a production instance with a custom domain, at $0, before anything depended on it.
- [ ] No card is on file with Vercel, Clerk, Discord or Cloudflare.
- [ ] `furrycolombia.com` itself has no new, changed or removed record.
- [ ] `id.furrycolombia.com` does not exist.
- [ ] Every Clerk DNS record in Cloudflare is DNS-only, and Clerk shows each as verified.
- [ ] Password sign-in is off on the production instance.
- [ ] `pnpm --filter hub test` passes (35 tests).
- [ ] `pnpm --filter hub test:e2e` passes locally (3 tests) and against `https://me.furrycolombia.com` (3 tests).
- [ ] `idp-cloud` is green against whichever Clerk instance production uses.
- [ ] Signing in twice creates exactly one `public.actors` row.
- [ ] No Clerk secret key appears in git history or in any `NEXT_PUBLIC_` variable.

## Follow-on work

- **Google connection** — answer the GCP billing question by creating the OAuth client, then enable it in Clerk.
- **Facebook connection** — needs a privacy policy page and a data-deletion callback hosted on the hub first.
- **Puck and Libra joining SSO** — add each hostname to Clerk's Allowed Subdomains. The domain layout chosen in spec §4 is what keeps this a dashboard entry.
- **`createRouteMatcher` → resource-based auth checks** — Clerk deprecates it; recorded in `2026-08-02-phase-1b-i-hub-foundation.md`.
