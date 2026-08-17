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
  because `section-editor.test.tsx`'s only coverage mocks
  `@hello-pangea/dnd` entirely and counts buttons by `aria-label` — wiring
  that passes whether or not a lift ever begins. The guard is now
  `tests/e2e/section-drag-reorder.spec.ts`, which drives a real drag by
  keyboard and is sabotage-verified against the original fault: removing the
  prop leaves the library's own `aria-live` announcement empty, because the
  lift never starts. Same lesson, same shape: the suite that mocked the
  dependency away is the one that could not have caught this, and the one
  that used the real thing did on its first run.

  **The fix landed only in `section-editor.tsx`.**
  `fursona-list.tsx`'s own drag grip carries the identical missing
  `disableInteractiveElementBlocking`, still unfixed as of the 2026-08-16
  final review — noted here rather than silently left for the next person to
  rediscover the same way.

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
  explicitly asks. Never commit secrets.
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
  `supabase/migrations/` holds the canonical schema in **ten files, every object
  defined exactly once** (2026-08-13). It grew to fourteen migrations in which
  six objects had been redefined by `create or replace` — `actors_public` four
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
  react-hook-form with a sticky toolbar; sections in four layouts with
  bilingual, per-item fields; an icon picker; and four starting templates
  shipped in code rather than in a table. Spec:
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
  was consolidated to ten files with every object defined exactly once** — it
  had grown to fourteen in which six objects were redefined by `create or
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

- **A section may carry its own form (2026-08-16).** A skin, a background
  picture and a fit, apart from the page's — edited in a paintbrush popup with
  a live preview, using the same `sectionStyle` the public page renders with
  so the two cannot drift. **Absent means "inherit the page,"** a real answer
  rather than a gap. **Colour stays page-level and always will** — a skin
  names no colour of its own, and every pairing of a style and a palette is
  somebody's page; a per-section colour would collapse that. Read
  `apps/hub/src/features/actors/CLAUDE.md` for what a section may set, the
  nesting fix a skin needed to apply twice without falling through to the
  wrong scope, and why the readability escape hatch stays page-level rather
  than growing a per-section correction. `card_size` did not ship with this —
  see the spec's Phasing section — because nothing yet rendered it; it landed
  in the phase below, beside the grid that does.

  The same pass fixed a section's drag handle, dead since it was first
  written and invisible to the only test that covered it — see "Every bug
  gets a regression test" above for the fault, the fix, and the lesson it is
  the second instance of.

- **The section-personality design is delivered end to end (2026-08-16).** The
  embed provider table, with the Content-Security-Policy's `frame-src`
  derived from it rather than kept as a second list somebody has to remember
  to update; the `posts` and `socials` layouts; the per-section form (skin,
  background picture, card size); the `cards` grid the size dial actually
  feeds; and a background picture behind the whole page, layered correctly
  over the author's own gradient. Read
  `apps/hub/src/features/actors/CLAUDE.md` and
  `docs/superpowers/specs/2026-08-15-section-personality-design.md` — the
  latter is now marked complete — for what each piece does and does not do,
  including the parts still resting on somebody else's undocumented behaviour
  (`posts`) and the one thing reasoned from the CSS spec rather than watched
  in a browser (the page background's `background-attachment`).

## The toolchain, and the nine rules it cost

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

**CI gates on `main`:** four jobs are **required**, and a pull request cannot
merge until all four report green — `conformance` (schema suite), `hub` (hub and
`@aeleos/identity` unit tests, both at 100% coverage, plus the production build),
`idp-cloud` (real Clerk ⇄ Supabase trust) and `e2e` (the Playwright suite against
a real Chromium — the only browser-level proof the signed-out app handoff works).
Branch protection is `strict`, so a branch must also be up to date with `main`
before it merges, and **admins are not exempt**: there is no one who can push
past a red check.

Two consequences worth knowing before you plan work around them. `e2e` and
`idp-cloud` both carry an `if:` guard that skips them on **fork** pull requests,
because secrets are withheld there — on a fork they cannot report green at all,
so that route needs the owner. And `e2e` was made required after the fact, which
is why nothing in `.github/workflows/` says so: the required-check list lives in
repository settings, not in the workflow file, and the two can disagree without
anything failing. Read it from the API rather than inferring it from the YAML:

```bash
gh api repos/vaoan/AeleOS/branches/main/protection/required_status_checks --jq '.contexts'
```

Claude's role throughout: build and test the hub here, specify exactly what to
configure in Clerk, and write the per-app integration code in the respective app
repos.
