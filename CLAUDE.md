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

The identity provider itself is **[Logto](https://logto.io)** — a managed,
open-source IdP running in Logto Cloud, reachable at `id.furrycolombia.com`. We
**configure** an IdP; we do not build one.

This repo is the **home for the cross-app identity concern** that belongs to no
single app:

| Lives here                                                                                                 | Path / status                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Design & specs (architecture, decisions)                                                                   | `docs/superpowers/specs/`                         |
| Implementation plans (phased rollout)                                                                      | `docs/superpowers/plans/`                         |
| Logto configuration-as-code (connectors, apps, branding), exported for version control & disaster recovery | _added during implementation_                     |
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

- **IdP = Logto (chosen over WorkOS, "one shared Supabase project", and a
  shared-JWT-secret hack).** Logto is the only option satisfying all four
  constraints at once: **$0** at our scale (free tier), **near-zero ops**
  (managed), **real multi-app SSO** (purpose-built), and an **open-source escape
  hatch** — if we outgrow the free tier we self-host the _same product_ with the
  _same user IDs_, a near-zero migration.
- **Each app keeps its own separate Supabase project/database.** Supabase couples
  Auth + DB in one project, and the existing apps already have their own
  production projects — so we do **not** merge databases. Instead each app's
  Supabase project uses **Supabase Third-Party Auth** to _trust_ Logto; RLS keeps
  working, keyed to the Logto identity (`auth.jwt()->>'sub'`).
- **The user ID is sacred (the most important rule).** The only genuinely
  expensive migration in any identity system is changing the ID that app data is
  keyed to. So every app stores a stable **`identity_sub`** column (Logto's `sub`)
  and **never** lets its own data keys depend on the IdP — app-local tables keep
  their own local primary keys. Swapping the token issuer later is then a
  one-column backfill, not a data remap. **Never weaken this.**
- **SSO via the shared Logto session**, not a hand-rolled shared cookie. All apps
  are subdomains of `furrycolombia.com` and redirect to the same Logto session, so
  additional apps sign the user in silently.
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
- **Don't get trapped.** Every choice must keep a low-migration exit (this is why
  Logto's open-source self-host path and the sacred `identity_sub` both matter).

## Phased rollout (do not skip Phase 0)

1. **Phase 0 — Stand up + de-risk.** Create the Logto tenant, point
   `id.furrycolombia.com` at it, configure Google + Discord connectors, and
   **validate the Supabase⇄Logto trust on a throwaway Supabase project before
   touching any real app.** This is the one real technical unknown.
2. **Phase 1 — New / greenfield app (and Puck).** Integrate end-to-end to prove
   the pattern. Puck is safe to migrate early because it is **not yet in
   production**; note Puck's foundation `user_profiles` FKs to `auth.users(id)` and
   that FK must be reworked to the `identity_sub` model.
3. **Phase 3 — Libra (production — careful, its own plan).** Import users to
   Logto by email, backfill `identity_sub` (no domain-data remap), switch to
   Third-Party Auth, verify in staging, keep a rollback path.

## References

- **Design spec (source of truth):**
  `docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`
- **Logto:** https://logto.io — docs: https://docs.logto.io
- **Supabase Third-Party Auth:** the mechanism each app uses to trust Logto.
- **Sister repos (shared toolchain & conventions):** `Z:\Github\puck`,
  `Z:\Github\libra`. Consult them for tooling/CI/convention decisions and
  mirror their approach; AeleOS follows the same pnpm + strict-TS + ESLint +
  Prettier + kebab-case-filenames discipline once it grows code.

> ⚠️ **Libra is in production. Never run anything against its database.**
> Each app has its own separate Supabase project; never cross credentials between
> them, and never point any AeleOS/Logto config at a production data project
> except as explicitly designed in the migration plan.

## Conventions

- **Secrets never in git.** Real values live in `.secrets` / provider dashboards /
  CI secrets. `.env`, `.secrets`, and raw Logto config dumps are gitignored — only
  sanitized/example config is committed.
- **Filenames:** kebab-case (matching the sister projects).
- **Specs & plans:** follow the `docs/superpowers/{specs,plans}/YYYY-MM-DD-*.md`
  convention used across the platform (brainstorm → spec → plan → implement).
- **Git:** work on branches, open PRs; do **not** commit unless the user
  explicitly asks. Never commit secrets.

## Current state

🌱 **Design phase.** The central-auth design is approved and committed. Nothing is
implemented yet — the next step is writing the **Phase 0 + Phase 1 implementation
plan** into `docs/superpowers/plans/`. Standing up Logto requires the maintainer to
create the Logto Cloud account (a manual signup + dashboard step Claude cannot do);
Claude's role is to specify exactly what to configure and to write the per-app
integration code in the respective app repos.
