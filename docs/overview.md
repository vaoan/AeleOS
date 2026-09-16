# AeleOS — the long form

Moved verbatim from the root `CLAUDE.md` on 2026-09-15 (see `docs/superpowers/specs/2026-09-15-instruction-architecture-design.md`). The root keeps the short form and points here.

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
  social logins once" real. The **Hobby** plan covers 50,000 monthly RETAINED
  users at **$0** — MRU, counted only for somebody returning 24 hours or more
  after signing up, which is more generous than the MAU this line used to say
  (re-read 2026-09-07) — with **three** social connections; unlimited is Pro at
  $20–25/month and the budget refuses it. It is supported by the Supabase CLI
  so the conformance suite runs locally.
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
- **Era looks — DESIGNED, NOT BUILT (2026-08-28):**
  `docs/superpowers/specs/2026-08-28-era-looks-design.md`. Five OS-era looks as
  page DOCUMENTS rather than skins, because two existing skins already carry
  the chrome of three of the five — `retro` is Windows 98's bevel and `aero` is
  Aero glass — and a look spans five vocabularies, so it belongs to none of
  them. Read it before adding a skin for a named product: the bar that removed
  `columns` applies. It also predicts, on the record and before building, that
  Windows 8 cannot be done, because Metro is per-block colour and per-block
  colour is refused by design.

  Its three phases ship independently and so get a plan each. Phase 1 is
  `docs/superpowers/plans/2026-08-28-era-looks-phase-1-template-seam.md`, and
  it locates the seam the spec implied without naming: `BlockEditor` holds the
  template picker and does NOT hold the theme, so "one path, not two" means
  lifting document application up to `FursonaEditor`, where the source dock
  already does it.

  **Read its correction banner first.** The plan was written against a
  `PageDocument` type that does not exist — `page-document.ts` is text-in and
  text-out — so a template carries the parsed `{ theme, blocks }` shape rather
  than JSON, and is not re-parsed at runtime. The guarantee re-parsing would
  have bought is taken at BUILD time instead: every shipped template is pushed
  through the real `toDocument`/`parseDocument` pair in its own test, so one
  the parser refuses fails the build rather than somebody's editor.

  Phase 2 is
  `docs/superpowers/plans/2026-08-28-era-looks-phase-2-the-five-looks.md`, and
  the captures it was planned against sharpen two of the spec's claims. **Vista
  and Windows 7 differ by PALETTE, not mechanism** — both are `aero`, one
  dark-tinted on green and one light-tinted on blue — where the spec called
  them near-identical. And **Windows 8 is confirmed unbuildable rather than
  predicted**: the Metro capture is flat solid tiles in seven different
  colours, and per-block colour is refused by design. Its ARRANGEMENT is
  reachable — `spaces` plus `weights` express the mixed tile sizes — so it is
  colour alone that is out of reach, which makes it a decision about a standing
  ruling rather than a gap to patch quietly.

  **Built and photographed on 2026-08-28, and the pictures found the biggest
  gap of all.** Five looks are seeded under `/137/era-*` and the findings sit
  with the eleven social ones. One missing mechanism explains most of the
  fidelity loss across three of the five: **a page cannot choose its SURFACE
  colour independently of its background**, so a panel is always a tint of the
  ground — Win98 wants silver on teal, XP near-white on blue, Metro coloured
  tiles on black. That is not the per-BLOCK colour already refused by design;
  it is per-page, and it is the more ordinary want. Vista and Windows 7, by
  contrast, needed nothing new at all.

  **Gap 8 is closed: a page chooses what its PANELS are painted with
  (2026-08-28).** `theme.surface` is a colour or null, null being the stepped
  panel every page had, so nothing stored moved. Windows 98 is silver on teal
  now and XP near-white on Luna blue — both unreachable before, because every
  derived colour stepped away from the background and a panel was always a tint
  of the ground behind it.

  **Choosing one gives the page TWO grounds**, and `derivePalette` solves ink,
  muted and edge against whichever leaves least room — the hardest-stop rule
  extended from one ground to two. What it guarantees is narrower than "both
  clear 4.5", and a failing test is what found the difference: `#008080` sits
  near mid-lightness and never cleared the minimum with or without this key, so
  the contract is that **a second ground costs the first nothing** — measured,
  the field stays at 4.05 exactly while the panel goes from 4.97 to 10.61.
  Weakening the assertion to make it pass would have been rule 7's forbidden
  move.

  It edits `set_actor_theme` in `0009`, so it carries the in-place-migration
  obligation: hand-apply to live, and do it LAST, immediately before merge, one
  pull request at a time — the push makes live the newer side and every other
  open pull request sees drift until yours merges.

  **The seeder reads a generated artefact rather than importing or copying.**
  `scripts/seed-pastiches.mjs` is plain JavaScript and cannot resolve the app's
  `@/` alias, so `scripts/era-looks.generated.json` is the seam and
  `apps/hub/tests/era-looks-json.test.ts` fails when it drifts from the module.
  That guard compares DATA and not text, because comparing text made it fight
  prettier forever — rule 6, with the formatter owning shape and the guard
  owning content.

- **Instruction architecture — APPROVED, NOT BUILT (2026-09-15):**
  `docs/superpowers/specs/2026-09-15-instruction-architecture-design.md`.
  This file is 240 KB and two nested notes are 100–200 KB; each crosses the
  CLI's large-memory-file threshold (five percent of the context window in
  characters, 150,000 for the current model), and a vertical actors task
  loads all three layer notes at once. The design keeps every rule and moves
  every receipt: a root map under 200 lines, `.claude/rules/*.md` scoped by
  `paths:`, skills for procedures, `docs/lessons/` and `HISTORY.md` for the
  narratives verbatim. Plan, seven phases, each its own pull request:
  `docs/superpowers/plans/2026-09-15-instruction-architecture.md`. Phase 1
  is a measurement; nothing here moves until it has run.
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
