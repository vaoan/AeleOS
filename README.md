# AeleOS 🌟

**The identity core of Furry Colombia — the star every app orbits.**

AeleOS is the central **identity provider** for the Furry Colombia platform. One
person = one identity, one login, across every app ([Puck](https://github.com/vaoan),
CandyStore, and everything that comes next), all under subdomains of
`furrycolombia.com`.

> Naming: our apps are celestial bodies — **Puck** (a moon of Uranus), **Janus**
> (a moon of Saturn). AeleOS is the **star** at the center they orbit. The name is
> the founder's fursona, _Aeleos_ + `OS` — because identity is the operating
> system the whole platform runs on.

## What this repo is (and isn't)

This is **not** a hosted application. The identity provider itself is
[**Logto**](https://logto.io) (managed cloud, at `id.furrycolombia.com`) — we
_configure_ an IdP, we don't build/deploy a login app.

This repo is the **home for the cross-app identity concern** that belongs to no
single app:

- 📐 **Design & specs** — architecture and decisions (`docs/superpowers/specs/`)
- 🗺️ **Implementation plans** — phased rollout (`docs/superpowers/plans/`)
- ⚙️ **Logto configuration-as-code** — connectors, applications, branding,
  exported for version control & disaster recovery _(added during implementation)_
- 🧩 **Shared integration glue** — a small helper package apps consume, if/when
  2+ apps need it _(added when justified — YAGNI until then)_

Per-app integration code (the OIDC client + Supabase third-party-auth wiring)
lives in **each app's own repo**, not here.

## How it works (the short version)

- **Logto** is the single source of truth for _who a person is_ (identity + social
  logins). It is **not** the source of truth for any app's domain data.
- **Each app keeps its own separate Supabase project/database**, configured with
  Supabase **Third-Party Auth** to _trust_ Logto. RLS keeps working, keyed to the
  Logto identity.
- **One login = SSO everywhere.** Log in once at any Furry Colombia app; the rest
  sign you in silently via the shared Logto session.
- **The user ID is sacred.** Apps store a stable `identity_sub` and never let their
  own data keys depend on the IdP — so we can change almost anything later without
  a rewrite.

See the design doc for the full picture, the identity/RLS model, and the phased
migration plan for Puck and CandyStore:

**➡️ [`docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`](docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md)**

## Status

🌱 **Design phase.** Spec approved; implementation planning next (Phase 0 —
stand up Logto and prove the Supabase⇄Logto trust — comes first).

## Cost & principles

- **$0** at our scale (Logto Cloud free tier), near-zero ops (managed).
- **Escape hatch:** Logto is open source — if we ever outgrow the free tier we can
  self-host the _same product_ with the _same user IDs_, a near-zero migration.

---

## The actor-model seam

The Supabase project in this repo is a **local-only test bed** for the canonical
actor-model schema. It is never deployed and holds no app data.

`supabase/migrations/` is the canonical SQL every consuming app copies into its
own migration set:

| Migration                       | Provides                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `0001_actors.sql`               | `actors` table, shape constraints, immutability trigger                             |
| `0002_actor_helpers.sql`        | `current_person_ref()`, `can_act_as()`                                              |
| `0003_actors_exposure.sql`      | RLS lockdown + `actors_public` view                                                 |
| `0004_platform_roles.sql`       | person-keyed roles mirror, `has_platform_role()`                                    |
| `0005_reference_domain.sql`     | reference authored-row pattern (`comments`) — **test fixture, not a product table** |
| `0006_provisioning.sql`         | derived `person_actor_ref()`, idempotent `ensure_person_actor()`                    |
| `0007_suspension_hardening.sql` | suspension closure, server-derived snapshot, grant fixes                            |

`0005` is a **reference**, not a feature. Apps copy the _pattern_ — the
`author_actor_id` / `author_person_ref` column pair, the column-level grants,
the insert policy, the derive trigger, and the immutability trigger — onto
their own tables.

But `0005` is also the **fixture the conformance suite runs against**:
`tests/db/authoring.test.ts` and `tests/db/transfer-accountability.test.ts`
(13 tests) require `public.comments` to exist. **Apply `0005` too, or those
tests fail on the first run.** An app has two honest options:

- **Keep `0005`.** Simplest. `comments` sits unused alongside the app's real
  tables and the 13 tests keep proving the pattern is installed correctly.
- **Port the 13 tests.** Drop `0005` and repoint `authoring.test.ts` and
  `transfer-accountability.test.ts` at the app's own authored table. This is
  strictly better — it proves _the app's_ table is correct — but it is work,
  and skipping the port means shipping the pattern untested.

> ⚠️ The UUIDv5 namespace in `0006` must be copied **byte-identically** into
> every app. It is what makes all apps derive the same `actor_ref` for the same
> person while the hub does not yet exist. Changing it in one app silently forks
> that person's platform identity.

### `author_person_ref` is server-derived, never client-supplied

`0007` puts a `before insert` trigger on `comments` that sets
`author_person_ref` from `current_person_ref()` and revokes the column from
the client's `insert` grant. The client sends only `author_actor_id`.

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

1. Copy `0001`–`0007` into the app's `supabase/migrations/`, renumbered to
   follow its existing migrations. Migrations are **append-only** — `0007`
   patches `0001`–`0006` with `create or replace` rather than editing them, so
   the order matters and none may be skipped.
2. `0005` installs the reference `comments` table. Keep it (the conformance
   suite needs it) or port `authoring.test.ts` and
   `transfer-accountability.test.ts` onto your own authored table — see above.
3. For every table recording who did something, add `author_actor_id` and
   `author_person_ref`, and apply the grants, policies and both triggers from
   `0005` + `0007`.
4. Copy `tests/db/` into the app and run it as a conformance suite.
   `tests/db/exposure-invariants.test.ts` is catalog-driven and will police
   your _own_ tables for leaked linkability columns — keep it.

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
