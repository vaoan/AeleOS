# AeleOS — Hub Deployment (Vercel + production Clerk) — Design

- **Date:** 2026-08-11
- **Status:** Approved for implementation planning
- **Scope:** Deploying `apps/hub` to a public hostname with a production Clerk
  instance. Covers DNS, the Clerk instance split, CI implications and provider
  sequencing. Does not change any application code.
- **Author:** Heiner Angarita (with Claude)
- **Supersedes:** the `id.furrycolombia.com` hostname wherever it appears.
  That subdomain is **retired and will never be created** — see §3.
- **Related:** `2026-08-10-hub-in-aeleos-design.md` (where the hub lives),
  `2026-07-31-idp-decision-change.md` (why Clerk), `docs/phase-0-clerk-setup.md`
  (the connector lineup and its costs).

---

## 1. Context & goal

The hub runs only on a developer's machine, against a local Supabase stack. That
is a poor fit for a project with effectively one maintainer who does not want to
run Docker to look at their own product.

The backend is already further along than the frontend. The AeleOS Supabase
project (`vmmpssydbrtkgvrlkijh`) has the actor schema pushed, Third-Party Auth
live, and `ensure_person_actor()` proven idempotent — asserted on every pull
request by the `idp-cloud` job, which mints a real Clerk user and resolves it as
`role=authenticated`. Deploying is therefore mostly a matter of pointing the
already-working app at the already-working database from a public hostname.

**Goal:** `me.furrycolombia.com` serves the hub, a person signs in with Discord,
and `/me` shows the platform ID that every Furry Colombia app will share.

## 2. Topology

| Hostname                   | Points at                                      | User-visible |
| -------------------------- | ---------------------------------------------- | ------------ |
| `me.furrycolombia.com`     | Vercel — `apps/hub`, Root Directory `apps/hub` | yes          |
| `clerk.furrycolombia.com`  | Clerk Frontend API, CNAME, **DNS-only**        | no           |
| `furrycolombia.com`        | unchanged — no record is added or altered      | —            |
| ~~`id.furrycolombia.com`~~ | retired, never created                         | —            |

Supabase stays the **existing** AeleOS project. No new project, no new schema,
no migration work. `supabase/migrations/` at the repository root remains the
single source for the one database.

The authentication flow is unchanged from what is already built and tested. The
browser loads the hub from `me.`, Clerk's JavaScript calls `clerk.` to run the
OAuth dance and mint a session, the hub forwards the resulting Clerk token to
PostgREST, and RLS resolves the caller from `auth.jwt()->>'sub'`. Only hostnames
and keys change; no application code does.

## 3. Why `id.furrycolombia.com` is retired

`id.` was correct for **Logto**, and only for Logto. Logto was a hosted login
_application_: every app redirected the browser to `id.furrycolombia.com`, the
person signed in on a page served there, and was redirected back. The subdomain
was a destination people saw.

Clerk does not work that way here. The hub renders Clerk's components in its own
pages — the sign-in screen is `me.furrycolombia.com/sign-in`, served by the
`[[...sign-in]]` route already in the repository. Nobody is ever redirected to a
Clerk-branded hostname. The only Clerk hostname is an API endpoint, and an API
endpoint does not deserve the platform's identity subdomain.

So `id.` buys nothing and costs a name. It is retired rather than repurposed.

## 4. Why Clerk sits beside `me.`, not under it

Clerk's Frontend API needs its own hostname: `me.furrycolombia.com` resolves to
Vercel, and one name cannot also resolve to Clerk. The real choice is
`clerk.furrycolombia.com` (a sibling of `me.`) or `clerk.me.furrycolombia.com`
(a child of it).

**It is not a cookie question.** Both are same-site with `me.`, because same-site
is computed on the registrable domain. An earlier draft of this reasoning claimed
otherwise and was wrong.

The difference is which of Clerk's two domain models the platform lands in when
the second app arrives:

