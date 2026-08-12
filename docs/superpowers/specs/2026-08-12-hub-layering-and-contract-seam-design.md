# Hub layering and the cross-repo contract seam

- **Date:** 2026-08-12
- **Status:** Decided
- **Amends:** the "small shared integration helper package — _only if/when 2+
  apps need it — YAGNI until then_" row in `CLAUDE.md`. The condition has been
  met; this document is what fires it.
- **Relates to:** Libra's `ADR-0135-auth-host-boundary`, which already names
  `packages/auth` as the seam an AeleOS package would replace.

## Why now

Two pressures arrived together.

**The hub outgrew its shape.** 26 of the 40 files in `apps/hub/src` sit in a
flat `components/` and `lib/` split, with no boundary between the sign-in flow,
the actor model, and the page chrome. Phase 1b-ii adds fursonas and the picker to
that flat namespace. The cost of imposing structure rises with every file added
before it.

**The YAGNI condition fired.** `CLAUDE.md` gates the shared integration package
on "2+ apps need it". Puck is Phase 1 and Libra is Phase 3 — both are in the
plan, and both already have a `packages/auth` slot waiting for it. Puck's holds
only `permissions.ts`; Libra's holds the mock auth-host client that ADR-0135
explicitly says will be replaced by a real IdP "while preserving `packages/auth`
contracts". The landing zone exists in both repos.

## What this is not

**This is not "make AeleOS look like Libra".** Libra and AeleOS scale along
different axes, and copying the layout wholesale would be cargo-culting:

- **Libra scales inward** — seven apps in one repo, sharing five packages
  through `workspace:*`.
- **AeleOS scales outward** — one app that must serve N apps living in _other
  repositories_. `workspace:*` cannot reach Puck or Libra.

So Turbo, `config/app-links.json`, and the multi-environment `$secret:` loader
are answers to questions AeleOS is not asking, and are deliberately **out of
scope**. What transfers is the layering discipline inside the app, and the
contract-package seam.

## Decision 1 — Two features, not three

```
apps/hub/src/
├── app/[locale]/…              routing only (thin wrappers — already true)
├── features/
│   ├── session/                sign-in form, SSO callback, sign-out,
│   │                             user menu, provider marks, Clerk appearance,
│   │                             providers, public-routes
│   └── actors/                 /me and the person actor
│                                 └── fursonas + picker land HERE in 1b-ii
└── shared/
    ├── application/            theme, nebula-preference
    ├── infrastructure/         env, fonts, i18n, request-locale, test-id
    └── presentation/           page-shell, html-lang, nebula-canvas,
                                  nebula-toggle, star-toggle, theme-toggle,
                                  language-toggle
```

**Fursonas is not a third feature.** `/me`, fursonas, and the picker are one
domain — the actor model. A person actor and a fursona actor are rows in the
same table under the same ownership ledger; the picker chooses between them.
Splitting them would put `actor_ref` in two features' domains and force exactly
the cross-feature import the rule forbids.

**The chrome is `shared/presentation`, not a feature.** The nebula, the theme
and locale toggles, and the page shell are used by every page and own no domain
concept. A `features/appearance/` would be a feature with no subject.

Layers (`domain` / `application` / `infrastructure` / `presentation`) are
created **as a feature earns them**, following Libra's own precedent — its
`cart` feature has `domain`, `application` and `presentation` and no
`infrastructure`. `session` needs infrastructure and presentation today and has
no domain type of its own. Empty layer folders are not created for symmetry:
under AeleOS's doc gate every barrel is a symbol that needs TSDoc, so ceremony
here is paid for in prose nobody reads.

Each feature exposes an `index.ts` public API. No feature imports another.

## Decision 2 — The package must not import Clerk

`packages/identity/`, published as **`@aeleos/identity`**. Checked on
2026-08-12: the registry has no `@aeleos/identity` and no `aeleos` package, so
the name is available — though the scope itself must still be registered before
the first publish, which happens at Puck's integration, not now.

The signature is the whole design:

```ts
createIdentityClient({ getToken, url, anonKey });
```

`getToken: () => Promise<string | null>` is a **parameter**, not an import. Each
app supplies its own — `@clerk/nextjs/server` in the hub, whatever each of Puck
and Libra uses in theirs.

This is the most consequential decision in this document, and it is load-bearing
for a promise made elsewhere:

1. **It preserves the escape hatch.** The design spec's central rule is that the
   user ID is sacred and swapping the token issuer stays a one-column
   `identity_sub` backfill. A package that imported `@clerk/nextjs` would put
   Clerk in the dependency graph of every app on the platform, and that promise
   would quietly become false — not by anyone deciding to weaken it, but by an
   import. The package never learns it is Clerk.
