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
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const secretsPath = resolve(rootDir, ".secrets");

/** The AeleOS project. Libra's production ref must never appear here. */
const PROJECT_REF = "vmmpssydbrtkgvrlkijh";
const PROJECT_NAME = "AeleOS";
/** Free-plan projects have no IPv4 on the direct host, so use the pooler. */
const POOLER_HOST = "aws-0-ca-central-1.pooler.supabase.com";
const POOLER_PORT = 5432;
/**
 * One identity per run, never shared. Two runs against the same address would
 * share an `identity_sub`, and the suite's `afterAll` deletes every row for it —
 * so concurrent runs delete each other's rows mid-test. `GITHUB_RUN_ID` makes
 * that impossible in CI; locally the timestamp does the same job.
 */
const RUN_ID = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
const TEST_EMAIL = `phase0+cloud-${RUN_ID}@example.com`;

function fail(msg) {
  console.error(`[cloud-idp] ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[cloud-idp] ${msg}`);
}

function readSecret(secrets, key) {
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

async function clerkApi(path, secretKey, init = {}) {
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
    fail(
      `${path} -> HTTP ${res.status}: ${e?.long_message ?? e?.message ?? ""}`,
    );
  }
  return body;
}

// ── Main ────────────────────────────────────────────────────────────────────

if (!existsSync(secretsPath))
  fail("no .secrets — run `pnpm sync-secrets` first.");
const secrets = readFileSync(secretsPath, "utf8");

const managementToken = readSecret(secrets, "SUPABASE_ACCESS_TOKEN");
const clerkSecretKey = readSecret(secrets, "CLERK_SECRET_KEY");
const clerkDomain = readSecret(secrets, "CLERK_DOMAIN");
const dbPassword =
  process.env.AELEOS_DB_PASSWORD ?? readSecret(secrets, "SUPABASE_DB_PASSWORD");

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
const clerk = providers.find((p) => String(p.type).startsWith("clerk"));
if (!clerk) {
  fail(
    "no Clerk third-party auth provider on the project — activate the Supabase " +
      "integration at https://clerk.com/setup/supabase.",
  );
}
log(`trust:  ${clerk.type} -> ${clerk.oidc_issuer_url}`);

// 3. Keys.
const keys = await api(
  `${base}/${PROJECT_REF}/api-keys?reveal=true`,
  managementToken,
);
const keyNamed = (name) => keys.find((k) => k.name === name)?.api_key;
const anonKey = keyNamed("anon");
const serviceRoleKey = keyNamed("service_role");
if (!anonKey || !serviceRoleKey) fail("could not read anon/service_role keys.");

// 4. A real Clerk identity, created fresh for this run and deleted below.
const user = await clerkApi("/users", clerkSecretKey, {
  method: "POST",
  body: JSON.stringify({
    email_address: [TEST_EMAIL],
    first_name: "Phase0",
    last_name: "Cloud",
    skip_password_requirement: true,
  }),
});
const session = await clerkApi("/sessions", clerkSecretKey, {
  method: "POST",
  body: JSON.stringify({ user_id: user.id }),
});
const minted = await clerkApi(
  `/sessions/${session.id}/tokens`,
  clerkSecretKey,
  { method: "POST" },
);
const jwt = minted.jwt ?? minted.token;
const claims = JSON.parse(
  Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
);
log(`clerk:  ${claims.sub} role=${claims.role ?? "(ABSENT)"}`);
if (claims.role !== "authenticated") {
  fail(
    "token has no `authenticated` role claim — the suite would fail anyway.",
  );
}

// 5. Run the suite. The token is valid for about 60 seconds from here.
const dbUrl =
  `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(dbPassword)}` +
  `@${POOLER_HOST}:${POOLER_PORT}/postgres`;

let status = 1;
try {
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
      SUPABASE_DB_URL: dbUrl,
      CLERK_SESSION_TOKEN: jwt,
      ...(clerkDomain ? { CLERK_DOMAIN: clerkDomain } : {}),
    },
  });
  status = result.status ?? 1;
} finally {
  // Always remove the identity, including when the suite fails — otherwise a
  // red run leaves a user behind and they accumulate silently. Deleting the
  // user cascades to its sessions; the suite's own `afterAll` removes the
  // `actors` rows.
  //
  // Deliberately not `clerkApi`: that helper exits the process on a bad
  // response, which here would discard the suite's exit status and report a
  // cleanup failure as a test failure.
  const deleted = await fetch(`https://api.clerk.com/v1/users/${user.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${clerkSecretKey}` },
  }).catch(() => null);
  if (deleted?.ok) {
    log(`cleaned: ${user.id}`);
  } else {
    console.error(
      `[cloud-idp] could not delete ${user.id} — remove it by hand`,
    );
  }
}

process.exit(status);
