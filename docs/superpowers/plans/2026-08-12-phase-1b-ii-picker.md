# Phase 1b-ii, part 2 — The Picker and the App Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a consuming app ask the hub "who does this person want to be?" and get a trustworthy answer back — plus the one endpoint apps call to mirror a person's actors.

**Architecture:** Two redirect surfaces, each with its own control. `return_to` leaves the hub for another app and is checked against an **exact origin allowlist**. The post-sign-in destination stays inside the hub and is checked to be a **same-origin path**. Consuming apps read actors server-to-server with the user's own Clerk token — there is no shared secret, no service account, and deliberately no CORS.

**Tech Stack:** Next.js 16 Route Handlers and Server Actions, React 19, next-intl, Clerk, zod, Vitest, Playwright. **No new dependencies.**

**Supersedes** tasks 6–9 of `2026-08-02-phase-1b-ii-fursonas-and-picker.md`. The allowlist design and the API's shape carry forward; the paths, the layering and the missing sign-in handoff do not.

**Depends on** `2026-08-12-phase-1b-ii-fursonas.md` (merged): `my_actors`, `listMyActors`, `ActorTile`, and the `features/actors` barrel already exist.

## Global Constraints

- **`return_to` is an open-redirect vector and so is the sign-in destination.** They are different problems with different answers: one leaves the hub and needs an origin allowlist; the other stays and must be rejected unless it is a relative path on this origin. Never conflate them, and never redirect to a caller-supplied URL without checking it.
- **`actor_ref` handed back to an app is a suggestion, never an authorization.** It travels in a query string where anyone can edit it. The integrator documentation must say so as its own step, not as an aside.
- **The exposure boundary holds.** `owner_ref` and `identity_sub` must never appear in an API response, a redirect, a rendered page or an error message.
- **Every user-visible string lives in both `en.json` and `es.json`.** `i18next/no-literal-string` is an ESLint error and `messages.test.ts` fails on an asymmetric key.
- **The layer rules are enforced.** `domain/` may import nothing from other layers — which is why the allowlist takes its origins as a **parameter** rather than reading `env` itself. No feature imports another; no `../` imports anywhere in `apps/hub/src`.
- **Coverage is 100% on all four metrics** in `apps/hub` and `packages/identity`. `presentation/**`, `app/**` and feature barrels are excluded — so anything under `app/` needs its own test file, as `fursona-edit-page.test.tsx` does. **Never lower a threshold.**
- **Every export carries TSDoc stating the contract, not the types.** Backticks in `@throws`, never braces — `tsdoc/syntax` rejects `@throws {Type}`.
- **Every export is tested on its happy path and each failure mode**, and a test guarding already-correct behaviour is **verified by sabotage**.
- Do **not** add an `eslint-disable` for `i18next/no-literal-string`; use `words.exclude` in `eslint.config.mjs`.
- Filenames kebab-case. Branch from `origin/main`.

## Two things this plan settles that the superseded one left open

**1. The sign-in handoff was missing, and without it the picker fails for its most common visitor.**

Verified against the live deployment: `GET /picker?return_to=…&app=Puck` while signed out answers `307 → /es/sign-in` with **the query string dropped**. `signInUrlFor` builds `/{locale}/sign-in` from the pathname alone, and the sign-in page hardcodes `afterSignInUrl = /{locale}/me`. So a person arriving from Puck who is not already signed into the hub signs in and lands on their profile, with `return_to` gone and no way back. Task 2 fixes this before the picker exists, because the picker is unusable without it.

**2. Consuming apps call the sync endpoint server-to-server. There is no CORS, on purpose.**

The endpoint returns a person's complete actor list. Adding `Access-Control-Allow-Credentials` with an origin allowlist would make that list readable by script on every allowlisted app — so an XSS in any one consuming app would yield every user's full fursona list, including the private ones, from every app. Server-side callers need no CORS headers, the app's own database write needs server privileges anyway, and the token never touches another origin's JavaScript. The integrator documentation states this as a requirement rather than leaving it to be discovered.

## Target File Structure

