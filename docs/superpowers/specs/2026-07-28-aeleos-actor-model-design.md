# AeleOS — Actor Model (person + fursonas) — Design

- **Date:** 2026-07-28 (amended 2026-07-29 — see §19)
- **Status:** Phase 1a implemented; §19 records what implementation changed
- **Scope:** Platform-wide. Extends the approved central-auth design with a second
  identity level (fursonas), the rules for acting as one, where permissions live,
  and an auditable ownership/transfer ledger.
- **Author:** Heiner Angarita (with Claude)
- **Supersedes in part:** `2026-07-26-aeleos-central-auth-design.md` §5 and §10 —
  see §12 for the exact deltas.

---

## 1. Context & goal

The approved central-auth design has **one** identity level: the person. That is
correct for authentication and insufficient for Furry Colombia.

In this community a person presents as one or more **fursonas**, and which one is
appropriate is **context-dependent**:

- CandyStore: a fursona does not sell — a **person** sells (legal accountability,
  payment, shipping).
- CandyStore: a review or comment may come from a **fursona** (the public-facing
  self) *or* from the **person** (when someone wants to give a real-person
  review).
- Future fursona-scoped apps may only make sense for fursonas.

The trap this spec exists to close: the central-auth spec's §5 makes
`identity_sub` **unique** on `user_profiles`, encoding "one person = one row per
app." The moment a fursona can author content, that constraint is wrong and every
RLS policy built on it resolves to the wrong subject. Fixing that after apps ship
domain data is precisely the expensive migration §3 of that spec exists to
prevent.

**Goal:** introduce the second identity level now — as a schema seam, not
necessarily as a product feature — so that adding fursonas later is a feature
release rather than a data migration.

## 2. Decision summary

**There is one namespace of actors.** A person is an actor. A fursona is an actor.
"Person-ness" is an attribute (`kind`), not a separate type or table.

Every domain row that records *who did this* points at an actor. The differences
between persons and fursonas are enforced in **capability checks**, not in the
schema shape.

Consequences, each expanded below:

| Requirement | Where it lands |
| --- | --- |
| Permissions attach to the **person**, never a fursona | §7 |
| Fursonas are **transferable** (gift, trade, sale) | §9 |
| Acting identity is chosen **per app**, per context | §6 |
| Transfers are **auditable** and disputes resolvable | §9 |

## 3. Core principles

### 3.1 There are now two sacred IDs

