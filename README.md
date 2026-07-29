# AeleOS

Central identity for the Furry Colombia platform. See
`docs/superpowers/specs/` for the design.

This repo is **not** a deployable application. The Supabase project here is a
local-only test bed for the canonical actor-model schema; it holds no app data.

## The actor-model seam

`supabase/migrations/` is the canonical SQL every consuming app copies into its
own migration set:

| Migration | Provides |
| --- | --- |
| `0001_actors.sql` | `actors` table, shape constraints, immutability trigger |
| `0002_actor_helpers.sql` | `current_person_ref()`, `can_act_as()` |
| `0003_actors_exposure.sql` | RLS lockdown + `actors_public` view |
| `0004_platform_roles.sql` | person-keyed roles mirror, `has_platform_role()` |
| `0005_reference_domain.sql` | reference authored-row pattern (`comments`) |
| `0006_provisioning.sql` | derived `person_actor_ref()`, idempotent `ensure_person_actor()` |

`0005` is a **reference**, not a feature. Apps copy the *pattern* — the
`author_actor_id` / `author_person_ref` column pair, the column-level grants,
the insert policy, and the immutability trigger — onto their own tables.

> ⚠️ The UUIDv5 namespace in `0006` must be copied **byte-identically** into
> every app. It is what makes all apps derive the same `actor_ref` for the same
> person while the hub does not yet exist. Changing it in one app silently forks
> that person's platform identity.

## Adopting the seam in an app

1. Copy `0001`–`0004` and `0006` into the app's `supabase/migrations/`,
   renumbered to follow its existing migrations. Skip `0005` — it is a pattern
   to imitate, not a table to install.
2. For every table recording who did something, add `author_actor_id` and
   `author_person_ref` and apply the policies from `0005`.
3. Copy `tests/db/` into the app and run it as a conformance suite.

## Running the tests

```bash
pnpm install
pnpm db:start     # requires Docker
pnpm test:db      # resets the database, then runs the full suite
```

## What these tests do and do not prove

They prove **claim shape and policy behaviour**: given a token carrying a `sub`,
the constraints, helpers, exposure boundaries, and write policies behave
correctly.

They do **not** prove the Supabase⇄Logto trust. Local tests mint HS256 tokens
signed with the local Supabase JWT secret; real Third-Party Auth validates
asymmetrically against Logto's JWKS. Validating that is Phase 0's job.
