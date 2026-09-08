#!/usr/bin/env node
/**
 * Sync secrets from GitHub repository secrets to the local .secrets file.
 *
 * Flow:
 *   1. Generate a random one-time passphrase
 *   2. Snapshot the workflow's existing run IDs
 *   3. Trigger the sync-secrets.yml workflow via `gh workflow run`
 *   4. Poll until a run outside that snapshot completes (120s timeout)
 *   5. Download the encrypted artifact
 *   6. Decrypt with the passphrase and write .secrets
 *   7. Clean up the encrypted artifact
 *
 * Prerequisites:
 *   - `gh` CLI installed and authenticated (`gh auth status`)
 *   - Repository access with workflow dispatch permissions
 *
 * Usage:
 *   pnpm sync-secrets
 */
import { createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const secretsPath = resolve(rootDir, ".secrets");
const hubEnvLocalPath = resolve(rootDir, "apps/hub/.env.local");
const hubEnvExamplePath = resolve(rootDir, "apps/hub/.env.example");

// Which `apps/hub/.env.local` key each `.secrets` key becomes. The names
// genuinely differ — see `buildHubEnvLocal`'s own TSDoc for why — so this is
// the one place that mapping is written down.
const HUB_ENV_KEY_MAPPING = [
  ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_PUBLISHABLE_KEY"],
  ["CLERK_SECRET_KEY", "CLERK_SECRET_KEY"],
  ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"],
];

const WORKFLOW_FILE = "sync-secrets.yml";
const ARTIFACT_NAME = "secrets-encrypted";
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 120_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[sync-secrets] ${msg}`);
}

function fail(msg) {
  console.error(`[sync-secrets] ERROR: ${msg}`);
  process.exit(1);
}

function gh(args, opts = {}) {
  return spawnSync("gh", args, {
    cwd: rootDir,
    encoding: "utf8",
    ...opts,
  });
}

// ── Prerequisite checks ──────────────────────────────────────────────────────

function ensureGhCli() {
  const result = gh(["auth", "status"]);
  if (result.status !== 0) {
    fail(
      "GitHub CLI (gh) is not installed or not authenticated.\n" +
        "Install it from https://cli.github.com and run `gh auth login`.",
    );
  }
}

// ── Get repo info (auto-detected from git remote) ────────────────────────────

function getRepoSlug() {
  const result = gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "-q",
    ".nameWithOwner",
  ]);
  if (result.status !== 0 || !result.stdout.trim()) {
    fail(
      "Could not determine repository. Make sure you're inside a GitHub repo.",
    );
  }
  return result.stdout.trim();
}

// ── Workflow trigger and polling ─────────────────────────────────────────────

function getCurrentBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  return result.stdout?.trim() || "main";
}

function listRuns() {
  const result = gh([
    "run",
    "list",
    "--workflow",
    WORKFLOW_FILE,
    "--limit",
    "20",
    "--json",
    "databaseId,status,conclusion",
  ]);
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    const runs = JSON.parse(result.stdout.trim());
    return Array.isArray(runs) ? runs : null;
  } catch {
    return null; // transient — the caller retries on the next poll
  }
}

// Snapshot the runs that already exist, so the one we are about to dispatch can
// be told apart from them. Fail rather than guess: without a baseline the poll
// below would fall back to "newest run", which is the bug this prevents.
function existingRunIds() {
  const runs = listRuns();
  if (runs === null) {
    fail(
      `Could not list runs for ${WORKFLOW_FILE}. ` +
        "Check access with: gh run list --workflow " +
        WORKFLOW_FILE,
    );
  }
  return new Set(runs.map((run) => run.databaseId));
}

function triggerWorkflow(passphrase) {
  log("Triggering sync-secrets workflow...");
  const branch = getCurrentBranch();
  log(`Using branch: ${branch}`);
  const result = gh([
    "workflow",
    "run",
    WORKFLOW_FILE,
    "--ref",
    branch,
    "--field",
    `passphrase=${passphrase}`,
  ]);
  if (result.status !== 0) {
    fail(`Failed to trigger workflow: ${result.stderr || "unknown error"}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForRun(knownRunIds) {
  log("Waiting for workflow to complete...");
  const startedAt = Date.now();

  while (Date.now() - startedAt < TIMEOUT_MS) {
    // Only a run that did not exist before the dispatch can be ours. Taking the
    // most recent run instead is a race: until GitHub registers the new run,
    // the newest is the *previous* sync's — already completed and successful,
    // so it is accepted immediately and its artifact downloaded. That artifact
    // was encrypted with a different one-time passphrase, so the run appears to
    // succeed and then dies at decrypt with "bad decrypt", which reads like a
    // corrupt artifact rather than the wrong run.
    const runs = listRuns();
    const run = runs?.find(
      (candidate) => !knownRunIds.has(candidate.databaseId),
    );

    if (run?.status === "completed") {
      if (run.conclusion === "success") {
        log(`Workflow completed successfully (run ${run.databaseId}).`);
        return run.databaseId;
      }
      fail(
        `Workflow failed with conclusion: ${run.conclusion}. ` +
          `Check the run with: gh run view ${run.databaseId}`,
      );
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    process.stdout.write(
      `\r[sync-secrets] Workflow ${run?.status ?? "registering"}... (${elapsed}s)`,
    );

    await sleep(POLL_INTERVAL_MS);
  }

  fail(
    `Secrets workflow timed out after ${TIMEOUT_MS / 1000}s without a new run ` +
      `completing. Check workflow runs with: gh run list --workflow ${WORKFLOW_FILE}`,
  );
}

// ── apps/hub/.env.local generation ───────────────────────────────────────────
//
// WHY THIS EXISTS. `.secrets` and `apps/hub/.env.local` are two different
// files for two different consumers: `.secrets` is read by CLI tools and by
// this script's own callers (its bare `CLERK_PUBLISHABLE_KEY` etc. is what a
// Node process calling Clerk's Management API wants), while the *running app*
// (`next dev`) only ever reads `apps/hub/.env.local` — via Next's own dotenv
// loader — and it wants different, `NEXT_PUBLIC_`-prefixed names for anything
// that must reach the browser bundle. `apps/hub/.env.example`'s own header
// already documents the fix as a one-time manual step: copy the example, then
// paste the four values from `.secrets`. That step is easy to skip on a fresh
// clone, and skipping it is not loud: `next dev` falls back to Clerk's own
// "keyless" auto-provisioning (a fresh random `*.clerk.accounts.dev` instance
// every boot) rather than refusing to start, so the failure downstream — a
// session token minted against the real instance can never match a random
// one's JWKS — reads like a Clerk outage rather than a missing file. See root
// `CLAUDE.md`'s toolchain rule 43 for the incident this was found from.

/**
 * Parses a `.secrets`- or `.env`-shaped text into a flat key/value map.
 *
 * Blank lines and lines starting with `#` are skipped. A line is split on its
 * FIRST `=` only, so a base64 value carrying its own `=` padding survives
 * intact. A key repeated later in the text overrides its earlier value, the
 * same behaviour `source`/dotenv give a file with a duplicate assignment.
 *
 * @param text - the file's contents.
 * @returns every assignment found.
 */
export function parseEnvAssignments(text) {
  /** @type {Record<string, string>} */
  const result = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    result[key] = line.slice(eq + 1).trim();
  }
  return result;
}

/**
 * Builds `apps/hub/.env.local`'s text from `.env.example`'s own template,
 * with the four Clerk/Supabase values `.secrets` holds substituted in.
 *
 * Only the four mapped keys (`HUB_ENV_KEY_MAPPING`) are ever touched — every
 * comment, blank line and other key (`AELEOS_ALLOWED_RETURN_ORIGINS`,
 * `NEXT_PUBLIC_HUB_HOST`) passes through from the example verbatim, so this
 * can never clobber a deliberate override such as the example's own
 * documented "local stack instead" values. A mapped key absent from
 * `secrets` is left as the example's own placeholder line, so a partial
 * `.secrets` still produces a file that names exactly what is missing rather
 * than a half-written line.
 *
 * @param exampleText - `apps/hub/.env.example`'s own contents.
 * @param secrets - parsed `.secrets` content, from {@link parseEnvAssignments}.
 * @returns the full `.env.local` text.
 */
export function buildHubEnvLocal(exampleText, secrets) {
  const targetToSource = new Map(HUB_ENV_KEY_MAPPING);
  return exampleText
    .split("\n")
    .map((line) => {
      const eq = line.indexOf("=");
      if (eq === -1) return line;
      const sourceKey = targetToSource.get(line.slice(0, eq));
      if (sourceKey === undefined) return line;
      const value = secrets[sourceKey];
      return value === undefined ? line : `${line.slice(0, eq)}=${value}`;
    })
    .join("\n");
}

/**
 * Creates `apps/hub/.env.local` from the just-synced `.secrets`, but only
 * when it does not already exist.
 *
 * Never overwrites an existing file — a developer's local-Supabase-stack
 * override, or any other hand edit, is left exactly as they made it. This is
 * a convenience on top of `.secrets` syncing, not the thing this script
 * exists to guarantee, so a failure here is reported and swallowed rather
 * than failing the whole run.
 *
 * @param secretsText - the `.secrets` content just written to disk.
 */
function syncHubEnvLocal(secretsText) {
  if (existsSync(hubEnvLocalPath)) {
    log("apps/hub/.env.local already exists — left untouched.");
    return;
  }
  if (!existsSync(hubEnvExamplePath)) {
    log("apps/hub/.env.example not found — skipping .env.local generation.");
    return;
  }
  try {
    const secrets = parseEnvAssignments(secretsText);
    const exampleText = readFileSync(hubEnvExamplePath, "utf-8");
    writeFileSync(hubEnvLocalPath, buildHubEnvLocal(exampleText, secrets));
    log(
      "Created apps/hub/.env.local from .secrets (Clerk + Supabase filled in).",
    );
  } catch (err) {
    log(`Could not generate apps/hub/.env.local: ${err.message}`);
  }
}

// ── Download and decrypt ─────────────────────────────────────────────────────

function downloadArtifact(runId) {
  log("Downloading encrypted artifact...");
  const downloadDir = resolve(rootDir, ".secrets-download");

  if (existsSync(downloadDir)) {
    rmSync(downloadDir, { recursive: true, force: true });
  }

  const result = gh([
    "run",
    "download",
    String(runId),
    "--name",
    ARTIFACT_NAME,
    "--dir",
    downloadDir,
  ]);

  if (result.status !== 0) {
    fail(`Failed to download artifact: ${result.stderr || "unknown error"}`);
  }

  const encryptedPath = resolve(downloadDir, "secrets-encrypted.bin");
  if (!existsSync(encryptedPath)) {
    rmSync(downloadDir, { recursive: true, force: true });
    fail("Downloaded artifact does not contain secrets-encrypted.bin.");
  }

  return { encryptedPath, downloadDir };
}

function decryptAndWrite(encryptedPath, passphrase, downloadDir) {
  log("Decrypting secrets...");
  const decryptedPath = resolve(rootDir, ".secrets-decrypted.tmp");

  try {
    const encrypted = readFileSync(encryptedPath);
    const magic = encrypted.subarray(0, 8).toString("ascii");
    if (magic !== "Salted__") {
      throw new Error("encrypted artifact is not in OpenSSL salted format");
    }

    const salt = encrypted.subarray(8, 16);
    const ciphertext = encrypted.subarray(16);
    const keyAndIv = pbkdf2Sync(passphrase, salt, 10_000, 48, "sha256");
    const key = keyAndIv.subarray(0, 32);
    const iv = keyAndIv.subarray(32, 48);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    writeFileSync(decryptedPath, decrypted);
  } catch (err) {
    rmSync(downloadDir, { recursive: true, force: true });
    if (existsSync(decryptedPath)) unlinkSync(decryptedPath);
    fail(`Failed to decrypt secrets artifact: ${err.message}`);
  }

  rmSync(downloadDir, { recursive: true, force: true });

  const content = readFileSync(decryptedPath, "utf-8");
  writeFileSync(secretsPath, content, "utf-8");
  unlinkSync(decryptedPath);

  const secretCount = content.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("#") && trimmed.includes("=");
  }).length;

  return secretCount;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  ensureGhCli();

  const repoSlug = getRepoSlug();
  log(`Repository: ${repoSlug}`);

  const passphrase = randomBytes(32).toString("hex");

  const knownRunIds = existingRunIds();

  triggerWorkflow(passphrase);

  const runId = await waitForRun(knownRunIds);

  const { encryptedPath, downloadDir } = downloadArtifact(runId);
  const secretCount = decryptAndWrite(encryptedPath, passphrase, downloadDir);
  syncHubEnvLocal(readFileSync(secretsPath, "utf-8"));

  console.log("");
  log(`Done — synced ${secretCount} secrets to .secrets`);
}

// Only runs as a CLI, so the tests can import the pure functions above.
if (process.argv[1]?.endsWith("sync-secrets.mjs")) {
  main().catch((err) => {
    console.error(`[sync-secrets] ${err.message}`);
    process.exit(1);
  });
}
