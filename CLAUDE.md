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

> **This is NOT a hosted application. There is no login app to build or deploy.**

The identity provider itself is **[Clerk](https://clerk.com)** — a managed IdP,
eventually reachable at `id.furrycolombia.com`. We **configure** an IdP; we do
not build one.

This repo is the **home for the cross-app identity concern** that belongs to no
single app:

| Lives here                                                                                                 | Path / status                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Design & specs (architecture, decisions)                                                                   | `docs/superpowers/specs/`                         |
| Implementation plans (phased rollout)                                                                      | `docs/superpowers/plans/`                         |
| Clerk configuration-as-code (connectors, apps, branding), exported for version control & disaster recovery | _added during implementation_                     |
| A small shared integration helper package                                                                  | _only if/when 2+ apps need it — YAGNI until then_ |

**Per-app integration code** (the OIDC client + Supabase third-party-auth wiring)
lives in **each app's own repo** (`puck`, `libra`, …) — **not** here. The
**AeleOS hub app** (`aeleos-hub`) — the fursona/profile registry, ownership ledger,
and actor picker — is likewise its own deployable repo; this repo stays
non-deployable.

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
   Discord connections, and **validate the Supabase⇄Clerk trust against a local
   Supabase stack before touching any real app.** This is the one real technical
   unknown. (DNS for `id.furrycolombia.com` is deferred to Phase 1; a Clerk
   development instance does not use a custom domain.)
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
- **Git:** work on branches, open PRs; do **not** commit unless the user
  explicitly asks. Never commit secrets.
- **Always branch from an explicit base — `git checkout -b <name> origin/main`.**
  Never bare `git checkout -b <name>`, which silently branches from whatever is
  currently checked out. This repo keeps a long-lived feature branch
  (`phase-0-clerk-standup`), so "whatever is checked out" is very often _not_
  `main`.

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

🌿 **Phase 1a shipped; Phase 0 awaiting its human steps.**

- **Phase 1a (actor model seam) — done.** `supabase/migrations/0001`–`0007` hold
  the canonical schema; `tests/db/` is the conformance suite apps run against
  their own database. Plan: `2026-07-29-phase-1a-actor-model-seam.md`.
- **Phase 0 (Clerk standup) — scaffolding in place, validation not yet run.**
  `pnpm test:idp` and migration `0008` exist and skip cleanly without
  credentials. It is **blocked on the maintainer** creating the Clerk account and
  activating the Supabase integration — a dashboard step Claude cannot do. See
  `docs/phase-0-clerk-setup.md`.
- **Phase 1b (the hub) — planned, not started.** `aeleos-hub` is its own repo and
  does not exist yet. Plans: `2026-08-02-phase-1b-i-hub-foundation.md` and
  `2026-08-02-phase-1b-ii-fursonas-and-picker.md`. Both depend on Phase 0.

Claude's role throughout: specify exactly what to configure, and write the
per-app integration code in the respective app repos.
