# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What AeleOS is

**AeleOS is the central identity provider for the Furry Colombia platform — the
"auth-only" layer that every app shares.** One person = one identity, one login,
across every Furry Colombia app (Puck, Libra, and everything that comes
next), all served under subdomains of `furrycolombia.com`.

The name is the founder's fursona _Aeleos_ + `OS` — because identity is the
operating system the whole platform runs on. In the platform's celestial naming
scheme (apps are moons: **Puck** = a moon of Uranus, **Janus** = a moon of
Saturn), **AeleOS is the star at the center they orbit** — which is literally the
dependency graph: everything depends on identity.

## The goal

Kill two long-standing pains at once:

1. **User-facing SSO** — a user logs in once and is already logged in across every
   app (no re-login when moving between them).
2. **Config dedup** — social login providers (Google, Discord, …) are configured
   in **one** place, not re-wired in every app's repo.

For **one shared community** (the same people use all the apps), where a person
should be a single identity everywhere.

## What this repo IS (and is NOT)

> **We do NOT build an identity provider. We DO ship exactly one app: the hub.**

The identity provider itself is **[Clerk](https://clerk.com)** — a managed IdP.
We **configure** an IdP; we do not build one. People never visit a Clerk-branded
address: the hub renders Clerk's components in its own pages, so sign-in happens
at `me.furrycolombia.com/sign-in` and Clerk's Frontend API is plumbing at
`clerk.furrycolombia.com`. (`id.furrycolombia.com` was Logto's hosted login page
and is **retired** — see `2026-08-11-hub-deployment-design.md`.)

The **hub** lives here, at `apps/hub` — a Next.js app where a person signs in
and manages their fursonas. It was originally planned as its own repository
(`aeleos-hub`); that changed on 2026-08-10 because the schema it reads lives
here, and two repositories issuing `supabase db push` at one database is two
sources of truth. See
`docs/superpowers/specs/2026-08-10-hub-in-aeleos-design.md`.

This repo is also the **home for the cross-app identity concern** that belongs
to no single app:

| Lives here                                                                                                 | Path / status                                |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Design & specs (architecture, decisions)                                                                   | `docs/superpowers/specs/`                    |
| Implementation plans (phased rollout)                                                                      | `docs/superpowers/plans/`                    |
| The hub app (fursona/profile registry, ownership ledger, actor picker)                                     | `apps/hub/` — the only deployable thing here |
| The handoff contract every consuming app codes against                                                     | `docs/integrating.md`                        |
| The canonical actor-model schema every app copies                                                          | `supabase/migrations/` — the root owns it    |
| Clerk configuration-as-code (connectors, apps, branding), exported for version control & disaster recovery | _added during implementation_                |
| The shared integration package — the Supabase-client and actor plumbing every app repeats                  | `packages/identity/` — `@aeleos/identity`    |

**Per-app integration code** (the OIDC client + Supabase third-party-auth wiring)
for the _other_ apps lives in **each app's own repo** (`puck`, `libra`, …) —
**not** here.

**The YAGNI gate on that package has fired.** It was held open until 2+ apps
needed it; Puck (Phase 1) and Libra (Phase 3) both already have a `packages/auth`
slot waiting for exactly this, so `packages/identity` now exists and `apps/hub`
consumes it through `workspace:*`. It stays **private and unpublished** until
Puck actually integrates — an interface designed against a hypothetical consumer
is a guess, and the cost of a wrong guess rises the moment a second repository
pins a version. Its one hard rule: **the package imports no framework, and above
all no Clerk.** `getToken` is a parameter, so the code never learns which
provider issued the token — which is what keeps the escape hatch a one-column
`identity_sub` backfill rather than a change to every app on the platform. That
is enforced in `eslint.config.mjs`, not trusted. Spec:
`docs/superpowers/specs/2026-08-12-hub-layering-and-contract-seam-design.md`.

**`apps/hub` ships no migrations.** `supabase/migrations/` at the root is the
single schema for the one database; never copy migrations into the app.

## Architecture & the decisions behind it

The full design is the source of truth — **read it before doing any work**:
`docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`.

Key choices and _why_:

- **IdP = Clerk (Logto was chosen first, then ruled out).** Supabase Third-Party
  Auth supports exactly Clerk, Firebase, Auth0, AWS Cognito and WorkOS — there is
  no Logto option and no generic OIDC one. Of those five, **Clerk alone has both
  Google and Discord as native connections**, which is what makes "configure
  social logins once" real. Free plan covers 50,000 monthly users at **$0**, and
  it is supported by the Supabase CLI so the conformance suite runs locally.
  The cost is real: **no self-host escape hatch** — none of the five is
  self-hostable. See `docs/superpowers/specs/2026-07-31-idp-decision-change.md`
  for the full reasoning, including why that loss is acceptable (the actor model
  already provides the exit: a one-column `identity_sub` backfill).
- **Each app keeps its own separate Supabase project/database.** Supabase couples
  Auth + DB in one project, and the existing apps already have their own
  production projects — so we do **not** merge databases. Instead each app's
  Supabase project uses **Supabase Third-Party Auth** to _trust_ Clerk; RLS keeps
  working, keyed to the Clerk identity (`auth.jwt()->>'sub'`).
- **The user ID is sacred (the most important rule).** The only genuinely
  expensive migration in any identity system is changing the ID that app data is
  keyed to. So every app stores a stable **`identity_sub`** column (Clerk's `sub`)
  and **never** lets its own data keys depend on the IdP — app-local tables keep
  their own local primary keys. Swapping the token issuer later is then a
  one-column backfill, not a data remap. **Never weaken this.**
- **SSO via the shared Clerk session**, not a hand-rolled shared cookie. All apps
  are subdomains of `furrycolombia.com`, so Clerk's session cookie covers them
  natively and additional apps sign the user in silently — no satellite-domain
  add-on required.
- **Social-login-first, no passwords** — consistent with the apps today, and it
  makes migration painless (no password hashes to move; users just re-link by
  email on next "Sign in with Google/Discord").

## Constraints (these shaped every decision — respect them)

- **Budget: $0. Not "low" — zero.** Confirmed 2026-08-09, superseding the
  earlier "~$20/year ceiling": **having to pay anything at all is a hard stop.**
  If a design needs a paid tier, a card on file, or a service that bills after a
  trial, that design is wrong — say so and find another way rather than
  proposing it and letting the cost surface later. GCP billing is switched off
  deliberately and permanently, so the GCP VM is not a deploy target any more
  (see `2026-08-05-repo-consolidation.md`, Task 5).
- **Near-zero ops.** Effectively one maintainer. Do not introduce fragile,
  self-run services without a strong reason; managed-and-boring beats clever.
- **Don't get trapped.** Every choice must keep a low-migration exit. Since no
  Supabase-supported IdP is self-hostable, the **sacred `identity_sub`** is now
  the _only_ thing carrying that guarantee — which makes it more important, not
  less.

## Phased rollout (do not skip Phase 0)

1. **Phase 0 — Stand up + de-risk.** Create the Clerk instance, configure Google +
   Discord connections, and **validate the Supabase⇄Clerk trust.** This was the
   one real technical unknown, and it is now **proven and continuously
   re-proven**: the `idp-cloud` CI job mints a real Clerk user, resolves it as
   `role=authenticated` against the AeleOS Supabase project, and runs
   `tests/idp/` on every pull request. (A Clerk development instance uses no
   custom domain; production DNS is Phase 1's job — `clerk.furrycolombia.com`,
   not `id.`.)
2. **Phase 1 — New / greenfield app (and Puck).** Integrate end-to-end to prove
   the pattern. Puck is safe to migrate early because it is **not yet in
   production**; note Puck's foundation `user_profiles` FKs to `auth.users(id)` and
   that FK must be reworked to the `identity_sub` model.
3. **Phase 3 — Libra (production — careful, its own plan).** Import users to
   Clerk by email, backfill `identity_sub` (no domain-data remap), switch to
   Third-Party Auth, verify in staging, keep a rollback path.

## References

- **Design spec (source of truth):**
  `docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`
- **Integrating another app (the handoff contract):** `docs/integrating.md` —
  written for a developer in Puck's or Libra's repository who has never seen
  this one. When the endpoint or the picker's contract changes, that file is
  the change, not a note about it.
- **IdP decision change (Logto → Clerk):**
  `docs/superpowers/specs/2026-07-31-idp-decision-change.md`
- **Clerk:** https://clerk.com — docs: https://clerk.com/docs
- **Supabase Third-Party Auth:** the mechanism each app uses to trust Clerk.
- **Sister repos (shared toolchain & conventions):** `Z:\Github\puck`,
  `Z:\Github\libra`. Consult them for tooling/CI/convention decisions and
  mirror their approach; AeleOS follows the same pnpm + strict-TS + ESLint +
  Prettier + kebab-case-filenames discipline once it grows code.

> ⚠️ **Libra is in production. Never run anything against its database.**
> Each app has its own separate Supabase project; never cross credentials between
> them, and never point any AeleOS/Clerk config at a production data project
> except as explicitly designed in the migration plan.

## Conventions

- **Secrets never in git.** Real values live in `.secrets` / provider dashboards /
  CI secrets. `.env`, `.secrets`, and raw IdP config dumps are gitignored — only
  sanitized/example config is committed (`.secrets.example`).
- **Filenames:** kebab-case (matching the sister projects).
- **Specs & plans:** follow the `docs/superpowers/{specs,plans}/YYYY-MM-DD-*.md`
  convention used across the platform (brainstorm → spec → plan → implement).
- **Every export carries TSDoc, and it states the contract — not the types.**
  TypeScript already has the types; repeating them is drift waiting to happen.
  Say what a caller may assume, what throws, what is idempotent, what is
  security-relevant. `pnpm lint` fails without it, and fails again if a
  parameter is renamed without its `@param`.
- **Every export is tested on its happy path and on each failure mode.** Branch
  coverage gates this — an untested error branch fails the build. A test that
  guards already-correct behaviour must be **verified by sabotage**: break the
  code, watch it go red, restore. A test never seen red proves nothing.
- **Every bug gets a regression test. No exceptions.** Finding the cause is half
  the work; the other half is a test that fails on the unfixed code. Write it
  before the fix where you can, and **sabotage-verify it against the original
  fault** either way — a regression test that never reproduced the bug is a
  guess about it.

  The test belongs at the level the bug actually lived at, which is rarely
  where it was noticed. `/pages` (then `/fursonas`) once threw for every signed-in visitor
  because `nuqs` shipped without its adapter, and the signed-in error boundary
  reported that as "we could not load your identity" — a message about the
  database, which was never involved. The regression test is not a nicer error
  page. It is `app-providers.test.tsx`, the one suite that does **not** mock
  `nuqs`, because every other suite mocked away the very thing that was
  missing.

  That is the lesson worth carrying: **a mocked dependency hides its own setup
  requirements.** When a bug turns out to be wiring a mock stood in for, the
  regression test has to use the real thing, and it will usually be the only
  test that does.

  **A second instance, 2026-08-16.** A section's drag handle had never worked —
  not by mouse, not by keyboard — since it was first written in commit
  `fa9d3dc`. `@hello-pangea/dnd` refuses to start a drag whose source event
  targets a tag it treats as interactive; the handle is a `<button>`; nothing
  set `disableInteractiveElementBlocking` on its `Draggable`. Lifting a
  section did nothing at all, silently, for every input method. It survived
  because the flat section editor's only coverage — `section-editor.test.tsx`,
  deleted along with that editor when the block editor replaced it — mocked
  `@hello-pangea/dnd` entirely and counted buttons by `aria-label`, wiring
  that passes whether or not a lift ever begins. The guard is now
  `tests/e2e/section-drag-reorder.spec.ts`, which drives a real drag by
  keyboard and is sabotage-verified against the original fault: removing the
  prop leaves the library's own `aria-live` announcement empty, because the
  lift never starts. Same lesson, same shape: the suite that mocked the
  dependency away is the one that could not have caught this, and the one
  that used the real thing did on its first run.

  The fix landed first in the flat editor's own card alone, and this note
  recorded `fursona-list.tsx` as still carrying the identical fault rather than
  leaving the next person to rediscover it. **It was then fixed in `#154`.**

  **The prop is gone, and the LESSON is not, which is why this note now says
  where the guard moved rather than which line sets it.** `@hello-pangea/dnd`
  is no longer a dependency — see the dragging bullet below — and dnd-kit has
  no interactive-tag rule at all: a grip is whatever element carries
  `listeners`. So the original fault cannot recur in that form, and the one
  that replaces it is the same shape with a different cause — a grip that
  renders, looks right, and was never handed the four things `useDraggable`
  returns. `block-slot.test.tsx` is where that is caught now, driving the real
  hook inside a real `DndContext` and carrying a deliberately unwired grip
  beside it as a permanent control, because a suite where the negative case
  cannot fail is a suite that proves nothing about the positive one.

  Which makes this note's own history the smaller lesson beside the bug's: it
  went on asserting an open fault for a day after that fault was closed, and
  was believed, because a sentence naming a file and a line reads like a
  measurement. **A note recording something as unfixed has to be deleted by
  whoever fixes it**, or it becomes the confident, wrong instruction this file
  warns about everywhere else.

- **Change an implementation, move its documentation.** `pnpm check:docs`
  compares each exported symbol against the base branch — and against the index
  in pre-commit — failing when the code moved and the TSDoc did not. It is a
  heuristic and it is deliberate: under AI-driven development a stale comment is
  a confident, wrong instruction. There is no suppression flag.
- **Constraints about an export live in its TSDoc**, where they are enforced and
  freshness-checked. A `CLAUDE.md` beside the code is optional and unenforced,
  for rules constraining code that does not exist yet. TSDoc constrains what
  exists; a directory note constrains what comes next.
- **Squash the migrations, and squash them again.** Nothing is in production
  yet, so the schema is still allowed a clean start — and a clean start is
  worth keeping, because the migration set is the thing every consuming app
  will copy. **Every object is defined exactly once.** A change to an existing
  function is an edit to the file that already defines it, not a new file
  stacked on top: `0015` folded into `0012` and the section layouts folded into
  `0009` for exactly this reason. Applying a squash means resetting the live
  database, which is legitimate **only while no consuming app has copied the
  migrations**. When Puck copies them, this ends permanently and every change
  becomes additive forever.

  **An in-place edit never reaches the live database, and nothing tells you.**
  This is the trap the convention above creates, and it is measured rather than
  theorised. Supabase's migration history records a file as applied; `db push`
  will not re-run an applied file. So editing `0009` changes what a fresh
  database would build and changes **nothing** about the database the app
  actually runs against — silently, permanently, and in exactly the case the
  convention makes normal. Found 2026-08-16: `set_actor_sections()` on the live
  project was missing its **entire** per-section style-validation block, so
  `skin`, `background_url`, `background_fit` and `card_size` were unvalidated at
  the database level from the day `#150`–`#154` merged until this was found. The
  zod schema was the only thing checking them; the database backstop `0009`
  appears to provide was never there.

  Every check was green throughout. Unit tests at 100% cannot see a database.
  **`pnpm test:db` cannot see it either, by construction** — it resets to a
  **fresh** database built from the files, where drift cannot exist. And the
  `actor_profiles.sections` column comment, the one signal this convention asks
  to be kept in step, **was current**: truthful about the file and false about
  the database. So the designed signal pointed the wrong way.

  What guards it now is the `schema-drift` job below. Until it is a required
  check, the obligation is yours: **after editing an applied migration, apply
  the changed statements to the live project yourself** — a `create or replace`
  in its own transaction — and re-run the check.

  **A squash is not finished when the SQL is.** It is finished when every
  document, comment and test that named the old arrangement says the new one —
  the AI-facing notes (`CLAUDE.md`, `AGENTS.md`, the feature notes), the specs
  and plans under `docs/`, the TSDoc, the SQL comments that cross-reference a
  migration by number, and the tests that read a migration file by name. Under
  AI-driven development a stale pointer is a confident, wrong instruction, and
  a renumbered migration is the most confidently wrong kind: the file it names
  still exists and contains something else. `pnpm check:docs` does not catch
  this, because nothing about the TypeScript changed. Grep for the old number.

  The counterweight is that a number is a name other files use, and a stale
  pointer is worse than an untidy one. `0009` alone is cited by a dozen TSDoc
  comments, so renumbering around it is a change to all of them. **Fold what is
  genuinely a redefinition; do not renumber for tidiness.**

  A caution about the reasoning, learned the hard way: this paragraph used to
  say `0006` owned the UUIDv5 derivation other apps copy byte-identically, and
  that was **wrong** — `0002` owns it, and three other documents repeated the
  same error. A reason not to touch something is worth checking before it is
  believed, because a false one protects nothing and costs the work anyway.

- **Git:** work on branches, open PRs; do **not** commit unless the user
  explicitly asks. Never commit secrets. Every `git` and `gh` call in this
  repository uses the PAT in `.secrets` (`GH_TOKEN`) and takes commit
  identity from `gh api user` — never from `git config --global` and never
  from a hardcoded name or email. The procedure is
  [`docs/git-with-gh-token.md`](docs/git-with-gh-token.md).
- **Always branch from an explicit base — `git checkout -b <name> origin/main`.**
  Never bare `git checkout -b <name>`, which silently branches from whatever is
  currently checked out — and after a session's work that is usually the last
  feature branch, not `main`. (`main` is now the only branch on the remote:
  merged branches delete themselves, which means a leftover _local_ branch
  marked `[origin/…: gone]` is the trap to watch for.)

  This has gone wrong twice, both times the same way: PR #4 and PR #11 were cut
  from the Phase 0 branch, so each carried ~10 unrelated commits and a
  `CLAUDE.md`/plan copy predating what was already on `main`. Merging either
  would have **silently reverted** work that was already merged. Branch
  protection caught them — `BEHIND` and then `DIRTY` — but that is a backstop,
  not the fix.

  Before pushing a new branch, confirm the base:

  ```bash
  git log --oneline origin/main..HEAD   # should list only your commits
  ```

  If it lists commits you did not write, the base is wrong. Rebuild with
  `git checkout -B <name> origin/main` and cherry-pick your commit — **unless**
  the change belongs on the feature branch, which is the case when it edits a
  file that only exists there. Check which it is before rebasing.

## Current state

🌿 **Phases 1a, 0, 1b, the fursona studio and the public pages are done — the
hub is live, another app can hand a person over to it, somebody can build a
fursona's page with real pictures, and a stranger can read it.** The studio
port is complete through phase 6. Phase 1b-i's 🧑 steps are the only thing
still open.

- **Phase 1a (actor model seam) — done, and the schema is now consolidated.**
  `supabase/migrations/` holds the canonical schema, **every object defined
  exactly once** (2026-08-13). Before that consolidation, six objects had been
  redefined by `create or replace` — `actors_public` four
  times, `ensure_person_actor` three — so the newest body of a function could
  sit in a file named after something else, and restating the wrong ancestor
  silently reverted a fix. That nearly shipped. **Before replacing anything,
  note that the file names now tell you where it lives**; keep it that way.
  `tests/db/` is the conformance suite apps run against their own database, and
  it is what proved the consolidation changed no behaviour. Plan:
  `2026-07-29-phase-1a-actor-model-seam.md`.
- **Phase 0 (Clerk standup) — done and self-verifying.** The Clerk instance and
  the Supabase integration are live. `tests/idp/` runs against a real
  Clerk-issued token; the `idp-cloud` CI job re-proves the trust on every pull
  request. See `docs/phase-0-clerk-setup.md`.
- **Phase 1b-i (hub foundation) — done, including the verification.**
  `apps/hub` is a Next.js app with Clerk sign-in, a Supabase client bound to the
  Clerk token, and person provisioning on first sign-in. Its last 🧑 step — verifying a real sign-in provisions exactly one actor row —
  **is no longer manual**. `clerk-actor-model.test.ts` calls
  `ensure_person_actor` twice as a real Clerk-authenticated caller and then
  COUNTS the rows through the Management API, which the previous assertion did
  not: returning the same `actor_ref` twice does not establish that only one row
  exists, because a second could be written and the first still be the one
  resolved. It runs in `idp-cloud` on every pull request.

  Confirmed against the live project on 2026-08-14 in a browser as well: a run
  of `signed-in.spec.ts`, which signs in repeatedly across several contexts,
  added exactly one person row and one address.
  Plan: `2026-08-02-phase-1b-i-hub-foundation.md`.

- **Visual identity — shipped.** The hub carries the design: OKLCH tokens for
  both modes, self-hosted fonts, and a drifting nebula canvas behind every page
  with the star beside the wordmark switching it off. `pnpm check:contrast`
  measures the token pairs so "measure, do not eyeball" is a command rather than
  a rule. Spec: `2026-08-12-aeleos-visual-identity-design.md`; the four things
  the design got wrong about itself are recorded in `docs/design/README.md`.
- **The hub is bilingual.** next-intl in the same shape as Libra's
  `shared/i18n`, in-app because AeleOS ships one app. Routes carry a `[locale]`
  segment; the browser's language wins where supported and **Spanish is the
  fallback** (Libra defaults to English — AeleOS deliberately does not). Both
  catalogues are key-checked in `apps/hub/tests/messages.test.ts`, so a message
  added to one language and not the other fails the build rather than rendering
  a raw key at somebody.
- **The hub is layered, and the layers are enforced.** `apps/hub/src` is
  `app/` (Next's routes — thin wrappers that import only from feature
  barrels), `proxy.ts`, `features/session/`, `features/actors/` and `shared/`
  — two features because `/me`, fursonas and the picker are one domain, and
  the chrome (nebula, toggles, page shell) owns no domain concept and so lives
  in `shared/presentation`. Each feature exposes an `index.ts` barrel and
  grows `domain` / `application` / `infrastructure` / `presentation` layers
  only as it earns them. Rules in `eslint.config.mjs` keep the shape honest
  rather than aspirational: a feature is reached through its barrel, no
  feature imports another, no `../` chains, `shared/` never depends on a
  feature, layers point inward only, and `packages/identity` must not import
  an app or a framework — Clerk, Next or React — so swapping the token issuer
  stays a one-column backfill rather than a change to every app on the
  platform. **Those rules are `eslint-plugin-boundaries` now, declared once as
  a graph over named element types**, matching the sister repos' tool — though
  not their graph, which is looser and lets features import each other. They
  were ~390 lines of `no-restricted-imports` blocks, one per feature per layer,
  each restating every pattern that still bound its files: flat config
  **replaces** that rule for overlapping globs instead of merging it, so a
  block that forgot a pattern it still owed was a silently disabled rule, and a
  fourth feature meant editing nine blocks correctly or quietly losing a
  boundary. Two properties are new rather than preserved: the graph denies by
  **default**, where the old blocks listed what was forbidden and so failed
  OPEN; and `no-unknown-files` fails a file that declares no home at all. Only
  the `../` ban and the package's framework ban are still
  `no-restricted-imports` — they are module names rather than elements.

  **The graph is only as real as its resolver.** `boundaries` asks
  `import/resolver` where a specifier points, and an import it cannot place is
  one it cannot police; the TypeScript resolver is configured for exactly that
  reason. `sabotage.py`-style verification is not optional here — nine
  violations were introduced one at a time and each was watched to fail before
  this was believed. Spec:
  `2026-08-12-hub-layering-and-contract-seam-design.md`.

- **`@aeleos/identity` is the cross-repo seam.** `packages/identity` holds
  `createIdentityClient` and the actor accessors — the code every app would
  otherwise copy — with `@supabase/supabase-js` as its only, peer, dependency.
  The hub is its first consumer so that the design is found wrong here before
  another repository pins a version of it. Phase 1b-ii builds fursonas onto this
  shape rather than writing it flat and moving it later.
- **Phase 1b-ii (fursonas and the picker) — done.** Fursona management shipped
  first (`2026-08-12-phase-1b-ii-fursonas.md`); the handoff followed. Another
  app can now ask which identity somebody wants to be. Two surfaces, and the
  reasoning behind each is the part worth keeping:
  - **`GET /api/actors/mine`** returns the caller's own actor list, authorized
    by the person's **own Clerk token** in an `Authorization: Bearer` header —
    no shared secret and no service account, so a caller can only ever read
    what its own signed-in user could already see. It carries **no CORS header
    and never will**: the payload is a complete actor list including private
    fursonas, so making it browser-readable would turn an XSS in any one
    consuming app into a disclosure of every user's fursonas from every app.
    `identity_sub` and `owner_ref` are picked out of the response by name
    rather than trusted to be absent — the linkability columns are the whole
    point of the actor model, and a column added upstream must not reach a
    caller by default.
  - **`/picker?return_to=…&app=…`** is where somebody chooses. `return_to` is
    matched on the **parsed origin** against an exact allowlist, never by
    string prefix or suffix — both of which are trivially defeated
    (`…furrycolombia.com.evil.example`, `evil.puck.furrycolombia.com`). The
    allowlist is **empty in production on purpose**, so no handoff completes
    until a maintainer adds an origin.
  - **The rule the consuming apps must not get wrong:** `actor_ref` comes back
    in a query string, so it is a _suggestion_, never an authorization. Every
    app looks it up in its own mirror, confirms ownership and `active` status,
    and uses its local row. `docs/integrating.md` says this in its own section
    because it is the one mistake that turns the whole model into "act as
    anybody".
  - **Declining is part of the protocol, not an omission.** Every branch of the
    picker offers a way out, because a page reached by a redirect that offers
    only choices is a trap — the back button lands on the link that sent the
    person there and bounces them forward again. Where `return_to` was
    accepted, declining returns to it with **no** `actor_ref`, and `declineUrl`
    strips any the caller planted, so a decline can never arrive looking like a
    choice. A consuming app must read an absent `actor_ref` as "they declined"
    and leave the current identity alone — never substitute a default, which
    turns "no thanks" into "yes, as somebody".
  - **The hub owns no mirror schema, and must not grow one by accident.**
    `supabase/migrations/` is the registry's own authoritative schema; it is not
    a drop-in mirror and cannot be (`actors_person_shape` needs `identity_sub`,
    which the endpoint deliberately never sends). `docs/integrating.md` names
    the columns it suggests as suggestions.

  Plan: `2026-08-12-phase-1b-ii-picker.md`. Contract: `docs/integrating.md`.

- **The fursona studio — done.** Libra's product editor, ported whole and
  without its theme: a filterable, drag-reorderable list; a full-page editor on
  react-hook-form with a sticky toolbar; sections in several layouts with
  bilingual, per-item fields; an icon picker; and starting templates
  shipped in code rather than in a table. **That editor is the flat one and is
  now superseded** — see the blocks bullet at the end of this list. Spec:
  `2026-08-13-fursona-studio-port-design.md`; plans
  `2026-08-13-fursona-studio-phase-*.md`.

  The line that phase drew and that later work must not blur: **a person's own
  writing is not next-intl.** The catalogues are the app's chrome and a missing
  key fails the build; `name_es` on somebody's section is a person who has not
  written the Spanish yet, and must never be reported as a fault.

- **Public pages (phase 5) — done.** `/{address}` is a person's profile and
  `/{address}/{handle}` is one of their fursonas, readable by anybody. Read
  **`apps/hub/src/features/actors/CLAUDE.md`** before touching anything in the
  actors feature. It is authoritative for addressing and newer than the spec.
  In short:

  - `/{person_address}` is a person's public profile and
    `/{person_address}/{handle}` is one of their fursonas. Both are readable by
    anybody.
  - A person has **one permanent number**, assigned in sequence, and may be
    granted a **vanity** — text or a different number. Both resolve forever, so
    a shared link never rots. The number is meant to be awardable: #7 really is
    the seventh person here.
  - **Both forms live in one namespace with one unique index.** A vanity may
    _be_ a number, so a constraint per form would let person #500 take the
    vanity `7` while person #7 exists.
  - **Fursona handles become unique per owner**, not globally, which is the
    point of putting the person in the path. Consuming apps are unaffected —
    they key off `actor_ref` and never the handle — but `docs/integrating.md`
    has to say so out loud rather than implying it.
  - **A profile lists only `public` fursonas.** "List the fursonas they own" is
    the natural implementation and it destroys what `unlisted` means.
  - **A suspension travels to every public page**, the person's own included.
    That rule exists nowhere in the schema today: a fursona whose _owner_ is
    suspended is still `active` itself, so its page would keep serving.

  Two things that phase established beyond the pages themselves. **The schema
  was consolidated so that every object is defined exactly once** — six had
  been redefined by `create or
replace`, so the newest body of a function could sit in a file named after
  something unrelated and restating the wrong ancestor silently reverted a fix.
  Keep that property. And **`0012` is the only thing `anon` may execute**;
  `0010_client_grants.sql` is the readable index of the client surface and says
  where that exception lives.

  Plan: `2026-08-13-fursona-studio-phase-5-public-page.md`.

- **Images are links, and nothing is stored (2026-08-14).** Every picture on a
  page is an address somebody pasted, exactly like the video and music players
  — see `embeds.ts`. **AeleOS hosts no files at all.**

  This replaced a working Supabase Storage bucket. The reason is the $0 budget
  rather than a technical one: hosting other people's images is the single cost
  on a profile builder that grows with how much people enjoy it, and it is the
  one that can be avoided outright. Storage on the free plan is 1 GB at no
  charge, so this was a deliberate choice made with that known, not a reaction
  to a bill.

  What went with the bucket is worth recording, because each was load-bearing
  and none of it is needed now:

  - The **public-read caveat** — an uploaded picture stayed reachable by its
    address even after its fursona was made private, so the editor had to say
    so beside the upload control. A pasted address never had that property,
    because the file was never ours to un-publish.
  - The **path-as-authorization** contract, `actor/{actor_ref}/{random}.{ext}`.
  - The **forced delete order**. `deleteFursona` had to sweep the bucket before
    marking the row, because the storage delete policy resolved through
    `owns_active_actor` and a deleted actor could no longer reclaim its own
    files. A delete is one write again.

  **Do not reintroduce an upload without reopening the budget question**, and if
  it is ever reopened, the three constraints above come back with it.

- **A block may carry its own form (2026-08-16).** A skin, a background
  picture and a fit, apart from the page's — edited in a paintbrush popup with
  a live preview, using the same `blockStyle` the public page renders with
  so the two cannot drift. It shipped per SECTION and is per BLOCK now,
  unchanged in meaning, which is the whole payoff of a section being only a
  container at depth 0. **Absent means "inherit whatever encloses this,"** a
  real answer rather than a gap. **Colour stays page-level and always will** —
  a skin names no colour of its own, and every pairing of a style and a palette
  is somebody's page; a per-block colour would collapse that. Read
  `apps/hub/src/features/actors/CLAUDE.md` for what a block may set, the
  nesting fix a skin needed to apply twice without falling through to the
  wrong scope, and why the readability escape hatch stays page-level rather
  than growing a per-block correction.

  The same pass fixed a section's drag handle, dead since it was first
  written and invisible to the only test that covered it — see "Every bug
  gets a regression test" above for the fault, the fix, and the lesson it is
  the second instance of.

- **The section-personality design is delivered end to end (2026-08-16).** The
  embed provider table, with the Content-Security-Policy's `frame-src`
  derived from it rather than kept as a second list somebody has to remember
  to update; embedded posts and branded social chips; the per-section form
  (skin, background picture, card size); the `cards` grid the size dial fed;
  and a background picture behind the whole page, layered correctly
  over the author's own gradient. The layouts named there are container modes
  and leaf kinds now — the blocks bullet below carries the mapping — and
  `card_size` lost its reader with the `auto-fill` grid it was a minimum width
  for. Read
  `apps/hub/src/features/actors/CLAUDE.md` and
  `docs/superpowers/specs/2026-08-15-section-personality-design.md` — the
  latter is now marked complete — for what each piece does and does not do,
  including the parts still resting on somebody else's undocumented behaviour
  (`posts`) and the one thing reasoned from the CSS spec rather than watched
  in a browser (the page background's `background-attachment`).

- **A border of one's own (2026-08-16) — done.** A section picks its own
  border style, which is the literal thing the phase above was asked for and
  answered with skins instead. A skin is a whole aesthetic — choosing `comic`
  for a heavy edge also brings a halftone, a radius and a hard shadow — where
  what was asked for composes with whatever skin is already worn; and it was
  not merely bundled but **unreachable**, since nothing in the style bag could
  make a section dashed. The same phase took the feature note's own "this list
  is a floor, not a ceiling" at its word: `masonry`, `progress` and `tabs`
  arrived — as layouts then, as two modes and a leaf kind now — and `neon`,
  `cutout` and `frame` joined the skins, each earning its place by a mechanism
  nothing else uses. Read
  `apps/hub/src/features/actors/CLAUDE.md` for what `progress` reads as a
  value (and that it inverts the title/description pair), why the border token
  is `--skin-border-style` rather than a write to Tailwind's own variable, and
  what `cutout` cost — `clip-path` clips overlay UI and focus rings alike,
  which is why the editor's card paints its face on a layer of its own and why
  every surface in the app now rings on the inside. Spec:
  `2026-08-16-a-border-of-ones-own-design.md`.

- **Blocks, then spaces, then dragging (2026-08-18) — the model, the renderer,
  the editor and the drag are all done.** A page was a flat array of sections
  whose `type` **welded arrangement to content** — `gallery` was a grid _of
  pictures_, `links` a list _of links_ — so heterogeneity was not merely
  unsupported but unrepresentable. A page is a recursive tree of **blocks**
  now: a **container** arranges its children in a mode, a **leaf** holds one
  piece of content, and **a section is a container at depth 0 that carries a
  name.**

  **The arrangement was then a FLOW for a week, and that was the second half of
  the same correction.** A container declared a track count and its children
  streamed into it declaring spans, which means there is no such thing as an
  empty place — so the shape somebody chose disappeared the moment their
  content stopped filling it. A section declares how many places it lays
  **across** now; children fill them row by row and the section grows downward;
  and **a place may be empty, keeps its width, and draws nothing.** Collapsing
  it was refused deliberately, because a space count that means nothing
  whenever a section is partly filled is a shape that changes under its author
  as they work.

  Read `apps/hub/src/features/actors/CLAUDE.md` before touching any of it — it
  carries the container modes, the leaf kinds, and **the table saying where
  every old `type` went**, which is the thing to check before concluding that
  `gallery` was dropped. Nothing was.

  The parts worth knowing before reading the code:

  - **Depth is capped at three and the DATABASE enforces it**, with an explicit
    counter passed down `validate_block`'s own recursion. `sections` is
    user-controlled `jsonb`, so an unbounded recursive validator is a stack
    somebody else chooses the depth of; a cap in the editor is a suggestion.
    Both sides also refuse a too-deep tree **by name**, because a container one
    level too far is otherwise refused for naming a `kind` no leaf has — which
    tells somebody their block kind is invalid and their title is missing,
    neither of which they got wrong.
  - **A space is a WIDTH and never a capacity, which is what makes narrowing
    safe.** `spaces` says how many places a container lays across; `children`
    is what is in them; the two are not tied, so narrowing a six-space section
    to two re-wraps six things into three rows with all six still there and in
    order. Nothing is displaced, so nothing needs rescuing — and
    `patchContainer` takes `Partial<Omit<ContainerBlock, "kind" | "children">>`,
    which makes the clamp somebody would add in good faith **impossible to
    express through the function the control uses.** A type saying it cannot
    be written tomorrow is stronger than a test saying it is absent today.
  - **Content adapts to its parent, not to the window.** Every responsive rule
    inside a block is a container query, and a viewport breakpoint here is the
    **wrong tool rather than a weaker one**: a card in one place of a
    three-space section is about a third of the page wide while every `sm:`
    rule inside it believes it has the whole screen, and the error worsens with
    depth. It needed no library and no client boundary either — `@container` is
    native CSS, so these renderers stay server components.
  - **Free positioning — coordinates on a canvas — is refused, and the refusal
    is hard to walk back once shipped.** It cannot degrade to a narrow
    viewport; it makes the editor close to unusable on a phone, which is where
    most people will build; and it is how the pages this product is inspired by
    became unreadable.
  - **`columns` was a mode and was removed before anything could store one**,
    for a reason worth reusing: three consecutive tasks wrote down three
    different meanings for it. See rule 15 below.
  - **There are THREE stored page shapes, and the third is a migration with a
    deletion condition.** Flat sections; blocks carrying `spaces`; and, for
    about a day, blocks carrying `columns`, written by the save boundary `#158`
    shipped. `withSpacesFromColumns` reads the third on the lenient path only,
    because stripping the key it does not know turned a three-across gallery
    into one full-width column and the next save stored that. The feature note
    carries the rest, including when it may be deleted and why nothing can tell
    you that.

  **The editor composes blocks now** — `block-editor.tsx`, `block-card.tsx`
  and `leaf-editor.tsx`, with the flat editor deleted. Somebody chooses a
  section's shape, fills a place with content or with another section to the
  cap of three, picks a content kind, edits only the fields that kind draws,
  removes what is there, and sees the section drawn by the renderer a
  stranger's page uses rather than by a preview that could drift from it.

  **Dragging is written, and `@hello-pangea/dnd` is gone (2026-08-18).**
  Anything may be dragged anywhere a place will hold it — content between
  sections, a section into a place, at the depth cap — by mouse and by
  keyboard. `@dnd-kit/core` + `@dnd-kit/sortable` replaced it because the old
  library's own README rules out dragging from a parent list into a child one
  and rules out grids separately, and this model is nested grids and nothing
  else. Measured on what each is actually imported for: 13.9 kB min+gzip
  against 28.5 kB, so the migration is a net reduction as the spike said,
  though not at the numbers it quoted.

  **A drop is an exchange of two places, and the flow semantics a list would
  give you were refused rather than overlooked.** Insert here and everything
  after slides along — which assumes the gaps between things mean nothing, and
  here they are the author's. A place is positional and an empty one keeps its
  width, so sliding the row along to make room would move the empty places
  somebody deliberately left, which is the one thing a rearrangement must not
  do to a shape they chose. Onto an empty place is a move, onto an occupied one
  a swap, and the top level shifts because the page's own list has no empty
  entries and cannot hold one. If swapping ever feels wrong in use, the fix is
  a ruling rather than a change to the model — the positions are stored either
  way.

  Two things carry the design and neither is in a component. `moveBlock`
  (`domain/block-moves.ts`) decides what a drop MEANS, with no library in
  sight; `domain/block-drag.ts` decides which two places a gesture NAMED, and
  that is where the phase's one real unknown was. **The collision resolves to
  the deepest place under the pointer** — places nest, so every enclosing place
  contains the pointer too, and a distance-to-centre ranking answers a leaf
  inside the container somebody is hovering, silently, one level in.
  "Innermost" and "longest path" are the same fact at any depth, which is what
  makes it hold at three rather than being the two-level special case the spike
  had. **A keyboard drag walks a list instead**, deliberately: a pointer cannot
  avoid the places inside the block it is carrying and a list can simply leave
  them out.

  **A pointer drag has now been driven in a browser, and it agrees with the
  unit fixtures.** Until `tests/e2e/block-drag.spec.ts` every browser-level
  proof was by KEYBOARD, which exercises a different branch: the keyboard side
  of `detectCollision` hands back the place the coordinate getter already chose
  and never calls `placeUnderPointer` at all, so the geometry was proved only
  against rectangles a unit test wrote for itself. **Four** of that spec's cases
  run by mouse AND by keyboard against a real layout — a swap inside one
  section, a move into a place at the depth cap and back out, a section reorder,
  and the refusal one level past the cap. The rest are single-gesture BY DESIGN,
  and this bullet claimed otherwise for a while: the cycle refusal and the plane
  rule have no keyboard gesture that expresses them, because the walk never
  offers those targets; the descendant-exclusion case IS the keyboard proof of
  that; and the save-and-reload, the abandoned drag and the collapsed-card walk
  each drive the one gesture their subject has. Its
  pointer half asserts the `data-over` highlight BEFORE it releases, which is
  `placeUnderPointer` ranking rectangles Chromium measured. Replacing
  deepest-wins with nearest-centre reddens it at the highlight and leaves the
  keyboard half green, which is the two paths being different said out loud.

  **Two of its fixtures are shaped by a trap rather than by taste**, and both
  are the "a case that passed because both orderings landed identically" shape.
  A swap and an insert-and-shift leave two ADJACENT places reading the same
  thing, so the swap is asserted across a place that is not adjacent to its
  source; and a shift and a swap leave the same page when there are only two
  sections, so the reorder gets a page of three. Each was verified by making
  the code do the other thing and watching it go red. Rule 27 is that trap
  written out, along with the third instance the same phase found and the one
  case where no fixture could have discriminated at all.

  **The cycle guard is checked in BOTH directions**, and only one of the two is
  the easy miss. An exchange moves the target as well as the source, so
  dropping a block onto its own ancestor is the same fault mirrored — and
  neither can hang, because the writes are immutable and no reference cycle can
  form: what forms is a duplicated subtree that the other half of the exchange
  then deletes, which is a section silently lost. `moveBlock` answers this and
  every other bad drop rather than throwing, because a refused drop is an
  ordinary outcome of dragging and the person is owed a sentence.

  The feature note carries the rest — the plane rule that keeps a nested block
  from being swapped with a whole section, what each of the three refusals says
  and which input can reach it, why a no-op comes back as the very array it was
  given, why every grip in the editor comes from one component, and the
  hydration mismatch dnd-kit's module-level id counter causes on every request
  after the first unless the context is given a `useId()`.

  Specs: `docs/superpowers/specs/2026-08-18-sections-of-spaces-design.md`,
  complete and the current word on the model;
  `docs/superpowers/specs/2026-08-18-dragging-design.md`, complete, and where
  the traps, the corrected bundle measurement and what dragging still owes are
  written down; and
  `docs/superpowers/specs/2026-08-17-blocks-and-grids-design.md`, which the
  first of those supersedes on tracks and spans and which still describes them.
  Its banner is what to read before anything under it: it is kept current, and
  the body is left as delivered. **Do not take that arrangement on trust** —
  the banner spent a day claiming phases 3–5 were unwritten and that the
  dnd-kit findings were "still what phase 4 inherits", after this branch had
  closed them, and this bullet vouched for it. A banner is only a banner while
  somebody updates it; whoever closes one of a superseded spec's phases updates
  the banner in the same change.
  Plans: `docs/superpowers/plans/2026-08-18-dragging.md`,
  `docs/superpowers/plans/2026-08-18-sections-of-spaces.md` and
  `docs/superpowers/plans/2026-08-17-blocks-and-grids-phase-1-model-and-renderer.md`.

- **Weighted places (2026-08-19) — done.** A section's places need not all be
  the same width: a container may declare `weights`, one whole share per place,
  so `[1, 3, 1]` is a narrow side, a wide middle and a narrow side. **The
  number is on the PARENT and that is the whole structural decision** — a drop
  is an exchange of two places, and an exchange between a two-wide place and a
  one-wide one has no meaning, which is why `span` was removed and why this is
  not `span` returning under a new name. `moveBlock` is untouched.

  It also closes a sentence in the feature note that was **false when
  written**: that a wide thing was a nested container of one space. Nesting can
  make something narrower and can never make anything wider, so the page this
  feature exists for was not unbuilt, it was unrepresentable.

  Two mechanisms are worth knowing before touching it, and the feature note
  carries the rest. **The class keeps the container query and the property
  carries the tracks** — weights are author data out of `jsonb`, so no build
  step can generate a class for them, while an inline `grid-template-columns`
  would carry no query and flatten the collapse every narrow screen depends on;
  the uniform list is the `var()` FALLBACK, so an unweighted page emits what it
  always did with no branch anywhere. And **every weighted track is floored at
  `8rem`**, which is what makes a lopsided ratio even out when there is little
  room and assert itself as the container grows. Only `grid` spends weights;
  the database stores them for every mode on purpose, so flipping to `carousel`
  to look and flipping back does not lose somebody's shape.

  Spec: `docs/superpowers/specs/2026-08-19-weighted-places-design.md`, complete,
  and where the measured threshold widths live. Plan:
  `docs/superpowers/plans/2026-08-19-weighted-places.md`, whose own corrections
  banner is the one to read first — three of its instructions were wrong and
  each was measured wrong rather than argued wrong. Rule 29 above is what the
  branch cost.

- **A page of one's own (2026-08-19) — done.** The last three pieces of
  furniture the app rendered on somebody's public page are gone: the identity
  header, the fursona list and the page's width. A public page is now entirely
  its owner's tree, and **nothing the app owns renders inside `SKIN_SCOPE`
  there any more.**

  Five leaf kinds — `avatar`, `handle`, `name`, `owner`, `fursonas` — draw the
  ACTOR rather than what somebody typed, which is a new CATEGORY in the model
  rather than five more entries. Read
  `apps/hub/src/features/actors/CLAUDE.md` before touching any of it. The
  parts worth knowing first:

  - **A fursona's page shows its owner, and that is new content.**
    `public_fursona` resolved `owner_address` for the canonical URL and never
    rendered it, so a stranger arriving from a shared link had no way back.
    The owner's NAME and PORTRAIT are gated on that person's own profile being
    readable — a fursona's page is governed by the fursona's visibility, so a
    public character routinely belongs to somebody whose profile 404s. The
    gate is in `0012`, never in a renderer.
  - **A page must carry at least one of each required kind**, enforced in the
    database, at the save boundary and in the editor. **The guarantee is that
    the block EXISTS, not that a visitor sees it** — a required block inside a
    collapsed `accordion` satisfies every layer and shows nothing, and
    `tests/db/blocks.test.ts` asserts that hole is open as a passing case so
    nobody reads the enforcement and concludes otherwise. Putting the
    ownership fact in un-styleable chrome was weighed and declined: every part
    of the page belongs to its owner.
  - **Absence means the default POSITION, not deletion**, which is why no
    stored page needed migrating and why the rule cannot be defeated by
    stripping the blocks: `withRequiredBlocks` puts them back on every read.
  - **A page chooses its own width**, six named stops from the reading measure
    out to `full`, and **a section may independently opt out of width and page
    chrome**. `bleed` reaches both edges; `margins: false` removes that
    depth-0 section's side gutter and first/between/last spacing. The full
    `PageShell` owns none of that spacing and the parent owns no gap, so a first
    bled section without margins is an ordinary banner and a genuinely last
    one is an ordinary footer. The measure remains per SECTION; `w-screen` is
    refused because `100vw` counts the scrollbar a centred column does not.
  - **The theme switch is in the bar** and the light/dark toggle's question
    mark is gone — it clears the author's theme as well as setting a default,
    so the press always changes something a visitor can see.

  **Three faults shipped with it and were found only when the branch's own
  browser suite was run with credentials, which is the part worth carrying.**
  The plan closed, every local gate was green, and `e2e` — a REQUIRED check —
  had never actually run the half of itself that needs Clerk, because
  `global-setup.ts` skips those suites without a key and the branch was
  verified on a machine that had not exported one. All three were in the
  headline features:

  - **Both public routes asked the shell for `width="wide"`**, so the
    per-section measure was laid inside a centred, padded `max-w-7xl` column:
    a doubled gutter, the two widest stops capped at 80rem, and a `bleed`
    section unable to reach either edge. `COLUMN.full` existed, was documented
    for exactly this, and had no caller. See rule 30.
  - **`set_actor_theme` had never heard of `measure`**, whose allowlist ends in
    `unknown theme key` — so picking a width made the whole theme save throw.
    Fixed in `0009`, hand-applied to live, and pinned by `tests/db/actor-theme.test.ts`.
  - **`fursonas.fursonas` was in neither catalogue**, so three editor routes
    drew their own key path where a heading belonged. They read
    `publicProfile.fursonas` now — the same string the public page uses, so the
    preview cannot disagree with the page — and
    `apps/hub/tests/message-keys-exist.test.ts` reads the SOURCE for every
    literal key asked of a literal namespace, which is the first guard here
    that can catch a hand-written key rather than a generated one.

  - **A fursona built by hand could not be saved AT ALL.** `readActorPage`
    answers `withRequiredBlocks([], kind)` for an actor with nothing stored,
    but the CREATE page has no actor to read yet and `FursonaEditor` defaulted
    to `[]` — a tree `set_actor_sections` refuses for naming no `avatar`,
    `handle` or `owner`. So Save produced "your sections were refused" on a
    page whose author had done nothing wrong, and only the template path
    worked, because applying one runs the shim. The default is the shim's
    output now. Seeding it made every page non-empty, which broke the template
    picker's confirmation the other way — that gate asked "are there any
    sections" and now asks `holdsNothingAuthored`, which is the question it
    always meant.

  A fifth thing was owed rather than broken: **every page fixture must now
  carry the required blocks**, so `seedPage` appends an identity section to
  every tree it writes and the specs that count sections say
  `+ SEEDED_IDENTITY_SECTIONS` rather than a bare number. Two spec-level traps
  came with it and are worth knowing before writing another editor test: the
  card a test builds is the LAST one, because the identity section opens first
  and `add-section` appends; and a page-wide locator for `nested-card` or
  `block-grid` now matches the identity section too, so those have to be
  scoped to the section under test.

  Spec: `docs/superpowers/specs/2026-08-19-a-page-of-ones-own-design.md`,
  complete. Plan: `docs/superpowers/plans/2026-08-19-a-page-of-ones-own.md`,
  whose corrections banner is the one to read first — six of its instructions
  were wrong, and the two worth carrying are that a leaf CANNOT have no fields
  (`title_en` is required everywhere) and that the vocabulary and the
  renderers cannot land separately, because `satisfies Record<LeafKind, …>`
  refuses to compile.

## The toolchain, and the rules it cost

Full account, with every measurement:
`docs/superpowers/specs/2026-08-15-toolchain-hardening-design.md`. Read it before
adding or disabling a linter. The short version, and the part that generalises:

**Everything the sister repos check, this repo now checks.** `stylelint`,
`eslint-plugin-boundaries`, `sherif`, `syncpack`,
`eslint-plugin-better-tailwindcss`, `eslint-plugin-sonarjs`,
`eslint-plugin-unicorn` — plus two the sisters do not have,
`@axe-core/playwright` and `fast-check`. AeleOS was the only one of the three
with **no CSS linting at all**, which is how `globals.css` grew a rule that beat
every Tailwind utility for months without anything noticing.

**Three findings were not style, and two of them were autofixes:**

- `unicorn/prefer-string-raw` rewrote the middleware `matcher` — the expression
  deciding which requests Clerk sees at all — into a `String.raw` template. Next
  reads that config **statically**, so the build failed naming no file. The rule
  is off.
- `stylelint --fix` deleted `-webkit-backdrop-filter` and left the standard
  property declared twice, three lines under a comment calling that line
  load-bearing. We have no autoprefixer, so a prefix in source is the only one
  that reaches a browser. `property-no-vendor-prefix` is off.
- The skin styled `[class~="border"]`, Tailwind's own generated class, from
  **outside every cascade layer** — where it beat every utility unconditionally.
  `@utility surface` replaced it across 74 class lists, and both hand-written
  `:not()` exclusions deleted themselves.

### The rules. Each was paid for.

1. **A newly adopted tool must be shown to fail before it is believed.** Three
   here were silently doing nothing: `better-tailwindcss` disabled all nine of
   its rules because `tailwindcss` resolved from `apps/hub` and not the root, and
   `boundaries` could not resolve the imports it was policing. Introduce a
   violation, watch it fail, restore.
2. **Never run an autofix over code a build tool parses rather than executes** —
   middleware matchers, route segment configs, `next.config.ts`. Review that diff
   every time.
3. **Do not style a class the framework generated.** It reaches the right
   elements and cannot see what they asked for. Own the class.
4. **Custom CSS belongs in a cascade layer.** Unlayered rules beat every layered
   one regardless of specificity — silently, and forever.
5. **When a rule disagrees with the code, decide which is wrong and write the
   answer down.** Every disable carries its reason; a silent one is a decision
   nobody can review.
6. **Two tools fighting is a configuration bug.** Prettier lowercases hex and a
   rule wanted upper — the fix ran, Prettier undid it, forever. Name the owner.
7. **A property test states a claim; it does not weaken until it passes.**
8. **A migration's cost is not the diff.** Try it, measure, revert with evidence.
9. **`check:docs` is per symbol and not a formality.** A mechanical rename still
   touched 33 exported contracts.
10. **An argument about cost is not a measurement of it.** The next-intl
    migration was refused on the reasoning that it traded a pre-paint guarantee
    for a weaker one. Sampling 184 frames across the change showed no frame ever
    painted wrong. Reason to decide what to measure; do not let it stand in for
    the measurement.
11. **A branch reached only by a random draw is not covered, and the coverage
    number lies about it at a low rate.** `embed-providers.ts`'s Mastodon
    resolver had no named case reaching the FALSE arm of its `&&` — every
    hand-written reject returned a line earlier, and the property test's own
    generator produced only valid pairs. The one thing that ever made it false
    was the unseeded hostile property _happening_ to draw a failing pair, so
    about one run in 42 came back `99.84% (654/655)` on a check that requires
    100, and the same shape sat unnoticed in the Twitch resolver beside it.
    Two things kept it invisible for weeks: the miss is rare enough to read as
    infrastructure noise rather than as a defect, and `test:coverage` is
    configured for `text-summary`, which reports the percentage and **never
    names the line**. So the diagnostic is worth remembering on its own —
    `--coverage.reporter=text` names it. **It finds the uncovered line and
    cannot confirm a clean file**, which is the half of the advice that was
    missing: measured 2026-08-19, `text` omits a fully-covered file from its
    table ENTIRELY — `block-tracks.ts` sat at 9/9 statements, 6/6 branches and
    3/3 functions in `coverage-final.json` and appeared nowhere in the printed
    table, and `--coverage.skipFull=false` did not bring it back. So absence
    from that table means "clean" or "not instrumented" and the reporter will
    not say which. Read `coverage-final.json` when the question is whether a
    file is covered, and use `text` when the question is which line is not.
    The rule generalises past coverage,
    because the shape recurs wherever a property test sits beside named cases:
    a property test states a claim about ALL inputs; it does not stand in for
    a case about ONE. If a branch is only entered when a generator happens to
    produce the right input, that branch is untested and the suite is telling
    you otherwise. The check that settles it is the suite run with the
    property files excluded: everything must still be at 100%.
12. **Never diagnose a browser failure against a server older than the code.**
    A `next dev` already running when the message catalogues change keeps
    serving the modules it started with, forever. New keys then render as raw
    keys, and because a `select` is as wide as its longest option,
    `fursonas.types.progress` at 155px where `Progreso` is eight characters
    overflows the 320px editor by a real 4px — so `responsive.spec.ts` fails
    honestly, about a page that genuinely was broken, for a reason that is not
    in any diff. **What makes it dangerous rather than annoying is that it
    disguises itself as a bad commit and survives the check you would use to
    rule that out.** An agent stashed its work, watched the failure persist,
    and correctly concluded "pre-existing" — because stashing does not restart
    a server. It cost a full bisect across twenty commits. Restart after
    touching the catalogues, and treat a server that predates the code as no
    evidence at all.
13. **A test can exercise a path the product never takes and look exactly like
    coverage.** `canvas-performance.spec.ts` set `--canvas` by name for every
    canvas, the default one included. The product never does that for the
    default — `themeVars` emits the property only for a canvas OTHER than the
    default, so that the untouched page stays byte-for-byte what it was — so
    the one caller exercising the nebula was the one caller that could not
    reproduce how the nebula is reached. It measured the half-resolution path
    while every page in the app served the full-resolution one: four times the
    pixels, 35.8ms a frame against 8.9, from the day `renderScale` was written.

    This is the repository's own "a mocked dependency hides its own setup
    requirements" with the TEST supplying what was missing instead of a mock,
    and it generalises the same way: **a suite that supplies setup the product
    does not is measuring a different program.** When a value has a fallback,
    the check has to reach it the way production does — by leaving it unset —
    and a fallback that each consumer applies for itself is a fallback each
    consumer gets a separate chance to disagree about. Both faults here were
    that: `renderScale("")` answered 1 where `renderScale("nebula")` answered
    0.5, and nothing owned the resolution until `resolveCanvas` did.

    **The other half is rule 10 at its sharpest.** Three of us reasoned
    confidently about which CSS was expensive — `backdrop-filter`,
    `background-attachment: fixed`, the comic halftone, `neon`'s spread,
    `cutout`'s `clip-path` — and every one of those arguments was wrong.
    Measured on a throttled phone, all of them together cost 4.0 points of the
    main thread and the canvas cost 65.6; the fixed attachment, the single
    measurement the feature notes flagged as highest-value, was zero three
    times over. The thing nobody had looked at was a one-line fallback. Suspect
    what is measured, not what is interesting.

14. **A budget is only real if it separates the two builds, and one reading of
    each does not establish that.** The dial-latency ceiling in
    `personalised-page-cost.spec.ts` was set from a single pair — 31ms fixed,
    557ms sabotaged — and it failed CI at 283ms on code that was correct. Read
    again, the same unmodified build measured a median of 17.6ms and 575.4ms at
    a 6x throttle in two runs minutes apart, against 836.1ms sabotaged. The
    distributions overlapped, so **no ceiling existed that could have been
    right**, and recalibrating it would only have moved which runs lied. It was
    replaced rather than relaxed, by a ratio of two counts taken in the same
    run — theme commits per delivered movement — which reads 0.006 fixed and
    1.000 sabotaged at throttles of 1x, 4x, 6x and 8x. The general form:
    **before trusting a performance budget, measure the good build twice and the
    bad build once, and check the gap is bigger than the spread.** A single
    green and a single red look identical to a real signal and to a coin toss.

    **The half of that which cost the most time is the sabotage.** An agent
    tried to check the budget by defeating the coalescing at RUNTIME —
    monkey-patching `requestAnimationFrame` — rather than in the source, saw the
    number barely move, and concluded the budget might be measuring nothing.
    Both halves of that were wrong and each on its own is enough. The patch does
    not reproduce the fault: the component's pending-frame flag still collapses
    a burst arriving in one task, so the keyboard burst reported 0.006 commits
    per movement WITH the patch applied — the coalescing intact. And the
    instrument is built out of the very thing being patched, `rAF` twice over,
    so it reported 2.6ms where the honest fixed build reports 27.0 and the truly
    sabotaged build 37.7: a page committing on every single event scoring ten
    times better than one that does not. **Never sabotage a mechanism your
    instrument is built on**; and when a runtime shortcut and a source edit
    disagree, the source edit is the measurement and the shortcut is a third
    program neither of you meant to run.

    A smaller finding from the same pass, worth keeping because it decides what
    a check CAN assert: **headless Chromium rasterises everything on the CPU.**
    Asked over CDP, it answers `2d_canvas: unavailable_software`,
    `gpu_compositing: disabled_software`, `rasterization: disabled_software` on
    a SwiftShader device, where the same browser headed on the same machine
    answers `enabled` to all three on the real adapter. Every canvas
    millisecond this repository has ever recorded is therefore software raster.
    That is the right regime for a CI budget — the runner has no GPU either, and
    it is the pessimistic side — and it leaves the resolution assertions
    untouched, since those compare integers. What it forbids is quoting those
    milliseconds as what a visitor's machine pays. The account is in
    `canvas-performance.spec.ts`'s own header.

15. **A name three consecutive authors cannot define the same way twice has no
    mechanism — it has a meaning each of them filled in from context.** The
    `columns` container mode was in the vocabulary, in the SQL and in the
    renderer, and each of those three said something different about it: the
    schema said it laid uniform tracks exactly as `grid` does, `0009` said
    `grid` fills them across and `columns` down, and the renderer shipped
    `grid` plus `items-start`. The middle one is a real mechanism, column-major
    fill order, which nothing else has — **and it was never implemented**, so
    the file whose comments are the readable index of the model was describing
    behaviour the product did not have, where `check:docs` cannot see it. The
    rule generalises past vocabularies, because it replaces an argument with an
    observation: this repo's standing bar is that a thing earns its place by a
    mechanism none of the others has, and "is there a mechanism" is arguable
    where "can three people who wrote it down agree" is not. It was removed
    before anything could store one.

16. **A summary wrong in the safe-sounding direction is worse than one that is
    simply wrong, because it closes the question.** A report said "the editor
    cannot save at all", which sounded like a limitation and read as settled.
    The truth was that the editor could not save a page WITH sections and saved
    perfectly well when it believed there were none — which, after the model
    changed under it, was every page. So opening any page and pressing Save
    erased it: the parse failed, the read answered `[]`, the mutation sent an
    empty tree, the RPC accepted it and reported success. Nobody looked,
    because the sentence had already told them nothing could be written. When
    writing down what a broken thing cannot do, state the failing input and the
    observed behaviour, not the conclusion — "it refuses a tree" and "it cannot
    save" are not the same claim, and only one of them is checkable.

17. **Being right for the wrong reason is the worse way to be right, because
    the reasoning is what the next person reuses.** The `min-w-0` fix was
    correct and its stated mechanism was false: a flex item is NOT floored at
    `min-width: auto` in a column container — per Flexbox §4.5 an automatic
    minimum size applies on the main axis, so it computes to `0` — and the
    guard that actually did the work everywhere except `timeline` was
    `minmax(0, 1fr)`. The credited sabotage was false too: removing the
    `min-w-0` guards left the whole suite green, because no fixture put a wide
    leaf in the one mode that lays `auto` tracks. A conclusion that survives a
    wrong explanation will be copied to the next place with the explanation
    attached, and there it will be wrong about the outcome as well. Measure
    which half of a fix is load-bearing before writing down why it worked.

18. **`check:docs` catches a symbol whose CODE moved. It cannot catch one whose
    WORLD moved.** `LEAF_KINDS`' TSDoc described an owed behaviour — the
    pairing debt inherited from `two-column`, including "the list disappears
    when no row survives" — and two leaves had by then paid that debt and
    deliberately INVERTED that half of it. The constant itself never changed a
    character, so nothing about the TypeScript moved and the freshness check
    had nothing to compare. The exposure is any TSDoc that describes something
    other than its own symbol: a debt, a plan, another file's behaviour, a
    guard that runs elsewhere. Those are the comments to grep for by hand when
    a phase closes, and the giveaway is the future or obligatory tense.

19. **A guard credited in REASONING is harder to catch than one credited in a
    comment, because there is nothing to read.** This file already says a
    sentence crediting a guard is not the guard. The new shape is a report or a
    review arguing "axe covers this" about `heading-order` and
    `scope-attr-valid` — both `best-practice` in `axe-core@4.13.0`, and
    `a11y.spec.ts` runs `wcag2a/2aa/21a/21aa` only, so neither ever fires. No
    file contained a false claim; the false claim was in the argument for why
    no file needed one. Settle it by reading `getRules()` out of the installed
    version rather than by recalling which tag a rule carries. And the naive
    fix is worse than the gap: `AxeBuilder` cannot mix `withTags` and
    `withRules`, so adding them means adopting the whole `best-practice`
    family — which would flag `empty-table-header`, a blank `<th>` beside a
    written value that `TableLeaf` renders **on purpose**. That is the second
    time "just turn the rule on" would have broken something deliberate; the
    first was `unicorn/prefer-string-raw` rewriting a middleware matcher Next
    reads statically.

20. **An agent that sabotages live state must restore it in the same run, and a
    session limit does not care.** One died mid-sabotage with its probe still
    on the live database — and worse, it had MOVED the probe from the end of a
    column comment to the front before dying, so the containment check somebody
    would reach for (`live.startsWith(file)`) answered false and the obvious
    "is the suffix still there" check would not have found it. Restoring meant
    executing the `comment on column` statement verbatim out of `0009` rather
    than retyping it, which is the idiom for every hand-applied migration edit
    here. The safer shape is to sabotage a COPY — the shadow database or a
    local stack, and `pnpm test:db` runs here now — and to reserve live probes
    for the one case that genuinely needs them. Where a live probe is
    unavoidable, write down where it is before making it, not after.

21. **A dormant guard names the conditions under which it wakes, and somebody
    has to READ them when that condition arrives.** The dial-latency half of
    `personalised-page-cost.spec.ts` was stood down with an exact note saying
    phase 3 would restore it, what else would have to move (nothing), and how
    to judge the result. Phase 3 was then built and merged and nobody opened
    the file; three of the note's stated reasons had gone false meanwhile, and
    it took a review to find it. This is not the "a sentence crediting a guard
    is not the guard" failure — the note was excellent and everything it said
    was checkable. What was missing was the step that reads it, so the
    obligation belongs to the phase rather than to the note: **when a phase
    closes, grep the suites for its own name.** A skip whose restore condition
    has arrived is a check that has quietly stopped existing, and it looks
    exactly like a check that is passing.

22. **One agent per working tree, or a worktree each.** Two were writing to this
    one at once — the second told to expect files to move under it rather than
    being made to wait — and a whole-tree `pnpm lint` came back red on four
    errors belonging to the other, which is precisely the state in which
    somebody "fixes" work that is not theirs. Nothing was lost only because the
    file sets happened to be nearly disjoint. The overlap rule that was being
    used, stage only your own files by name, protects the INDEX and protects
    nothing whatever about running a gate against a tree somebody else is
    editing. The cost of the rule is occasional serialisation; the cost of not
    having it is a red gate nobody owns.

23. **An assertion that cannot fail FIRST is corroborating, not independent, and
    counting it as proof is how a suite overstates itself.** Where several
    assertions sit in one path, an earlier sabotage reddens before the later
    ones are reached — so they never had the chance to be the thing that
    caught it, and a report saying "these are covered" is describing reach
    rather than evidence. The task that got this right named four of its own
    that way rather than adding them to a total, and it is the honest form of
    the discipline rules 11, 17 and 19 each found the dishonest form of. The
    test is mechanical: sabotage the code, and see which assertion is the one
    that goes red.

24. **A brief's premise can be wrong, and an implementation that says so is
    doing the job rather than refusing it.** Twice in one phase. A plan
    demanded `children.length === spaces` on a reading of "spaces" as a total,
    which made a fifty-picture gallery unrepresentable; the implementer hit the
    consequence and asked about the cause. And the editor brief asked what
    happens to a displaced occupant when a shape narrows — a question with no
    answer, because a width is not a capacity and nothing is displaced. Both
    were mine. The failure mode to guard against is the opposite one, an agent
    implementing an impossible instruction and writing tests that assert it, so
    say plainly which part of the instruction does not apply and why, and carry
    on. And note what the second cost when it was half-fixed: three places in
    the plan still stated the old rule after the constraint above them had been
    corrected. **A document that contradicts itself is worse than one that is
    simply wrong**, because whichever half a reader reaches first is the one
    they follow.

25. **A premise about the DATA is dated the moment it is written, and `main`
    moves.** A plan's migration ruling opened "every page in the database is
    flat-shaped", and every task after it reasoned from that sentence. It had
    been false for about an hour: a pull request merged that morning shipped a
    save boundary writing a shape nobody downstream knew about, so the branch
    read those pages, stripped the key it did not recognise, and answered a
    default — a three-across gallery as one full-width column, for its owner
    and for a stranger, with the next save storing the loss. Nothing failed,
    because a strip is not an error and no test owns the live database. Two
    habits follow, and the second is the one that was missing. **Date a claim
    about stored data and name what would falsify it**, rather than stating it
    as a standing fact. And **re-read what merged to `main` while the branch was
    open**, specifically for writes: a claim about the schema is checked by
    `check:schema-drift`, and a claim about what is IN the rows is checked by
    nobody at all.

26. **An event you can OBSERVE is not proof that the thing which acts on it is
    listening yet.** `@dnd-kit/core@6.3.1`'s `KeyboardSensor.attach()` starts
    the drag synchronously and then adds its own `keydown` listener inside a
    `setTimeout`. The lift is announced out of the state that synchronous call
    set — so the announcement, which is the only signal a browser test has, is
    rendered INSIDE the window where an arrow key reaches nothing at all. One
    run in three lost its first arrow, the walk then sat on the place it
    started from, and the poll timed out five seconds later quoting an
    announcement that was entirely correct. It reads as a slow machine and is
    not: the key was never delivered, so no timeout is large enough to fix it.

    Two things generalise past this library. **Waiting for a visible effect
    proves the effect and never the wiring behind it** — and where a dependency
    defers its own listeners, the wait has to be ORDERED against that deferral
    rather than made longer.

    **The ordering this rule originally prescribed was wrong, and measuring it
    is what showed that.** It said one macrotask closes the window "by
    construction, because the sensor's timer was queued first and timers of
    equal delay fire in the order they were queued". That argument assumes the
    sensor has already ATTACHED when the yield is queued — and attach happens
    in a React commit the scheduler may defer. On a page with one more section
    it does defer, and then our timer is queued first, fires first, and the
    first arrow is lost on EVERY run rather than one in three. Measured
    2026-08-20: one macrotask lost it every time, two lost it every time, a
    `requestAnimationFrame` with a `setTimeout` nested inside it lost it never.
    React commits before paint, so the frame callback runs after the commit
    that attached the sensor, and a timer queued from inside that frame is
    queued after the sensor's own. `support/drag.ts` does that now.

    The general form is the part to carry: **an ordering argument has a
    premise about WHEN the other side registered, and that premise is the thing
    to check.** A guard whose correctness rests on queue order is only as true
    as its assumption about what has already run — and the failure mode is not
    a flake that gets rarer on a faster machine, it is a deterministic loss on
    a heavier page. And **a
    "did it happen" check built on a signal that is already dirty is vacuous**:
    the second drag in a test begins with the first drag's own DROP
    announcement still on screen, so `expect(liveRegion).not.toBeEmpty()`
    passed before anything had been lifted — an assertion that could not fail,
    in the one place a dead grip would first be noticed. Wait for a CHANGE from
    what was there, not for presence.

27. **A FIXTURE can make a right answer and a wrong one identical, and then the
    assertion is perfect and proves nothing.** This is the failure that hides
    best, because everything a review looks at is correct: the case reads
    exactly like the behaviour it names, the sabotage is the honest one, and
    the suite stays green through it. The dragging phase sprang it on subject
    after subject. A swap and an insert-and-shift leave the same page when the
    two places are ADJACENT, so the case had to move a block across a place
    rather than beside one. A shift and a swap leave the same page when there
    are only two sections, so the reorder needed a page of three. And a
    write-order guard survived its own removal because the case
    removed a section AFTER the one holding the other half of the exchange,
    where both orders land identically — rewritten to remove the section
    BEFORE it, the same removal reddens.

    The diagnostic is cheap and belongs in the writing rather than the review:
    **name the wrong behaviour you are excluding and ask whether this fixture
    could tell it from the right one.** Two operations, one page, and the
    answer is often no. And where the answer is no and no fixture at that level
    can be built, say so — the dragging suite could not distinguish
    deepest-wins from first-match in a browser at all, because `useDroppable`
    registers children before parents and the first containing candidate simply
    IS the deepest one in that DOM. That was reported rather than added to a
    total, and the discriminating proof was found a level down where the
    candidate order is the test's to make hostile. Rule 23 is the same honesty
    about a different mechanism: there, the assertion never got the chance to
    fail; here, it got the chance and the fixture wasted it.

28. **Anything that ships file CONTENT to a server, rather than committing it,
    is exposed to the checkout's line endings — and in this repo
    `.gitattributes` closed that door, which is why this rule no longer tells
    you to convert anything.** The fault it was written for: `supabase db reset
--linked`, `db push` and any hand-applied `create or replace` send the
    files as they sit on disk, so a CRLF working tree puts a `\r` on every line
    of `prosrc` that the checked-out file does not have. `migra` compares
    function SOURCE, so all ten multi-line functions in `0009` were reported as
    drift at once, including four nobody had touched. **And every local check
    agreed it was fine** — `check:schema-drift` builds its shadow from the same
    files, so both sides matched and it printed "the live database matches",
    while CI checked out LF and was the only place the two sides differed.

    **The mechanism is gone and the instruction with it. Measured on
    2026-08-19:** `core.autocrlf` is still `true`, but `.gitattributes` —
    `bf8cd29`, 2026-07-29, long since on `main` — sets `* text=auto eol=lf` and
    `*.sql text eol=lf`, and **gitattributes beats `core.autocrlf`**.
    `0009_actor_profiles.sql` holds 0 CRLF pairs and 1056 bare LF on disk. So
    the conversion this rule used to mandate is a no-op, and its corollary —
    that a local drift green "is not evidence about CI" — is no longer true for
    line endings. This paragraph replaces the old instruction rather than
    softening it, because whoever fixes a thing deletes the note saying it is
    broken. What is still owed is the general form above: a NEW file type, a
    checkout on a machine without these attributes, or a paste through an
    editor that adds its own endings all reopen it, and the way to check is to
    count the bytes rather than to trust a setting.

    **And it was reopened, on 2026-08-19, by exactly that third route.** An
    agent editing SQL with Python's `pathlib.Path.write_text` re-wrote whole
    files as CRLF: that call applies the platform's newline translation on
    WRITE, so reading a pure-LF file and writing it back unchanged converts
    every line on Windows. Passing `newline="
"` is what stops it, measured
    rather than assumed. Nothing else said so — `git status` showed only the
    lines actually edited, because `.gitattributes` normalises on the way into
    the index, and the committed blobs were clean throughout.

    What it broke is the one thing that reads the WORKING TREE rather than the
    index: `supabase db reset` built the local and shadow databases from the
    CRLF file, so their `prosrc` carried a carriage return and the live
    project's did not. `check:schema-drift` then reported drift in
    **`public_person`, a function the branch never touched** — which reads as
    the live project having been tampered with, and sends you looking in the
    wrong place entirely. The branch's own function was the one that did NOT
    drift, because the apply script normalised before sending.

    Three things to take from it. **A drift report naming a function you did
    not touch is a line-endings report until proven otherwise** — check that
    before anything else, and check it by comparing the live body against the
    LOCAL database rather than against the file, since the local one is what
    was built from the tree. **A `git stash` round-trip silently launders the
    file back to LF**, which is a trap of its own: the evidence disappears the
    moment you try the obvious isolation step, and the next run comes back
    green for a reason unrelated to what you changed. And **count the bytes of
    any file a script has written before committing it** — the same session
    later committed a `CLAUDE.md` with every newline STRIPPED, 90KB on one
    line, and neither the pre-commit hook nor any check noticed. Prose has no
    compiler; only counting catches this.

    **The diagnostic lesson is the part that never expires.** A script written
    to answer "does live match the file" compared `prosrc` against the file and
    reported `same` for all six functions it checked — because it normalised
    line endings first, having been written by somebody who assumed whitespace
    was noise. **A comparison that normalises cannot see the fault it is
    looking for**, and this one normalised away exactly the byte in question.
    Rule 23's cousin: the assertion ran, it just could not fail.

29. **A SABOTAGE is a fixture too, and a green restore afterwards is
    indistinguishable from a real verification.** Rule 27 is about a fixture
    that cannot tell a right answer from a wrong one; this is the same failure
    landing on the step that was supposed to prove the fixture works. "Break it
    and watch it go red" is vacuous when the break you chose lands where the
    watched case cannot see it — and the trap is that the sequence looks
    identical to a successful one: you break, you run, you restore, everything
    is green, and you have learned nothing. The weighted-places branch hit this
    class **seven times in eight tasks**, three of them on sabotage steps
    rather than on test fixtures, which is what makes it a rule rather than an
    anecdote. All measured:

    - `<>` changed to `<` on a length check did not redden anything, because
      both agree on "too short" and diverge only on "too long", and every
      fixture was short.
    - Removing a class's `@lg:` prefix did not redden the "collapses to one
      track" case — and the prediction had been that the rule would then apply
      at EVERY width. It applies at no width: the unprefixed arbitrary-value
      class loses the cascade to `grid-cols-1`, so the grid collapsed
      everywhere and the collapse case passed trivially while three other cases
      reddened.
    - Lowering that threshold instead (`@lg:` → `@xs:`) did not redden it
      either. `@xs` is 20rem of CONTAINER, and the phone fixture's container is
      about 288px once page padding is priced in, so even the too-eager
      threshold leaves 320px collapsed.
    - A brief's order check selected `h3` elements where `PlainLeaf` renders a
      `<span>`. It would have compared `[]` to `[]` and passed forever.
    - A pad fixture `[1, 3, 1]` widened to five gives `[1, 3, 1, 1, 1]` whether
      the code pads with the constant `1` or with the LAST SHARE — because the
      last share is itself `1`. Rewritten to `[1, 3, 2]`, the pad-with-last-
      share sabotage reddens exactly.
    - Two more were caught before they were written, by choosing weights that
      are not a palindrome (`[1, 3, 1]` reversed is itself, so a renderer that
      reverses the array passes every test built on it) and by making a
      truncation (`[2, 5, 4]` → `[2, 5]`) that no preset lookup could have
      produced.

    The diagnostic is the same one and it costs nothing: **name the wrong
    behaviour you are excluding, and ask whether this fixture — or this
    sabotage — could tell it from the right one.** Where the answer is no and
    nothing at that level can discriminate, say so rather than writing
    something that looks like it does. That was the right answer twice here:
    the collapse case's own sabotage was reported as not discriminating rather
    than quietly counted, and the guard that actually pins the threshold was
    found a level down, in unit assertions that compare the class string
    verbatim.

30. **A comment describing what ANOTHER file does is a claim nothing checks,
    and it shipped two broken headline features on one branch.**
    `blocks.tsx` says three separate times that "the route asks the shell for a
    full-width `main`"; `page-shell.tsx` documents `COLUMN.full` as existing
    for exactly that; the prop's type admits it — and **no route ever passed
    it.** Both public pages asked for `"wide"`, so every page was laid inside a
    centred, padded `max-w-7xl` column, and three things were wrong at once: a
    second gutter inside the page's own (16px each side, which moved the
    container-query width at which a three-place section stops collapsing and
    reddened `weighted-places.spec.ts` on a viewport its own header had
    MEASURED), the two widest of the six measures silently capped at 80rem so
    two stops a person can pick did nothing, and a `bleed` section — this
    branch's own headline — unable to reach either edge.

    **Every unit test stayed green through all of it**, because they render
    `PublicBlocks` and assert `MEASURE_CLASS` as class STRINGS. The class was
    always right; the box it was laid in was not. This is rule 18 with the
    tense removed — `check:docs` compares a symbol against its own code, and
    none of those comments was about its own symbol — and it is the repository's
    own "a mocked dependency hides its own setup requirements", the suites that
    mocked the shell away being the ones that could not have caught it. The
    giveaway is a comment whose subject is a different file, and the check is
    one grep: **does the caller it describes exist?** `COLUMN.full` had no
    caller and no test mentioned it either, which is the same fact twice.

    **The same branch shipped the same shape one layer down.** `PAGE_MEASURES`
    gained six stops in TypeScript while `set_actor_theme`'s key allowlist
    never heard of `measure` — and that allowlist ends in
    `raise exception 'unknown theme key %'`, so picking a width did not merely
    fail to persist: it made the WHOLE theme save throw, every colour beside it
    included. `block-limits-match-migration.test.ts` exists to stop exactly
    this for `mode` and `kind`, and a seventh closed vocabulary was added
    beside it without being pinned to the SQL. **A vocabulary written down in
    two languages needs the test that says so in the same change**, and the
    cheap version is a regex over the migration — not because a regex is
    elegant but because nothing else in the build can see across the two.

    What found both was one browser test that seeded a REAL page through the
    product's own RPC and then measured boxes. Neither fault was reachable from
    any suite that mocked the shell or compared a class name, and the second
    was not reachable from any suite at all that did not write to a database.

31. **A SKIPPED test reports green, and a suite that skips most of itself when
    a secret is absent is the easiest way in this repository to believe work is
    verified when it is not.** `pnpm test:e2e` on a shell that has not sourced
    `.secrets` runs 48 of 136 cases and prints `48 passed` — no failures, no
    summary line anybody reads as a warning, and every suite that needs a
    Clerk identity quietly stood down by `global-setup.ts`. That skip is
    correct and must stay: a fork has no secrets and demanding them would turn
    a clean run into a hard failure. What is not correct is reading the result
    as a pass. Three shipped faults on one branch were invisible to every
    local run for exactly this reason, and CI would have caught all three —
    `e2e` is a required check and it HAS the secrets — so the cost was paid at
    the point where it is most expensive to diagnose rather than avoided.

    The habit: **before believing a browser run, check how many cases it
    skipped.** `set -a; . ./.secrets; set +a` in the same invocation is what
    makes the suite whole, and the number to compare against is the case count,
    not the word "passed". The same shape is worth suspecting anywhere a
    `test.skip` is conditioned on the environment rather than on the code.

**`@typescript-eslint/no-deprecated` is enabled, with no exceptions**, and it
is the only check that reads our DEPENDENCIES' deprecations rather than ours. It
found Clerk's warning that middleware path-matching "can leave protected
resources reachable", and next-intl's whole locale API.

Getting there cost a restructure worth knowing about. `next/root-params` only
exposes a segment belonging to the ROOT layout, so `[locale]/layout.tsx` owns
`<html>` now and `app/layout.tsx` is gone. **A language change therefore
REPLACES the document element** — proved with a marker attribute, not inferred —
so anything set imperatively on it is lost. `HtmlLang` puts back all three:
`lang`, `data-theme` recomputed from the same inputs the pre-paint script reads,
and `data-page-theme` from module memory, because `setPageTheme` persists
nothing by design.

This was refused once, on the argument that a layout effect is a weaker
guarantee than a script the browser cannot paint before. **That argument was
wrong and the way it was wrong is rule 10 below**: 184 frames were sampled across
a language change and none painted without the theme.

**A second finding is open.** `fast-check` refuted the claim that derived text
clears 4.5:1 wherever a colour could: on `#e21233` light text reaches 4.12 where
dark would reach 4.81, and none of the fifteen hand-picked backgrounds in
`palette.test.ts` is such a colour. Nothing asserts it, the reproduction is in
`palette-properties.test.ts`, and it is not a property to weaken until it
passes.

**CI gates on `main`:** six jobs are **required**, and a pull request cannot
merge until all six report green — `conformance` (schema suite), `hub` (hub and
`@aeleos/identity` unit tests, both at 100% coverage, plus the production build),
`idp-cloud` (real Clerk ⇄ Supabase trust), `e2e` (the Playwright suite against
a real Chromium — the only browser-level proof the signed-out app handoff works),
`schema-drift` (live database vs `supabase/migrations/`) and `canvas` (dial and
throttled-page cost). Branch protection is `strict`, so a branch must also be
up to date with `main` before it merges, and **admins are not exempt**: there is
no one who can push past a red check. Merges are **squash only** (merge commits
and rebases are off), history on `main` is linear, force-pushes and deleting
`main` are off, and unresolved review threads block merge. The required-check
list still lives in repository settings, not in the workflow file — read it
from the API rather than inferring it from the YAML:

```bash
gh api repos/vaoan/AeleOS/branches/main/protection/required_status_checks --jq '.contexts'
```

Fork pull requests are the other catch. `e2e`, `idp-cloud`, `schema-drift` and
`canvas` all skip on forks because secrets are withheld there — on a fork they
cannot report green at all, so that route needs the owner.

`canvas` and `schema-drift` are on that required list (2026-08-20). `canvas`
measures every canvas at the top of both dials and then what a
personalised page costs on a throttled phone; both faults it guards against
shipped to `main` under a green tick. Its dial half was stood down while the
block model's first phases landed, because the fixture is built from mode and
kind pairs the flat editor of the day had no name for, so the route it measures
opened empty; the editor port restored it and both halves run. That guard's own
note is where rule 21 came from.

`schema-drift` runs `pnpm check:schema-drift`, and it exists because of the
in-place-migration hazard above:
it compares `supabase/migrations/` against the **live** project, which is the
one thing no other check looks at. It carries the same fork `if:` guard as
`idp-cloud`, because it needs the database password.

It runs `supabase db diff` under each of the engines it needs, and **no pass is
ever skipped because an earlier one was clean** — that ordering is the design
rather than belt-and-braces. `migra` reads structure with no noise and is
**blind to `COMMENT ON`**, proven by perturbing a live column comment and
watching it report nothing, so a `pg-delta` pass counting only `COMMENT ON`
runs first. That pass is also what makes a green verdict honest: given a wrong
password the CLI's migra engine exits 0 and prints "No schema changes found",
byte-identical to a clean project, so a migra-only job would have gone
permanently green the moment the secret rotated. Where it goes red for
something other than drift, it is still working: a pull request that **adds** a
migration stays red until it is pushed to live, which is how this repo already
works, and a new table stays red until it grants `service_role`.

Claude's role throughout: build and test the hub here, specify exactly what to
configure in Clerk, and write the per-app integration code in the respective app
repos.