The central-auth spec establishes `identity_sub` (Logto's `sub`) as sacred. This
spec adds a second:

> **`actor_ref`** — a platform-wide, stable identifier for every actor (person or
> fursona). It is minted by the hub and must exist from the first app that stores
> authored content.

`actor_ref` must be born stable. Introducing it after apps key content to persons
means remapping every authored row — the exact migration the platform is designed
to avoid, one level down.

### 3.2 Accountability is recorded, never derived

Because fursonas can change hands, resolving "who is responsible for this row" by
following `owner_ref` at read time **silently reassigns blame after a transfer**.

> Every authored row stores **both** the actor it displays as *and* an immutable
> snapshot of the person who performed the action.

Attribution follows the character; responsibility stays with the human who acted.
This cannot be backfilled — the information does not exist anywhere else once the
row is written.

### 3.3 Logto never learns that fursonas exist

Logto holds persons and standard OIDC claims only. The actor graph lives in the
hub. This keeps the open-source/self-host escape hatch cheap.

## 4. The actor model

### 4.1 Registry (hub-owned, source of truth)

```sql
create table actors (
  id            uuid primary key default gen_random_uuid(),  -- hub-local pk
  actor_ref     uuid not null unique,                        -- platform-wide, sacred
  kind          text not null check (kind in ('person','fursona')),
  owner_ref     uuid references actors(actor_ref),           -- null iff kind='person'
  identity_sub  text unique,                                 -- Logto sub; person rows only
  handle        text not null,                               -- stable public slug
  display_name  text,
  avatar_url    text,
  visibility    text not null default 'private'
                  check (visibility in ('private','unlisted','public')),
  status        text not null default 'active'
                  check (status in ('active','suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint person_shape  check (kind <> 'person'  or (identity_sub is not null and owner_ref is null)),
  constraint fursona_shape check (kind <> 'fursona' or (identity_sub is null     and owner_ref is not null))
);

create unique index actors_handle_lower_idx on actors (lower(handle));
```

**Person rows are never transferable.** `owner_ref` is null on them by
constraint; a transferable person row would be an account-takeover primitive.

`handle` is minted at creation for every actor. Public directories need stable
URLs, and retrofitting handles once fursonas exist means collision resolution and
land-grab disputes. It costs nothing now (see §11).

### 4.2 Per-app mirror (replaces `user_profiles`)

Each app keeps a local mirror so RLS runs entirely inside its own Postgres. This
**replaces** the `user_profiles` table from the central-auth spec §5.

```sql
create table actors (
  id            uuid primary key default gen_random_uuid(),  -- app-LOCAL pk
  actor_ref     uuid not null unique,                        -- platform ref
  kind          text not null,
  owner_ref     uuid,
  identity_sub  text unique,                                 -- person rows only
  handle        text,
  display_name  text,
  avatar_url    text,
  visibility    text not null default 'private',
  status        text not null default 'active',
  synced_at     timestamptz not null default now()
);
```

Domain data FKs the **local `id`**, never `actor_ref` — the same discipline the
central-auth spec §3 applies to `identity_sub`, applied one level down. Swapping
the registry stays a one-column backfill.

**Mirror the minimum.** An app mirrors only the actors it needs: the current
user's own actors, plus actors referenced by its domain data. Replicating the
entire platform actor list into every app would spread the ownership graph far
wider than necessary, which §8 designates a security boundary.

**`owner_ref` is never client-readable.** It exists in the mirror because
`app.can_act_as()` needs it, but no client-facing query, view, or API may return
it. The enforcement mechanism — RLS on the mirror table, a `security definer`
helper, or exposing only a restricted view — is an implementation choice to
settle during planning; the constraint is not.

### 4.3 Authored rows

```sql
-- on every table that records who did something
author_actor_id    uuid not null references actors(id),   -- display; may transfer later
author_person_ref  uuid not null                          -- snapshot; immutable
```

### 4.4 RLS helpers

```sql
-- the caller's person actor_ref, from the trusted Logto token
create or replace function app.current_person_ref() returns uuid
language sql stable as $$
  select actor_ref from public.actors
  where identity_sub = auth.jwt()->>'sub' and kind = 'person'
$$;

-- may the caller act as this local actor row?
create or replace function app.can_act_as(target uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.actors a
    where a.id = target
      and a.status = 'active'
      and ( a.identity_sub = auth.jwt()->>'sub'
            or a.owner_ref = app.current_person_ref() )
  )
$$;
```

Write policies enforce that the accountability snapshot is truthful:

```sql
create policy "authors write only as an actor they own"
on public.comments for insert
with check (
  app.can_act_as(author_actor_id)
  and author_person_ref = app.current_person_ref()
);
```

`author_person_ref` must be immutable after insert (no update policy grants it; a
trigger rejects changes).

## 5. Layer ownership

| Layer | Owns | Must never hold |
| --- | --- | --- |
| **Logto** | persons, standard OIDC claims, social connectors, platform roles | any knowledge of fursonas |
| **Hub** (AeleOS app) | actor registry, mints `actor_ref` + `handle`, ownership ledger, profile editing; writes person `name`/`picture` through to Logto's Management API | app domain data |
| **Each app** | own Supabase project, local actor mirror, domain data, domain permissions | authoritative actor state |

The hub is the **designated profile editor**: one write-path implementation, one
set of M2M credentials, no split-brain.

## 6. Acting identity — per app, per context

**Requirement: the choice of fursona or person is individual per context.**

- The active actor is chosen from a **Netflix-style picker** hosted by the hub
  after Logto login.
- The choice is **scoped and remembered per app**. Being a fursona in Puck and
  yourself in CandyStore simultaneously is the intended behaviour, because the
  appropriate self genuinely differs by context.
- The active actor is stored in **each app's own session**, not in the token, so
  switching requires no token refresh.
- The person actor appears in the picker as an ordinary tile. "Reviewing as
  myself" is not a special case or an escape hatch.

**Re-prompt triggers:** new session; inactivity threshold exceeded; the actor list
changed (including a transfer completing — see §9).

**Always-visible attribution:** the active actor's name and avatar render at the
point of action, not only in the picker. The inactivity re-prompt covers "I've
been away and forgot"; the visible badge covers the more common failure of being
confidently wrong.

## 7. Permissions

**Requirement: permissions are person-related.**

> A fursona is never the **subject** of a permission. It can be the **object** of
> one.

### 7.1 Three tiers

| Tier | Lives in | Examples | Rationale |
| --- | --- | --- | --- |
| Platform roles | **Logto** (native RBAC) | `admin`, `moderator`, `puck:access` | Person-level, cross-app, small, rarely changes |
| Actor attributes | **Hub** | `visibility`, `status`, verified, handle | Not permissions; Logto must not know fursonas |
| Domain permissions | **Each app** | Puck's 28-key RBAC, seller permissions | Coupled to objects the IdP cannot see |

Because every permission is person-keyed, Logto's native RBAC fits with no
impedance mismatch, and no second roles system is built.

### 7.2 Delivery: mirror, do not stuff tokens

Platform roles are **mirrored into each app** alongside actor rows, not carried as
JWT claims alone.

Claims-only delivery has two failure modes: tokens bloat as roles multiply across
apps, and — more seriously — **a revoked role stays valid until the token
expires**. For bans that window is exactly when harm is occurring. Mirrored state
makes revocation immediate.

```sql
-- per-app mirror, alongside the actors mirror (§4.2)
create table platform_roles (
  identity_sub  text not null,            -- person rows only; roles are person-keyed
  role          text not null,
  synced_at     timestamptz not null default now(),
  primary key (identity_sub, role)
);
```

Keyed on `identity_sub` rather than `actor_ref` — a deliberate restatement of
§7's rule at the schema level. There is nowhere in this table to record a
fursona, so a per-fursona permission cannot be expressed even by accident.

### 7.3 Things that look like fursona permissions but are not

- **Suspending a single fursona** — an attribute (`status`), not a permission.
  Enforcement of misconduct must be **person-level**, or the user switches
  fursonas and continues. Fursona suspension is public hygiene, not a control.
- **Verified / featured / visible** — attributes.

### 7.4 The genuine case: permissions *over* an actor

Co-owned characters, group mascots, an artist managing a character on someone's
behalf, and transfer itself. The subject remains a **person**; the fursona is the
object. Modelled as `person → may manage → actor`.

Only single-owner is implemented initially (§15). The model does not preclude
co-ownership later.

### 7.5 Capability gating and elevation

Person-only capabilities: selling, checkout, payment, shipping address — anything
legally accountable.

When a person-only action is attempted while acting as a fursona, apps use the
**inline elevation** pattern: prompt to continue as the person, switch, proceed.
Hiding the control is worse — it reads as a bug. Elevation changes the active
actor **only in the current app** (§6).

## 8. Attribution, accountability & moderation

- **Display** uses `author_actor_id`.
- **Enforcement** uses `author_person_ref` — the write-time snapshot, never a
  read-time `owner_ref` walk (§3.2).
- Moderation acts on the **person**. Fursona-level status changes are cosmetic and
  must always be paired with person-level action when responding to misconduct.

**Linkability is a security boundary, not a documentation note.** The
fursona → person mapping exists in the database because moderation requires it,
and must never surface through any API response, UI, export, or error message.

This protects two distinct parties:

1. A person whose fursonas are deliberately not publicly connected.
2. A **previous owner** of a transferred fursona — whose `author_person_ref`
   snapshots remain in app databases and must not be visible to the new owner.

Requires explicit tests, not just review.

## 9. Transfer, exchange & audit

**Requirement: fursonas can be exchanged and sold, with tight audit.**

Only `kind = 'fursona'` rows transfer. `owner_ref` is mutable on them and only
changes through the flow below.

### 9.1 Two-party flow

Unilateral transfer is not permitted — it makes "I never agreed to this" disputes
unresolvable.

```
proposed → accepted  → ownership changes, ledger event written
         → declined
         → cancelled  (by proposer)
         → expired
```

```sql
create table actor_transfer_proposals (
  id             uuid primary key default gen_random_uuid(),
  actor_ref      uuid not null references actors(actor_ref),
  from_owner_ref uuid not null,
  to_owner_ref   uuid not null,
  event_type     text not null check (event_type in ('gift','sale','trade')),
  status         text not null default 'pending'
                   check (status in ('pending','accepted','declined','cancelled','expired')),
  external_ref   text,                    -- optional order/txn reference
  proposed_at    timestamptz not null default now(),
  expires_at     timestamptz not null,
  resolved_at    timestamptz
);
```

Acceptance updates `actors.owner_ref` and writes the ledger event **in one
transaction**.

### 9.2 Append-only ownership ledger

```sql
create table actor_ownership_events (
  id             bigserial primary key,
  actor_ref      uuid not null references actors(actor_ref),
  from_owner_ref uuid,                     -- null on initial creation
  to_owner_ref   uuid not null,
  event_type     text not null
                   check (event_type in ('created','gift','sale','trade',
                                         'admin_transfer','reclaim')),
  initiated_by   uuid not null,            -- person actor_ref
  accepted_by    uuid,                     -- person actor_ref; null for 'created'/admin
  external_ref   text,
  note           text,
  occurred_at    timestamptz not null default now()
);
```

**Append-only.** No UPDATE or DELETE policy is granted, to any role, including
admins. Corrections are new compensating events. Provenance is unreconstructable
if not captured at the time — and in a community where character ownership gets
disputed, this ledger *is* the record of truth.

Every actor's history begins with a `created` event, so the chain is complete from
origin.

`admin_transfer` and `reclaim` exist so staff intervention is *recorded* rather
than performed as an untracked direct write.

### 9.3 Money is out of scope

`external_ref` records a reference to a transaction settled elsewhere. This spec
does not design payments, escrow, or marketplace mechanics, and the platform does
not mediate sales. The model does not preclude adding this later.

### 9.4 In-flight sessions

A completed transfer changes the actor list, which is already a re-prompt trigger
(§6). The previous owner is returned to the picker rather than continuing to act
as a character they no longer own.

## 10. Sync & propagation

- The **hub** is source of truth for actor rows and attributes.
- **Logto** is source of truth for person `name` / `picture`; the hub writes these
  through via the Management API.
- Apps refresh their mirror on login and on change. Webhook-driven refresh is
  preferred over login-only (which leaves stale copies until next sign-in);
  availability to be verified (§14).
- Mirrors are caches. The hub's registry and ledger are authoritative; a mirror
  may be rebuilt from the hub at any time.

## 11. Public directory — deferred, with hedges

Fursona profiles are **private by default** and there is no public directory in
this scope. Two decisions are taken now because they are expensive later:

1. **`handle` minted at creation** for every actor.
2. **`visibility` column present from day one**, defaulted to `private`.

Turning the directory on later becomes a UI project rather than a migration.

## 12. Deltas to the approved central-auth spec

| Central-auth spec | Change |
| --- | --- |
| §5 `user_profiles` with unique `identity_sub` | Replaced by the `actors` mirror (§4.2). `identity_sub` unique only on person rows. |
| §5 `app.current_user_id()` | Replaced by `app.current_person_ref()` + `app.can_act_as()` (§4.4). |
| §5 first-login provisioning | Provisions a **person actor** and its `created` ledger event. |
| §10 "per-app roles/permissions stay each app's concern" | Refined: domain permissions stay per app; platform roles centralize in Logto (§7). |
| §7 Phase 1 "new apps (greenfield)" | Named: the hub is the Phase 1 greenfield app. |
| §3 sacred ID | Joined by `actor_ref` as a second sacred ID (§3.1). |

Phase 0 of the central-auth spec is **unchanged**. Standing up Logto and proving
the Supabase⇄Logto trust does not touch any of this.

## 13. Phasing

**The seam ships early; the product does not have to.**

1. **Phase 1a — seam only.** Apps ship the `actors` mirror, `author_actor_id` +
   `author_person_ref`, and the RLS helpers. Every user has exactly one
   auto-created person actor. No picker, no fursonas, no visible change.
2. **Phase 1b — hub.** Fursona creation and profile editing; the picker; per-app
   active actor.
3. **Phase 2 — transfer.** Proposal flow and ledger.
4. **Later — public directory** (§11), co-ownership (§7.4).

Phase 1a is what makes fursonas a feature rather than a migration. It is the part
that must not be deferred.

## 14. Risks & things to verify

1. **Logto webhooks** — exact user-update event, and free-tier availability.
   Determines whether mirrors refresh on change or only on login (§10).
2. **Logto Management API on the free tier** — M2M credentials and write access,
   required for the hub's write-through of person `name`/`picture` (§5).
3. **Logto native RBAC on the free tier** — role/scope limits (§7.1).
4. **Pronouns are not a standard OIDC claim.** OIDC defines only `gender` (free
   text). Pronouns require custom-claim configuration; confirm it reaches app
   tokens.
5. **Linkability enforcement** (§8) needs explicit tests covering API responses,
   exports, and error messages — including the previous-owner case.
6. **Ledger immutability** should be verified at the database level, not assumed
   from application code.
7. Carried from the central-auth spec: the Supabase⇄Logto Third-Party Auth
   wiring remains the highest-priority unknown, unchanged by this spec.

## 15. Out of scope / YAGNI

- **Co-owned fursonas** — single owner only initially; model permits it later
  (§7.4).
- **Payments, escrow, marketplace mechanics** for fursona sales (§9.3).
- **Public directory / galleries / ref sheets** (§11).
- **Per-fursona permissions** — explicitly rejected as a security anti-pattern
  (§7.3).
- **Zanzibar-style centralized fine-grained authorization** (OpenFGA, SpiceDB,
  Ory Keto). The correct growth path if domain permissions ever need to
  centralize, but it is a service to operate, which conflicts with the near-zero
  ops constraint for no present benefit. Named as the future path; not built
  toward.
- **Rich fursona data in Logto `custom_data`** — rejected; it would make an
  issuer swap a data migration (§3.3).

## 16. Success criteria

1. One person is one Logto identity; that person may hold multiple fursonas.
2. A user can act as different actors in different apps simultaneously.
3. Every permission check resolves to a person; no permission is keyed to a
   fursona.
4. A fursona can be transferred between persons with both parties' consent, and
   the full ownership history is reconstructable from an append-only ledger.
5. After a transfer, moderation of pre-transfer content resolves to the person who
   actually acted, not the new owner.
6. The fursona → person mapping never surfaces through any public interface.
7. Logto holds no fursona data; an issuer swap remains a one-column backfill.
8. Phase 1a ships with no user-visible change, and fursonas arrive later without
   any data migration.

## 17. Repo layout

**Decided:** the hub is its own repo under the AeleOS brand. This repo remains the
cross-app identity concern and **not** a deployable application — the statement in
`CLAUDE.md` holds unchanged.

| Repo | Contains | Deployable |
| --- | --- | --- |
| `aeleos` (this repo) | specs, plans, Logto configuration-as-code | no |
| `aeleos-hub` | the hub application + its own Supabase project | yes |

This mirrors the existing one-repo-per-app convention (`puck`, `candystore`) and
structurally enforces the separation in §12: Phase 0 cannot block on hub work,
because they are different codebases with different release cadences.

**The hub is both a consumer and the registry.** It authenticates against Logto
like any other app, but its Supabase project holds the *authoritative* `actors`
table (§4.1) and the ownership ledger (§9.2) — not a mirror. It is the only app
for which §4.2 does not apply.

## 18. Open decisions

1. **Hub hostname (blocking Phase 1b).** The central-auth spec assigns
   `id.furrycolombia.com` to Logto, so the hub needs its own subdomain — the two
   cannot share a host root reliably under managed Logto. Suggested:
   `me.furrycolombia.com`. Users will perceive one product across two hostnames;
   branding and navigation should make the seam invisible.
2. **Inactivity threshold** for the picker re-prompt (§6). Needs a concrete
   default.
3. **Transfer proposal expiry** window (§9.1).
4. **Content visibility after transfer** — whether a fursona's pre-transfer
   authored content remains displayed under the character. §3.2 makes either
   choice safe; the decision is a community-norms question, not a technical one.

## 19. Implementation deltas from Phase 1a

Phase 1a shipped on branch `feat/actor-model-seam` (migrations `0001`–`0007`, 72
conformance tests). Five things differ from this spec as originally written. They
are recorded here rather than edited into the sections above, so the design intent
and what implementation forced remain distinguishable.

### 19.1 `actor_ref` is derived, not minted — and Phase 1b must not change that

§5 has the hub mint `actor_ref`. In Phase 1a the hub does not exist yet, and each
app provisions person actors independently. Independent minting would give the same
human different platform identities per app — the one migration this design exists
to prevent.

So a person's `actor_ref` is **derived deterministically** from `identity_sub`:
UUIDv5 over the fixed namespace `d1f1a0c6-6b3e-5f7a-9c2d-3e4f5a6b7c8d`. Every app
computes the same value with zero coordination. A golden-vector test pins it
(`aeleos-golden-vector` → `ea573748-66ea-5413-a843-6e7068f19da6`).

> ⚠️ **Phase 1b must adopt the identical derivation for person actors.** If the hub
> mints random `actor_ref`s instead, every person already provisioned forks into two
> identities. Fursona `actor_ref`s may be randomly minted by the hub — only person
> rows are derived.

### 19.2 Accountability is server-derived, not client-asserted

§4.3 had the client send `author_person_ref`, validated by an RLS `with check`. That
is now inverted: the column is revoked from every client insert grant and set by a
`before insert` trigger from `current_person_ref()`.

Rationale: as a pattern other apps copy, the original shape failed *silently*. An app
that dropped the `and author_person_ref = ...` conjunct still passed the
"can't post as another's fursona" test — that clause is `can_act_as` — and failed only
the forged-snapshot test, the one most likely to be dropped when adapting the suite.
The trigger version fails closed regardless of what a copier deletes.

### 19.3 A suspended person can act as nothing — **product decision, needs confirming**

§7.3 says negative permissions must be person-level or they are trivially evaded.
The first implementation checked `status` on the *target* actor only, so suspending a
person left every fursona they owned fully usable — the exact evasion §7.3 warns of.
Found in final review, reproduced live, fixed in `0007`: `current_person_ref()` now
returns null for a suspended person, so they can act as nothing at all.

**Consequence to confirm:** this also hides a suspended person's own private fursonas
from `actors_public` and blocks them editing or deleting their own past content. That
follows logically from "act as nothing", but what suspension *should* mean for a
person's access to their own data is a product decision, not a technical one.

### 19.4 Linkability is enforced by a catalog invariant, not only per-object tests

§8 requires explicit tests for the linkability boundary. Per-object tests only prove
it for objects *this* repo defines; copying apps add their own tables, which is where
the next leak comes from. `tests/db/exposure-invariants.test.ts` therefore asserts at
the catalog level that no client role holds SELECT on any column named `owner_ref`,
`identity_sub`, or `author_person_ref` on any relation in `public`. It was verified to
catch a deliberately introduced regression.

### 19.5 `0005` is a test fixture, and the conformance suite depends on it

The reference `comments` table is not a product table, but 13 of the 72 tests require
it. Adopting apps apply `0001`–`0007` including `0005`, or port those tests onto their
own authored table. Also note: because the pattern uses column-level grants,
`select('*')` fails — clients must name columns explicitly.

### 19.6 What Phase 1a still does not prove

Unchanged from §14.7 and worth restating: the conformance suite validates claim shape
and policy behaviour only. It mints HS256 tokens against a local secret. **It does not
validate the Supabase⇄Logto Third-Party Auth trust**, which uses asymmetric JWKS
verification. That remains Phase 0's job and the highest-risk unknown in the design.

## 20. Next step

Implementation planning for **Phase 1a** (the seam), sequenced after the
central-auth spec's Phase 0. Phase 1a touches only the consuming apps' schemas and
is **not** blocked by §18.1 — the hub hostname is needed for Phase 1b.
