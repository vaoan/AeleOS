# Hub Layering and the Identity Package — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape `apps/hub/src` into `features/` + `shared/` with enforced
boundaries, then extract the Clerk→Supabase plumbing into `packages/identity`
(`@aeleos/identity`) that the hub consumes via `workspace:*`.

**Architecture:** Two features (`session`, `actors`), each with an `index.ts`
public API and layers created only as earned; everything shell-shaped goes to
`shared/`. The package takes `getToken` as a **parameter** so it never imports
Clerk, Next, or React — which is what keeps the `identity_sub` escape hatch real.

**Tech Stack:** pnpm workspaces, TypeScript (strict), Next 16, React 19, Vitest,
`@supabase/supabase-js`, ESLint flat config.

**Source spec:** `docs/superpowers/specs/2026-08-12-hub-layering-and-contract-seam-design.md`

**Out of scope:** Phase 1b-ii (fursonas + picker) has its own plan,
`2026-08-02-phase-1b-ii-fursonas-and-picker.md`, and is built onto the shape
this plan produces. Publishing to npm waits for Puck's integration.

## Global Constraints

- **Tasks 1–4 are move-only.** `check:docs` compares by file path and ignores
  added symbols, so a moved file reads as new and the doc-freshness gate goes
  **silent**. A commit that both moves a file and changes its behaviour carries
  that change past the gate unexamined. Move and update imports; change nothing
  else. Behaviour changes go in Tasks 6–9.

  **One sanctioned exception:** Task 3 deletes `sign-in-card.tsx`. It is not a
  behaviour change — nothing imports the file, so no code path loses anything —
  and `check:docs` ignores deleted symbols by design, so nothing slips past the
  gate. Decided by the repo owner on 2026-08-12. There are no other exceptions;
  if a task tempts you toward one, stop and report it.

- **All 148 existing tests stay green through Tasks 1–5.** A red test there
  means a move went wrong; never adjust a test to match a move except for its
  import paths. Tasks 7–9 deliberately add package tests and rewrite two hub
  test files, and each says exactly what it expects afterwards.
- **Never lower a coverage threshold.** `apps/hub/vitest.config.ts` documents
  the ratchet: it goes up, never down. If coverage drops, the fix is a test.
- **Every export carries TSDoc stating the contract, not the types.** `pnpm lint`
  fails without it. Moved code keeps its existing TSDoc verbatim.
- **Every export is tested on its happy path and each failure mode.** A test
  guarding already-correct behaviour must be verified by sabotage: break the
  code, watch it go red, restore.
- **Filenames are kebab-case** (`.ls-lint.yml` enforces this).
- **Branch from an explicit base:** `git checkout -b <name> origin/main`. Verify
  with `git log --oneline origin/main..HEAD` before pushing.
- **Do not commit secrets.** `.secrets` and `.env.local` are gitignored.

## Target File Structure

```
apps/hub/src/
├── app/                                       paths unchanged; imports updated
├── features/
│   ├── session/
│   │   ├── application/use-clerk-appearance.ts
│   │   ├── infrastructure/clerk-appearance.ts
│   │   ├── infrastructure/providers.ts
│   │   ├── infrastructure/public-routes.ts
│   │   ├── presentation/provider-marks.tsx
│   │   ├── presentation/sign-in-card.tsx
│   │   ├── presentation/sign-in-form.tsx
│   │   ├── presentation/sign-out-button.tsx
│   │   ├── presentation/sso-callback.tsx
│   │   ├── presentation/user-menu.tsx
│   │   └── index.ts
│   └── actors/
│       ├── infrastructure/actors.ts
│       └── index.ts
├── shared/
│   ├── application/nebula-noise.ts
│   ├── application/nebula-preference.ts
│   ├── application/theme.ts
│   ├── infrastructure/env.ts
│   ├── infrastructure/fonts.ts
│   ├── infrastructure/i18n/{messages/en.json,messages/es.json,navigation.ts,request.ts,routing.ts}
│   ├── infrastructure/request-locale.ts
│   ├── infrastructure/supabase-server.ts
│   ├── infrastructure/test-id.ts
│   └── presentation/{html-lang,language-toggle,nebula-canvas,nebula-toggle,page-shell,star-toggle,theme-toggle}.tsx
└── proxy.ts

packages/identity/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/{index.ts,client.ts,actors.ts}
└── tests/{client.test.ts,actors.test.ts}
```

**Why `session` and `actors` and nothing else.** `/me`, fursonas and the picker
are one domain — the actor model — so fursonas extends `actors` rather than
becoming a third feature. The nebula, theme and locale toggles own no domain
concept and are used by every page, so they are `shared/presentation`, not a
feature.

**Where the tricky ones go.** `nebula-noise.ts` is pure computation, not a
component, so it is `shared/application` alongside `theme.ts` and
`nebula-preference.ts`. `supabase-server.ts` starts in
`shared/infrastructure` and thins to a four-line adapter in Task 9.

---

### Task 1: Move `shared/infrastructure`

**Files:**

- Move: `apps/hub/src/lib/{env,fonts,request-locale,test-id,supabase-server}.ts` → `apps/hub/src/shared/infrastructure/`
- Move: `apps/hub/src/i18n/` → `apps/hub/src/shared/infrastructure/i18n/`
- Modify: `apps/hub/next.config.ts` (the next-intl plugin path)
- Modify: `apps/hub/vitest.config.ts` (coverage `include`)
- Modify: every importer listed in Step 3

**Interfaces:**

- Consumes: nothing.
- Produces: `@/shared/infrastructure/env` exporting `env: Env` and
  `readEnv(raw: Record<string, string | undefined>): Env`;
  `@/shared/infrastructure/supabase-server` exporting
  `createServerClient(): Promise<SupabaseClient>`;
  `@/shared/infrastructure/test-id` ; `@/shared/infrastructure/i18n/routing`
  exporting `routing`; `@/shared/infrastructure/i18n/navigation`.

- [ ] **Step 1: Widen the coverage include before moving anything**

`apps/hub/vitest.config.ts` currently reads `include: ["src/lib/**/*.ts", "e2e-target.ts"]`.
When `src/lib/` empties, that glob matches nothing and coverage silently stops
measuring. Widen it first so every intermediate commit is honest:

```ts
      include: [
        "src/lib/**/*.ts",
        "src/features/**/*.ts",
        "src/shared/**/*.ts",
        "e2e-target.ts",
      ],
```

Leave `exclude` as it is for now. `src/lib/**` is removed from this list in
Task 5, once nothing is left there.

- [ ] **Step 2: Move the files with `git mv`**

Use `git mv` rather than create-and-delete, so the rename is visible in review.

```bash
cd apps/hub
mkdir -p src/shared/infrastructure
git mv src/lib/env.ts             src/shared/infrastructure/env.ts
git mv src/lib/fonts.ts           src/shared/infrastructure/fonts.ts
git mv src/lib/request-locale.ts  src/shared/infrastructure/request-locale.ts
git mv src/lib/test-id.ts         src/shared/infrastructure/test-id.ts
git mv src/lib/supabase-server.ts src/shared/infrastructure/supabase-server.ts
git mv src/i18n                   src/shared/infrastructure/i18n
```

`src/shared/infrastructure/i18n/request.ts` imports `./routing` and
`./messages/${locale}.json` relatively. The whole folder moves together, so
those keep working untouched — do not rewrite them.

- [ ] **Step 3: Rewrite the import paths**

Exact replacements, all of them:

| Old specifier           | New specifier                             | Files                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/lib/env`             | `@/shared/infrastructure/env`             | `src/lib/supabase-server.ts` (now moved), `tests/env.test.ts`                                                                                                                                                                                                   |
| `@/lib/fonts`           | `@/shared/infrastructure/fonts`           | `src/app/layout.tsx`                                                                                                                                                                                                                                            |
| `@/lib/request-locale`  | `@/shared/infrastructure/request-locale`  | `src/proxy.ts`, `tests/request-locale.test.ts`                                                                                                                                                                                                                  |
| `@/lib/supabase-server` | `@/shared/infrastructure/supabase-server` | `src/lib/actors.ts`, `tests/actors.test.ts` (inside `vi.mock(...)`)                                                                                                                                                                                             |
| `@/lib/test-id`         | `@/shared/infrastructure/test-id`         | `src/app/[locale]/(app)/error.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/sign-in/[[...sign-in]]/page.tsx`, `src/components/{language-toggle,page-shell,sign-in-form,sign-out-button,star-toggle,theme-toggle}.tsx`                                    |
| `@/i18n/navigation`     | `@/shared/infrastructure/i18n/navigation` | `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/page.tsx`, `src/components/language-toggle.tsx`                                                                                                                                                          |
| `@/i18n/routing`        | `@/shared/infrastructure/i18n/routing`    | `src/app/[locale]/layout.tsx`, `src/components/language-toggle.tsx`, `src/lib/public-routes.ts`, `src/shared/infrastructure/request-locale.ts`, `src/proxy.ts`, `tests/language-toggle.test.tsx`, `tests/public-routes.test.ts`, `tests/request-locale.test.ts` |
| `@/i18n/messages/`      | `@/shared/infrastructure/i18n/messages/`  | `tests/messages.test.ts`                                                                                                                                                                                                                                        |

Verify none were missed:

```bash
cd apps/hub && grep -rn "@/lib/\(env\|fonts\|request-locale\|test-id\|supabase-server\)\|@/i18n/" src tests
```

Expected: no output.

- [ ] **Step 4: Point the next-intl plugin at the new path**

`apps/hub/next.config.ts` names the request file explicitly. Without this the
build fails to find the i18n config.

```ts
const withNextIntl = createNextIntlPlugin(
  "./src/shared/infrastructure/i18n/request.ts",
);
```

- [ ] **Step 5: Run the full check**

```bash
cd apps/hub && pnpm typecheck && pnpm test:coverage && pnpm build
```

Expected: typecheck clean, 148 tests pass, coverage thresholds met
(branches ≥98, functions 100, lines 100, statements ≥99), build succeeds.

If coverage reports fewer than 14 files, the include glob is wrong.

- [ ] **Step 6: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "refactor(hub): move shared infrastructure out of lib and i18n

Move-only. env, fonts, request-locale, test-id, supabase-server and the
whole i18n folder become src/shared/infrastructure, and next.config.ts
follows the request file to its new path. Coverage include is widened to
span both the old and new locations so no commit in this series measures
nothing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Move `shared/application` and `shared/presentation`

**Files:**

- Move: `apps/hub/src/lib/{nebula-noise,nebula-preference,theme}.ts` → `apps/hub/src/shared/application/`
- Move: `apps/hub/src/components/{html-lang,language-toggle,nebula-canvas,nebula-toggle,page-shell,star-toggle,theme-toggle}.tsx` → `apps/hub/src/shared/presentation/`
- Modify: importers listed in Step 2

**Interfaces:**

- Consumes: `@/shared/infrastructure/test-id`, `@/shared/infrastructure/i18n/*` from Task 1.
- Produces: `@/shared/presentation/page-shell` exporting `PageShell`;
  `@/shared/presentation/nebula-canvas` exporting `NebulaCanvas` and
  `NEBULA_CHANGE_EVENT`; `@/shared/application/theme` ;
  `@/shared/application/nebula-preference` exporting `NEBULA_STORAGE_KEY` and
  `resolveNebula`.

- [ ] **Step 1: Move the files**

```bash
cd apps/hub
mkdir -p src/shared/application src/shared/presentation
git mv src/lib/nebula-noise.ts      src/shared/application/nebula-noise.ts
git mv src/lib/nebula-preference.ts src/shared/application/nebula-preference.ts
git mv src/lib/theme.ts             src/shared/application/theme.ts
for f in html-lang language-toggle nebula-canvas nebula-toggle page-shell star-toggle theme-toggle; do
  git mv "src/components/$f.tsx" "src/shared/presentation/$f.tsx"
done
```

`sign-in-card.tsx` stays in `src/components/` for now — it belongs to
`session` and moves in Task 3.

- [ ] **Step 2: Rewrite the import paths**

| Old specifier                  | New specifier                            | Files                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/lib/nebula-noise`           | `@/shared/application/nebula-noise`      | `src/shared/presentation/nebula-canvas.tsx`, `tests/nebula-noise.test.ts`                                                                                                                      |
| `@/lib/nebula-preference`      | `@/shared/application/nebula-preference` | `src/shared/presentation/nebula-canvas.tsx`, `src/shared/presentation/nebula-toggle.tsx`, `tests/nebula-preference.test.ts`                                                                    |
| `@/lib/theme`                  | `@/shared/application/theme`             | `src/app/layout.tsx`, `src/shared/presentation/theme-toggle.tsx`, `tests/theme.test.ts`                                                                                                        |
| `@/components/html-lang`       | `@/shared/presentation/html-lang`        | `src/app/[locale]/layout.tsx`                                                                                                                                                                  |
| `@/components/language-toggle` | `@/shared/presentation/language-toggle`  | `src/shared/presentation/page-shell.tsx`, `tests/language-toggle.test.tsx`                                                                                                                     |
| `@/components/nebula-canvas`   | `@/shared/presentation/nebula-canvas`    | `src/app/layout.tsx`, `src/shared/presentation/nebula-toggle.tsx`                                                                                                                              |
| `@/components/nebula-toggle`   | `@/shared/presentation/nebula-toggle`    | `src/shared/presentation/page-shell.tsx`                                                                                                                                                       |
| `@/components/page-shell`      | `@/shared/presentation/page-shell`       | `src/app/[locale]/(app)/error.tsx`, `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/(app)/me/page.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/sign-in/[[...sign-in]]/page.tsx` |
| `@/components/star-toggle`     | `@/shared/presentation/star-toggle`      | `src/shared/presentation/nebula-toggle.tsx`, `tests/star-toggle.test.tsx`                                                                                                                      |
| `@/components/theme-toggle`    | `@/shared/presentation/theme-toggle`     | `src/shared/presentation/page-shell.tsx`, `tests/theme-toggle.test.tsx`                                                                                                                        |

Verify:

```bash
cd apps/hub && grep -rn "@/lib/\(nebula-noise\|nebula-preference\|theme\)\|@/components/\(html-lang\|language-toggle\|nebula-canvas\|nebula-toggle\|page-shell\|star-toggle\|theme-toggle\)" src tests
```

Expected: no output.

- [ ] **Step 3: Run the full check**

```bash
cd apps/hub && pnpm typecheck && pnpm test:coverage && pnpm build
```

Expected: 148 tests pass, thresholds met, build succeeds.

- [ ] **Step 4: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "refactor(hub): move the chrome into shared application and presentation

Move-only. The nebula, theme and locale toggles own no domain concept and
are used by every page, so they are shared/presentation rather than a
feature. nebula-noise is pure computation, not a component, so it sits in
shared/application beside theme and nebula-preference.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Create `features/session`

**Files:**

- Move: `apps/hub/src/lib/{clerk-appearance,providers,public-routes}.ts` → `apps/hub/src/features/session/infrastructure/`
- Move: `apps/hub/src/components/use-clerk-appearance.ts` → `apps/hub/src/features/session/application/`
- Move: `apps/hub/src/components/{provider-marks,sign-in-form,sign-out-button,sso-callback,user-menu}.tsx` → `apps/hub/src/features/session/presentation/`
- Delete: `apps/hub/src/components/sign-in-card.tsx` (dead code — see Step 4)
- Create: `apps/hub/src/features/session/index.ts`
- Modify: `apps/hub/vitest.config.ts` (coverage `exclude`)

**Interfaces:**

- Consumes: `@/shared/infrastructure/test-id`, `@/shared/infrastructure/i18n/routing`.
- Produces: `@/features/session` re-exporting `SignInForm`, `SsoCallback`,
  `SignOutControl`, `UserMenu`, `isPublicRoute`, `PROVIDERS`, and the types
  `SignInFormProps`, `SsoCallbackProps`, `SignOutControlProps`, `Provider`.

**Note the name:** the file is `sign-out-button.tsx` but the component it
exports is `SignOutControl`. Use the real name; renaming either one is a
behaviour change and does not belong in a move-only commit.

- [ ] **Step 1: Move the files**

```bash
cd apps/hub
mkdir -p src/features/session/{application,infrastructure,presentation}
git mv src/lib/clerk-appearance.ts src/features/session/infrastructure/clerk-appearance.ts
git mv src/lib/providers.ts        src/features/session/infrastructure/providers.ts
git mv src/lib/public-routes.ts    src/features/session/infrastructure/public-routes.ts
git mv src/components/use-clerk-appearance.ts src/features/session/application/use-clerk-appearance.ts
for f in provider-marks sign-in-form sign-out-button sso-callback user-menu; do
  git mv "src/components/$f.tsx" "src/features/session/presentation/$f.tsx"
done
```

`sign-in-card.tsx` is deliberately left behind — Step 4 decides whether it moves
or goes. `src/components/` is emptied at the end of Step 4, not here.

- [ ] **Step 2: Rewrite the intra-feature import paths**

Within the feature, keep absolute `@/features/session/...` specifiers rather
than relative ones — this matches Libra's "absolute for cross-directory" rule
and survives further moves.

| Old specifier                       | New specifier                                         | Files                                                                                                    |
| ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@/lib/clerk-appearance`            | `@/features/session/infrastructure/clerk-appearance`  | `src/features/session/application/use-clerk-appearance.ts`, `tests/clerk-appearance.test.ts`             |
| `@/lib/providers`                   | `@/features/session/infrastructure/providers`         | `src/features/session/presentation/sign-in-form.tsx`, `src/app/[locale]/sign-in/[[...sign-in]]/page.tsx` |
| `@/lib/public-routes`               | `@/features/session/infrastructure/public-routes`     | `src/proxy.ts`, `tests/public-routes.test.ts`                                                            |
| `@/components/use-clerk-appearance` | `@/features/session/application/use-clerk-appearance` | `src/features/session/presentation/user-menu.tsx`, and `sign-in-card.tsx` if Step 4 keeps it             |
| `@/components/provider-marks`       | `@/features/session/presentation/provider-marks`      | `src/features/session/presentation/sign-in-form.tsx`                                                     |
| `@/components/sign-in-form`         | `@/features/session` (barrel — see Step 4)            | `src/app/[locale]/sign-in/[[...sign-in]]/page.tsx`, `tests/sign-in-form.test.tsx`                        |
| `@/components/sso-callback`         | `@/features/session` (barrel)                         | `src/app/[locale]/sign-in/[[...sign-in]]/page.tsx`                                                       |
| `@/components/sign-out-button`      | `@/features/session` (barrel)                         | `src/app/[locale]/(app)/me/page.tsx`, `tests/sign-out-button.test.tsx`                                   |
| `@/components/user-menu`            | `@/features/session` (barrel)                         | `src/app/[locale]/(app)/layout.tsx`                                                                      |

- [ ] **Step 3: Write the barrel**

Create `apps/hub/src/features/session/index.ts`:

```ts
/**
 * The session feature's public API — signing in, signing out, and deciding
 * which routes need a session at all.
 *
 * Everything outside this feature imports from here and never from a file
 * inside it. That is what lets the layers below be rearranged without a
 * caller noticing, and it is enforced by ESLint rather than by convention.
 */
