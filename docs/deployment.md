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

**Created 2026-09-27**, as a clone of the development instance, from the
Clerk dashboard driven by Claude in a browser the owner had signed into. No
card was requested at creation, at the custom domain step, or at any point
after — that is the last of §0's questions, answered by doing. It is the
AeleOS application's production instance; the organisation stays on **Hobby**.

Cloning copied the development instance's settings, and three of them were
wrong for production and were changed the same day:

| Setting                             | Cloned as | Set to                                                           |
| ----------------------------------- | --------- | ---------------------------------------------------------------- |
| Sign-up with password               | on        | **off** (and "add password to account" off) — social-login-first |
| Facebook connection                 | enabled   | **disabled**; the third slot is empty on purpose (§1 below)      |
| Email verification code for sign-in | on        | on — kept; it is the launch set's safety net                     |

The production keys (`pk_live_…`, `sk_live_…`) live in `.secrets` and in the
repository's GitHub secrets under `CLERK_PROD_*` names — the sync workflow
exports them from the branch that added them, so **until that branch is on
`main`, `pnpm sync-secrets` rewrites `.secrets` without them** — and **not**
in Vercel:
the hub keeps running the development instance (§2), so the swap the plan's
Task 6 describes has not happened and is not meant to yet.

### DNS records

Added to the `furrycolombia.com` Cloudflare zone through its API with the
`CF_API_TOKEN` from `.secrets`, each explicitly `proxied: false`. All five
were **DNS only** (grey cloud) from the moment they existed, and the Frontend
API showed as verified in Clerk within a minute; the mail records took a few
minutes longer to reach every public resolver.

| Type  | Name              | Purpose                                           |
| ----- | ----------------- | ------------------------------------------------- |
| CNAME | `clerk`           | Frontend API — every app's Clerk code talks to it |
| CNAME | `accounts`        | Account Portal — exists, nothing of ours links it |
| CNAME | `clkmail`         | transactional email (verification codes)          |
| CNAME | `clk._domainkey`  | DKIM key 1 for that mail                          |
| CNAME | `clk2._domainkey` | DKIM key 2 for that mail                          |

Values are Clerk-issued targets under `clerk.services`, read off the Domains
page at the time; a rebuild reads them there again rather than from here.

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

### Google: the billing question, answered (2026-09-27)

**Creating the OAuth client required no billing account.** The GCP project
`furrycolombia-candyshop` — the one whose free trial ended and took Libra's
old host with it — still opens, still edits, and still creates credentials;
what it lost is paid compute, not the console. So the question the design
carried since `phase-0-clerk-setup.md` is closed the way this repository
settles questions about other people's services: by doing it.

Two things were wrong on the way and are now right, both on the **Google Auth
Platform** pages of that project:

- **The consent screen was in "Testing" with zero test users**, which would
  have refused every Google sign-in with a "this app is not verified /
  access blocked" screen. It is **published** now. Publishing needed the
  branding page complete: the homepage `https://furrycolombia.com`, a privacy
  policy link and a terms link. Both point at Libra's landing app —
  `https://store.furrycolombia.com/es/legal/privacy` and `…/legal/terms` —
  which is where those pages exist in code, and which resolves once Libra is
  back online. Google does not fetch them to publish; they are shown to the
  person on the consent screen. Publishing needed no verification because the
  client asks only for `openid`, `email` and `profile`, which are not
  sensitive scopes, and the app carries no logo.
- **A dedicated client** named `AeleOS sign-in (Clerk production)`, type web
  application, with the single authorized redirect URI
  `https://clerk.furrycolombia.com/v1/oauth_callback`. The older `CandyShop`
  client from Libra's Supabase Auth days is left alone. The client ID and
  secret are in `.secrets` and GitHub secrets as `GOOGLE_OAUTH_CLIENT_*`, and
  entered into the production instance's Google connection, which reports
  **"Used for sign-in"**.