```
apps/hub/src/features/picker/
├── domain/return-to.ts            isAllowedReturnTo, isInternalPath — pure
├── presentation/picker-grid.tsx
└── index.ts

apps/hub/src/app/[locale]/(app)/picker/
├── page.tsx
└── actions.ts

apps/hub/src/app/api/actors/mine/route.ts

apps/hub/src/shared/infrastructure/
├── env.ts                         gains allowedReturnOrigins
└── request-locale.ts              signInUrlFor carries the destination

apps/hub/tests/
├── return-to.test.ts
├── sign-in-destination.test.ts
├── picker-page.test.tsx
├── picker-actions.test.ts
└── api-actors-mine.test.ts
```

`return-to.ts` lives in `domain/` and therefore may not read `env` — the layer rules forbid it, and Task 3 of the fursonas plan proved they fire on real code. It takes the allowed origins as a **parameter**, which also makes it trivially testable without mocking the environment.

---

### Task 1: The two redirect guards

**Files:**

- Create: `apps/hub/src/features/picker/domain/return-to.ts`, `apps/hub/src/features/picker/index.ts`
- Modify: `apps/hub/src/shared/infrastructure/env.ts`, `apps/hub/.env.example`
- Test: `apps/hub/tests/return-to.test.ts`

**Interfaces:**

- Consumes: nothing. `domain/` imports no other layer.
- Produces:
  - `isAllowedReturnTo(candidate: string, allowed: readonly string[]): boolean`
  - `isInternalPath(candidate: string): boolean`
  - `env.allowedReturnOrigins: string[]` from `AELEOS_ALLOWED_RETURN_ORIGINS`

- [ ] **Step 1: Write the failing test**

Create `apps/hub/tests/return-to.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isAllowedReturnTo,
  isInternalPath,
} from "@/features/picker/domain/return-to";

const ALLOWED = [
  "https://puck.furrycolombia.com",
  "http://localhost:5000",
] as const;

/**
 * Whether the candidate is allowed against the fixture origins.
 *
 * @param candidate - the URL to check.
 * @returns the guard's answer.
 */
const ok = (candidate: string) => isAllowedReturnTo(candidate, ALLOWED);

describe("isAllowedReturnTo", () => {
  it("accepts an exact allowed origin", () => {
    expect(ok("https://puck.furrycolombia.com/callback")).toBe(true);
    expect(ok("http://localhost:5000/x?y=1")).toBe(true);
  });

  it("rejects a different host", () => {
    expect(ok("https://evil.example/callback")).toBe(false);
  });

  // The three shapes that beat naive matching. A subdomain beats "endsWith",
  // a suffixed host beats "startsWith", and a scheme swap beats host-only
  // comparison — which is why this compares the parsed origin as a whole.
  it("rejects a subdomain of an allowed origin", () => {
    expect(ok("https://evil.puck.furrycolombia.com/x")).toBe(false);
  });

  it("rejects a host that merely starts with an allowed one", () => {
    expect(ok("https://puck.furrycolombia.com.evil.example/x")).toBe(false);
  });

  it("rejects an allowed host under a different scheme", () => {
    expect(ok("http://puck.furrycolombia.com/callback")).toBe(false);
  });

  it("rejects an allowed host on a different port", () => {
    expect(ok("http://localhost:5001/x")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(ok("javascript:alert(1)")).toBe(false);
    expect(ok("data:text/html,<script>")).toBe(false);
  });

  it("rejects a protocol-relative URL", () => {
    expect(ok("//evil.example/x")).toBe(false);
  });

  it("rejects garbage rather than throwing", () => {
    expect(ok("not a url")).toBe(false);
    expect(ok("")).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(isAllowedReturnTo("https://puck.furrycolombia.com/x", [])).toBe(
      false,
    );
  });

  // Credentials in a URL are a phishing shape: the browser shows the userinfo
  // before the @, so an allowed origin can be made to appear in a bar that
  // navigates elsewhere. URL parsing puts them outside `origin`, so this is
  // about refusing to hand one back, not about matching.
  it("rejects a URL carrying credentials", () => {
    expect(ok("https://puck.furrycolombia.com@evil.example/x")).toBe(false);
    expect(ok("https://user:pw@puck.furrycolombia.com/x")).toBe(false);
  });
});

describe("isInternalPath", () => {
  it("accepts a rooted path", () => {
    expect(isInternalPath("/es/picker?return_to=x")).toBe(true);
    expect(isInternalPath("/")).toBe(true);
  });

  // Every one of these is an open redirect if it reaches a `redirect()`.
  it("rejects anything that could leave this origin", () => {
    for (const bad of [
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example/x",
      "\\\\evil.example\\x",
      "javascript:alert(1)",
      "http://localhost:5000/x",
    ]) {
      expect(isInternalPath(bad)).toBe(false);
    }
  });

  it("rejects a relative path with no leading slash", () => {
    expect(isInternalPath("picker")).toBe(false);
    expect(isInternalPath("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd Z:/Github/aeleos/apps/hub && pnpm test
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `apps/hub/src/features/picker/domain/return-to.ts`:

```ts
/** Schemes a redirect target may use. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Whether the picker may send someone to this URL when they are done.
 *
 * Compares the **parsed origin** — scheme, host and port together — against an
 * exact allowlist. String matching is what makes
 * `https://puck.furrycolombia.com.evil.example` look allowed under
 * `startsWith` and `https://evil.puck.furrycolombia.com` look allowed under
 * `endsWith`, so neither is used.
 *
 * A URL carrying credentials is refused outright even if its origin matches:
 * the userinfo before the `@` is what a browser shows first, so handing one
 * back would let an allowed origin decorate a link that goes elsewhere.
 *
 * The allowed origins arrive as a parameter rather than being read here,
 * because this file is in `domain/` and may not reach into infrastructure —
 * which also means it is testable without mocking the environment.
 *
 * @param candidate - the caller-supplied URL, entirely untrusted.
 * @param allowed - exact origins, as `env.allowedReturnOrigins` supplies them.
 * @returns true only when the parsed origin matches one of them exactly.
 */