2. **It decouples from the churn.** Next version, React version, and Clerk SDK
   version are the three things that differ per app and move fastest. A
   framework-free package is not dragged by any of them.
3. **It is testable without an IdP.** A fake `getToken` is a one-line stub.

### Contents

| In                                     | Why                                               |
| -------------------------------------- | ------------------------------------------------- |
| `createIdentityClient`                 | The Supabase-client factory — the duplicated code |
| `ensurePersonActor` / `getPersonActor` | Every app copies the canonical actor schema       |
| Claim and `identity_sub` types         | The contract itself                               |

| Out                     | Why                                                      |
| ----------------------- | -------------------------------------------------------- |
| React components, hooks | Framework-version coupled; each app's shell differs      |
| Next middleware         | Router conventions differ per app                        |
| Environment loading     | Each app owns its own env, and AeleOS's is Zod-validated |

The actor accessors belong **in** the package rather than in the hub because
`CLAUDE.md` already states that `supabase/migrations/` is "the canonical
actor-model schema every app copies". Every app therefore runs the same queries
against the same shape, and `getPersonActor`'s hard-won distinction between
absence and failure — "no rows" returns null, everything else throws — should
exist once rather than be re-derived per app.

`@supabase/supabase-js` is a **peerDependency**, so the app controls the
version. No other runtime dependencies.

## Decision 3 — Dogfood before publish

`packages/identity` lives in this repo; `apps/hub` consumes it via
`workspace:*`. It is published to public npm by a tag-triggered GitHub Actions
workflow **only when Puck actually integrates**.

The reason is not caution about npm. It is that an interface designed against a
hypothetical consumer is a guess, and the cost of a wrong guess rises the moment
a second repository pins a version. The hub is a real consumer available today;
it should find the design wrong before anyone else can.

Versioning is semver, and the `index.ts` surface is the contract. `check:docs`
already guards TSDoc freshness on exported symbols, which extends to the package
without modification.

All three repositories are public, so publishing costs nothing. The one new
dependency is an npm account and an `NPM_TOKEN` repository secret — no card, no
paid tier, consistent with the $0 constraint.

## Enforcement

ESLint `no-restricted-imports`, matching Libra's rules:

| Rule                                       | Prevents                         |
| ------------------------------------------ | -------------------------------- |
| No feature imports another feature         | Tangled domains                  |
| Absolute `@/…` for cross-directory imports | `../../../` chains               |
| Layer direction inward only                | Presentation leaking into domain |
| `packages/` never imports from `apps/`     | The dependency rule inverting    |

`madge --circular` is already part of `check:tools` and covers the rest.

## Testing

Package tests use a fake `getToken` and a stubbed Supabase client. The existing
`tests/idp/` cloud job continues to prove the real Clerk⇄Supabase trust on every
pull request — that job is what makes a framework-free package safe, because the
integration it no longer imports is still verified end to end.

Hub tests move with their subjects. All 148 stay green throughout; a red test at
any point in the restructure means a move went wrong, which is the property that
makes the diff reviewable despite its size.

AeleOS's existing gates are unchanged: branch coverage, the sabotage rule, and
TSDoc on every export.

## The one real hazard: `check:docs` goes blind on moves

`scripts/check-doc-freshness.mjs` compares by file path, using
`git diff --name-only` and `git show <base>:<path>`. For a moved file the base
lookup fails, the file reads as newly added, and **added symbols are ignored by
design**.

So the gate does not block a restructure — it goes _silent_ during one. A commit
that both moves a file and changes its behaviour would carry that change past
the doc-freshness check unexamined.

The mitigation is a sequencing rule, not a code change: **pure moves land in
their own commits, with edits in separate commits afterwards.** This is good
practice regardless, and here it is the only thing standing between a large
refactor and an unreviewed behaviour change.

## Order of work

1. **Restructure** `apps/hub/src` into `features/` and `shared/`. Move-only
   commits. Tests green at every step.
2. **Extract** `packages/identity`, hub consumes it via `workspace:*`.
3. **Fursonas** (Phase 1b-ii) is then built directly onto the finished shape
   rather than written flat and moved later.

Publishing to npm is deferred to Puck's integration and is not part of this
work.

## What this does not cover

- Turbo, a multi-environment `$secret:` loader, or an app registry. Out of
  scope, per "What this is not".
- Puck's and Libra's own integration code, which lives in their repositories.
- The npm release workflow, which is written when Puck integrates.
- Any change to `supabase/migrations/`, the Clerk configuration, or the
  deployment pipeline.