export {
  SignInForm,
  type SignInFormProps,
} from "@/features/session/presentation/sign-in-form";
export {
  SsoCallback,
  type SsoCallbackProps,
} from "@/features/session/presentation/sso-callback";
export {
  SignOutControl,
  type SignOutControlProps,
} from "@/features/session/presentation/sign-out-button";
export { UserMenu } from "@/features/session/presentation/user-menu";
export { isPublicRoute } from "@/features/session/infrastructure/public-routes";
export {
  PROVIDERS,
  type Provider,
} from "@/features/session/infrastructure/providers";
```

`SignInCard` and the three `*Mark` components are deliberately **not** exported:
they are used inside the feature, and a barrel that re-exports everything is a
barrel that enforces nothing.

- [ ] **Step 4: Decide what to do about `SignInCard`**

`src/components/sign-in-card.tsx` exports `SignInCard`, and **nothing imports
it** — not a route, not a test, not another component. It is dead code that
survived because `check:tools` runs `knip --no-exit-code`, so an unused export
has never failed a build.

Confirm it is still true before acting:

```bash
cd Z:/Github/aeleos && grep -rn "sign-in-card\|SignInCard" --include=*.ts --include=*.tsx --include=*.json apps/hub | grep -v node_modules
```

Expected: one line, the export itself.

**Decided 2026-08-12: delete it.** The sign-in page composes `SignInForm`
inside `PageShell` directly, so this component duplicates a job already done,
and moving dead code into a new structure would give it a permanence it has not
earned.

If the grep above returns **more than one line**, the situation has changed
since the decision — stop and report it rather than deleting a component that
now has a consumer.

```bash
cd apps/hub
git rm src/components/sign-in-card.tsx
rmdir src/components
```

`use-clerk-appearance.ts` was `sign-in-card.tsx`'s only other consumer besides
`user-menu.tsx`, which still uses it — so nothing else becomes dead as a result.
Confirm after deleting:

```bash
cd Z:/Github/aeleos && grep -rn "useClerkAppearance" apps/hub/src
```

Expected: two lines — the definition, and `user-menu.tsx` using it.

`rmdir` fails loudly if anything is left behind — that is the point. If it
fails, a file was missed in Task 2 or here.

`src/proxy.ts` keeps importing
`@/features/session/infrastructure/public-routes` directly for now — Task 5
forbids that and moves it to the barrel. Update it to the new path here so the
tree compiles.

- [ ] **Step 5: Keep coverage measuring exactly the same files**

**`src/features/**/*.ts` matches `.tsx` files too.** This is not a typo and not
intuition — Vitest calls picomatch with `{ contains: true }`, which makes the
pattern a substring match rather than one that must consume the whole filename,
so `…/sign-in-form.tsx` matches a `*.ts` glob. Task 2 hit this: moving seven
`.tsx` components under `src/shared/` collapsed coverage from 99% to **60.72%**
and failed all four thresholds. Verified by removing the exclusion and running
the suite.

So the six `.tsx` components you just moved into
`src/features/session/presentation/` will be swept into the coverage
denominator unless excluded — as will the barrel (re-exports only) and
`use-clerk-appearance.ts` (a React hook, the same category as the `.tsx` files
coverage already skips).

`exclude` already carries the first four entries below — Tasks 1 and 2 added
them. Add the last three:

```ts
      exclude: [
        "src/app/**",
        "src/shared/infrastructure/fonts.ts",
        "src/shared/infrastructure/i18n/**",
        "src/shared/presentation/**",
        "src/features/*/presentation/**",
        "src/features/*/index.ts",
        "src/features/session/application/use-clerk-appearance.ts",
      ],