export function isAllowedReturnTo(
  candidate: string,
  allowed: readonly string[],
): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (!SAFE_PROTOCOLS.has(url.protocol)) return false;
  if (url.username !== "" || url.password !== "") return false;

  return allowed.includes(url.origin);
}

/**
 * Whether a value is a path on this origin, safe to redirect to after sign-in.
 *
 * A different problem from {@link isAllowedReturnTo} and deliberately stricter:
 * this destination must never leave the hub, so anything that could resolve to
 * another origin is refused rather than matched. `//host`, `/\host` and a
 * backslash-prefixed path all navigate off-origin in at least one browser, so
 * the second character is checked, not just the first.
 *
 * @param candidate - the caller-supplied destination, entirely untrusted.
 * @returns true only for a rooted, same-origin path.
 */
export function isInternalPath(candidate: string): boolean {
  if (!candidate.startsWith("/")) return false;
  // "//host" and "/\host" both leave the origin.
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return false;
  return true;
}
```

Create `apps/hub/src/features/picker/index.ts` exporting both, with a barrel TSDoc explaining that the picker feature owns the redirect guards because it is the only thing that redirects anywhere a caller chose.

- [ ] **Step 4: Add the environment variable**

In `apps/hub/src/shared/infrastructure/env.ts`, add `AELEOS_ALLOWED_RETURN_ORIGINS: z.string()` to the schema, `allowedReturnOrigins: string[]` to `Env`, the split-and-trim in `readEnv`, the `process.env` read in `loadEnv`, and a getter on `env` alongside the existing two.

Use `z.string()` — **not** `.min(1)`. An empty allowlist must be a valid configuration that allows nothing, so a deployment with the picker unused does not fail to boot. `isAllowedReturnTo` already returns false for every candidate against an empty list, and Step 1 tests that.

Append to `apps/hub/.env.example`:

```bash
# Comma-separated origins the picker may redirect back to.
# Exact origin match — scheme, host and port together. No wildcards, no
# subdomain matching. Empty means the picker refuses every return_to.
AELEOS_ALLOWED_RETURN_ORIGINS=http://localhost:5000
```

Add a test to `apps/hub/tests/env.test.ts` for the parsing: a comma list with whitespace, and the empty string yielding `[]`.

- [ ] **Step 5: Run the tests**

```bash
cd Z:/Github/aeleos/apps/hub && pnpm test:coverage
```

Expected: all pass, coverage still 100/100/100/100.

- [ ] **Step 6: Verify by sabotage — twice**

**a.** Replace the origin comparison with `allowed.some((o) => candidate.startsWith(o))`. Expected: **"rejects a host that merely starts with an allowed one" reddens.** Restore.

**b.** In `isInternalPath`, drop the `//` and `/\` check so only the leading slash is tested. Expected: **"rejects anything that could leave this origin" reddens.** Restore.