| Clerk primary domain   | `puck.furrycolombia.com` is…                     | Cost                                                                                                                          |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `furrycolombia.com`    | a subdomain of the primary domain                | add it to **Allowed Subdomains**. Nothing else.                                                                               |
| `me.furrycolombia.com` | neither the primary domain nor a subdomain of it | a **satellite domain**: per-app `isSatellite`, `domain`, `signInUrl` back to the hub, and `allowedRedirectOrigins` on the hub |

AeleOS exists so that Puck and Libra share one login. Choosing the primary
domain `furrycolombia.com` keeps that a one-line dashboard entry per app forever.
Choosing `me.` makes every future app carry satellite configuration to buy back
what was given away.

Setting Clerk's primary domain to `furrycolombia.com` **adds subdomain records
only**. The apex site is not touched: no A record, no redirect, no page moves.

## 5. Two Clerk instances, one Supabase project

This is the only genuinely awkward part of the design, and it must not be
resolved by accident.

There will be two Clerk instances:

- **Development** — used by `localhost` and by CI's `idp-cloud` job, which mints
  a throwaway user per run.
- **Production** — used by `me.furrycolombia.com`.

There is one Supabase project, and Supabase Third-Party Auth trusts a Clerk
**domain**. If the project is pointed at production Clerk while CI keeps minting
users on the development instance, `idp-cloud` goes green while testing an
instance nobody uses. **That is a gate that proves nothing**, and this project
has spent real effort removing exactly that shape of failure. It is ruled out.

Two acceptable resolutions, in order of preference:

1. **Trust both.** Add production Clerk as a second Third-Party Auth integration
   alongside development. Local work, CI and production are all validated, and
   nothing changes in CI. Whether Supabase permits two Clerk integrations on one
   project is unconfirmed — see §9.
2. **Trust production only, and move CI to it.** Point Supabase at the production
   Clerk domain and have `idp-cloud` mint its user on the production instance.
   `scripts/run-cloud-idp.mjs` already derives a per-run identity from
   `GITHUB_RUN_ID` and deletes it in a `finally`, so concurrent runs cannot
   collide and a failed run leaves nothing behind — it is safe to point at a
   production instance. The cost is that local development against cloud Supabase
   needs the production Clerk keys.

Either way, the rule holds: **whatever issues the tokens production uses is what
CI must exercise.**

## 6. Delivery: GitHub Actions, not Vercel's Git integration

**Amended 2026-08-11.** This section originally assumed Vercel's Git
integration and its Preview environment. It does not use either.

Vercel has no connection to the repository. `.github/workflows/deploy.yml`
builds with the Vercel CLI on a runner and uploads only `.vercel/output` via
`vercel deploy --prebuilt`. Vercel's own documentation describes this as the
path for people who cannot use the Git integration, and notes what makes it
attractive here: it ensures "source code is not exposed to Vercel during the
build process." `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` replace project
linking, so no `.vercel` directory is committed.

The reason is coupling, not distrust. The deploy pipeline lives in a file in
this repository, readable and changeable, and moving to another host means
editing that file rather than unpicking an integration. It also keeps the
`apps/hub`-carries-no-Vercel-configuration property from
`2026-08-10-hub-in-aeleos-design.md` true of the delivery path as well as the
application.

**The build must run on Linux.** Next 16 emits symlinks into `.vercel/output`;
building on Windows produces links that fail to upload with an `ENOENT` on a
path that exists locally. This was hit before the workflow existed.

**Consequence — there are no automatic preview deployments.** They were a
property of the Git integration. `vercel deploy` without `--prod` returns a
preview URL, so previews can be added to the workflow deliberately, and the
e2e suite can point at any URL since Task 5. That is follow-on work, not part
of this design.

Deploying on push to `main` is safe because `main` cannot receive unverified
code: `conformance`, `hub` and `idp-cloud` are required checks and admins are
not exempt, so every commit there has already passed them on a pull request.

## 7. Provider sequencing

`docs/phase-0-clerk-setup.md` establishes the lineup — Google, Discord, Facebook
— on cost grounds. Production has an ordering constraint that development did
not, because production requires **our own** OAuth applications rather than
Clerk's shared development credentials:

| Provider     | Blocker before it can be configured                                             |
| ------------ | ------------------------------------------------------------------------------- |
| **Discord**  | none — a free Developer Portal application                                      |
| **Google**   | the unresolved question of whether an OAuth client requires GCP billing         |
| **Facebook** | a privacy policy URL and a data-deletion callback, both of which must be hosted |

Facebook's requirement is circular: it needs pages that only exist once the site
is live. It therefore cannot be a precondition for going live.

**Launch with Discord alone.** Add Google once the billing question is answered
by creating the client, and Facebook once the hub hosts the two required pages.
Adding a connection later costs nothing and traps nobody — social-login-first
means an affected person re-links by email on their next sign-in.

## 8. Split of work

**Human only** — no agent can do these:

1. Create the production Clerk instance; set its primary domain to
   `furrycolombia.com`; turn password sign-in **off**.
2. Register a Discord application; set its redirect URI to the callback Clerk
   shows for `clerk.furrycolombia.com`.
3. Add the DNS records Clerk's dashboard specifies, in Cloudflare, each set to
   **DNS only** (grey cloud). Clerk validates these records with a DNS check
   that fails behind Cloudflare's proxy.
4. Create the Vercel project from the repository; set Root Directory to
   `apps/hub`; add the environment variables per environment (§6); add
   `me.furrycolombia.com` as a domain.
5. Add the production Clerk integration in the Supabase dashboard (§5).

**Agent work** — in this repository:

1. A `docs/deployment.md` runbook in the style of `phase-0-clerk-setup.md`,
   recording exact values and their reasons rather than restating dashboards.
2. `apps/hub/.env.example` annotated for the production values.
3. Whatever CI change §5's resolution forces.
4. Retiring `id.furrycolombia.com` from the documentation that still names it.

No `vercel.json`. Per `2026-08-10-hub-in-aeleos-design.md`, `apps/hub` carries no
Vercel-specific configuration beyond what Next.js generates, and that is
deliberate: it is what keeps a move to Cloudflare a configuration change rather
than a rewrite.

## 9. Confirm by doing

Recorded rather than guessed, following the precedent set by the Google billing
question in `docs/phase-0-clerk-setup.md`:

- **Can one Supabase project hold two Clerk Third-Party Auth integrations?**
  Decides §5. Supabase's documentation describes adding "a new Third-Party Auth
  integration" without stating whether a second is allowed.
- **Does Clerk's free plan include a production instance with a custom domain?**
  Believed yes, and the whole design assumes it. Confirm before depending on it;
  if it does not, the deployment stops until a free path is found, per the budget
  rule.
- **Does creating a Google OAuth client require a billing account?** Inherited
  from Phase 0, unchanged, and now sequenced after launch rather than before it.

## 10. Cost

| Item              | Plan             | Cost                                                          |
| ----------------- | ---------------- | ------------------------------------------------------------- |
| Vercel            | Hobby            | $0 — no card; limits pause the deployment rather than billing |
| Clerk             | Free             | $0 — 50,000 MAU                                               |
| Discord OAuth app | Developer Portal | $0                                                            |
| Cloudflare DNS    | Free             | $0                                                            |

Nothing here requires a card on file. Vercel Hobby's failure mode — pausing
rather than charging — is the correct one against a hard-stop budget: disruptive,
never expensive.

Hobby is restricted to personal, non-commercial use. AeleOS generates no revenue,
so it sits inside that restriction; the residual risk and its mitigation are
recorded in `2026-08-10-hub-in-aeleos-design.md` and are unchanged by this spec.

## 11. What this does NOT cover

- Google and Facebook connections (§7 — sequenced after launch).
- The privacy policy and data-deletion pages Facebook will require.
- Puck and Libra joining the SSO. §4 chooses the domain layout that makes it a
  dashboard entry, but their integration is each app's own work.
- Phase 1b-ii — fursonas, the picker, the active-actor handoff.