```

None of this widens what is measured — every excluded path names a file that
was outside `src/lib/` before the restructure and so was never measured. The
covered set stays the same 14 files. **Do not lower a threshold to make
coverage pass**; if it fails, an exclusion is missing.

- [ ] **Step 6: Run the full check**

```bash
cd apps/hub && pnpm typecheck && pnpm test:coverage && pnpm build
```

Expected: 148 tests pass; coverage still reports **14 files**; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "refactor(hub): gather the sign-in flow into features/session

The Clerk appearance, the provider list, the route matcher and the sign-in
components become one feature behind an index.ts, so callers depend on the
barrel rather than on where a component happens to live.

Deletes SignInCard, which nothing imported — not a route, not a test, not
another component. It survived because check:tools runs knip with
--no-exit-code, so an unused export has never failed a build. The sign-in
page composes SignInForm inside PageShell directly, so the component
duplicated a job already done; moving it into the new structure would have
given it a permanence it had not earned.

The coverage exclusions grow by two entries rather than the covered set
growing: the barrel is re-exports and use-clerk-appearance is a hook, both
of which are the same category as the .tsx files coverage already skips.
The measured set is the same 14 files as before.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Create `features/actors`

**Files:**

- Move: `apps/hub/src/lib/actors.ts` → `apps/hub/src/features/actors/infrastructure/actors.ts`
- Create: `apps/hub/src/features/actors/index.ts`
- Modify: `apps/hub/src/app/[locale]/(app)/me/page.tsx`, `apps/hub/tests/actors.test.ts`

**Interfaces:**

- Consumes: `@/shared/infrastructure/supabase-server` exporting `createServerClient`.
- Produces: `@/features/actors` re-exporting `ensurePersonActor(): Promise<string>`,
  `getPersonActor(actorRef: string): Promise<PersonActor | null>`, and the type
  `PersonActor` (`{ id, actorRef, handle, displayName, avatarUrl }`).

- [ ] **Step 1: Move the file**

```bash
cd apps/hub
mkdir -p src/features/actors/infrastructure
git mv src/lib/actors.ts src/features/actors/infrastructure/actors.ts
rmdir src/lib
```

`rmdir src/lib` must succeed — it is the proof that every file found a home. If
it fails, list what is left and place it before continuing.

- [ ] **Step 2: Write the barrel**

Create `apps/hub/src/features/actors/index.ts`:

```ts
/**
 * The actor feature's public API — the person actor behind /me.
 *
 * Fursonas and the picker join this feature rather than becoming their own:
 * a person actor and a fursona actor are rows in the same table under the same
 * ownership ledger, so splitting them would put `actor_ref` in two features'
 * domains and force the cross-feature import the boundary rules forbid.
 */
export {
  ensurePersonActor,
  getPersonActor,
  type PersonActor,
} from "@/features/actors/infrastructure/actors";
```

- [ ] **Step 3: Update the importers**

- `src/app/[locale]/(app)/me/page.tsx`: `@/lib/actors` → `@/features/actors`
- `tests/actors.test.ts`: `@/lib/actors` → `@/features/actors/infrastructure/actors`
  (the test targets the implementation, not the barrel)

Verify nothing still points at `src/lib`:

```bash
cd apps/hub && grep -rn "@/lib/\|@/components/" src tests
```

Expected: no output.

- [ ] **Step 4: Run the full check**

```bash
cd apps/hub && pnpm typecheck && pnpm test:coverage && pnpm build
```

Expected: 148 tests pass, 14 files covered, build succeeds.

- [ ] **Step 5: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "refactor(hub): give the actor model its own feature

Move-only, and the last of them: src/lib and src/components are now gone.
/me, fursonas and the picker are one domain, so the barrel is written to
receive fursonas rather than to describe only what exists today.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Enforce the boundaries

**Files:**

- Modify: `eslint.config.mjs` (append four config objects before the closing `]`)
- Modify: `apps/hub/vitest.config.ts` (drop the dead `src/lib/**` glob)
- Modify: `knip.json`, `.ls-lint.yml`
- Modify: `apps/hub/src/proxy.ts`

**Interfaces:**

- Consumes: the structure from Tasks 1–4.
- Produces: no new exports. Rules only.

- [ ] **Step 1: Prove the rules are needed before adding them**

The sabotage check runs first, so you see the rule catch something real rather
than trusting it. Add a deliberately illegal import to
`src/features/actors/infrastructure/actors.ts`:

```ts
import { PROVIDERS } from "@/features/session";
```

Run `cd Z:/Github/aeleos && pnpm lint`. Expected right now: **passes** — nothing
forbids it yet. That is the gap this task closes. Leave the bad import in place
for Step 3.

- [ ] **Step 2: Add the boundary rules**

**Read this before writing the config.** ESLint flat config **replaces**
`no-restricted-imports` when a later block's `files` glob also matches — it does
not merge the `patterns` arrays. So a general block for `apps/hub/src/**` plus a
specific one for `apps/hub/src/features/session/**` means session files get
_only_ the specific rule, and the general one is silently gone. Verified with a
throwaway project: two blocks, two patterns, only the second ever fired.

The consequence: **every block below repeats the relative-import pattern.** That
is duplication on purpose. Do not "clean it up" into a shared base block.

Append to `eslint.config.mjs`, immediately before the closing `];`:

```js
  // Import boundaries. Each block repeats the "../" pattern because flat config
  // REPLACES no-restricted-imports for overlapping globs rather than merging
  // it — factoring the shared pattern into its own block silently disables it
  // everywhere a more specific block matches.
  //
  // Adding a feature means adding a block here and naming it in the others.
  // Two features make that clearer than a plugin; revisit at four.
  {
    files: ["apps/hub/src/features/session/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Reach sideways with an absolute @/ import. A ../ chain breaks the moment a file moves.",
            },
            {
              group: ["@/features/actors", "@/features/actors/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/hub/src/features/actors/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Reach sideways with an absolute @/ import. A ../ chain breaks the moment a file moves.",
            },
            {
              group: ["@/features/session", "@/features/session/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
          ],
        },
      ],
    },
  },

  // Routes and the proxy reach a feature through its barrel. A deep import pins
  // the caller to where a file happens to live, which is what the barrel exists
  // to prevent.
  {
    files: ["apps/hub/src/app/**/*.{ts,tsx}", "apps/hub/src/proxy.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Reach sideways with an absolute @/ import. A ../ chain breaks the moment a file moves.",
            },
            {
              group: ["@/features/*/*"],
              message:
                "Import a feature through its barrel: @/features/<name>.",
            },
          ],
        },
      ],
    },
  },

  // shared/ knows nothing about any feature — the dependency rule, in the one
  // direction that must never invert.
  {
    files: ["apps/hub/src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Reach sideways with an absolute @/ import. A ../ chain breaks the moment a file moves.",
            },
            {
              group: ["@/features", "@/features/**"],
              message:
                "shared/ must not depend on a feature — that inverts the dependency rule. Pass what it needs in as a prop or a parameter.",
            },
          ],
        },
      ],
    },
  },

  // A package knows nothing about any app. This is the boundary that lets
  // packages/identity be published to repositories that have no apps/hub.
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "**/apps/**"],
              message:
                "Packages must not depend on apps. Dependencies flow one way: apps import packages.",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 3: Watch the rule fire, then remove the sabotage**

```bash
cd Z:/Github/aeleos && pnpm lint
```

Expected: **fails**, naming `src/features/actors/infrastructure/actors.ts` with
the "Features must not import each other" message.

Now prove the repeated pattern survived — this is the specific thing the flat
config gotcha would break, and it fails silently if it is wrong. Add a second
sabotage to the same file:

```ts
import { env } from "../../../shared/infrastructure/env";
```

