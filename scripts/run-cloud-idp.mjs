#!/usr/bin/env node
/**
 * Run the Phase 0 IdP suite against the HOSTED AeleOS Supabase project.
 *
 * The local stack proves the mechanism; this proves the product — Supabase's
 * hosted Auth server fetching Clerk's JWKS over the internet and mapping the
 * token to the `authenticated` Postgres role.
 *
 * Flow:
 *   1. Resolve the project and refuse to run against anything but AeleOS
 *   2. Assert Clerk is registered as a third-party auth provider on it
 *   3. Read the anon and service_role keys from the Management API
 *   4. Mint a fresh Clerk session token (~60s lifetime)
 *   5. Hand all of it to `vitest` via SUPABASE_TARGET=cloud
 *
 * Nothing is written to disk. The token only ever reaches the child process.
 *
 * Prerequisites:
 *   - .secrets with SUPABASE_ACCESS_TOKEN, CLERK_SECRET_KEY, CLERK_DOMAIN
 *   - the project's database password, as AELEOS_DB_PASSWORD
 *   - migrations already pushed to the project (`supabase db push --db-url …`)
 *
 * Usage:
 *   AELEOS_DB_PASSWORD=… pnpm test:idp:cloud
 *
 * Which Clerk instance mints the token is decided by `CLERK_SECRET_KEY` and
 * `CLERK_DOMAIN`, and an exported variable wins over `.secrets` — the same
 * precedence `AELEOS_DB_PASSWORD` already has. That is how the PRODUCTION
 * instance is proved without the hub moving to it (2026-09-27): export the
 * `CLERK_PROD_*` pair under those two names and run. The project trusts both
 * instances, so {@link findTrust} looks for the entry whose issuer is the
 * domain in use rather than the first entry whose type says Clerk — Supabase
 * types the production entry `custom`, and a run that logged the development
 * trust while minting a production token would prove nothing.
 *
 * The pieces with a failure mode of their own are exported and tested in
 * `tests/tools/run-cloud-idp.test.ts`; `main()` only wires them together and
 * runs when this file is the entry point.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_NAME, PROJECT_REF, poolerUrl } from "./aeleos-project.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const secretsPath = resolve(rootDir, ".secrets");

function fail(msg) {
  console.error(`[cloud-idp] ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[cloud-idp] ${msg}`);
}

/**
 * The value of `KEY=value` in a `.secrets` text, trimmed, or `null` when the
 * key is absent. Only a line that STARTS with the key counts, so
 * `CLERK_PROD_SECRET_KEY=` never answers for `CLERK_SECRET_KEY`.
 */
export function readSecret(secrets, key) {
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(secrets);
  return m ? m[1].trim() : null;
}

