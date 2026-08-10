# IdP decision change — Logto → Clerk

- **Date:** 2026-07-31
- **Status:** Decided
- **Supersedes:** the Logto choice in `2026-07-26-aeleos-central-auth-design.md` §2

## What forced the change

The central-auth design's mechanism was: each app's Supabase project uses
**Third-Party Auth** to trust Logto, so `auth.jwt()->>'sub'` yields the Logto
user ID.

**Supabase Third-Party Auth does not support Logto, and has no generic OIDC
option.** It supports exactly Clerk, Firebase, Auth0, AWS Cognito and WorkOS —
confirmed both in Supabase's documentation and in the `[auth.third_party.*]`
blocks of the CLI's own `config.toml`. Logto's own Supabase guide documents a
different pattern entirely: a backend that validates a Logto token and mints a
Supabase JWT.

Phase 0 existed precisely to find this before any app was migrated. It did.

## Why Clerk

Of the five supported providers, Clerk alone has **both Google and Discord as
native connections**, which is what makes "configure social logins once" real
rather than aspirational. It is present in the local CLI config, so the entire
72-test conformance suite keeps running against a local stack. Its free plan
covers 50,000 monthly users against a $0 budget.

Alternatives weighed: WorkOS has a far larger free tier but no native Discord
and no local CLI support. Auth0 allows brand customisation on free but needs a
custom social connection for Discord. Firebase and Cognito need Discord via
OIDC.

## What was lost, honestly

**The open-source escape hatch.** None of the five providers is self-hostable,
so "self-host the same product if pricing turns" is off the table — and that was
the decisive tiebreaker that chose Logto over WorkOS originally.

A Supabase-as-IdP architecture would have preserved it (Supabase Auth can act as
an OAuth 2.1/OIDC provider, and Supabase is open source), but it requires a third
Supabase project.

> **Correction (2026-08-09).** This passage claimed Puck and Libra held both
> free slots. Puck has never had a Supabase project, so at the time of writing
> only one slot (Libra's) was taken and an extra project was in fact free. Both
> slots are used today (Libra + AeleOS), so the cost objection holds now — but it
> did not when the decision was made. The decision stands on the remaining
> grounds: it rides a beta feature, and any paid tier is a hard stop under the
> $0 budget.

## Why that loss is acceptable

The escape hatch it protected is already provided by the actor model. Domain data
keys on local ids; `identity_sub` is the only IdP-facing column; `actor_ref`,
`owner_ref` and every `author_person_ref` snapshot are **stored, not recomputed**.
Swapping issuers is therefore a one-column backfill matched by email — the same
migration shape §7 already describes for Libra, with zero domain rows
touched.

Self-hostability was a second layer of insurance over an exit we already own.
Paying $300/year now to keep it would be buying the same insurance twice.

## Costs accepted

- Clerk branding on the hosted login page (free plan).
- Maximum 3 social connections (Google + Discord = 2, one spare).
- No self-host path; exit is the one-column backfill above.

## What Phase 0 validated

⏳ **Pending — not yet run.** The scaffolding exists (`pnpm test:idp`,
`supabase/migrations/0008_idp_introspection.sql`), but the validation needs a
real Clerk instance and a captured session token, which are human-only steps.
See `docs/phase-0-clerk-setup.md`.

The decision above does **not** depend on those results: it rests on the
supported-provider list, which is documented fact. What remains to be proven is
that the integration behaves as documented — that Supabase accepts Clerk-issued
tokens, that `auth.jwt()->>'sub'` resolves to the Clerk user id, that the
`authenticated` role is assigned, that forged tokens are rejected, and that
Phase 1a's migrations need no changes.

If any of that fails, it is recorded here and in `docs/phase-0-report.md` as a
finding — Phase 1a's migrations are not to be edited to make it pass.