Re-run `pnpm lint`. Expected: **two** errors on that file — the cross-feature
one and "Reach sideways with an absolute @/ import." If only the cross-feature
error appears, the `../*` pattern was dropped by an overlapping block; go back
and check every block repeats it.

Now delete both sabotage imports and re-run:

```bash
cd Z:/Github/aeleos && pnpm lint
```

Expected: passes.

- [ ] **Step 4: Move proxy.ts onto the barrel**

`src/proxy.ts` still deep-imports `@/features/session/infrastructure/public-routes`,
which the rule from Step 2 now forbids. Change it to:

```ts
import { isPublicRoute } from "@/features/session";
```

Re-run `pnpm lint` — expected: passes.

- [ ] **Step 5: Drop the dead coverage glob**

`src/lib/` no longer exists. In `apps/hub/vitest.config.ts` remove
`"src/lib/**/*.ts"` from `include`, leaving:

```ts
      include: [
        "src/features/**/*.ts",
        "src/shared/**/*.ts",
        "e2e-target.ts",
      ],
```

- [ ] **Step 6: Update knip and ls-lint**

`knip.json` names `src/middleware.ts` as an entry point. That file does not
exist — it was renamed `proxy.ts` for Next 16 and the config was never
followed. Fix it while here, and add the barrels as entry points so knip does
not report every re-export as unused:

```json
    "apps/hub": {
      "entry": [
        "src/app/**/*.tsx",
        "src/proxy.ts",
        "src/features/*/index.ts",
        "next.config.ts",
        "vitest.config.ts",
        "playwright.config.ts",
        "tests/**/*.test.{ts,tsx}",
        "tests/e2e/**/*.spec.ts"
      ],
      "project": ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"]
    }
```

`.ls-lint.yml` already covers `apps/hub/src` recursively, so the new folders
need no entry. Confirm with `pnpm ls-lint`.

- [ ] **Step 7: Run every gate**

```bash
cd Z:/Github/aeleos
pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:tools && pnpm check:docs origin/main
cd apps/hub && pnpm test:coverage && pnpm build
```

Expected: all pass, 148 tests, 14 files covered.

- [ ] **Step 8: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "refactor(hub): enforce the feature boundaries in ESLint

The structure from the previous four commits is only a convention until
something checks it. Four rules: features may not import each other,
everything outside a feature goes through its barrel, shared/ may not
depend on a feature, and packages may not depend on apps.

Verified by sabotage — an actors-imports-session line passes lint before
these rules and fails after, naming the file and the reason.

Also fixes a knip entry that pointed at src/middleware.ts, a path that has
not existed since the Next 16 rename to proxy.ts.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Scaffold `packages/identity`

**Files:**

- Create: `packages/identity/package.json`, `packages/identity/tsconfig.json`, `packages/identity/vitest.config.ts`, `packages/identity/src/index.ts`
- Modify: `pnpm-workspace.yaml`, root `package.json`, `knip.json`, `.ls-lint.yml`, `.github/workflows/db-tests.yml`

**Interfaces:**

- Consumes: nothing.
- Produces: the workspace package `@aeleos/identity`, importable as
  `@aeleos/identity` once a consumer declares `"@aeleos/identity": "workspace:*"`.

- [ ] **Step 1: Add `packages/*` to the workspace**

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*

onlyBuiltDependencies:
  - esbuild
  - supabase
```

- [ ] **Step 2: Write the package manifest**

`packages/identity/package.json`. It is `private: true` for now — publishing
waits for Puck's integration, and a package that can be published by accident
before its interface is proven is the thing the spec's "dogfood before publish"
decision exists to prevent.

```json
{
  "name": "@aeleos/identity",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "peerDependencies": {
    "@supabase/supabase-js": "^2.110.0"
  },
  "devDependencies": {
    "@supabase/supabase-js": "^2.110.0"
  }
}
```

`@supabase/supabase-js` is a peer dependency so the consuming app owns the
version — two copies of the client in one bundle is a real failure mode. It is
repeated under `devDependencies` so the package's own tests can resolve it.

- [ ] **Step 3: Write the TypeScript config**

`packages/identity/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
  "exclude": ["node_modules"]
}
```

`"lib"` deliberately omits `dom`: this package runs on a server and in a
browser, and a `dom` lib would let a browser-only global compile here and fail
in a consumer.

- [ ] **Step 4: Write the test config**

`packages/identity/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      reporter: ["text-summary"],
      // Pure logic with no framework in the way, so there is no reason for any
      // of these to be below 100. If a branch cannot be reached, delete it
      // rather than lowering the floor.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
```

- [ ] **Step 5: Write a placeholder barrel**

`packages/identity/src/index.ts`:

```ts
/**
 * The identity contract every Furry Colombia app depends on.
 *
 * This package deliberately imports no framework — not Next, not React, and
 * above all not Clerk. The caller supplies a `getToken` function, so the code
 * here never learns which provider issued the token it forwards. That is what
 * keeps swapping the issuer a one-column `identity_sub` backfill rather than a
 * change to every app on the platform.
 */
export {};
```

- [ ] **Step 6: Wire the package into the repo's checks**

Root `package.json` — extend `typecheck`:

```json
    "typecheck": "tsc --noEmit && pnpm --filter hub typecheck && pnpm --filter @aeleos/identity typecheck",
```

`knip.json` — add the workspace beside the existing two:

```json
    "packages/identity": {
      "entry": ["src/index.ts", "tests/**/*.test.ts"],
      "project": ["src/**/*.ts", "tests/**/*.ts"]
    }
```

`.ls-lint.yml` — add under `ls:`:

```yaml
packages/identity/src:
  .ts: kebab-case

packages/identity/tests:
  .ts: kebab-case
```

`.github/workflows/db-tests.yml` — add one line to the **existing `hub` job**,
after `pnpm --filter hub test:coverage`:

```yaml
- run: pnpm --filter @aeleos/identity test:coverage
```

Add it to that job rather than creating a new one: `conformance`, `hub` and
`idp-cloud` are the three required checks on `main`, and a new job would not be
required until someone changes branch protection by hand — a green PR that
never ran the package tests is worse than no job at all.

- [ ] **Step 7: Install and verify**

```bash
cd Z:/Github/aeleos
pnpm install
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: install links the new workspace; all three pass.

- [ ] **Step 8: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "feat(identity): scaffold the @aeleos/identity workspace package

Empty but wired: workspace membership, strict TS without the dom lib,
vitest at 100 percent thresholds, and typecheck, knip, ls-lint and CI all
pointed at it. The package test run joins the existing hub job rather than
adding a job, because only conformance, hub and idp-cloud are required
checks and a job outside that set would let a PR go green without it.

Private for now. Publishing waits for Puck, so the interface is proven by
a real consumer before a second repository can pin a version.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `createIdentityClient` in the package

**Files:**

- Create: `packages/identity/src/client.ts`, `packages/identity/tests/client.test.ts`
- Modify: `packages/identity/src/index.ts`

**Interfaces:**

- Consumes: `@supabase/supabase-js` (`createClient`, `SupabaseClient`).
- Produces: `createIdentityClient(options: IdentityClientOptions): SupabaseClient`;
  `type GetToken = () => Promise<string | null>`;
  `interface IdentityClientOptions { getToken: GetToken; url: string; anonKey: string }`.

- [ ] **Step 1: Write the failing test**

