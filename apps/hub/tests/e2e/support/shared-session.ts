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
//
// **A file that adopts this pattern must audit its OWN `browser.newContext()`
// calls, not just this module's.** `test.use({ storageState: STATE_PATH })`
// becomes that file's default for every manually created context, including
// ones a test builds for a deliberately SEPARATE identity — an anonymous
// "stranger" reading a public page, or a second independent sign-in proving
// two sessions converge on one platform id. Both faults were caught only by
// actually running the suite in a browser: `establishSharedSession` itself
// threw `ENOENT` trying to read its own not-yet-written output (see below),
// and `signed-in.spec.ts`'s "signing in twice" case failed with "You're
// already signed in" because its supposedly-fresh second context silently
// inherited the shared session. Every such call needs its own explicit
// `{ storageState: undefined }` — the same fix, for the same reason, at every
// call site that must NOT be the shared identity.

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
 * **Its own `browser.newContext()` call carries an explicit
 * `storageState: undefined` (2026-08-29).** Without it, Playwright fills the
 * key in from the calling file's `test.use({ storageState: path })` — the
 * same `path` this function is about to write — and this call throws `ENOENT`
 * reading a file that does not exist yet. See the file header for the wider
 * version of this trap, which also bit two callers directly.
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
  // **`storageState: undefined` is explicit and load-bearing.** Playwright's
  // test runner instruments every `browser.newContext()` call — not only the
  // `context`/`page` fixtures — and fills in any key ABSENT from the options
  // object from the file's `test.use()` config (see
  // `runBeforeCreateBrowserContext` in `@playwright/test`). Every caller of
  // this function has already called `test.use({ storageState: path })` for
  // the very state this establishes, so omitting the key here does not mean
  // "no storage state" — it means "inherit the file's default", which is this
  // same path, which does not exist yet. The result is
  // `browser.newContext` throwing `ENOENT` reading its own not-yet-written
  // output. Setting the key to `undefined` makes it PRESENT, which the merge
  // checks with `in` rather than truthiness, so it is left alone.
  const context = await browser.newContext({
    baseURL: e2eTarget().baseURL,
    storageState: undefined,
  });
  try {
    const page = await context.newPage();
    await signIn(page, await mintTicket(userId));
    await context.storageState({ path });
  } finally {
    await context.close();
  }
}
