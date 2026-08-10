# Phase 0 — Clerk IdP Standup & Trust Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that Supabase genuinely trusts Clerk-issued tokens and that Phase 1a's actor model works unchanged against a real Clerk identity — before any real app is touched and before any money is spent.

**Architecture:** The validation runs entirely against the **local** Supabase stack pointed at a **real** Clerk development instance. Supabase fetches Clerk's JWKS over the network, so the trust being tested is the real asymmetric one — not a simulation. This deliberately avoids creating a Supabase Cloud project, because the free plan allows only two and both are already spoken for. A second, opt-in test suite (`test:idp`) is added alongside the existing offline suite; the existing 72-test suite keeps running with no credentials, so CI stays green for contributors who have none.

**Tech Stack:** Clerk (development instance), local Supabase CLI stack, Vitest, `@supabase/supabase-js`, `@clerk/clerk-js` (loaded from CDN by a throwaway capture page).

## Global Constraints

- **Budget: $0.** Clerk free plan only — 50,000 MRU, max 3 social connections. Do not enable anything that requires Pro. The Supabase free plan allows two active projects and both are now in use — `CandyShop` (Libra's production project) and `AeleOS` (created 2026-08-09). Puck has none, despite what earlier revisions of this plan said.
- **Phase 0 touches no real app and no real data.** No changes to Puck or Libra, and nothing pointed at their Supabase projects.
- **The existing offline suite must keep passing without Clerk credentials.** `pnpm test:db` (72 tests) must never require a secret. The new `pnpm test:idp` suite skips cleanly when `.secrets` is absent.
- **Secrets never in git.** All Clerk values live in `.secrets` (already gitignored). `pnpm secretlint` must pass. Never paste a real token or secret key into a committed file, including this plan or any report.
- **Phase 1a migrations must not change.** If a validation fails, that is a finding to report — do not "fix" it by editing `0001`–`0007`. The whole point is discovering whether they hold.
- Filenames kebab-case. Branch work; do not merge or open a PR without explicit instruction.
- Several steps are **human-only** (dashboard signup and configuration). They are marked 🧑 and cannot be performed by an agent.

---

### Task 1: Create the Clerk instance and record its values 🧑

**This entire task is human-only.** An agent cannot create accounts or click dashboard buttons. Its deliverable is a populated `.secrets` file plus a committed example file.

**Files:**

- Create: `.secrets.example`
- Create (untracked, human-populated): `.secrets`

**Interfaces:**

- Produces: `.secrets` containing `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_DOMAIN`. Later tasks read these.

- [ ] **Step 1: Create the Clerk application** 🧑

Sign up at <https://clerk.com> (free plan) and create an application named `Furry Colombia`.

When prompted for sign-in options, enable **Google** and **Discord** only. Disable email/password — the platform is social-login-first by design, and the free plan caps you at 3 social connections, so spending two of three deliberately leaves one spare.

- [ ] **Step 2: Activate the Supabase integration** 🧑

In the Clerk Dashboard, open the **Supabase integration setup** page, choose the configuration options, and select **Activate Supabase integration**.

This is what adds the `"role": "authenticated"` claim to every session token, which Supabase requires in order to assign the Postgres role. Activation then reveals your **Clerk domain** — record it.

> Do **not** use the older "Supabase JWT template" approach. It was deprecated in April 2025 in favour of this native integration.

- [x] **Step 3: Record the values**

Create `.secrets.example` and commit it:

```bash
# Copy to .secrets and fill in from the Clerk dashboard.
# .secrets is gitignored — never commit real values.

# Clerk Dashboard > API Keys > Publishable key (starts pk_test_ on a dev instance)
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx

# Clerk Dashboard > API Keys > Secret key (starts sk_test_ on a dev instance)
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx

# Revealed when you activate the Supabase integration.
# Looks like: your-app-name.clerk.accounts.dev
CLERK_DOMAIN=example.clerk.accounts.dev

# Populated later, by Task 3's capture page. A real session JWT.
CLERK_SESSION_TOKEN=
```

Then create `.secrets` (NOT committed) from it, filling in the real values.

- [ ] **Step 4: Confirm the secret guard still passes**

Run: `pnpm secretlint`
Expected: exit 0. `.secrets` is gitignored, so it is not scanned — but confirm `.secrets.example` contains only placeholders, never a real key.

- [ ] **Step 5: Commit**

```bash
git add .secrets.example
git commit -m "chore: add clerk secrets example for phase 0"
```

---

### Task 2: Point the local Supabase stack at Clerk

**Files:**

- Modify: `supabase/config.toml` (the `[auth.third_party.clerk]` block, currently `enabled = false`)
- Create: `docs/phase-0-clerk-setup.md`

**Interfaces:**

- Consumes: `CLERK_DOMAIN` from `.secrets` (Task 1).
- Produces: a local Supabase stack that fetches and trusts Clerk's JWKS.

- [x] **Step 1: Enable the integration locally**

`supabase/config.toml` already contains this block, currently disabled:

```toml
# Use Clerk as a third-party provider alongside Supabase Auth.
[auth.third_party.clerk]
enabled = false
# Obtain from https://clerk.com/setup/supabase
# domain = "example.clerk.accounts.dev"
```

Change it to read:

```toml
# Use Clerk as a third-party provider alongside Supabase Auth.
[auth.third_party.clerk]
enabled = true
domain = "env(CLERK_DOMAIN)"
```

> Use the `env(...)` form, not the literal domain. A Clerk development domain is not a credential, but keeping it out of git means the committed config works for any contributor with their own instance, and it stops this file drifting into "config that only works on one laptop".

> **⚠️ Finding (2026-08-03) — this step as written breaks CI. Do not commit `enabled = true`.**
>
> `supabase start` fetches the provider's OpenID discovery document at boot and
> aborts if it cannot reach it:
>
> ```
> LegacyStartInvalidConfigError: Failed to fetch
> https://example.clerk.accounts.dev/.well-known/openid-configuration
> ```
>
> So `enabled = true` makes a **real, reachable** Clerk domain a hard requirement
> for starting the stack at all. `.github/workflows/db-tests.yml` runs
> `supabase start` then `pnpm test:db` with no Clerk secrets, so committing it
> fails CI outright — and it contradicts this plan's own global constraint that
> `pnpm test:db` must never require a secret.
>
> The `env(...)` reasoning above still holds; the mistake was assuming the value
> is only read lazily at token-verification time. It is validated at boot.
>
> **Resolution:** the committed block stays `enabled = false`, with a comment
> explaining why. Enabling it is a local, uncommitted edit made when running
> `test:idp` — see `docs/phase-0-clerk-setup.md` §5.

- [ ] **Step 2: Restart the stack so the config is applied**

```bash
set -a; . ./.secrets; set +a
pnpm exec supabase stop
pnpm exec supabase start
```

Expected: the stack starts cleanly. If it refuses with a config error, the `domain` value is malformed — it must be a bare hostname like `example.clerk.accounts.dev`, with no `https://` and no trailing slash.

- [x] **Step 3: Confirm the offline suite is unaffected**

Run: `pnpm test:db`
Expected: PASS (72 tests across 10 files).

This matters: enabling a third-party provider must not disturb the existing HS256-based harness. If this fails, stop and report — it means the two token paths conflict, which would be a genuine finding about the architecture rather than a bug to paper over.

- [x] **Step 4: Write the human setup guide**

Create `docs/phase-0-clerk-setup.md`:

````markdown
# Phase 0 — Clerk setup (human steps)

These steps cannot be automated. Do them once, then the validation suite runs
from `.secrets`.

## 1. Clerk application

1. Sign up at https://clerk.com on the **free** plan.
2. Create an application named `Furry Colombia`.
3. Enable **Google** and **Discord** social connections. Disable email/password.
   The free plan allows 3 social connections; this uses 2.

## 2. Supabase integration

1. Clerk Dashboard → Supabase integration setup.
2. Select **Activate Supabase integration**.
   This adds the `"role": "authenticated"` claim to session tokens, which
   Supabase requires to assign the Postgres role.
3. Record the **Clerk domain** it reveals.

Do not use the legacy "Supabase JWT template" — deprecated April 2025.

## 3. Local secrets

Copy `.secrets.example` to `.secrets` and fill in the publishable key, secret
key, and Clerk domain. `.secrets` is gitignored.

## 4. Run the validation

```bash
pnpm exec supabase start
pnpm test:idp
```

## Note on hosting

The validation suite runs entirely against the **local** Supabase stack. It
fetches Clerk's real JWKS over the network, so the asymmetric trust being tested
is genuine; what it does not exercise is Cloud dashboard configuration.

Supabase's free plan allows **two** active projects. As of 2026-08-09, verified
against the management API, both are in use:

| Project     | Ref                    | What it is                                            |
| ----------- | ---------------------- | ----------------------------------------------------- |
| `CandyShop` | `olafyajipvsltohagiah` | Libra's production project (still under its old name) |
| `AeleOS`    | `vmmpssydbrtkgvrlkijh` | created 2026-08-09; not used by the test suite        |

**Puck has no Supabase project** — earlier revisions of this doc claimed Puck
held one of the two slots. It never did.
````

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml docs/phase-0-clerk-setup.md
git commit -m "feat: point local supabase at clerk as third-party auth provider"
```

---

### Task 3: Capture a real Clerk session token

A real token signed by Clerk's real keys is the only thing that proves the trust. This task builds a throwaway page to obtain one.

**Files:**

- Create: `scripts/capture-clerk-token.html`
- Modify: `package.json` (add the `capture:token` script)

**Interfaces:**

- Consumes: `CLERK_PUBLISHABLE_KEY` from `.secrets`.
- Produces: a real session JWT, pasted by the human into `.secrets` as `CLERK_SESSION_TOKEN`.

- [x] **Step 1: Write the capture page**

Create `scripts/capture-clerk-token.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>Clerk token capture (dev only)</title>
<style>
  body {
    font-family: system-ui, sans-serif;
    max-width: 44rem;
    margin: 3rem auto;
    padding: 0 1rem;
  }
  textarea {
    width: 100%;
    height: 9rem;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }
  .warn {
    background: #fee;
    border-left: 4px solid #c00;
    padding: 0.75rem 1rem;
  }
</style>
<h1>Clerk token capture</h1>
<p class="warn">
  Development tool. The token printed below is a real credential — paste it into
  <code>.secrets</code> only, never into a committed file.
</p>
<div id="app"></div>
<h2>Session token</h2>
<textarea
  id="out"
  readonly
  placeholder="Sign in above; the token appears here."
></textarea>

<script type="module">
  const KEY = new URLSearchParams(location.search).get("pk");
  if (!KEY) {
    document.getElementById("app").textContent =
      "Missing ?pk=<publishable key> in the URL.";
  } else {
    const { Clerk } = await import(
      `https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
    );
    const clerk = new Clerk(KEY);
    await clerk.load();
    if (clerk.user) {
      document.getElementById("out").value = await clerk.session.getToken();
    } else {
      clerk.mountSignIn(document.getElementById("app"));
    }
  }
</script>
```

- [x] **Step 2: Add the serve script**

Add to `package.json` `scripts`:

```json
"capture:token": "npx --yes serve scripts -l 5555"
```

- [ ] **Step 3: Capture a token** 🧑

```bash
set -a; . ./.secrets; set +a
npx --yes serve scripts -l 5555
```

Open `http://localhost:5555/capture-clerk-token.html?pk=$CLERK_PUBLISHABLE_KEY`, sign in with Google or Discord, and copy the printed token into `.secrets` as `CLERK_SESSION_TOKEN`.

> Clerk session tokens are short-lived (about 60 seconds by default). Capture one immediately before running the validation in Task 4. If a test fails with an expiry error, capture a fresh token — that is expected behaviour, not a defect.

- [ ] **Step 4: Confirm nothing leaked**

```bash
pnpm secretlint; echo "exit=$?"
git status --porcelain
```

Expected: secretlint exits 0, and `.secrets` does not appear in git status (it is ignored).

- [ ] **Step 5: Commit**

```bash
git add scripts/capture-clerk-token.html package.json
git commit -m "feat: add throwaway clerk token capture page"
```

---

### Task 4: Validate the trust — the linchpin

This is the single most important task in the plan. Everything downstream assumes it passes.

**Files:**

- Create: `vitest.config.idp.ts`
- Create: `tests/idp/global-setup.ts`
- Create: `tests/idp/clerk-trust.test.ts`
- Modify: `package.json` (add `test:idp`)

**Interfaces:**

- Consumes: `.secrets` values; the local stack from Task 2.
- Produces: `pnpm test:idp`, and the helpers `clerkClient()` and `hasClerkCredentials()`.

- [x] **Step 1: Add the opt-in suite config**

Create `vitest.config.idp.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/idp/global-setup.ts"],
    include: ["tests/idp/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
```

Add to `package.json` `scripts`:

```json
"test:idp": "vitest run -c vitest.config.idp.ts"
```

> Note this does NOT run `supabase db reset`, unlike `test:db`. This suite reads an already-running stack and must not wipe it.

- [x] **Step 2: Write the setup that loads secrets and allows skipping**

Create `tests/idp/global-setup.ts`:

```ts
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export default function setup(): void {
  // Load .secrets if present. Absent is fine — the tests skip themselves.
  if (existsSync(".secrets")) {
    for (const line of readFileSync(".secrets", "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }

  const json = execSync("supabase status -o json", { encoding: "utf8" });
  const s = JSON.parse(json) as Record<string, string>;
  process.env.SUPABASE_URL = s.API_URL;
  process.env.SUPABASE_ANON_KEY = s.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = s.SERVICE_ROLE_KEY;
  process.env.SUPABASE_DB_URL = s.DB_URL;
}
```

- [x] **Step 3: Write the failing validation test**

Create `tests/idp/clerk-trust.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const token = (): string => process.env.CLERK_SESSION_TOKEN ?? "";
const hasCreds = (): boolean => token().length > 0;

function clerkClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token()}` } },
    },
  );
}