`packages/identity/tests/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({}) as unknown);
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

const { createIdentityClient } = await import("../src/client");

/** The options object passed to `createClient`, as this package builds it. */
type Passed = {
  auth: { persistSession: boolean; autoRefreshToken: boolean };
  accessToken: () => Promise<string | null>;
};

/**
 * Builds a client and hands back the third argument `createClient` received.
 *
 * @param getToken - the token source under test.
 * @returns the options object the package constructed.
 */
function optionsFor(getToken: () => Promise<string | null>): Passed {
  createClient.mockClear();
  createIdentityClient({
    getToken,
    url: "https://x.supabase.co",
    anonKey: "k",
  });
  return createClient.mock.calls[0]![2] as Passed;
}

describe("createIdentityClient", () => {
  it("passes the url and key through to Supabase", () => {
    createClient.mockClear();
    createIdentityClient({
      getToken: async () => "t",
      url: "https://x.supabase.co",
      anonKey: "k",
    });
    expect(createClient.mock.calls[0]![0]).toBe("https://x.supabase.co");
    expect(createClient.mock.calls[0]![1]).toBe("k");
  });

  // There is no Supabase session — Supabase trusts the issuer directly — so a
  // persisted session would be a second, stale source of identity.
  it("holds no session of its own", () => {
    const opts = optionsFor(async () => "t");
    expect(opts.auth.persistSession).toBe(false);
    expect(opts.auth.autoRefreshToken).toBe(false);
  });

  // A callback rather than a resolved value: resolving once would pin the
  // client to whatever token was valid at construction, and every later
  // request would send an expired one.
  it("asks for a fresh token on every call", async () => {
    let calls = 0;
    const opts = optionsFor(async () => `token-${++calls}`);
    expect(await opts.accessToken()).toBe("token-1");
    expect(await opts.accessToken()).toBe("token-2");
  });

  it("yields null when there is no token, rather than undefined", async () => {
    const opts = optionsFor(async () => null);
    expect(await opts.accessToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/identity && pnpm test
```

Expected: FAIL — `Cannot find module '../src/client'`.

- [ ] **Step 3: Write the implementation**

`packages/identity/src/client.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supplies the current caller's access token, or null when nobody is signed in.
 *
 * A function rather than a string on purpose: it is invoked per request, so a
 * refreshed token is used and an expired one is never reused.
 */
export type GetToken = () => Promise<string | null>;

/** What a caller must supply to reach its own Supabase project. */
export interface IdentityClientOptions {
  /** The caller's token source. */
  getToken: GetToken;
  /** The Supabase project URL. */
  url: string;
  /** The project's anon key. */
  anonKey: string;
}

/**
 * A Supabase client that authenticates as the signed-in person.
 *
 * There is no Supabase session: the project trusts the token issuer directly
 * via Third-Party Auth, so the caller's token is forwarded and RLS resolves the
 * person from it.
 *
 * **This function never learns which provider issued the token.** `getToken` is
 * a parameter, so swapping the issuer changes the caller and nothing here —
 * which is what keeps that migration a one-column `identity_sub` backfill
 * rather than a change to every app that depends on this package.
 *
 * @param options - the token source and the project to reach.
 * @returns a client that attaches a freshly-read token to every request.
 */
export function createIdentityClient(
  options: IdentityClientOptions,
): SupabaseClient {
  const { getToken, url, anonKey } = options;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => (await getToken()) ?? null,
  });
}
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/identity && pnpm test:coverage
```

Expected: 4 tests pass, coverage 100% on `src/client.ts`.

- [ ] **Step 5: Verify by sabotage**

Two sabotages, one per invariant. Run each, watch it go red, restore it.

**a. Break the null contract.** Change `?? null` to `?? undefined`:

```ts
    accessToken: async () => (await getToken()) ?? undefined,
```

Expected: "yields null when there is no token" goes **red**. Restore.

**b. Break the per-request read.** Resolve the token once at construction:

```ts
export function createIdentityClient(
  options: IdentityClientOptions,
): SupabaseClient {
  const { getToken, url, anonKey } = options;
  const once = getToken();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => (await once) ?? null,
  });
}
```

Expected: "asks for a fresh token on every call" goes **red** — it returns
`token-1` twice. Restore.

A test never seen red proves nothing, and (b) guards the invariant that
actually breaks in production: an expired token on every request after the
first.

- [ ] **Step 6: Export it**

`packages/identity/src/index.ts` — replace `export {};` with:

```ts
export {
  createIdentityClient,
  type GetToken,
  type IdentityClientOptions,
} from "./client";
```

The file-level TSDoc block at the top of `index.ts` stays as written in Task 6.

- [ ] **Step 7: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "feat(identity): add createIdentityClient

The Clerk-to-Supabase plumbing, with the provider taken out of it: getToken
is a parameter, so this code never learns who issued the token it forwards.
That is the whole point — it keeps swapping the issuer a one-column
identity_sub backfill instead of a change to every app on the platform.

accessToken stays a callback rather than a resolved value. Resolving once
pins the client to whatever was valid at construction, and the test that
asks for two tokens in a row is what holds that open.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Actor accessors in the package

**Files:**

- Create: `packages/identity/src/actors.ts`, `packages/identity/tests/actors.test.ts`
- Modify: `packages/identity/src/index.ts`

**Interfaces:**

- Consumes: `SupabaseClient` from `@supabase/supabase-js`.
- Produces: `ensurePersonActor(client: SupabaseClient): Promise<string>`;
  `getPersonActor(client: SupabaseClient, actorRef: string): Promise<PersonActor | null>`;
  `type PersonActor = { id: string; actorRef: string; handle: string; displayName: string | null; avatarUrl: string | null }`.

The difference from the hub's current version is exactly one thing: the client
arrives as a **parameter** instead of being constructed inside. Copy the
existing bodies and TSDoc from
`apps/hub/src/features/actors/infrastructure/actors.ts` verbatim otherwise.

- [ ] **Step 1: Write the failing test**

`packages/identity/tests/actors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePersonActor, getPersonActor } from "../src/actors";

/**
 * A Supabase client stub that answers one `rpc` call.
 *
 * @param result - what `rpc` resolves to.
 * @returns a stub typed as a client.
 */
const rpcClient = (result: {
  data?: unknown;
  error?: { message: string } | null;
}) =>
  ({
    rpc: async () => ({ data: null, error: null, ...result }),
  }) as unknown as SupabaseClient;

/**
 * A Supabase client stub that answers one `.from().select().eq().single()`.
 *
 * @param result - what `single` resolves to.
 * @returns a stub typed as a client.
 */
const rowClient = (result: {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null, ...result }),
        }),
      }),
    }),
  }) as unknown as SupabaseClient;

describe("ensurePersonActor", () => {
  it("returns the actor_ref the database derived", async () => {
    expect(await ensurePersonActor(rpcClient({ data: "act_abc" }))).toBe(
      "act_abc",
    );
  });

  it("throws when provisioning fails, naming the cause", async () => {
    await expect(
      ensurePersonActor(rpcClient({ error: { message: "RLS denied" } })),
    ).rejects.toThrow(/RLS denied/);
  });

  // Casting instead would hand the caller null typed as a string, and /me
  // would render an empty platform ID as though provisioning had succeeded.
  it("throws when neither a ref nor an error comes back", async () => {
    await expect(ensurePersonActor(rpcClient({ data: null }))).rejects.toThrow(
      /no actor_ref/i,
    );
    await expect(ensurePersonActor(rpcClient({ data: "" }))).rejects.toThrow(
      /no actor_ref/i,
    );
  });
});

describe("getPersonActor", () => {
  const row = {
    id: "11111111-1111-1111-1111-111111111111",
    actor_ref: "act_abc",
    handle: "aeleos",
    display_name: "Aeleos",
    avatar_url: null,
  };

  it("maps the row into the client-safe shape", async () => {
    expect(await getPersonActor(rowClient({ data: row }), "act_abc")).toEqual({
      id: row.id,
      actorRef: "act_abc",
      handle: "aeleos",
      displayName: "Aeleos",
      avatarUrl: null,
    });
  });

  it("defaults the nullable columns rather than yielding undefined", async () => {
    const sparse = { ...row, display_name: null, avatar_url: null };
    const actor = await getPersonActor(rowClient({ data: sparse }), "act_abc");
    expect(actor?.displayName).toBeNull();
    expect(actor?.avatarUrl).toBeNull();
  });

  // Absence and failure are different answers. Only "no rows" is absence.
  it("returns null when no row matches", async () => {
    expect(
      await getPersonActor(
        rowClient({ error: { code: "PGRST116", message: "no rows" } }),
        "act_abc",
      ),
    ).toBeNull();
  });

  it("throws on any error that is not no-rows", async () => {
    await expect(
      getPersonActor(
        rowClient({ error: { code: "42501", message: "permission denied" } }),
        "act_abc",
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("returns null when the row is absent without an error", async () => {
    expect(
      await getPersonActor(rowClient({ data: null }), "act_abc"),
    ).toBeNull();
  });

  // A truncated projection type-checks and renders blank. These three are
  // NOT NULL in the schema, so their absence means the view changed.
  it("throws when a NOT NULL column is missing from the projection", async () => {
    const truncated = { actor_ref: "act_abc", handle: "aeleos" };
    await expect(
      getPersonActor(rowClient({ data: truncated }), "act_abc"),
    ).rejects.toThrow(/incomplete/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/identity && pnpm test
```