Record both exactly. These two lines are the whole of the open-redirect defence.

- [ ] **Step 7: Commit**

```bash
cd Z:/Github/aeleos
git add apps/hub/src/features/picker apps/hub/src/shared/infrastructure/env.ts apps/hub/.env.example apps/hub/tests
git commit -m "feat(hub): add the two redirect guards the picker needs

Two surfaces, two different problems. return_to leaves the hub for
another app, so it is checked against an exact origin allowlist — scheme,
host and port compared as a parsed whole, because startsWith admits
puck.furrycolombia.com.evil.example and endsWith admits
evil.puck.furrycolombia.com. The post-sign-in destination stays inside the
hub, so it is refused unless it is a rooted same-origin path; //host and
/\\host both leave the origin, so the second character is checked too.

A URL carrying credentials is refused even when its origin matches. The
userinfo before the @ is what a browser shows first, so handing one back
would let an allowed origin decorate a link that goes somewhere else.

The guards live in domain/ and take the allowlist as a parameter rather
than reading env, because domain may not reach into infrastructure — which
also makes them testable without mocking the environment.

The allowlist may be empty, and an empty one allows nothing. A deployment
that does not use the picker should not fail to boot.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Carry the destination through sign-in

**Files:**

- Modify: `apps/hub/src/shared/infrastructure/request-locale.ts`, `apps/hub/src/app/[locale]/sign-in/[[...sign-in]]/page.tsx`
- Test: `apps/hub/tests/request-locale.test.ts`, `apps/hub/tests/sign-in-destination.test.ts`

**Interfaces:**

- Consumes: `isInternalPath` from `@/features/picker`.
- Produces: `signInUrlFor(pathname, base, search?)` carrying a `redirect_url` query parameter; the sign-in page honouring it.

**Why this task exists.** Verified against production: `GET /picker?return_to=…` while signed out answers `307 → /es/sign-in` with the query string **dropped**, and the sign-in page then sends everyone to `/{locale}/me`. Without this, the picker works only for someone already signed into the hub — which is not the person an app is sending over.

- [ ] **Step 1: Write the failing tests**

Extend `apps/hub/tests/request-locale.test.ts` with cases proving `signInUrlFor` appends the original path **and query** as a single `redirect_url` parameter, correctly encoded, and that it omits the parameter when the destination is just `/`.

Create `apps/hub/tests/sign-in-destination.test.ts` covering a `resolveAfterSignInUrl(raw, locale)` helper:

```ts
import { describe, expect, it } from "vitest";
import { resolveAfterSignInUrl } from "@/shared/infrastructure/request-locale";

describe("resolveAfterSignInUrl", () => {
  it("returns the requested internal destination", () => {
    expect(resolveAfterSignInUrl("/es/picker?return_to=x", "es")).toBe(
      "/es/picker?return_to=x",
    );
  });

  it("falls back to the profile when nothing was requested", () => {
    expect(resolveAfterSignInUrl(null, "es")).toBe("/es/me");
    expect(resolveAfterSignInUrl("", "en")).toBe("/en/me");
  });

  // The whole point. A destination arriving in a query string is attacker
  // input, and sending someone to it after authenticating is the classic
  // post-login open redirect.
  it("falls back rather than leaving this origin", () => {
    for (const bad of [
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example/x",
      "javascript:alert(1)",
      "picker",
    ]) {
      expect(resolveAfterSignInUrl(bad, "es")).toBe("/es/me");
    }
  });
});
```

- [ ] **Step 2: Run and watch it fail**, then implement.

`signInUrlFor` gains an optional `search` argument and appends
`?redirect_url=<encoded pathname+search>` when the destination is not already
the profile. `resolveAfterSignInUrl(raw, locale)` returns `raw` when
`isInternalPath(raw)` is true and `/{locale}/me` otherwise — **never** throwing,
because an unauthenticated visitor with a malformed URL must still be able to
sign in.

Update `proxy.ts` to pass `request.nextUrl.search` into `signInUrlFor`, and the
sign-in page to read `redirect_url` from its `searchParams` and pass
`resolveAfterSignInUrl(...)` as `afterSignInUrl` to both `SignInForm` and
`SsoCallback`.

- [ ] **Step 3: Verify by sabotage**

Change `resolveAfterSignInUrl` to return `raw ?? \`/${locale}/me\``without the`isInternalPath` check. Expected: **"falls back rather than leaving this origin"
reddens on every case.** Restore and confirm green. This is a post-login open
redirect and the test is the only thing standing on it.

