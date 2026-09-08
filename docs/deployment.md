# Hub deployment (human steps)

The design is `docs/superpowers/specs/2026-08-11-hub-deployment-design.md`, and
the task order is `docs/superpowers/plans/2026-08-11-hub-deployment.md`. This
file records what was actually done and what each value is for, so a rebuild
does not require rediscovering it. It records no secrets.

## 0. Confirmed before starting

| Question                                                                                 | Answer                                                                       | How                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| Clerk Hobby plan includes a production instance and a custom domain, at $0 with no card? | **published answer: yes** (2026-09-07) — one dashboard check left, see below | clerk.com/pricing    |
| Supabase allows two Clerk Third-Party Auth integrations?                                 | **yes** (2026-08-11)                                                         | Management API probe |

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

### The Clerk plan question, answered on the published terms (2026-09-07)

It is the one precondition that can end the plan, because the budget is a hard
stop rather than a preference. Read directly off `clerk.com/pricing` rather
than inferred:

- The plan is called **Hobby**, not "Free". Anything in this repository still
  saying "Clerk Free plan" means this one.
- **Custom domain is listed as included.** That is the line the whole design
  rests on, and it is stated on the plan itself rather than implied.
- **"No credit card required to start."**
- **50,000 MRU** — monthly RETAINED users, counted only for someone who
  returns 24 hours or more after signing up. Earlier notes here and in
  `CLAUDE.md` said "50,000 MAU"; MRU is the more generous of the two, so the
  budget position is better than was recorded, not worse.
- **Three social connections.** Unlimited is a Pro feature at $20–25/month,
  which is a hard stop — see §1's provider decision for what that costs us.

Two things we are accepting rather than avoiding, both cosmetic or mild:

- **"Remove Clerk branding" is a Pro feature**, so the production sign-in
  carries _Secured by Clerk_.
- **Hobby has a fixed 7-day session lifetime.** A custom lifetime is Pro. The
  design never wanted one, so this is a property to know rather than a
  blocker: people re-authenticate weekly.

**What is still owed is the billing screen itself.** A pricing page and a
billing screen occasionally disagree, and this project's own convention is to
confirm by doing. Before anything depends on it, check that creating the
production instance and its custom domain completes without a card being
requested at any point.

If it does not, stop. The fallback is a different design — running the hub
behind the development instance on a `*.vercel.app` URL — and it needs its own
decision, not a workaround.

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

### What sign-in offers at launch (2026-09-07)

**Google, Discord, and email code. The third social slot stays empty.**

**This supersedes the design's §7 "Launch with Discord alone."** That ruling
was correct when it was made and its premise is now false. It sequenced Google
after launch because nothing depended on Google — and Libra's existing users
sign in with **Google and Discord** (confirmed by the owner, 2026-09-07). A
Discord-only launch locks out every Google user on the day Libra points at
Clerk. Root rule 25's shape: a premise about the world, dated, and falsified by
something learned later.

So the ordering inverts.

| Strategy       | Status at launch | What it needs                                         |
| -------------- | ---------------- | ----------------------------------------------------- |
| **Discord**    | required         | a free Developer Portal application — no prerequisite |
| **Google**     | **required**     | our own OAuth client, and the billing question below  |
| **Email code** | required         | a Clerk setting; costs **no** social slot             |
| _third social_ | held open        | nothing — deliberately unfilled, see below            |

**Google is now the blocker on the critical path, not a follow-up.** The
question inherited from `phase-0-clerk-setup.md` — whether creating an OAuth
client requires a billing account on the Cloud project — has never been
answered, and public sources do not settle it (what they describe is billing
for billable _APIs_, which sign-in does not enable). GCP billing for this
organisation is off permanently and deliberately, so if the client cannot be
created without a card, that is a decision to take rather than a step to work
around. **Answer it by creating the client**, which is this repository's own
convention for a question about somebody else's service.

**Email code costs no social slot, and that is why it is in the launch set.**
It is an auth ATTRIBUTE rather than a social connection — the distinction
`phase-0-clerk-setup.md` already draws between `user_settings.social` and
`user_settings.attributes` — so it does not consume one of Hobby's three. It
is the safety net that makes the migration survivable: production has password
sign-in **off** by design, Libra's Supabase Auth passwords do not move, and a
person whose provider email does not resolve the way they expect has no other
way in. Without it, "re-link by email on next sign-in" is a promise with no
mechanism behind it for anyone whose two providers both fail.

### Why the third slot is empty rather than Facebook

`phase-0-clerk-setup.md`'s lineup names **Google, Discord and Facebook**, and
that third choice is deferred rather than kept, for reasons that note already
half-stated:

- **No Libra user signs in with Facebook**, so it does nothing for the
  migration this launch exists to serve.
- **It is the one provider with a circular blocker** — a privacy policy URL
  and a data-deletion callback, both of which must be hosted on a site that is
  live. It cannot be a precondition for going live.
- **Facebook is built around a real-name policy and this is a pseudonymous
  fursona community.** The lineup note records that doubt and names **Twitch**
  as the obvious free alternative if the slot is ever better spent. Twitch has
  neither of Facebook's blockers.

The slot is therefore left open on purpose, to be decided when somebody
actually wants it. Filling it now would spend the last free connection on the
candidate with the most prerequisites and the least evidence of demand.

**Do not render a disabled "coming soon" provider button.** Clerk's prebuilt
`<SignIn />` draws buttons for the connections ENABLED on the instance; there
is no enabled-but-disabled state, so a greyed-out third button means building
the sign-in form by hand with Clerk Elements or faking one through the
appearance API — real work for a control that does nothing. If the absence
needs signalling at all, a line of text under the buttons cannot be pressed and
cannot rot into a control somebody expects to work.

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