Expected: FAIL — `Cannot find module '../src/actors'`.

- [ ] **Step 3: Write the implementation**

`packages/identity/src/actors.ts` — the bodies are copied from
`apps/hub/src/features/actors/infrastructure/actors.ts`, with `client` taken as
a parameter and the `createServerClient` import dropped:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A person's actor, as exposed by the `actors_public` view.
 *
 * Never carries `owner_ref` or `identity_sub`. Those are absent from the view
 * by construction, which is what makes this shape safe to hand to a client.
 */
export type PersonActor = {
  id: string;
  actorRef: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** PostgREST's code for "`.single()` matched no rows" — an answer, not a fault. */
const NO_ROWS = "PGRST116";

/**
 * Ensures the signed-in person has an actor row, returning its `actor_ref`.
 *
 * Idempotent and safe to call on every request: the database derives the ref
 * deterministically from the identity claim and returns the stored value.
 *
 * @param client - a client authenticated as the person being provisioned.
 * @returns the person's stable platform ID.
 * @throws when provisioning fails, or when it reports neither a ref nor an
 * error — which would otherwise hand the caller an empty ID typed as a string.
 */
export async function ensurePersonActor(
  client: SupabaseClient,
): Promise<string> {
  const { data, error } = await client.rpc("ensure_person_actor");
  if (error)
    throw new Error(`Could not provision person actor: ${error.message}`);
  if (typeof data !== "string" || data.length === 0)
    throw new Error("Provisioning returned no actor_ref");
  return data;
}

/**
 * Reads a person actor through the safe projection. Null when not found.
 *
 * Only "no rows" becomes null. Every other error is rethrown: an RLS denial, a
 * dropped connection or a missing view are faults, and collapsing them into
 * null would render a blank identity while reporting success. Absence and
 * failure are different answers, and anything added here must keep them apart.
 *
 * @param client - a client authenticated as the reader.
 * @param actorRef - the platform ID to look up, as returned by
 * {@link ensurePersonActor}.
 * @returns the actor, or null when no row matches.
 * @throws on any failure that is not "no rows matched", and when a NOT NULL
 * column is missing from the row — which means the view changed, not that data
 * is absent.
 */
export async function getPersonActor(
  client: SupabaseClient,
  actorRef: string,
): Promise<PersonActor | null> {
  const { data, error } = await client
    .from("actors_public")
    .select("id, actor_ref, handle, display_name, avatar_url")
    .eq("actor_ref", actorRef)
    .single();

  if (error) {
    if (error.code === NO_ROWS) return null;
    throw new Error(`Could not read person actor: ${error.message}`);
  }
  if (!data) return null;

  const { id, actor_ref, handle } = data;
  if (
    typeof id !== "string" ||
    typeof actor_ref !== "string" ||
    typeof handle !== "string"
  )
    throw new Error(`Person actor row is incomplete for actor_ref ${actorRef}`);

  return {
    id,
    actorRef: actor_ref,
    handle,
    displayName: (data.display_name as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/identity && pnpm test:coverage
```

Expected: 12 tests pass (4 from Task 7 plus 8 here), coverage 100% across all
four metrics.

- [ ] **Step 5: Verify by sabotage**

Change `if (error.code === NO_ROWS) return null;` to `return null;` — collapsing
every failure into absence, which is the exact defect the TSDoc warns about.

Expected: "throws on any error that is not no-rows" goes **red**. Restore and
confirm green.

- [ ] **Step 6: Export them**

`packages/identity/src/index.ts`, appended below the client exports:

```ts
export { ensurePersonActor, getPersonActor, type PersonActor } from "./actors";
```

- [ ] **Step 7: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "feat(identity): move the actor accessors into the package

The client arrives as a parameter instead of being constructed inside; the
bodies are otherwise the hub's, unchanged. They belong here because every
app copies the canonical actor schema, so every app runs these same two
queries — and getPersonActor's distinction between absence and failure is
worth deriving once rather than per app.

Eight tests, each failure mode included, and the no-rows branch verified by
sabotage: collapsing every error into null turns it red.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The hub adopts the package

**Files:**

- Modify: `apps/hub/package.json`, `apps/hub/src/shared/infrastructure/supabase-server.ts`, `apps/hub/src/features/actors/infrastructure/actors.ts`, `apps/hub/src/features/actors/index.ts`
- Modify: `apps/hub/tests/actors.test.ts`, `apps/hub/tests/supabase-client.test.ts`
- Modify: `apps/hub/next.config.ts`

**Interfaces:**

- Consumes: `@aeleos/identity` exporting `createIdentityClient`,
  `ensurePersonActor(client)`, `getPersonActor(client, actorRef)`, `PersonActor`.
- Produces: `@/shared/infrastructure/supabase-server` still exporting
  `createServerClient(): Promise<SupabaseClient>`, and `@/features/actors` still
  exporting `ensurePersonActor()`, `getPersonActor(actorRef)`, `PersonActor` —
  **the hub's own signatures do not change**, so no route file is touched.

- [ ] **Step 1: Declare the dependency**

`apps/hub/package.json`, under `dependencies`:

```json
    "@aeleos/identity": "workspace:*",
```

Then:

```bash
cd Z:/Github/aeleos && pnpm install
```

- [ ] **Step 2: Transpile the workspace package**

The package ships TypeScript source, not a build. Next must transpile it.
`apps/hub/next.config.ts`:

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@aeleos/identity"],
};
```

- [ ] **Step 3: Thin the Supabase factory to an adapter**

`apps/hub/src/shared/infrastructure/supabase-server.ts` becomes the one place
that knows the hub uses Clerk:

```ts
import { auth } from "@clerk/nextjs/server";
import { createIdentityClient } from "@aeleos/identity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/shared/infrastructure/env";

/**
 * Supabase client for Server Components and Route Handlers.
 *
 * The plumbing lives in `@aeleos/identity`, which takes `getToken` as a
 * parameter and therefore never learns the issuer is Clerk. This function is
 * the adapter that supplies it — the only file in the hub that names both
 * sides, and so the only one a change of issuer would touch.
 *
 * @returns a client that authenticates as the signed-in person.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const { getToken } = await auth();
  return createIdentityClient({
    getToken,
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
  });
}
```

- [ ] **Step 4: Thin the actor accessors to adapters**

`apps/hub/src/features/actors/infrastructure/actors.ts` — the bodies now live in
the package; what remains binds them to the hub's client:

```ts
import {
  ensurePersonActor as ensure,
  getPersonActor as read,
  type PersonActor,
} from "@aeleos/identity";
import { createServerClient } from "@/shared/infrastructure/supabase-server";

export type { PersonActor };

/**
 * Ensures the signed-in person has an actor row, returning its `actor_ref`.
 *
 * Idempotent and safe to call on every request. The behaviour and its failure
 * modes are the package's; this supplies the hub's authenticated client.
 *
 * @returns the person's stable platform ID.
 * @throws when provisioning fails or returns no ref.
 */
export async function ensurePersonActor(): Promise<string> {
  return ensure(await createServerClient());
}

/**
 * Reads a person actor through the safe projection. Null when not found.
 *
 * Absence and failure stay distinct — see `@aeleos/identity`. This supplies the
 * hub's authenticated client and nothing else.
 *
 * @param actorRef - the platform ID to look up.
 * @returns the actor, or null when no row matches.
 * @throws on any failure that is not "no rows matched".
 */
export async function getPersonActor(
  actorRef: string,
): Promise<PersonActor | null> {
  return read(await createServerClient(), actorRef);
}
```

- [ ] **Step 5: Reduce the hub's tests to what the hub still owns**

The failure-mode coverage moved to `packages/identity/tests/actors.test.ts` in
Task 8. Duplicating it here would test the package twice and the adapter never.

Replace the body of `apps/hub/tests/actors.test.ts` with two tests that assert
only the wiring:

```ts
import { describe, expect, it, vi } from "vitest";

const client = { marker: "hub-client" };
vi.mock("@/shared/infrastructure/supabase-server", () => ({
  createServerClient: vi.fn(async () => client),
}));

const ensure = vi.fn(async () => "act_abc");
const read = vi.fn(async () => null);
vi.mock("@aeleos/identity", () => ({
  ensurePersonActor: (...a: unknown[]) => ensure(...a),
  getPersonActor: (...a: unknown[]) => read(...a),
}));

const actors = await import("@/features/actors/infrastructure/actors");

describe("the hub's actor adapters", () => {
  // The whole job of this layer is handing the package a client that carries
  // the hub's Clerk token. Passing the wrong one, or none, would authenticate
  // as nobody and RLS would return an empty result rather than an error.
  it("gives the package the hub's authenticated client", async () => {
    await actors.ensurePersonActor();
    expect(ensure).toHaveBeenCalledWith(client);
  });

  it("forwards the actor_ref alongside that client", async () => {
    await actors.getPersonActor("act_abc");
    expect(read).toHaveBeenCalledWith(client, "act_abc");
  });
});
```

`apps/hub/tests/supabase-client.test.ts` loses its assertions about
`persistSession` and the `accessToken` callback — those moved to the package in
Task 7 — and keeps only what the hub owns: that Clerk's `getToken` is the
function handed over. Replace its body with:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const getToken = vi.fn(async () => "clerk-token");
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ getToken })),
}));