let pool: pg.Pool;
beforeAll(() => {
  pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
});
afterAll(async () => {
  await pool.end();
});

describe.skipIf(!hasCreds())("supabase trusts clerk", () => {
  it("the captured token is a real asymmetric Clerk JWT", () => {
    const [rawHeader, rawPayload] = token().split(".");
    const header = JSON.parse(
      Buffer.from(rawHeader as string, "base64url").toString("utf8"),
    ) as { alg: string; kid?: string };
    const payload = JSON.parse(
      Buffer.from(rawPayload as string, "base64url").toString("utf8"),
    ) as { sub: string; role?: string; iss: string; exp: number };

    // Supabase requires asymmetric signing with a kid header.
    expect(header.alg).not.toBe("HS256");
    expect(header.kid).toBeTruthy();
    // The Supabase integration must be activated in Clerk for this claim.
    expect(payload.role).toBe("authenticated");
    expect(payload.sub).toMatch(/^user_/);
    expect(payload.iss).toContain(process.env.CLERK_DOMAIN as string);
    expect(payload.exp * 1000).toBeGreaterThan(Date.now());
  });

  it("PostgREST accepts the Clerk token and resolves its sub", async () => {
    const c = clerkClient();
    const { data, error } = await c.rpc("whoami_sub");
    expect(error).toBeNull();

    const payload = JSON.parse(
      Buffer.from(token().split(".")[1] as string, "base64url").toString(
        "utf8",
      ),
    ) as { sub: string };
    expect(data).toBe(payload.sub);
  });

  it("assigns the authenticated role, not anon", async () => {
    const c = clerkClient();
    const { data, error } = await c.rpc("whoami_role");
    expect(error).toBeNull();
    expect(data).toBe("authenticated");
  });

  it("rejects a token signed with the wrong key", async () => {
    const [h, p] = token().split(".");
    const forged = `${h}.${p}.${"A".repeat(64)}`;
    const c = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_ANON_KEY as string,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${forged}` } },
      },
    );
    const { error } = await c.rpc("whoami_sub");
    expect(error).not.toBeNull();
  });
});
```

- [x] **Step 4: Add the two introspection functions the tests call**

Create `supabase/migrations/0008_idp_introspection.sql`:

```sql
-- Phase 0 validation helpers. They expose only the caller's own identity as
-- the database sees it, which is exactly what has to be proven.
create or replace function public.whoami_sub()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'sub'
$$;

create or replace function public.whoami_role()
returns text
language sql
stable
as $$
  select current_user::text
$$;

revoke all on function public.whoami_sub() from public;
revoke all on function public.whoami_role() from public;
grant execute on function public.whoami_sub() to authenticated;
grant execute on function public.whoami_role() to authenticated;
```

- [ ] **Step 5: Apply and run**

```bash
pnpm test:db          # applies 0008 via db reset; expect 72 passing
# capture a FRESH token now (Task 3, step 3) — they expire in ~60s
pnpm test:idp
```

Expected: 4 passing.

**If the second or third test fails**, that is the finding Phase 0 exists to produce. Do not modify Phase 1a migrations. Record the exact error and report it — it means Supabase is not accepting Clerk tokens as documented, and the architecture decision needs revisiting.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.idp.ts tests/idp/global-setup.ts tests/idp/clerk-trust.test.ts supabase/migrations/0008_idp_introspection.sql package.json
git commit -m "test: validate supabase trusts clerk-issued tokens"
```

---

### Task 5: Prove the actor model works against a real Clerk identity

Task 4 proves the token is accepted. This proves Phase 1a's schema — written months before Clerk was chosen — needs no changes.

**Files:**

- Create: `tests/idp/clerk-actor-model.test.ts`

**Interfaces:**

- Consumes: `ensure_person_actor()`, `current_person_ref()`, `can_act_as()`, `actors`, `comments` from migrations `0001`–`0007`.
- Produces: nothing; this is a proof, not a component.

- [x] **Step 1: Write the test**

Create `tests/idp/clerk-actor-model.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const token = (): string => process.env.CLERK_SESSION_TOKEN ?? "";
const hasCreds = (): boolean => token().length > 0;

const clerkSub = (): string =>
  (
    JSON.parse(
      Buffer.from(token().split(".")[1] as string, "base64url").toString(
        "utf8",
      ),
    ) as { sub: string }
  ).sub;

function clerkClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token()}` } },
    },
  );
}

const admin = (): SupabaseClient =>
  createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );

let pool: pg.Pool;
beforeAll(() => {
  pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
});
afterAll(async () => {
  await admin().from("actors").delete().eq("identity_sub", clerkSub());
  await pool.end();
});

describe.skipIf(!hasCreds())(
  "actor model against a real Clerk identity",
  () => {
    it("provisions a person actor from the Clerk subject", async () => {
      const c = clerkClient();
      const { data, error } = await c.rpc("ensure_person_actor");
      expect(error).toBeNull();
      expect(data).toBeTruthy();

      const { data: rows } = await admin()
        .from("actors")
        .select("actor_ref, kind")
        .eq("identity_sub", clerkSub());
      expect(rows).toHaveLength(1);
      expect(rows?.[0]?.kind).toBe("person");
      expect(rows?.[0]?.actor_ref).toBe(data);
    });

    it("is idempotent for the same Clerk subject", async () => {
      const c = clerkClient();
      const first = await c.rpc("ensure_person_actor");
      const second = await c.rpc("ensure_person_actor");
      expect(second.data).toBe(first.data);
    });

    it("resolves current_person_ref from the Clerk token", async () => {
      const c = clerkClient();
      await c.rpc("ensure_person_actor");
      const { data, error } = await c.rpc("current_person_ref");
      expect(error).toBeNull();

      const { data: rows } = await admin()
        .from("actors")
        .select("actor_ref")
        .eq("identity_sub", clerkSub())
        .single();
      expect(data).toBe(rows?.actor_ref);
    });

    it("lets the Clerk user author as an owned fursona", async () => {
      const c = clerkClient();
      const personRef = (await c.rpc("ensure_person_actor")).data as string;

      const { data: sona, error: sErr } = await admin()
        .from("actors")
        .insert({
          actor_ref: randomUUID(),
          kind: "fursona",
          owner_ref: personRef,
          handle: `clerk-sona-${randomUUID().slice(0, 8)}`,
        })
        .select("id")
        .single();
      if (sErr) throw sErr;

      const { error } = await c.from("comments").insert({
        body: "authored via Clerk",
        author_actor_id: sona.id as string,
      });
      expect(error).toBeNull();

      // The accountability snapshot must have been derived server-side.
      const r = await pool.query<{ author_person_ref: string }>(
        "select author_person_ref from public.comments where author_actor_id = $1",
        [sona.id as string],
      );
      expect(r.rows[0]?.author_person_ref).toBe(personRef);

      await admin()
        .from("comments")
        .delete()
        .eq("author_actor_id", sona.id as string);
      await admin()
        .from("actors")
        .delete()
        .eq("id", sona.id as string);
    });

    it("still hides the linkability columns from a Clerk-authenticated caller", async () => {
      const c = clerkClient();
      const viaActors = await c.from("actors_public").select("owner_ref");
      expect(viaActors.error).not.toBeNull();
      const viaComments = await c.from("comments").select("author_person_ref");
      expect(viaComments.error).not.toBeNull();
    });
  },
);
```

- [ ] **Step 2: Run it**

```bash
# capture a fresh token first — they expire in ~60s
pnpm test:idp
```

Expected: 9 passing (4 from Task 4, 5 here).

If `ensure_person_actor` fails, note that `current_person_ref` is granted only to `authenticated` — a failure here most likely means the `role` claim is missing, which points back at Task 1 step 2.

- [ ] **Step 3: Commit**

```bash
git add tests/idp/clerk-actor-model.test.ts
git commit -m "test: prove the actor model works against a real clerk identity"
```

---

### Task 6: Record the decision and amend the specs

Both specs currently name Logto throughout. Leaving them stale would mislead whoever builds Phase 1b.

**Files:**

- Modify: `docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`
- Modify: `docs/superpowers/specs/2026-07-28-aeleos-actor-model-design.md`
- Modify: `CLAUDE.md`
- Create: `docs/superpowers/specs/2026-07-31-idp-decision-change.md`

**Interfaces:**

- Consumes: the results of Tasks 4 and 5.
- Produces: an accurate decision record.

- [x] **Step 1: Write the decision record**

Create `docs/superpowers/specs/2026-07-31-idp-decision-change.md`:

```markdown
# IdP decision change — Logto → Clerk

- **Date:** 2026-07-31
- **Status:** Decided
- **Supersedes:** the Logto choice in `2026-07-26-aeleos-central-auth-design.md` §2

## What forced the change

The central-auth design's mechanism was: each app's Supabase project uses
**Third-Party Auth** to trust Logto, so `auth.jwt()->>'sub'` yields the Logto
user ID.

**Supabase Third-Party Auth does not support Logto, and has no generic OIDC
option.** It supports exactly Clerk, Firebase, Auth0, AWS Cognito and WorkOS —
confirmed both in Supabase's documentation and in the `[auth.third_party.*]`
blocks of the CLI's own `config.toml`. Logto's own Supabase guide documents a
different pattern entirely: a backend that validates a Logto token and mints a
Supabase JWT.

Phase 0 existed precisely to find this before any app was migrated. It did.

## Why Clerk

Of the five supported providers, Clerk alone has **both Google and Discord as
native connections**, which is what makes "configure social logins once" real
rather than aspirational. It is present in the local CLI config, so the entire
72-test conformance suite keeps running against a local stack. Its free plan
covers 50,000 monthly users against a $0 budget.

Alternatives weighed: WorkOS has a far larger free tier but no native Discord
and no local CLI support. Auth0 allows brand customisation on free but needs a
custom social connection for Discord. Firebase and Cognito need Discord via
OIDC.

## What was lost, honestly

**The open-source escape hatch.** None of the five providers is self-hostable,
so "self-host the same product if pricing turns" is off the table — and that was
the decisive tiebreaker that chose Logto over WorkOS originally.

A Supabase-as-IdP architecture would have preserved it (Supabase Auth can act as
an OAuth 2.1/OIDC provider, and Supabase is open source), but it requires a third
Supabase project.

> **Correction (2026-08-09).** This passage claimed Puck and Libra held both
> free slots. Puck has never had a Supabase project, so at the time of writing
> only one slot (Libra's) was taken and an extra project was in fact free. Both
> slots are used today (Libra + AeleOS), so the cost objection holds now — but it
> did not when the decision was made. The decision stands on the remaining
> grounds: it rides a beta feature, and any paid tier is a hard stop under the
> $0 budget.

## Why that loss is acceptable

The escape hatch it protected is already provided by the actor model. Domain data
keys on local ids; `identity_sub` is the only IdP-facing column; `actor_ref`,
`owner_ref` and every `author_person_ref` snapshot are **stored, not recomputed**.
Swapping issuers is therefore a one-column backfill matched by email — the same
migration shape §7 already describes for Libra, with zero domain rows
touched.

Self-hostability was a second layer of insurance over an exit we already own.
Paying $300/year now to keep it would be buying the same insurance twice.

## Costs accepted

- Clerk branding on the hosted login page (free plan).
- Maximum 3 social connections (Google + Discord = 2, one spare).
- No self-host path; exit is the one-column backfill above.

## What Phase 0 validated

See the Phase 0 report. In summary: Supabase accepts Clerk-issued tokens,
`auth.jwt()->>'sub'` resolves to the Clerk user id, the `authenticated` role is
assigned, forged tokens are rejected, and **Phase 1a's migrations required no
changes at all**.
```

- [x] **Step 2: Mark the superseded decision in the central-auth spec**

In `docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`, immediately after the `**Related:**` line in the header block, insert:

```markdown
- **⚠️ Superseded in part (2026-07-31):** the IdP is **Clerk**, not Logto —
  Supabase Third-Party Auth does not support Logto. See
  `2026-07-31-idp-decision-change.md`. Everything else in this spec —
  the sacred-ID principle, separate app databases, social-login-first,
  the phased rollout — stands unchanged.
```

- [x] **Step 3: Mark it in the actor-model spec**

In `docs/superpowers/specs/2026-07-28-aeleos-actor-model-design.md`, in §19 (Implementation deltas), append a new subsection:

```markdown
### 19.7 The IdP is Clerk, not Logto

Supabase Third-Party Auth does not support Logto; see
`2026-07-31-idp-decision-change.md`. This changes nothing in this spec's model.
`identity_sub` now holds a Clerk user id (`user_...`) instead of a Logto `sub`,
and §3.3's "Logto never learns that fursonas exist" applies verbatim to Clerk.

Note for whoever builds Phase 1b: `person_actor_ref()` derives `actor_ref` from
`identity_sub`, so a Clerk-provisioned person derives a different `actor_ref`
than a Logto-provisioned one would have. That is harmless because the derivation
is **bootstrap-only** — existing rows keep their stored `actor_ref`. Never
re-derive for existing users.
```

- [x] **Step 4: Update the project instructions**

In `CLAUDE.md`, replace every statement that names Logto as the IdP with Clerk, keeping the reasoning intact:

- In "What this repo IS (and is NOT)": change "The identity provider itself is **[Logto](https://logto.io)** — a managed, open-source IdP running in Logto Cloud, reachable at `id.furrycolombia.com`" to name **Clerk** as the managed IdP, and drop the "open-source" phrasing, which is no longer true.
- In "Architecture & the decisions behind it": replace the Logto bullet with a Clerk bullet stating it is the only Supabase-supported provider with native Google **and** Discord, and pointing at `2026-07-31-idp-decision-change.md` for the full reasoning including what was lost.
- In "References": replace the Logto links with `https://clerk.com` and `https://clerk.com/docs`.

Leave the sacred-ID rule, the budget constraints, and the phased rollout untouched — none of them changed.

- [ ] **Step 5: Verify and commit**

```bash
pnpm secretlint && pnpm format:check
git add docs/superpowers/specs/ CLAUDE.md
git commit -m "docs: record the Logto to Clerk decision change"
```

---

### Task 7: Write the Phase 0 report and confirm the free-tier facts

**Files:**

- Create: `docs/phase-0-report.md`

**Interfaces:**

- Consumes: results from Tasks 4 and 5.
- Produces: the go/no-go record for Phase 1.

- [ ] **Step 1: Confirm the free-plan facts against the live dashboard** 🧑

Check each in the Clerk dashboard and record the actual observed value, not what this plan assumed:

- Monthly active/retained user allowance on the free plan
- Number of social connections permitted, and how many are used
- Whether the Supabase integration is available without upgrading
- Whether Clerk branding appears on the hosted sign-in page
- Session token lifetime (affects how the validation suite is run)

- [ ] **Step 1b: Check whether a custom claim can carry pronouns** 🧑

The actor-model spec (§14.4) flags that pronouns are **not** a standard OIDC
claim — OIDC defines only `gender`, as free text. Under Logto this meant custom
data; under Clerk it means session-token customisation.

Confirm in the Clerk dashboard that a custom claim can be added to session tokens
on the **free** plan, and that it reaches `auth.jwt()` in Postgres. A quick check:
add a static test claim, capture a fresh token, and read it back with
`select auth.jwt() -> 'your_claim'`.

This does not need to be _built_ now — Phase 1b owns the profile fields. It needs
to be **known**, because if custom claims are gated behind a paid plan, the
profile design changes and it is far cheaper to learn that now.

- [ ] **Step 2: Write the report**

Create `docs/phase-0-report.md` recording, with real command output:

1. Whether Supabase accepted the Clerk token (Task 4) — the go/no-go.
2. Whether the actor model needed any change (Task 5) — expected: none.
3. The confirmed free-plan limits from step 1.
4. Anything that did not behave as this plan predicted.
5. An explicit statement of what remains unvalidated: **this was tested against the local Supabase stack, not Supabase Cloud.** The JWKS verification is real, but Cloud dashboard configuration has not been exercised, and no real app has been migrated.

- [ ] **Step 3: Run the full gate**

```bash
pnpm test:db && pnpm typecheck && pnpm lint && pnpm format:check && pnpm secretlint
```

Expected: all pass. `pnpm test:idp` is deliberately excluded — it needs credentials and a fresh token, so it must never be a CI gate.

- [ ] **Step 4: Commit**

```bash
git add docs/phase-0-report.md
git commit -m "docs: phase 0 validation report"
```

---

## Verification checklist

- [x] `pnpm test:db` passes (72 tests). ⚠️ Run with the provider **disabled** — see the Task 2 Step 1 finding; enabling it makes the stack unstartable without a real Clerk domain.
- [ ] `pnpm test:idp` passes (9 tests) with a fresh token in `.secrets`.
- [x] `pnpm test:idp` **skips cleanly** with `.secrets` absent — CI must not need credentials.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm secretlint` all pass.
- [x] No real Clerk key or token appears anywhere in git history.
- [x] No Supabase Cloud project was created.
- [x] Migrations `0001`–`0007` are unmodified.

## What Phase 0 does NOT deliver

- No app is migrated. Puck and Libra are untouched.
- No Supabase Cloud configuration is exercised — only the local stack.
- No hosted login theming, no custom domain, no `id.furrycolombia.com` DNS.
- No decision on the hub hostname (actor-model spec §18.1).

### Deliberate deviations from the spec's Phase 0

The central-auth spec §7 lists three Phase 0 items this plan handles differently.
Each is a considered choice, not an oversight:

1. **"Point `id.furrycolombia.com` at it" and "theme the hosted login" — deferred
   to Phase 1.** Neither is needed to answer the question Phase 0 exists to
   answer, and a Clerk _development_ instance does not use a custom domain
   anyway. Doing DNS before the trust is proven would be spending effort on an
   architecture that might not survive validation. Confirm during Phase 1 whether
   a custom domain is available on the free plan — satellite domains are a paid
   add-on, and the custom-domain position on free is unverified.

2. **"Register an application for each app" — not applicable to Clerk.** Logto
   models each app as a separate application with its own client ID. Clerk uses
   one instance serving multiple frontends, authorised by allowed origins. Since
   every app is a subdomain of `furrycolombia.com`, the session cookie covers
   them natively and no satellite-domain add-on is required. Origins get
   configured per app during Phase 1.

3. **"Validate on a throwaway Supabase project" — replaced by the local stack.**
   The spec assumed a spare Cloud project was free to create. As of 2026-08-09 it
   is not: the free plan allows two and both are in use (Libra + AeleOS). The
   local stack was the right call regardless, and it fetches Clerk's real JWKS
   over the network, so the asymmetric trust being tested is genuine. What is
   _not_ exercised is Cloud dashboard configuration — recorded as an explicit
   limitation in the Phase 0 report.

## Follow-on work

- **Phase 1a adoption in Puck** — copy the seam, rework `user_profiles` off its `auth.users(id)` FK.
- **Phase 1b** — the `aeleos-hub` repo: fursona registry, picker, profile editing.
- **Phase 3** — Libra, production, its own plan.
- **Repeatable token acquisition** — this plan captures a token manually because it is a one-time exercise. If `test:idp` should ever run unattended, investigate Clerk's Backend API for programmatic session creation; that path was not verified while writing this plan and must not be assumed to exist.
