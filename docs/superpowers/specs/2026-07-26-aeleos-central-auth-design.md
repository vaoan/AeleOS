# Furry Colombia — Central Identity ("auth-only app") — Design

- **Date:** 2026-07-26
- **Status:** Approved for implementation planning
- **Scope:** Platform-wide (cross-repo). Introduces a single identity provider shared by **all** Furry Colombia apps — Puck, CandyStore, and future apps — living under subdomains of `furrycolombia.com`. This spec lives in the **AeleOS** repo (`vaoan/aeleos`), the home for platform identity; implementation spans multiple repos.
- **Author:** Heiner Angarita (with Claude)
- **Related:** `CLAUDE.md` (Puck), CandyStore (production, separate Supabase project), Janus (sister project).

---

## 1. Context & goal

Today, identity is **siloed per app**. Puck and CandyStore each run their **own
separate Supabase project**, each with its own social-login setup, its own auth
UI, and its own `auth.users`. A person who uses both is two unrelated accounts,
must log in separately in each, and every new app repeats the whole auth wiring.

Furry Colombia is **one community**: the same people move between apps, and a
person should be **one identity** everywhere. We want:

- **C — both wins** (established in brainstorming):
  - **User-facing SSO:** log in once at `furrycolombia.com`, be logged in across
    every app.
  - **Config dedup:** configure social logins (Google, Discord, …) in **one**
    place, not once per repo.
- **A — one shared community:** one person = one identity across all apps.

### Hard constraints (the budget reality)

1. **$0 now**, at most **~$20/year** out-of-pocket; **no funding**.
2. **Near-zero ops** — this is run by essentially one person; we cannot babysit a
   fragile service.
3. **Don't get trapped** — a mid-sized community that may grow; today's choice
   must not require a rewrite later.
4. **All apps are subdomains of `furrycolombia.com`** (e.g. `puck.`, `tienda.`,
   `id.`). This is decided and universal.

## 2. Decision summary