const createIdentityClient = vi.fn(() => ({}) as unknown);
vi.mock("@aeleos/identity", () => ({
  createIdentityClient: (...a: unknown[]) => createIdentityClient(...a),
}));

vi.mock("@/shared/infrastructure/env", () => ({
  env: { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon-key" },
}));

const { createServerClient } =
  await import("@/shared/infrastructure/supabase-server");

describe("createServerClient", () => {
  beforeEach(() => createIdentityClient.mockClear());

  it("reaches the project named in the validated env", async () => {
    await createServerClient();
    expect(createIdentityClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://x.supabase.co",
        anonKey: "anon-key",
      }),
    );
  });

  // The one thing only this file can get wrong: it must hand over Clerk's
  // token *source*, not a token it already read. A resolved token goes stale
  // and RLS then answers as nobody — an empty result rather than an error,
  // which is a silent wrong answer.
  it("forwards Clerk's token source, so each call reads a fresh token", async () => {
    let n = 0;
    getToken.mockImplementation(async () => `clerk-token-${++n}`);
    await createServerClient();
    const passed = createIdentityClient.mock.calls[0]![0] as {
      getToken: () => Promise<string | null>;
    };
    expect(await passed.getToken()).toBe("clerk-token-1");
    expect(await passed.getToken()).toBe("clerk-token-2");
  });
});
```

Sabotage to verify the second test: make the adapter read the token eagerly.

```ts
const { getToken } = await auth();
const token = await getToken();
return createIdentityClient({
  getToken: async () => token,
  url: env.supabaseUrl,
  anonKey: env.supabaseAnonKey,
});
```

Expected: **red** — both calls return `clerk-token-1`. Restore. This is the
real bug the test exists for, not a reference-equality technicality.

- [ ] **Step 6: Re-measure the hub's coverage and raise the floor if it moved**

```bash
cd apps/hub && pnpm test:coverage
```

`actors.ts` and `supabase-server.ts` are now a handful of lines each with no
branches, so the hub's branch percentage will **rise**. Read the reported
figures and raise `thresholds` in `apps/hub/vitest.config.ts` to the new
measured floor — the config's own comment requires it: "Turning the ratchet is
part of the work; leaving it slack lets the next change quietly spend the
headroom." Never lower a number.

- [ ] **Step 7: Run every gate**

```bash
cd Z:/Github/aeleos
pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:tools && pnpm check:docs origin/main
cd apps/hub && pnpm test:coverage && pnpm build
cd ../../packages/identity && pnpm test:coverage
```

Expected: all pass. `check:docs` matters here — unlike Tasks 1–4 this task
**changes behaviour**, so the doc gate is awake and will flag any export whose
implementation moved without its TSDoc.

- [ ] **Step 8: Confirm the real integration still works**

The package is now between the hub and Supabase, and no unit test proves the
combination against a live token.

```bash
cd Z:/Github/aeleos && pnpm test:idp:cloud
```

Expected: passes — a real Clerk user resolves as `role=authenticated` against
the AeleOS Supabase project. If this fails, the adapter is wrong; do not
proceed.

- [ ] **Step 9: Commit**

```bash
cd Z:/Github/aeleos
git add -A
git commit -m "refactor(hub): consume @aeleos/identity

The hub becomes the package's first consumer, which is the point: the
interface gets proven by real use before Puck or Libra can pin a version.

supabase-server and the actor accessors thin to adapters. The hub's own
signatures are unchanged, so no route file moves — the only file that now
names both Clerk and Supabase is supabase-server.ts, which is exactly the
file a change of issuer should touch.

The hub's tests drop the failure-mode assertions that moved to the package
and keep what only the hub can get wrong: that the client handed over is
the one carrying the Clerk token. Verified end to end with test:idp:cloud
against a real token, since no unit test spans the seam.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done when

- `apps/hub/src/lib/` and `apps/hub/src/components/` no longer exist.
- `pnpm lint` fails if a feature imports another feature, if anything outside a
  feature deep-imports past its barrel, if `shared/` imports a feature, or if a
  package imports an app — each verified by sabotage.
- `packages/identity` has no dependency on Next, React, or Clerk. Check the
  imports and the manifest, not the prose — the package's own TSDoc names all
  three frameworks in order to disclaim them, so a bare word search matches
  that and reports a violation which is not one:

  ```bash
  grep -rnE 'from "(@clerk|next|react)' packages/identity/src
  grep -nE '"(@clerk|next|react)' packages/identity/package.json
  ```

  — expected: no output from either.

- `conformance`, `hub` and `idp-cloud` are green, with the package's tests
  running inside the `hub` job.
- Phase 1b-ii can begin by adding `domain/`, `application/` and `presentation/`
  under `src/features/actors/` without moving anything that exists.