`furrycolombia.com` was already an authorized domain on the consent screen,
so the redirect URI on `clerk.furrycolombia.com` needed nothing further.

### Discord (2026-09-27)

A new Discord application named **Furry Colombia** — the name is what a
person sees on Discord's authorise screen, so it is the platform's, not a
vendor's or a shop's — with the single redirect
`https://clerk.furrycolombia.com/v1/oauth_callback` under OAuth2. Its client
ID and a freshly reset secret are in `.secrets` and GitHub secrets as
`DISCORD_OAUTH_CLIENT_*` and entered into the production instance's Discord
connection, which reports **"Used for sign-in"**. Libra's older `Candy Shop`
application is left as it was. Two of the portal's steps are the owner's
alone — its login and a CAPTCHA on application creation, then a password
prompt before the secret is shown — which is why this record says who did
what.

## 2. Supabase trust

The AeleOS project (`vmmpssydbrtkgvrlkijh`) is unchanged apart from its
Third-Party Auth entries. No new project, no migration work — the schema and
`ensure_person_actor()` were already live and are proven on every pull request
by `idp-cloud`.

**Both development and production Clerk integrations coexist** (§0's
resolution 1, taken 2026-09-27). The production entry was added through the
Management API with the issuer `https://clerk.furrycolombia.com`; Supabase
types it `custom` rather than `clerk`, and that is only a label — it resolves
the same JWKS (its `resolved_jwks` carries the production instance's key id)
and honours the same `role` claim.

**The `role` claim is per instance and cloning does not carry it.** The
first production token minted had no `role` at all: the claim comes from
Clerk's Supabase integration, which Phase 0 activated on the development
instance only. Activated for production the same way — Clerk's Supabase setup
page, instance set to Production, "Activate Supabase integration" — and the
next token carried `role=authenticated`. A production instance that skips
this step verifies fine and is refused by every RLS policy, which is a
harder fault to read than a `401`. **CI is unchanged**:
`idp-cloud` keeps minting on the development instance, which is what the hub
still runs, so the rule this protects — whatever issues the tokens production
uses is what CI must exercise — holds for the hub's production. Libra's
production is the other instance, and `scripts/run-cloud-idp.mjs` now proves
that one on demand: export the `CLERK_PROD_*` pair as `CLERK_SECRET_KEY` and
`CLERK_DOMAIN` and run `pnpm test:idp:cloud`; the runner picks the trust
entry whose issuer matches the domain in use, so its log names the instance
it actually tested.

**Proved 2026-09-27: 15 of 15 on development, then 15 of 15 on production**,
each run minting its own user and deleting it. Two things the production run
taught the runner on the way:

- **Clerk's Backend API will not create a session on a production instance**
  ("Request only valid for development instances"), which is how the runner
  had always minted. On production it now asks the Backend API for a
  sign-in token and lets the Frontend API consume it in native mode
  (`_is_native=1`, client token in the `Authorization` header) and sign the
  session JWT. The secret key's prefix picks the path.
- **A mint that failed leaked its user.** The user was created before the
  `try … finally` that deletes it, and `fail()` exits without running
  `finally`. The first production run left `phase0+cloud-local-…` behind on
  the production instance; it was deleted by hand, and the mint now sits
  inside the block and throws instead of exiting.

**The free-tier project pauses after a week without traffic, and the first
proof run found it paused (2026-09-27).** Both `api-keys` and `secrets`
answer `[]` with HTTP 200 while a project is `INACTIVE`, which the runner
reports as "could not read anon/service_role keys" — an empty answer, not a
refusal, so nothing points at the pause. `idp-cloud` had last run ten days
earlier; nothing had touched the project since, and `me.furrycolombia.com`
had been serving against a paused database the whole time. Restoring is one
Management API call (`POST /v1/projects/{ref}/restore`) and a few minutes of
`COMING_UP`. A weekly ping is the obvious follow-up and is not built yet.

## 3. What is live now

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
