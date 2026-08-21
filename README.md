<p align="center">
  <img src=".github/readme-hero.svg" alt="AeleOS — the identity hub and actor registry for Furry Colombia" width="100%">
</p>

<h1 align="center">AeleOS</h1>

<p align="center">
  <strong>Identity is the operating system.</strong><br>
  The identity hub and actor registry for Furry Colombia.
</p>

<p align="center">
  <a href="https://me.furrycolombia.com"><img alt="Live at me.furrycolombia.com" src="https://img.shields.io/badge/live-me.furrycolombia.com-ef6d97"></a>
  <a href="https://github.com/vaoan/AeleOS/actions"><img alt="CI" src="https://github.com/vaoan/AeleOS/actions/workflows/db-tests.yml/badge.svg"></a>
  <img alt="Node 24+" src="https://img.shields.io/badge/node-%E2%89%A524-845cd6">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-f5c14e">
</p>

One person carries **one login and every fursona** across the platform, while
each app keeps its own database. AeleOS is where somebody signs in, decides who
they are, and builds the page a stranger reads — and it is the one place social
logins are configured for everybody.

**[Open the hub →](https://me.furrycolombia.com)** · **[Integrate an app →](docs/integrating.md)** · **[Explore the architecture →](docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md)**

> **On the name.** Furry Colombia's apps are moons — **Puck** orbits Uranus,
> **Janus** orbits Saturn. AeleOS is the star they orbit, which is literally the
> dependency graph: everything depends on identity. The word is the founder's
> fursona _Aeleos_ + `OS`.

---

## What ships today

- **Sign in once, and be somebody.** Clerk-backed sign-in with Google and
  Discord, and a person actor provisioned on the first visit.
- **One registry for a person and their fursonas.** The authoritative record of
  who exists and who owns whom, shared by every app.
- **A studio for building a page.** Sections are containers of places holding
  content or more containers, three deep, arranged by dragging with a mouse or
  a keyboard — plus skins, borders, widths, backgrounds and per-item bilingual
  fields.
- **Public pages anybody can read.** `/{person}` is somebody's profile and
  `/{person}/{fursona}` is one of their characters. A person's permanent number
  and their vanity both resolve forever, so a shared link never rots.
- **Bilingual, Spanish first.** The browser's language wins where supported and
  Spanish is the fallback.
- **A handoff other apps can use.** A picker where somebody chooses which
  identity to be, and a server-to-server actor list for the app that asked.
- **Nothing is uploaded.** Every picture, video and song on a page is a link
  somebody pasted. AeleOS hosts no files.

## How it works

```mermaid
flowchart LR
  person(["A person"]) --> clerk["Clerk<br/>who they are, social logins,<br/>one shared session"]
  clerk --> hub["AeleOS hub<br/>me.furrycolombia.com"]
  hub --> registry[("Actor registry<br/>the authority on<br/>people and fursonas")]
  clerk -. "signs them in silently" .-> app["A consuming app<br/>Puck, Libra, next"]
  hub -. "picker + actor sync" .-> app
  app --> store[("That app's own Supabase<br/>mirror + its domain data")]
```

Clerk is the source of truth for _who a person is_, and for nothing else. Every
app keeps its own Supabase project and uses **Third-Party Auth** to trust Clerk,
so RLS keeps working keyed to `auth.jwt()->>'sub'`. Because every app is a
subdomain of `furrycolombia.com`, one session covers all of them.

Two rules carry the whole design:

- **`identity_sub` is sacred.** Every app stores Clerk's `sub` in a column of its
  own and never lets its data keys depend on the issuer. Changing token issuers
  is then a one-column backfill instead of a data remap — which matters, because
  no Supabase-supported IdP is self-hostable and this is the only exit there is.
- **An `actor_ref` in a query string is a suggestion, never an authorization.**
  The consuming app looks it up in its own mirror, confirms ownership and
  `active` status, and uses its local row. An absent one means the person
  declined; nothing changes.

The endpoints, the mirror shape and the failure modes live in
**[`docs/integrating.md`](docs/integrating.md)**.

## What lives here

| Concern                                        | Path                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| The only deployable app                        | [`apps/hub`](apps/hub)                           |
| The framework-free identity seam apps share    | [`packages/identity`](packages/identity)         |
| The authoritative registry schema              | [`supabase/migrations`](supabase/migrations)     |
| Conformance suites — database and real IdP     | [`tests/db`](tests/db), [`tests/idp`](tests/idp) |
| Integration contract, operations, specs, plans | [`docs`](docs)                                   |

**We do not build an identity provider.** [Clerk](https://clerk.com) is the IdP;
this repository configures it. Nobody is ever sent to a Clerk-branded address —
the hub renders Clerk's components in its own pages, so people sign in at
`me.furrycolombia.com/sign-in`. Per-app integration code belongs in each app's
own repository, not here.

## Choose your path

- **Just looking?** Open [the hub](https://me.furrycolombia.com) and read
  somebody's page.
- **Integrating an app?** Start at [`docs/integrating.md`](docs/integrating.md) —
  it is written for a developer who has never seen this repository.
- **Contributing?** Run it locally below, then read [`CLAUDE.md`](CLAUDE.md) for
  the conventions, which are enforced rather than advisory.

## Run it locally

You need **Node.js 24 or newer**, the pnpm version pinned by `packageManager` in
`package.json`, and GitHub CLI access for `pnpm sync-secrets`. Docker is needed
only for the database conformance suite.

```bash
pnpm install
pnpm sync-secrets                              # pulls credentials from GitHub
cp apps/hub/.env.example apps/hub/.env.local   # paste the values from .secrets
pnpm dev                                       # http://localhost:5100
```

The defaults point at the **hosted** services, so signing in while developing
provisions a real actor in the shared registry. A local stack is only needed for
schema work — `apps/hub/.env.example` has the switch, and `pnpm test:db` uses a
local stack regardless (it begins with `supabase db reset`, which against the
linked live project would destroy it).

Checks, all of which also run in CI:

```bash
pnpm --filter hub test:coverage   # 100% on all four metrics, and it is a gate
pnpm --filter hub test:e2e        # Playwright against a real Chromium
pnpm --filter hub build           # catches what unit tests mock away
pnpm typecheck && pnpm lint && pnpm format:check && pnpm secretlint
pnpm check:docs && pnpm check:tools && pnpm check:contrast
```

Secrets never enter git. See [`.secrets.example`](.secrets.example),
[`apps/hub/.env.example`](apps/hub/.env.example) and
[`docs/git-with-gh-token.md`](docs/git-with-gh-token.md).

## Engineering principles

Five rules whose absence would misdescribe the system:

1. **Store `identity_sub`.** Never key app domain data to the IdP.
2. **`GET /api/actors/mine` is server-to-server.** It returns a complete actor
   list including private fursonas, so it carries no CORS header and never will.
3. **Verify what the picker returns** against your own mirror and your own
   signed-in user before acting on it.
4. **`@aeleos/identity` imports no framework and above all no Clerk.**
   `getToken` is a parameter, so the code never learns who issued the token —
   which is what keeps the escape hatch a one-column backfill. Enforced in
   `eslint.config.mjs`, not trusted.
5. **Tests, TSDoc and layer boundaries are contracts.** Coverage gates the
   build, `pnpm check:docs` fails when code moves and its documentation does
   not, and `eslint-plugin-boundaries` denies imports by default.

The migration inventory and the adoption walkthrough live in
[`docs/registry.md`](docs/registry.md); why each tool exists and what it caught
is in
[`docs/superpowers/specs/2026-08-15-toolchain-hardening-design.md`](docs/superpowers/specs/2026-08-15-toolchain-hardening-design.md).
Directory-level `CLAUDE.md` files constrain code that does not exist yet — if
you are about to touch the actors feature, read
[`apps/hub/src/features/actors/CLAUDE.md`](apps/hub/src/features/actors/CLAUDE.md)
first. It is authoritative for addressing and the block model, and newer than the
specs.

## Status

🌿 **The hub is live, the registry is authoritative, the studio ships, and the
public pages are readable by anybody.** The Clerk⇄Supabase trust is re-proven on
every pull request by the `idp-cloud` job rather than asserted — see
[`docs/phase-0-clerk-setup.md`](docs/phase-0-clerk-setup.md). Deployment is a
push to `main`; the details are in
[`docs/deployment.md`](docs/deployment.md).

What is deliberately not switched on, and what is somebody else's repository:

- **The picker's return-origin allowlist is empty in production**, so no handoff
  completes until a maintainer adds an origin.
- **Consuming-app migrations are work in Puck's and Libra's own repositories.**
  Libra is in production; never run anything against its database.
- **The Supabase project here is live, not a sandbox.** `supabase db push` and
  `db reset --linked` act on real data.

Merging is gated: same-repo pull requests turn on squash auto-merge when they
open and wait for the required checks — today `conformance`, `hub`, `idp-cloud`,
`e2e`, `schema-drift` and `canvas`, with branch protection `strict` and admins
not exempt. That list lives in repository settings rather than in the workflow
files, so read it rather than inferring it:

```bash
gh api repos/vaoan/AeleOS/branches/main/protection/required_status_checks --jq '.contexts'
```

## Documentation

| Read this                                                                              | For                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [Central auth design](docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md) | The architecture and the reasoning behind it    |
| [IdP decision change](docs/superpowers/specs/2026-07-31-idp-decision-change.md)        | Why Clerk, and what choosing it cost            |
| [Integrating an app](docs/integrating.md)                                              | The handoff contract, written for another repo  |
| [Actor registry](docs/registry.md)                                                     | Schema ownership, migrations, adopting the seam |
| [Phase 0 — Clerk setup](docs/phase-0-clerk-setup.md)                                   | How the trust was stood up and is verified      |
| [Deployment](docs/deployment.md)                                                       | How the hub reaches production                  |
| [Design journal](docs/design/README.md)                                                | The visual identity, and what it got wrong      |
| [Git with `GH_TOKEN`](docs/git-with-gh-token.md)                                       | Authenticating `git` and `gh` here              |
| [Toolchain hardening](docs/superpowers/specs/2026-08-15-toolchain-hardening-design.md) | Every linter, and the rule it cost              |

**Cost: $0.** Not "low" — zero. Clerk's free plan covers 50,000 monthly active
users, and a design that needs a paid tier is a design to reject.

MIT licensed, as declared in `package.json`.
