# Hub deployment (human steps)

The design is `docs/superpowers/specs/2026-08-11-hub-deployment-design.md`, and
the task order is `docs/superpowers/plans/2026-08-11-hub-deployment.md`. This
file records what was actually done and what each value is for, so a rebuild
does not require rediscovering it. It records no secrets.

## 0. Confirmed before starting

| Question                                                                                | Answer                  | How                     |
| --------------------------------------------------------------------------------------- | ----------------------- | ----------------------- |
| Clerk free plan includes a production instance and a custom domain, at $0 with no card? | **pending** — see below | Clerk Dashboard billing |
| Supabase allows two Clerk Third-Party Auth integrations?                                | **yes** (2026-08-11)    | Management API probe    |

### Supabase accepts a second integration

Settled empirically rather than by reading. The project has one integration:

```
type: clerk-development
oidc_issuer_url: https://regular-puma-47.clerk.accounts.dev
```

Posting a second one with a deliberately invalid issuer was rejected with:

> Fetching of the JWT signing keys (JWKS) for this Third-Party Auth integration
> failed. Check the configuration for typos.

That is a complaint about the issuer, **not** about a limit — so the second slot
exists and Supabase only refused the fake issuer. Nothing was created; the
project still has exactly one integration.

This is spec §5 **resolution 1**: production can be trusted alongside
development. **CI is unaffected** — `idp-cloud` keeps minting users on the
development instance, and it keeps testing something real, because production
will be trusted by the same project.

Had the answer been no, the production instance would have had to replace the
development one and CI's `CLERK_SECRET_KEY` / `CLERK_DOMAIN` secrets would have
had to move with it, or `idp-cloud` would have gone green while testing an
instance nobody uses.

### The Clerk plan question is still open

It is the one precondition that can end the plan, because the budget is a hard
stop rather than a preference.

What the documentation says: Clerk gates specific **features** behind a paid
plan for production use — allowlist and blocklist, session inactivity timeout,
and a custom maximum session lifetime. **None of those are used here.** Nothing
in the documentation describes a production instance or a custom domain as
itself paid, and `CLAUDE.md` records the free plan as covering 50,000 monthly
users at $0.

So the expectation is that this is free. Confirm it on the billing screen before
anything depends on it:

- A **production instance** can be created at $0.
- A **custom domain** for the Frontend API is included.
- **No card** is requested at any point.

If any of those is false, stop. The fallback is a different design — running the
hub behind the development instance on a `*.vercel.app` URL — and it needs its
own decision, not a workaround.

## 1. Clerk production instance

_Not yet created. Task 2 of the plan._

The primary domain is **`furrycolombia.com`**, not `me.furrycolombia.com`, so
that Puck and Libra join SSO with a dashboard entry rather than satellite
configuration. The Frontend API is **`clerk.furrycolombia.com`**.

`id.furrycolombia.com` is **not** used and will not be created. It belonged to
Logto's hosted login page; Clerk's components render inside the hub, so nobody
visits a Clerk-branded address.

Every Clerk DNS record must be **DNS only** (grey cloud) in Cloudflare. All
seven pre-existing records in that zone are proxied, so this is a deliberate
exception, not the default — Clerk validates its records with a DNS check that
fails behind Cloudflare's proxy.

## 2. What is live now

The hub is deployed and reachable at **https://me.furrycolombia.com**, running
the **development** Clerk instance. The sign-in page shows Clerk's orange
"Development mode" banner, which is the visible marker that this is not yet the
production identity provider.

| Piece    | Value                                                        |
| -------- | ------------------------------------------------------------ |
| Host     | Vercel project `aeleos-hub`, Root Directory `apps/hub`       |
| Git link | **none** — GitHub Actions builds and uploads the output      |
| DNS      | `CNAME me.furrycolombia.com → …vercel-dns-017.com`, DNS-only |
| Database | the hosted AeleOS Supabase project                           |
| Deploy   | `.github/workflows/deploy.yml`, on push to `main`            |

Swapping to production Clerk is an environment-variable change and a redeploy.
**The hostname does not change.**
