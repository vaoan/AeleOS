import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import { e2eTarget } from "../../../e2e-target";
import { mintTicket, signIn } from "./clerk-session";

// WHY THIS EXISTS.
//
// A Clerk sign-in token is single-use, so a spec file that calls
// `signIn(page, await mintTicket(identity.userId))` once per test case pays
// for a fresh Clerk round trip every single time — 55 call sites across this
// suite, when every one of them already shares ONE identity per file, created
// once in `beforeAll`. The session that identity's first sign-in establishes
// is exactly as good the second time, if something restores it instead of
// asking Clerk for another ticket. This mints ONE ticket per file, drives the
// ordinary `signIn` flow once in a throwaway context, and saves the resulting
// Playwright storage state so the rest of that file's tests can restore it.
//
// **`workers: 1` and `fullyParallel: false`** (see `playwright.config.ts`) are
// what make sharing safe: every test in the whole run executes one at a time,
// so nothing else can observe or disturb the throwaway context used here.

/**
 * Where a spec file's shared signed-in session is written.
 *
 * Under the OS temp directory and never inside the repository — nothing this
 * writes is committed. The process id and a timestamp make the path unique
 * per invocation, so two runs (or, in principle, two files sharing a tag by
 * mistake) never collide on the same file.
 *
 * @param specTag - a filesystem-safe name for the calling spec file.
 * @returns the absolute path `establishSharedSession` will write to and
 * `test.use({ storageState })` will read from.
 */
export function sharedStatePath(specTag: string): string {
  return join(
    tmpdir(),
    `aeleos-e2e-session-${specTag}-${process.pid}-${Date.now()}.json`,
  );
}

/**
 * Signs one identity in, once, and saves the resulting browser storage state.
 *
 * **Must complete inside `test.beforeAll`, before any test in the file asks
 * for a `page`.** `test.use({ storageState: path })`'s value is read lazily —
 * at the moment Playwright creates the context for the first test that needs
 * one, which is after every `beforeAll` in scope has already run — so a
 * fixed, precomputed `path` (see {@link sharedStatePath}) may be named in a
 * module-level `test.use()` call even though the file it names is written
 * later, during setup. That ordering is asserted empirically by every spec
 * that uses this — a file whose signed-in tests pass could not have read an
 * unauthenticated (or missing) storage state.
 *
 * @param browser - the worker-scoped `browser` fixture, requested by
 * `beforeAll` (e.g. `test.beforeAll(async ({ browser }) => { … })`).
 * @param userId - whose identity to sign in as.
 * @param path - where to write the storage state; pass the same path given
 * to the file's `test.use({ storageState })` call.
 * @throws whatever `signIn` throws — an identity that cannot sign in leaves
 * no file behind, so every restoring test fails loudly on a missing path
 * rather than silently running unauthenticated.
 */
export async function establishSharedSession(
  browser: Browser,
  userId: string,
  path: string,
): Promise<void> {
  const context = await browser.newContext({ baseURL: e2eTarget().baseURL });
  try {
    const page = await context.newPage();
    await signIn(page, await mintTicket(userId));
    await context.storageState({ path });
  } finally {
    await context.close();
  }
}