Build a dedicated **identity provider (IdP)** — the "auth-only app" — using
**[Logto](https://logto.io)**, reachable at **`id.furrycolombia.com`**. Every app
**trusts** Logto for identity while keeping its **own separate database**. Supabase
supports this via **Third-Party Auth**, so each app's Row-Level Security (RLS)
keeps working unchanged in principle, keyed to the Logto identity.

Why Logto specifically (vs. the alternatives weighed in brainstorming):

| Requirement                  | Logto (chosen)                                            | WorkOS AuthKit                 | Shared Supabase project              | Shared-JWT-secret hack |
| ---------------------------- | --------------------------------------------------------- | ------------------------------ | ------------------------------------ | ---------------------- |
| $0 at our scale              | ✅ free tier (tens of thousands of users)                 | ✅ very large free tier        | ✅ (included)                        | ✅                     |
| Near-zero ops                | ✅ managed cloud                                          | ✅ managed                     | ⚠️ but forces DB merge               | ❌ fragile             |
| Real cross-app SSO           | ✅ purpose-built, multi-app native                        | ✅                             | ❌ not a true multi-app SSO provider | ⚠️ partial             |
| Keeps apps' **separate** DBs | ✅                                                        | ✅                             | ❌ couples all data into one project | ✅                     |
| **Escape hatch** if we grow  | ✅ **open source → self-host the same product**, same IDs | ❌ closed source, no self-host | —                                    | —                      |

Logto is the only option that satisfies **all four** constraints at once. The
open-source self-host escape hatch is the decisive tiebreaker against WorkOS: if
Logto Cloud ever gets pricey or we want full control, we self-host the **exact
same product** with the **same user IDs** — a near-zero migration.

## 3. The core principle: the user ID is sacred

The **only** genuinely expensive migration in any identity system is **changing
the ID that app data is keyed to**. Everything else (which social logins, the
login UI, hosting, even the whole IdP vendor) is cheap to change _if_ the identity
ID stays stable.

Therefore this design's single most important rule:

> **Every app stores a stable `identity_sub` (Logto's `sub` claim) and never lets
> its own data keys depend on the IdP.** App-local tables keep their own local
> primary keys; `identity_sub` is a separate, unique, indexed column that maps a
> local user to the shared identity.

This decoupling is what makes the "don't get trapped" promise real: swapping the
token issuer later means backfilling **one column**, not remapping every row.

## 4. Architecture

```
                    ┌───────────────────────────────────────┐
                    │          id.furrycolombia.com          │
                    │        Logto — identity provider        │
                    │  • one account per person (SSO)        │
                    │  • social connectors: Google, Discord… │
                    │  • hosted login/consent + our branding │
                    └───────────────────┬────────────────────┘
                                        │ OIDC (issues ID/access tokens; JWKS)
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
    ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
    │ puck.furry….com │        │ tienda.furry…   │        │ next app…       │
    │ Next.js app     │        │ (CandyStore)    │        │                 │
    │ ─────────────── │        │ ─────────────── │        │ ─────────────── │
    │ own Supabase    │        │ own Supabase    │        │ own Supabase    │
    │ DB + RLS        │        │ DB + RLS        │        │ DB + RLS        │
    │ trusts Logto    │        │ trusts Logto    │        │ trusts Logto    │
    │ user_profiles.  │        │ …               │        │ …               │
    │ identity_sub    │        │                 │        │                 │
    └─────────────────┘        └─────────────────┘        └─────────────────┘
```

### Components

1. **Logto (the auth-only app)** — hosted at `id.furrycolombia.com`.
   - The single source of truth for **who a person is** (identity, email, social
     links). It is **not** the source of truth for any app's _domain data_.
   - Owns all **social connectors**. Adding "Sign in with Discord" to every app is
     a one-time config here.
   - Serves the login / signup / consent pages (Logto's hosted UI, themed to
     Furry Colombia branding). No app ships its own login form.
   - Registered as a **separate Logto "application"** per app (each app gets its
     own client ID + redirect URIs), all sharing one user pool → one identity.

2. **Each app's Supabase project** — unchanged as the app's data store.
   - Configured with **Supabase Third-Party Auth** to trust Logto as the token
     issuer (via Logto's JWKS). PostgREST/RLS validate incoming Logto access
     tokens; `auth.jwt()->>'sub'` yields the Logto user ID.
   - Keeps its own schema, migrations, and RLS. **No shared database.**

3. **Each app's web layer** — the OIDC client.
   - Uses Logto's SDK (or standard OIDC) to run login/logout and hold the session.
   - On authenticated requests to its Supabase project, forwards the Logto access
     token so RLS applies.

### How SSO works across subdomains

- All apps are subdomains of `furrycolombia.com`, and Logto lives at
  `id.furrycolombia.com`. Because every app redirects to the **same** Logto
  session for login, once a user has a Logto session, subsequent apps complete
  login **silently** (no re-entering credentials) — that's the SSO experience.
- Sessions are held per-app (the OIDC client in each app), backed by the shared
  Logto session. We do **not** rely on a hand-rolled shared cookie; Logto's OIDC
  session is the shared state, which is more robust and works even if an app ever
  moved off a subdomain.

## 5. Identity & data model (per app)

Each app keeps a `user_profiles` (or equivalent) table it already owns, with:

- `id` — the app's **local** user primary key (its own UUID). App domain data
  FKs to **this**, never to the IdP.
- `identity_sub` — **unique, indexed**; stores Logto's `sub`. This is the only
  link to the shared identity.
- Denormalized convenience fields synced from Logto on login as needed
  (`email`, `display_name`, `avatar_url`).

**RLS pattern.** Policies resolve the caller's local user via the sub:

```sql
-- caller's local user id, derived from the trusted Logto token
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select id from public.user_profiles
  where identity_sub = auth.jwt()->>'sub'
$$;

-- example ownership policy
create policy "owners manage their events"
on public.events for all
using ( owner_id = app.current_user_id() );
```

This keeps app data keyed on local IDs (future-proof) at the cost of one
indexed lookup per policy evaluation — an acceptable trade for decoupling.

> **Simpler alternative (rejected as default):** key everything directly on
> `auth.jwt()->>'sub'`. Less code, but couples all data to the IdP's ID format
> and undermines the "sacred ID / escape hatch" principle. Use only for a
> brand-new app where we accept the coupling.

### First-login provisioning

On a user's first authenticated request an app doesn't recognize, the app
**upserts** a `user_profiles` row keyed by `identity_sub` (a Supabase trigger or
an app-side "ensure profile" step). Puck's foundation already auto-provisions a
profile + default permissions on first login; that logic moves from "Supabase
auth trigger" to "first-seen `identity_sub`."

## 6. Auth methods (social connectors)

- **Configured once in Logto**, available to every app instantly.
- Start with the providers already in use (**Google, Discord** per Puck's current
  shell). Social-login-first, **no passwords** — consistent with today and it
  makes migration painless (no password hashes to move).
- Adding a provider later (e.g. Apple, email OTP) is a Logto config change, zero
  app code.

## 7. Migration plan (phased, lowest-risk-first)

The three app cohorts have very different risk profiles, so we sequence them:

**Phase 0 — Stand up the IdP.**

- Create the Logto tenant, point `id.furrycolombia.com` at it, theme the hosted
  login, and configure Google + Discord connectors.
- Register a Logto application for each existing/planned app.
- **Validate the Supabase ⇄ Logto trust** on a throwaway Supabase project before
  touching any real app (see Risks §9 — this is the key unknown to de-risk first).

**Phase 1 — New apps (greenfield).**

- Any app built after this spec uses Logto from day one with the `identity_sub`
  model. No migration, pure upside. This proves the pattern end-to-end.

**Phase 2 — Puck (in progress, not yet in production).**

- Puck's web app (sub-project #2) currently uses Supabase's own social login.
  Because Puck is **not in production**, we can migrate with low risk:
  - Switch the web layer from Supabase Auth to Logto OIDC.
  - Reconfigure Puck's Supabase project to Third-Party Auth trusting Logto.
  - Reconcile the foundation schema: today `user_profiles` FKs to
    `auth.users(id)`. Under Third-Party Auth there is **no** Supabase-managed
    `auth.users` row, so the FK is dropped and identity is carried by
    `identity_sub` (a schema migration + RLS rewrite per §5).
  - Update Puck's spec/plan for sub-project #2 to reflect the new auth seam.

**Phase 3 — CandyStore (production — the careful one).**

- CandyStore has **real users and real data** FK'd to Supabase `auth.users`.
  This is the highest-effort step and gets its own dedicated plan.
  - **Import users into Logto** by email (social-login users re-link on next
    "Sign in with Google/Discord" — no password migration).
  - **Backfill `identity_sub`** on existing CandyStore user rows by matching
    email. Because app data stays keyed on CandyStore's **local** user IDs
    (§3/§5), **no domain rows are remapped** — we only populate one new column.
  - Switch CandyStore's Supabase project to Third-Party Auth and its web layer to
    Logto OIDC, then verify RLS against the backfilled mapping in staging before
    cutover.
  - Keep a rollback path (old Supabase Auth path re-enableable) until verified.

## 8. Cost & ops

- **Cost:** $0 on Logto Cloud's free tier at our scale; a domain we already own.
  Well within the ~$20/year ceiling with headroom.
- **Ops:** managed cloud — patching/uptime is Logto's problem. Our only ongoing
  work is occasional connector config.
- **Growth path:** if the free tier is ever outgrown, options in order of
  preference: (1) Logto Cloud paid tier, or (2) **self-host Logto** (same
  product, same user IDs, same tokens → near-zero migration). Either is a
  decision we can defer until real numbers demand it.

## 9. Risks & things to validate (before committing app-by-app)

1. **Supabase Third-Party Auth ⇄ Logto wiring (highest priority).** Confirm on a
   throwaway project that a Logto access token is accepted by Supabase RLS and
   that `auth.jwt()->>'sub'` resolves as expected. This is the linchpin — validate
   in Phase 0 before any real migration.
2. **Puck's `auth.users` FK.** The foundation schema references
   `auth.users(id)`. Moving to Third-Party Auth removes Supabase-managed auth
   rows; the schema + RLS must be reworked to the `identity_sub` model. Scope this
   as part of Phase 2.
3. **Preserving/mapping IDs on CandyStore migration.** Our design deliberately
   does **not** require Logto to reuse CandyStore's old UUIDs — we map via a
   backfilled `identity_sub` column instead, so this risk is contained. Still,
   verify the email-match import covers all active users and handles duplicates.
4. **Logto free-tier limits.** Confirm current MAU/features on the free tier at
   planning time (vendor terms change); document the exact ceiling in the plan.
5. **Session/logout semantics.** Define single-logout behavior (logging out of
   one app vs. the whole platform) explicitly during implementation.

## 10. Out of scope / YAGNI

- **No shared application database.** Apps keep separate Supabase projects; only
  _identity_ is shared.
- **No custom-built OAuth server.** We adopt Logto, not roll our own.
- **No passwords / no email-password auth** initially — social-login-first.
- **No org/team/multi-tenant modeling** beyond "one person = one identity."
  Per-app roles/permissions stay each app's concern (e.g. Puck's 28-key RBAC).
- **No migration of Janus or other sister projects** unless/until they join the
  Furry Colombia domain — out of scope here.

## 11. Success criteria

1. A user logs in once at any Furry Colombia app and is **silently** logged in at
   the others (SSO).
2. One person is **one identity** across all apps (single Logto account).
3. Social connectors are configured **once** (in Logto) and available everywhere.
4. Each app keeps its **own separate database**, with RLS working against the
   Logto identity.
5. Total spend stays **$0–$20/year**, with a documented, low-migration growth path
   (self-host the same product).
6. Puck and CandyStore are migrated with **no domain-data remapping** (identity
   carried by a backfilled `identity_sub` column).

## 12. Next step

Implementation planning starts with **Phase 0 + Phase 1** (stand up Logto, prove
the Supabase⇄Logto trust, ship one greenfield/Puck integration end-to-end), which
de-risks everything downstream. CandyStore (Phase 3) gets its own dedicated plan
once the pattern is proven.
