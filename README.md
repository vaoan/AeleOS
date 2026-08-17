# AeleOS 🌟

**The identity core of Furry Colombia — the star every app orbits.**

AeleOS is the central **identity provider** for the Furry Colombia platform. One
person = one identity, one login, across every app ([Puck](https://github.com/vaoan),
Libra, and everything that comes next), all under subdomains of
`furrycolombia.com`.

> Naming: our apps are celestial bodies — **Puck** (a moon of Uranus), **Janus**
> (a moon of Saturn). AeleOS is the **star** at the center they orbit. The name is
> the founder's fursona, _Aeleos_ + `OS` — because identity is the operating
> system the whole platform runs on.

## What this repo is (and isn't)

We do **not** build an identity provider. The IdP itself is
[**Clerk**](https://clerk.com) (managed cloud) — we _configure_ it, we don't
write a login service. Nobody is ever redirected to a Clerk-branded address: the
hub renders Clerk's components itself, so people sign in at
`me.furrycolombia.com/sign-in`.

We do ship one application: the **hub** at `apps/hub` (see below), where a
person signs in and manages their fursonas. It lives here because the schema it
reads is here, and two repositories issuing `supabase db push` at one database
would be two sources of truth — see
[`docs/superpowers/specs/2026-08-10-hub-in-aeleos-design.md`](docs/superpowers/specs/2026-08-10-hub-in-aeleos-design.md).

This repo is also the **home for the cross-app identity concern** that belongs
to no single app:

- 📐 **Design & specs** — architecture and decisions (`docs/superpowers/specs/`)
- 🗺️ **Implementation plans** — phased rollout (`docs/superpowers/plans/`)
- ⚙️ **Clerk configuration-as-code** — connections, applications, branding,
  exported for version control & disaster recovery _(added during implementation)_
- 🧩 **`packages/identity`** — `@aeleos/identity`, the Supabase-client and actor
  plumbing every app would otherwise copy. Private and unpublished until Puck
  actually integrates. Its one hard rule: **it imports no framework, and above
  all no Clerk** — `getToken` is a parameter, so the code never learns which
  provider issued the token. That is enforced in `eslint.config.mjs`, not
  trusted.

Per-app integration code (the OIDC client + Supabase third-party-auth wiring)
for _other_ apps — Puck, Libra — lives in **each app's own repo**, not here.

## The hub

`apps/hub` is the AeleOS web application — where a person signs in and manages
their fursonas. It is the only deployable thing in this repository.

It is bilingual (Spanish is the fallback, deliberately unlike Libra), carries
its own visual identity, and includes a **fursona studio**: a filterable,
drag-reorderable list and a full-page editor where somebody composes their
character's page out of sections in whichever of the layouts suits it, with
per-item bilingual fields, an icon picker and shipped starting templates.

It is live at **[me.furrycolombia.com](https://me.furrycolombia.com)**, deployed
from GitHub Actions on every push to `main`.

Running it locally needs no Docker and no local database — the defaults point at
the hosted services, so this works on any machine:

```bash
pnpm install
pnpm sync-secrets                              # pulls credentials from GitHub
cp apps/hub/.env.example apps/hub/.env.local   # paste the four values from .secrets
pnpm dev                                       # http://localhost:5100
```

That runs against the **hosted** Supabase project, so signing in while developing
provisions a real actor in the shared registry. A local stack is only needed for
schema work — see `apps/hub/.env.example` for the switch. `pnpm test:db` always
uses a local stack regardless.

The hub ships no migrations. `supabase/migrations/` at the root is the single
schema for the one database — see [`docs/registry.md`](docs/registry.md).

### Checks

```bash
pnpm --filter hub test:coverage   # unit — 100% on all four metrics, and it is a gate
pnpm --filter hub test:e2e        # end-to-end against a real Chromium
pnpm --filter hub build           # catches what unit tests mock away
pnpm typecheck && pnpm lint && pnpm format:check && pnpm secretlint
pnpm check:docs && pnpm check:tools && pnpm check:contrast
```

**Four CI jobs are required to merge** and admins are not exempt:
`conformance` (the schema suite), `hub` (unit tests at 100% coverage plus the
production build), `idp-cloud` (the real Clerk ⇄ Supabase trust) and `e2e`.
Branch protection is `strict`, so a branch must also be up to date with `main`.

## Working here

Most of this is enforced, so you will meet it as a red check rather than as
advice. The reasons are the useful part:

- **Branch from an explicit base: `git checkout -b <name> origin/main`.** Never
  bare `git checkout -b`, which silently branches from whatever is checked out —
  usually the last feature branch. This has gone wrong twice, and both times the
  pull request would have **reverted work already merged**. Before pushing,
  `git log --oneline origin/main..HEAD` should list only your commits.
- **100% coverage on all four metrics in `apps/hub`, and it gates the build.**
  An untested error branch fails CI. More importantly: a test that has never
  been seen failing proves nothing, so when you add one that guards
  already-correct behaviour, **break the code, watch it go red, restore**.
- **Every bug gets a regression test**, written against the unfixed code, at the
  level the bug actually lived at — which is rarely where it was noticed. When a
  bug turns out to be wiring that a mock stood in for, the regression test has
  to use the real thing, and it will usually be the only test that does.
- **Every export carries TSDoc that states the contract, not the types.**
  TypeScript already has the types. Say what a caller may assume, what throws,
  what is idempotent, what is security-relevant. `pnpm check:docs` also compares
  each exported symbol against the base branch and fails when the code moved and
  its documentation did not. There is no suppression flag.
- **Both message catalogues, always.** A key added to one language and not the
  other fails the build. But a person's own writing — a fursona's section names,
  their `*_es` fields — is **not** next-intl, and a missing value there is
  somebody who has not written it yet, never an error.
- **The hub is layered and the layers are enforced** in `eslint.config.mjs` by
  `eslint-plugin-boundaries`: a feature is reached through its barrel, no
  feature imports another, `shared/` never depends on a feature, layers point
  inward only, and `packages/identity` may not import an app or a framework.
  The graph denies by default and `no-unknown-files` fails a file that declares
  no home, so a boundary cannot be lost by forgetting to restate it — which is
  what the ~390 lines of `no-restricted-imports` blocks it replaced could do,
  because flat config replaces that rule for overlapping globs rather than
  merging it.
- **Filenames are kebab-case**; `pnpm check:tools` runs `ls-lint`, `knip`,
  `jscpd`, `cspell`, `secretlint`, `stylelint`, and — since three package.json
  files can disagree about one dependency without anything noticing — `sherif`
  and `syncpack`. `.syncpackrc.json` records the two deliberate exceptions:
  `@aeleos/identity` is reached by workspace protocol rather than by version,
  and `@supabase/supabase-js` is a **peer** of that package on purpose, so it
  may float wider there than the app pins.
- **The CSS is linted, and one rule of ours is a scar.** `stylelint` forbids
  selecting a `class` attribute: the skin used to style `[class~="border"]` —
  Tailwind's own generated class — from outside every cascade layer, where it
  beat every utility unconditionally. `@utility surface` replaced it.
- **Class strings are canonical and never deprecated**
  (`eslint-plugin-better-tailwindcss`), and the code is held to modern idioms
  (`eslint-plugin-sonarjs`, `eslint-plugin-unicorn`). Every rule turned off
  carries its reason in the config, because two of them were turned off for
  findings rather than taste — one autofix broke the auth middleware and another
  shipped a Safari regression.
- **Accessibility is measured on the rendered page**, not only on the tokens:
  `tests/e2e/a11y.spec.ts` runs axe at WCAG A and AA over sign-in, the 404, the
  signed-in pages, the editor with its theme panel open, and a themed public
  page. `pnpm check:contrast` still measures the token pairs it can compute.
- **Phone layouts are proved, not eyeballed.** `tests/e2e/responsive.spec.ts`
  checks every viewport in `VIEWPORTS`, each of which names an orientation, and
  every check has two halves: the
  page does not scroll sideways, **and** nothing above the content is hiding
  that it would — so the `overflow-x: hidden` shortcut fails as loudly as the
  fault.
- **The colour invariants are properties, not lists.**
  `tests/palette-properties.test.ts` runs `fast-check` over every colour the
  input can produce: the author's background is rendered verbatim, derived text
  agrees with itself, gradient stops always come back sorted and never mutate
  the caller's array.

The full account of how this toolchain arrived, what each tool caught, and the
rules that came out of it:
`docs/superpowers/specs/2026-08-15-toolchain-hardening-design.md`.

- **Development is cloud-only.** No local Docker or Supabase in normal use: push
  and read CI, and verify schema changes by querying the database rather than by
  trusting a CLI's exit code — it prints Docker credential noise while
  succeeding.

Directory-level `CLAUDE.md` files carry rules for code that **does not exist
yet**; TSDoc carries rules for code that does. If you are about to build
something in `apps/hub/src/features/actors`, read that directory's note first.

## How it works (the short version)

- **Clerk** is the single source of truth for _who a person is_ (identity + social
  logins). It is **not** the source of truth for any app's domain data.
- **Each app keeps its own separate Supabase project/database**, configured with
  Supabase **Third-Party Auth** to _trust_ Clerk. RLS keeps working, keyed to the
  Clerk identity (`auth.jwt()->>'sub'`).
- **One login = SSO everywhere.** Log in once at any Furry Colombia app; the rest
  sign you in silently via the shared Clerk session. Every app is a subdomain of
  `furrycolombia.com`, so the session cookie covers them natively.
- **The user ID is sacred.** Apps store a stable `identity_sub` and never let their
  own data keys depend on the IdP — so we can change almost anything later without
  a rewrite.

## The app handoff

An app does not ask "who is this?" and stop there. A person has a person actor
and any number of fursonas, so it also has to ask **which of them somebody
wants to be** — and it must not become the authority on that answer.

Two endpoints on the hub cover it, and both are live:

- **`GET /api/actors/mine`** — the person's own actor list, authorized by
  their own Clerk session token in an `Authorization: Bearer` header. No shared
  secret, no service account, and deliberately **no CORS**: an app's server
  calls this and upserts into its own `actors` mirror, keyed on `actor_ref`.
  `identity_sub` and `owner_ref` are never sent.
- **`/picker?return_to=…&app=…`** — where the person chooses. `return_to` is
  matched against an exact origin allowlist a maintainer configures, and they
  come back to it with `actor_ref` appended. A visitor who is not signed into
  the hub signs in first and keeps their destination. They can also **decline**,
  which returns them to the same place carrying no `actor_ref` at all.

**`actor_ref` comes back in a query string, so it is a suggestion and never an
authorization.** The consuming app looks it up in its own mirror, confirms it
belongs to the signed-in person and is active, and then uses its local row —
and treats its absence as "they declined", changing nothing.

**➡️ [`docs/integrating.md`](docs/integrating.md)** — the whole thing, written
for a developer in another repository.

See the design doc for the full picture, the identity/RLS model, and the phased
migration plan for Puck and Libra:

**➡️ [`docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`](docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md)**

The IdP was originally Logto; it was ruled out because Supabase Third-Party Auth
trusts only Clerk, Firebase, Auth0, AWS Cognito and WorkOS. The full reasoning,
including what that cost us, is here:

**➡️ [`docs/superpowers/specs/2026-07-31-idp-decision-change.md`](docs/superpowers/specs/2026-07-31-idp-decision-change.md)**

## Status

🌿 **The hub is live, the app handoff is built, and the fursona studio ships.**
The actor-model seam (`supabase/migrations/` + `tests/db/`) is done, and the
Clerk⇄Supabase trust is proven on every pull request by the `idp-cloud` job
rather than asserted — see [`docs/phase-0-clerk-setup.md`](docs/phase-0-clerk-setup.md).
The hub signs people in, provisions their person actor, manages fursonas,
lets somebody build a fursona's page, and serves the picker and the
actor-mirror endpoint above.

**The public pages ship**: `/{person_address}` is a person's profile and
`/{person_address}/{handle}` is one of their fursonas, readable by anybody. A
person carries a permanent number and an optional vanity, and both addresses
resolve forever. Pictures are uploaded to Supabase Storage — one public bucket,
so an uploaded image stays reachable by its address even after a fursona is made
private, which the editor says out loud. If you are touching the actors feature,
read
[`apps/hub/src/features/actors/CLAUDE.md`](apps/hub/src/features/actors/CLAUDE.md)
first: it is authoritative for addressing and newer than the specs.

One thing is deliberately not switched on: the picker's return-origin allowlist
is **empty in production**, so no app can complete a handoff until a maintainer
adds its origin.

## Cost & principles

- **$0** at our scale (Clerk's free plan covers 50,000 monthly active users),
  near-zero ops (managed).
- **Escape hatch:** none at the product level — **no** Supabase-supported IdP is
  self-hostable, so unlike Logto there is no "run the same thing yourself" exit.
  What carries the guarantee instead is the **sacred `identity_sub`**: because no
  app's data keys depend on the IdP, swapping the token issuer is a one-column
  backfill rather than a data remap. This is why that rule must never be weakened.

---

## The actor-model seam

> ⚠️ **The Supabase project here is live, not a sandbox.** An earlier version of
> this README called it a local-only test bed; that has not been true since the
> hub deployed. It is the hosted project `me.furrycolombia.com` reads, so
> `supabase db push` and `supabase db reset --linked` act on real data. There is
> also **no local stack in normal use** — this repository is developed against
> the cloud, and the schema red/green cycle runs in CI rather than on a laptop.

`supabase/migrations/` is the canonical SQL every consuming app copies into its
own migration set:

| Migration                       | Provides                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `0001_actors.sql`               | `actors` table, shape constraints, immutability and `updated_at` triggers                   |
| `0002_actor_helpers.sql`        | `person_actor_ref()`, `current_person_ref()`, `can_act_as()`, `require_active_person_ref()` |
| `0003_actors_exposure.sql`      | RLS lockdown, the `actors_public` view, `my_actors()`                                       |
| `0004_platform_roles.sql`       | person-keyed roles mirror, `has_platform_role()`                                            |
| `0005_reference_domain.sql`     | reference authored-row pattern (`comments`) — **test fixture, not a product table**         |
| `0006_provisioning.sql`         | idempotent `ensure_person_actor()` — the only definition                                    |
| `0007_fursona_self_service.sql` | `create_fursona()` with its quota, `update_fursona()`, soft `delete_fursona()`              |
| `0008_idp_introspection.sql`    | `whoami_sub()`, `whoami_role()` — used by the trust tests                                   |
| `0009_actor_profiles.sql`       | ordering, pinning, and the validated bilingual `sections` write                             |
| `0010_client_grants.sql`        | the complete client surface, in one file                                                    |
| `0011_person_addresses.sql`     | one permanent number per person, assigned by trigger, plus optional vanity                  |
| `0012_public_actor_reads.sql`   | the entire anonymous read surface — the only functions granted to `anon`                    |
| `0013_my_address.sql`           | `my_address()`, so a person can learn their own public address                              |
| `0014_person_self_service.sql`  | a person edits and publishes their own profile                                              |

The table is the list. Copy every row of it — an app that stops partway has a
schema that looks installed and refuses reads it should serve.

### Every object is defined exactly once

**This is the rule to preserve, and it is newer than most of the schema.** The
migrations were consolidated on 2026-08-13, when six objects had been redefined
by `create or replace` — the `actors_public` view four times,
`ensure_person_actor` three. The newest body of a function
could therefore sit in a file named after something unrelated, so replacing it
meant hunting for the right ancestor first, and restating the wrong one silently
reverted a fix. That nearly shipped.

So: **the file name tells you where an object lives.** Put a new object in a new
file; when you replace one, you should not have to search. `0010_client_grants.sql`
is likewise the single readable answer to "what can a signed-in caller reach?" —
including what is granted to nobody, and why.

`0005` is a **reference**, not a feature. Apps copy the _pattern_ — the
`author_actor_id` / `author_person_ref` column pair, the column-level grants,
the insert policy, the derive trigger, and the immutability trigger — onto
their own tables.

But `0005` is also the **fixture the conformance suite runs against**:
`tests/db/authoring.test.ts` and `tests/db/transfer-accountability.test.ts`
require `public.comments` to exist. **Apply `0005` too, or those
tests fail on the first run.** An app has two honest options:

- **Keep `0005`.** Simplest. `comments` sits unused alongside the app's real
  tables and those two suites keep proving the pattern is installed correctly.
- **Port them.** Drop `0005` and repoint `authoring.test.ts` and
  `transfer-accountability.test.ts` at the app's own authored table. This is
  strictly better — it proves _the app's_ table is correct — but it is work,
  and skipping the port means shipping the pattern untested.

> ⚠️ The UUIDv5 namespace in `person_actor_ref` (`0002_actor_helpers.sql`) must
> be copied **byte-identically** into every app. It is what makes all apps derive the same `actor_ref` for the same
> person while the hub does not yet exist. Changing it in one app silently forks
> that person's platform identity.

### `author_person_ref` is server-derived, never client-supplied

`0005_reference_domain.sql` puts a `before insert` trigger on `comments` that
sets `author_person_ref` from `current_person_ref()` and never grants the column
to the client at all. The client sends only `author_actor_id`.

This is deliberate ergonomics-for-safety. The earlier design let the client
send the value and had the insert policy verify it — correct, but fragile as a
_copied_ pattern: an app that drops the `and author_person_ref = ...` conjunct
while adapting the policy to its own table still passes the "cannot post as
another person's fursona" test, and fails only the forged-snapshot test — the
one most likely to be dropped in the same edit. With the trigger, the safe
behaviour is the default and there is no conjunct to forget.

`service_role` may still write the column explicitly (the derive trigger only
overwrites when the caller resolves to a person), which is what imports and
backfills need.

### `select('*')` does not work on tables using this pattern

`comments` uses **column-level** grants, so the default `supabase-js` shapes
fail:

```ts
await supabase.from("comments").select(); // ❌ permission denied
await supabase.from("comments").insert({ ... }).select(); // ❌ same, the implicit `*`
```

`*` expands to every column, including `author_person_ref`, which no client
role may read. It fails **closed** — that is the boundary working — but it is
the day-one surprise for every adopting app. Always name columns explicitly:

```ts
await supabase.from("comments").select("id, body, author_actor_id, created_at");

await supabase
  .from("comments")
  .insert({ body, author_actor_id: actingAs })
  .select("id, body, author_actor_id, created_at");
```

## Adopting the seam in an app

1. Copy `0001`–`0013` into the app's `supabase/migrations/`, renumbered to
   follow its existing migrations. Since the consolidation each file defines its
   own objects once, so the order matters only for dependencies — but none may
   be skipped.
2. `0005` installs the reference `comments` table. Keep it (the conformance
   suite needs it) or port `authoring.test.ts` and
   `transfer-accountability.test.ts` onto your own authored table — see above.
3. For every table recording who did something, add `author_actor_id` and
   `author_person_ref`, and apply the grants, policies and both triggers from
   `0005_reference_domain.sql`.
4. Copy `tests/db/` into the app and run it as a conformance suite.
   `tests/db/exposure-invariants.test.ts` is catalog-driven and will police
   your _own_ tables for leaked linkability columns — keep it.

## Running the tests

```bash
pnpm install
pnpm db:start     # requires Docker
pnpm test:db      # resets the database, then runs the full suite
```

> ⚠️ **`pnpm test:db` begins with `supabase db reset`.** Against the linked live
> project that would destroy it. In this repository the schema cycle runs in
> **CI** instead — push, and read the `conformance` job, roughly four minutes a
> turn. A consuming app with a real local stack can run it directly.

## What these tests do and do not prove

They prove **claim shape and policy behaviour**: given a token carrying a `sub`,
the constraints, helpers, exposure boundaries, and write policies behave
correctly.

They do **not** prove the Supabase⇄Clerk trust. Local tests mint HS256 tokens
signed with the local Supabase JWT secret; real Third-Party Auth validates
asymmetrically against Clerk's JWKS. Validating that is Phase 0's job — see
`tests/idp/`, which runs against a real Clerk-issued token and skips when no
credentials are present.