async function api(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(`${url} -> HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

/**
 * One Backend API call. Throws on a non-2xx answer rather than exiting, so a
 * caller that owns something to clean up (the test user, below) can run its
 * `finally` first; `main()` turns the throw into an exit only where nothing
 * is owned yet.
 */
async function clerkRequest(path, secretKey, init = {}) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body.errors?.[0];
    throw new Error(
      `${path} -> HTTP ${res.status}: ${e?.long_message ?? e?.message ?? ""}`,
    );
  }
  return body;
}

/**
 * The Third-Party Auth entry the run must be checked against, or `undefined`.
 *
 * With a domain, it is the entry whose issuer is exactly `https://<domain>`
 * (a trailing slash on the stored issuer is tolerated), whatever Supabase
 * typed it — the production entry is `custom`. Without a domain it falls back
 * to the first entry whose type starts with `clerk`, which is the pre-2026-09
 * behaviour for a `.secrets` that names no domain.
 */
export function findTrust(providers, clerkDomain) {
  if (clerkDomain) {
    return providers.find(
      (p) =>
        String(p.oidc_issuer_url).replace(/\/$/, "") ===
        `https://${clerkDomain}`,
    );
  }
  return providers.find((p) => String(p.type).startsWith("clerk"));
}

/**
 * A session token for `userId`, minted the way the instance allows.
 *
 * A development instance lets the Backend API create a session outright. A
 * production instance refuses that call ("Request only valid for development
 * instances"), so there the Backend API issues a sign-in token and the
 * Frontend API consumes it in its native mode — `_is_native=1`, which answers
 * with the client token in an `Authorization` header instead of a cookie —
 * and then signs the session's JWT. Both paths end in the same `__session`
 * token Supabase sees, `role` claim included, provided the instance has the
 * Supabase integration activated (`docs/deployment.md` §2).
 *
 * The secret key's prefix decides the path: `sk_live_` is production, and
 * production without a domain is refused before any request is made. Every
 * failure THROWS — never exits — because the caller owns a user to delete.
 */
export async function mintSessionToken(secretKey, domain, userId) {
  if (!secretKey.startsWith("sk_live_")) {
    const session = await clerkRequest("/sessions", secretKey, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    const minted = await clerkRequest(
      `/sessions/${session.id}/tokens`,
      secretKey,
      { method: "POST" },
    );
    return minted.jwt ?? minted.token;
  }
  if (!domain) {
    throw new Error(
      "CLERK_DOMAIN is required to mint on a production instance.",
    );
  }
  const ticket = await clerkRequest("/sign_in_tokens", secretKey, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  });
  const fapi = `https://${domain}/v1`;
  const signIn = await fetch(`${fapi}/client/sign_ins?_is_native=1`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ strategy: "ticket", ticket: ticket.token }),
  });
  const clientToken = signIn.headers.get("authorization");
  const signInBody = await signIn.json().catch(() => ({}));
  if (!signIn.ok || !clientToken) {
    throw new Error(
      `${fapi}/client/sign_ins -> HTTP ${signIn.status}: ${JSON.stringify(signInBody).slice(0, 200)}`,
    );
  }
  const sessionId = signInBody.response?.created_session_id;
  if (!sessionId) {
    throw new Error("the sign-in completed without creating a session.");
  }
  const minted = await fetch(
    `${fapi}/client/sessions/${sessionId}/tokens?_is_native=1`,
    { method: "POST", headers: { Authorization: clientToken } },
  );
  const mintedBody = await minted.json().catch(() => ({}));
  if (!minted.ok || !mintedBody.jwt) {
    throw new Error(
      `${fapi}/client/sessions/…/tokens -> HTTP ${minted.status}`,
    );
  }
  return mintedBody.jwt;
}

/**
 * Create a Clerk user for one run, hand it to `body`, and delete it however
 * `body` ends. Resolves to the exit status the run should report.
 *
 * `body(user)` returns a status (the suite's exit code). If it throws, the
 * message is logged under the `[cloud-idp]` prefix and the status is `1` —
 * and the user is STILL deleted, because the delete lives in `finally` and
 * nothing in between may call `process.exit`. That is the regression this
 * function exists to hold: before 2026-09-27 the mint sat outside the block
 * and exited on failure, and the first production run left its user behind.
 *
 * A failed delete is reported and does not change the status: a cleanup
 * failure must never masquerade as a test failure, nor hide a pass.
 *
 * Creating the user can throw (a bad key, a refused email); nothing is owned
 * yet at that point, so the caller decides what to do with it.
 */