- [ ] **Step 4: Run every gate and commit**

```bash
cd Z:/Github/aeleos && pnpm lint && pnpm typecheck
cd apps/hub && pnpm test:coverage && pnpm build
```

Commit with a message explaining that the destination is carried through
sign-in, that it is validated as internal on the way out rather than trusted,
and that this was found by tracing a signed-out visitor from another app.

---

### Task 3: The picker

**Files:**

- Create: `apps/hub/src/features/picker/presentation/picker-grid.tsx`, `apps/hub/src/app/[locale]/(app)/picker/page.tsx`, `apps/hub/src/app/[locale]/(app)/picker/actions.ts`
- Modify: `apps/hub/src/features/picker/index.ts`, both message catalogues
- Test: `apps/hub/tests/picker-page.test.tsx`, `apps/hub/tests/picker-actions.test.ts`

**Interfaces:**

- Consumes: `listMyActors`, `ActorTile` from `@/features/actors`; `isAllowedReturnTo` from `@/features/picker/domain/return-to`; `env.allowedReturnOrigins`.
- Produces: `GET /[locale]/picker?return_to=<url>&app=<name>`, and `chooseActorAction` redirecting to `return_to?actor_ref=<uuid>`.

**Note the boundary:** `features/picker` may **not** import `@/features/actors` — features must not import each other. The **page** is in `app/`, which may import both barrels; it fetches the actors and passes them to `PickerGrid` as props. Keep the feature-to-feature dependency out of the features.

- [ ] **Step 1: Add message keys to both catalogues**

`picker.title`, `picker.subtitleFor` (taking an `{app}` placeholder), `picker.subtitleGeneric`, `picker.refused`, `picker.refusedHint`, `picker.choose`. Run `pnpm --filter hub test` before writing any component — a missing Spanish key is cheaper to find now.

- [ ] **Step 2: Refuse before rendering**

The page validates `return_to` **before** it renders anything. When it is missing or not allowed, render the refusal message and **no tiles** — do not render a grid whose every link is dead, and do not echo the rejected URL back into the page, which would make the hub a reflected-content surface for an attacker's string.

`app` is attacker-controlled too. It is rendered as a name, so pass it through next-intl's placeholder interpolation (which escapes) and cap its length; never render it as markup or into an attribute.

- [ ] **Step 3: The action**

`chooseActorAction` re-validates `return_to` against the allowlist — the hidden field is not trusted — resolves the chosen `actor_ref` against `listMyActors()` so a caller cannot hand back an actor they do not own, refuses a non-`active` actor, then redirects to `return_to?actor_ref=<uuid>` using `next/navigation`'s `redirect` (the target is external, so the locale-aware wrapper is wrong here — say so in a comment, because every other redirect in this app is the other kind).

- [ ] **Step 4: Tests**

`picker-page.test.tsx`: no `return_to` → refusal, no tiles; a disallowed `return_to` → refusal, no tiles, and the rejected URL absent from the output; an allowed one → tiles, person first.
`picker-actions.test.ts`: a valid choice redirects with `actor_ref` appended; a tampered `return_to` is refused; an `actor_ref` the caller does not own is refused; a suspended actor is refused.

**Verify by sabotage:** drop the re-validation in the action and confirm the tampered-`return_to` test reddens; drop the ownership resolution and confirm the not-owned test reddens.