export async function withTestUser(secretKey, email, body) {
  const user = await clerkRequest("/users", secretKey, {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      first_name: "Phase0",
      last_name: "Cloud",
      skip_password_requirement: true,
    }),
  });
  let status = 1;
  try {
    status = await body(user);
  } catch (err) {
    console.error(
      `[cloud-idp] ${err instanceof Error ? err.message : String(err)}`,
    );
    status = 1;
  } finally {
    // Deliberately not `clerkApi`: that helper exits the process on a bad
    // response, which here would discard the suite's exit status and report
    // a cleanup failure as a test failure. Deleting the user cascades to its
    // sessions; the suite's own `afterAll` removes the `actors` rows.
    const deleted = await fetch(`https://api.clerk.com/v1/users/${user.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secretKey}` },
    }).catch(() => null);
    if (deleted?.ok) {
      log(`cleaned: ${user.id}`);
    } else {
      console.error(
        `[cloud-idp] could not delete ${user.id} — remove it by hand`,
      );
    }
  }
  return status;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  /**
   * One identity per run, never shared. Two runs against the same address
   * would share an `identity_sub`, and the suite's `afterAll` deletes every
   * row for it — so concurrent runs delete each other's rows mid-test.
   * `GITHUB_RUN_ID` makes that impossible in CI; locally the timestamp does
   * the same job.
   */
  const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
  const testEmail = `phase0+cloud-${runId}@example.com`;

  if (!existsSync(secretsPath))
    fail("no .secrets — run `pnpm sync-secrets` first.");
  const secrets = readFileSync(secretsPath, "utf8");

  const managementToken = readSecret(secrets, "SUPABASE_ACCESS_TOKEN");
  const clerkSecretKey =
    process.env.CLERK_SECRET_KEY ?? readSecret(secrets, "CLERK_SECRET_KEY");
  const clerkDomain =
    process.env.CLERK_DOMAIN ?? readSecret(secrets, "CLERK_DOMAIN");
  const dbPassword =
    process.env.AELEOS_DB_PASSWORD ??
    readSecret(secrets, "SUPABASE_DB_PASSWORD");

  if (!managementToken) fail("SUPABASE_ACCESS_TOKEN missing from .secrets.");
  if (!clerkSecretKey) fail("CLERK_SECRET_KEY missing from .secrets.");
  if (!dbPassword) {
    fail("set AELEOS_DB_PASSWORD (or SUPABASE_DB_PASSWORD in .secrets).");
  }

  const base = "https://api.supabase.com/v1/projects";

  // 1. Refuse to touch any project but AeleOS.
  const project = await api(`${base}/${PROJECT_REF}`, managementToken);
  if (project.name !== PROJECT_NAME) {
    fail(
      `refusing to target project "${project.name}" (expected ${PROJECT_NAME}).`,
    );
  }
  log(`target: ${project.name} (${PROJECT_REF}, ${project.region})`);

  // 2. The trust must exist on the project, not just in Clerk.
  const providers = await api(
    `${base}/${PROJECT_REF}/config/auth/third-party-auth`,
    managementToken,
  );
  const clerk = findTrust(providers, clerkDomain);
  if (!clerk) {
    fail(
      clerkDomain
        ? `no third-party auth provider on the project trusts https://${clerkDomain} — ` +
            "add it under Authentication → Third-Party Auth."
        : "no Clerk third-party auth provider on the project — activate the Supabase " +
            "integration at https://clerk.com/setup/supabase.",
    );
  }
  log(`trust:  ${clerk.type} -> ${clerk.oidc_issuer_url}`);

  // 3. Keys. A paused project answers `[]` here with HTTP 200, which is what
  // this message looks like from the outside — `docs/deployment.md` §2.
  const keys = await api(
    `${base}/${PROJECT_REF}/api-keys?reveal=true`,
    managementToken,
  );
  const keyNamed = (name) => keys.find((k) => k.name === name)?.api_key;
  const anonKey = keyNamed("anon");
  const serviceRoleKey = keyNamed("service_role");
  if (!anonKey || !serviceRoleKey) {
    fail("could not read anon/service_role keys (is the project paused?).");
  }

  // 4 and 5. A real Clerk identity for this run, a token for it, the suite —
  // and the identity deleted however that ends.
  let status;
  try {
    status = await withTestUser(clerkSecretKey, testEmail, async (user) => {
      const jwt = await mintSessionToken(clerkSecretKey, clerkDomain, user.id);
      const claims = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
      );
      log(`clerk:  ${claims.sub} role=${claims.role ?? "(ABSENT)"}`);
      if (claims.role !== "authenticated") {
        throw new Error(
          "token has no `authenticated` role claim — activate the Supabase " +
            "integration on THIS instance (docs/deployment.md §2).",
        );
      }

      // The token is valid for about 60 seconds from here.
      const result = spawnSync("pnpm", ["test:idp"], {
        cwd: rootDir,
        shell: true,
        stdio: "inherit",
        env: {
          ...process.env,
          SUPABASE_TARGET: "cloud",
          SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
          SUPABASE_ANON_KEY: anonKey,
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
          SUPABASE_DB_URL: poolerUrl(dbPassword),
          CLERK_SESSION_TOKEN: jwt,
          ...(clerkDomain ? { CLERK_DOMAIN: clerkDomain } : {}),
        },
      });
      return result.status ?? 1;
    });
  } catch (err) {
    // Only user creation can land here, and it owns nothing.
    fail(err instanceof Error ? err.message : String(err));
  }

  process.exit(status);
}

if (process.argv[1]?.endsWith("run-cloud-idp.mjs")) {
  main().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