- [ ] **Step 5: Gates and commit.**

---

### Task 4: The sync endpoint

**Files:**

- Create: `apps/hub/src/app/api/actors/mine/route.ts`
- Test: `apps/hub/tests/api-actors-mine.test.ts`

**Interfaces:**

- Consumes: `listMyActors` from `@/features/actors`, `auth` from `@clerk/nextjs/server`.
- Produces: `GET /api/actors/mine` → `200 { actors: Actor[] }` or `401`.

- [ ] **Step 1: Write the failing test**, covering: the caller's actors returned; `401` with `listMyActors` **not called** when unauthenticated; the body containing no `owner_ref`/`identity_sub` under any spelling; `cache-control: no-store` set; and **no `Access-Control-Allow-Origin` header present** — the absence is deliberate and a test is what keeps someone from "helpfully" adding one.

- [ ] **Step 2: Implement.** Auth first, then read. `no-store`, because a cached actor list is a stale identity.

- [ ] **Step 3: Confirm the route is outside the protected shell.** It lives at `app/api/...`, not under `[locale]/(app)`, so the layout's `auth.protect()` does not cover it — its own `auth()` check is the only gate. Verify by sabotage: remove the `userId` check and confirm the 401 test reddens.

- [ ] **Step 4: Check the proxy matcher actually reaches it.** `proxy.ts`'s matcher includes `"/(api|trpc)(.*)"`. Confirm an unauthenticated request returns **401 JSON** rather than a 307 to sign-in — an API that redirects to HTML is useless to a server-side caller, and this is exactly the kind of thing that only shows up when someone integrates. If it redirects, add the route to `PUBLIC_ROUTES` so its own `auth()` check answers instead, and test that.

- [ ] **Step 5: Gates and commit.**

---

### Task 5: Integrator documentation and end-to-end coverage

**Files:**

- Create: `docs/integrating.md`
- Modify: `README.md`, `CLAUDE.md`
- Test: `apps/hub/tests/e2e/picker.spec.ts`

- [ ] **Step 1: Write `docs/integrating.md`** with four sections:

1. **Sync the user's actors** — the `fetch` with `Authorization: Bearer <the user's own token>`, **server-side only**. State plainly that there is no CORS and why: the response is a person's complete actor list, so making it browser-readable would turn an XSS in any consuming app into a disclosure of every user's fursonas from every app. There is no shared secret and no service account; authorization is the user's own token, so a caller can only ever read their own actors.
2. **Send the user to the picker** — the URL shape, that `return_to` must be an exact origin match, and that a maintainer must add the origin before it works.
3. **Verify what comes back — not optional.** `actor_ref` arrives in a query string and anyone can edit it. Look it up in the app's own mirror, confirm it belongs to the signed-in person, and confirm it is active. Show the check, and show what _not_ to do.
4. **Re-prompt when the choice may be stale** — an actor can be suspended or deleted after the choice was made.

- [ ] **Step 2: Add the e2e spec.** Playwright, covering the refusal cases without a session (no `return_to`, disallowed `return_to`), since those need no sign-in. Note in the file what is **not** covered — the signed-in choose-and-return journey — rather than pretending otherwise; the existing suite is anonymous-only and adding a signed-in fixture is its own piece of work.

- [ ] **Step 3: Update `README.md` and `CLAUDE.md`** to describe the handoff as it now exists, and link `docs/integrating.md`.

- [ ] **Step 4: Run every gate**, including `pnpm test:db`, and commit.

---

## Done when

- A signed-out person sent from another app to `/picker?return_to=…` signs in and lands back on the picker with `return_to` intact — the journey Task 2 exists for.
- `pnpm lint` rejects a `domain/` file importing infrastructure, and the two redirect guards are each verified by sabotage.
- An unauthenticated `GET /api/actors/mine` returns **401 JSON**, not a redirect.
- No response, redirect or rendered page contains `owner_ref` or `identity_sub`.
- `docs/integrating.md` tells an integrator to treat `actor_ref` as a suggestion, in its own section.
- Both suites are 100/100/100/100 with no threshold lowered.
