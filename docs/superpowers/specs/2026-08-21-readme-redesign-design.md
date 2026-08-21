# A README that introduces the product and maps the system

- **Date:** 2026-08-21
- **Status:** Approved for implementation planning
- **Scope:** Replace the root `README.md` and add one repository-owned hero asset.
- **Audience:** Community visitors, app integrators and contributors, weighted equally.

## Context

The root README has the right facts in the wrong shape. It is a strong internal
field guide: it explains the identity seam, the actor handoff, migration
ownership, security boundaries and the reasons behind the toolchain. It is a
weak repository landing page: the product appears late, three audiences share
one uninterrupted manual, and the document has grown beyond 400 lines.

The product also moved while the README stood still. It still describes
Supabase Storage uploads, four required CI jobs and a flat section editor.
AeleOS now hosts no files, branch protection requires six checks, and public
pages are built from a recursive tree of containers and leaves. The README also
calls AeleOS an identity provider before explaining that Clerk is the provider.
A skimmer can leave with the opposite of the intended architecture.

The redesign will preserve the current README's topics without preserving its
shape. Stable concepts remain in the README. Detailed contracts, inventories and
operational history move behind links to the documents that already own them.

## Goals

1. Explain what AeleOS is and what ships today before explaining how it is
   maintained.
2. Give community visitors, app integrators and contributors an obvious path
   through the repository.
3. Express the shipped visual identity without adding a product screenshot that
   ages with the editor.
4. Keep the trust boundaries and the sacred `identity_sub` rule prominent.
5. Replace duplicated reference material with links to its authoritative home.
6. Remove stale claims and make volatile facts harder to state incorrectly.

## Non-goals

- This does not change the application, schema, deployment or GitHub settings.
- This does not add a screenshot catalogue or a marketing site.
- This does not rewrite `docs/integrating.md`, `docs/registry.md`,
  `docs/deployment.md` or the feature notes.
- This does not claim that Puck or Libra has completed its migration.
- This does not present AeleOS as a custom identity provider.

## Opening narrative

The README opens as a restrained product landing page.

The hero is a static SVG at `.github/readme-hero.svg`, derived from the shipped
nebula palette: a deep violet field, rose dust, one bright star and the AeleOS
wordmark. It contains no screenshot, external font, user data or runtime
dependency. The image communicates the brand while remaining stable as the UI
changes.

The opening copy is:

> **Identity is the operating system.**
>
> The identity hub and actor registry for Furry Colombia.

The next sentence connects the user and architecture promises: one person can
carry one login and every fursona across the platform while each app keeps its
own database. It describes the intended platform seam without claiming every
app migration is complete.

A compact badge row links to the live hub, CI workflow, Node requirement and
MIT license. Three calls to action follow:

- **Open the hub** → `https://me.furrycolombia.com`
- **Integrate an app** → `docs/integrating.md`
- **Explore the architecture** → the central identity design and its Clerk
  decision update

The celestial naming story remains as a short aside. It supports the brand
without delaying the product definition.

## Information architecture

### What ships today

The first body section groups the current user-facing surface:

- Clerk-backed sign-in and first-visit person provisioning
- one authoritative registry for a person and the fursonas they own
- a block-based studio with nested containers, drag-and-drop, themes and
  bilingual content
- public person and fursona pages
- a bilingual hub with Spanish fallback
- an actor picker and server-only actor sync for consuming apps
- linked images and media; AeleOS hosts no files

These are concise capability statements, not an exhaustive inventory of every
container mode, leaf kind or style control.

### How it works

One Mermaid diagram shows the stable system:

1. Clerk establishes who the person is and supplies the shared session.
2. AeleOS runs the hub and authoritative actor registry.
3. Each consuming app trusts Clerk, keeps its own Supabase database and mirrors
   only the actors its signed-in user can access.

The diagram is followed by two short rules:

- `identity_sub` is the stable issuer seam; app-local data keeps local keys.
- An `actor_ref` returned through a query string is a suggestion, never
  authorization.

The endpoint contract and mirror shape remain in `docs/integrating.md`.

### What lives here

A compact repository map names the concern and the authoritative path:

| Concern                                  | Path                    |
| ---------------------------------------- | ----------------------- |
| Only deployable app                      | `apps/hub`              |
| Framework-free identity seam             | `packages/identity`     |
| Authoritative registry schema            | `supabase/migrations`   |
| Database and IdP conformance             | `tests/db`, `tests/idp` |
| Integration, operations, specs and plans | `docs`                  |

The section states that this repository configures Clerk rather than building
an IdP, and that per-app integration code belongs in each app's repository.

### Choose your path

Three short routes prevent the audiences from reading one another's manuals:

- A community visitor opens the live hub and public pages.
- An app developer starts with `docs/integrating.md`.
- A contributor follows the quickstart and then reads `CLAUDE.md` for enforced
  conventions.

### Run it locally

The quickstart states the verified prerequisites:

- Node.js 24 or newer
- the pnpm version pinned by `packageManager`
- GitHub CLI access for `pnpm sync-secrets`
- Docker only for local database conformance

The command block remains short:

```bash
pnpm install
pnpm sync-secrets
cp apps/hub/.env.example apps/hub/.env.local
pnpm dev
```

The surrounding text says that the default environment targets hosted services
and can provision real actors. Local schema tests require Docker and
`pnpm test:db`. Detailed secret handling links to `.secrets.example`,
`apps/hub/.env.example` and `docs/git-with-gh-token.md`.

### Engineering principles

The README keeps five rules whose absence would misdescribe the system:

1. Store `identity_sub`; never key app domain data directly to the IdP.
2. Call `/api/actors/mine` from a server; its lack of CORS is deliberate.
3. Verify picker returns against the consuming app's mirror and signed-in user.
4. Keep `@aeleos/identity` framework- and Clerk-free.
5. Treat tests, TSDoc and layer boundaries as enforced contracts.

The migration inventory, column-grant tutorial, sabotage history and complete
tool list move out of the README. Their links remain.

### Status and operational truth

The status section distinguishes shipped core from platform rollout:

- the hub, registry, studio, public pages and handoff surfaces are live
- Clerk-to-Supabase trust is re-proven in CI
- consuming-app migrations remain work in their own repositories
- the picker's production return-origin allowlist is empty until a maintainer
  adds an app
- the hosted Supabase project is live, not a sandbox
- same-repo PRs wait for the required checks and squash auto-merge

The current six checks may be named for orientation, but the GitHub API command
is the source of truth:

```bash
gh api repos/vaoan/AeleOS/branches/main/protection/required_status_checks \
  --jq '.contexts'
```

### Documentation index

The final navigation section links to:

- platform architecture and the Clerk decision
- app integration
- actor registry and migration ownership
- Phase 0 / trust verification
- deployment
- visual design journal
- Git and GitHub authentication
- toolchain rationale

The README ends with the MIT license, which is declared in `package.json`. There
is no `LICENSE` file in the repository, so the README states the license rather
than linking to one.

## Accuracy boundaries

When sources disagree, current code and the newest authoritative notes win:

- `CLAUDE.md` for current shipped state and CI rules
- `apps/hub/src/features/actors/CLAUDE.md` for public pages and block vocabulary
- `docs/integrating.md` for actor sync and picker contracts
- `docs/registry.md` and `supabase/migrations` for schema ownership
- package manifests for commands and prerequisites
- GitHub branch-protection API for required checks

The README will remove these stale claims:

- Supabase Storage uploads and their public-read caveat
- four required checks
- a flat section-based studio
- committed Clerk configuration exports
- the opening claim that this repository is the identity provider

## Verification

Before the README is considered complete:

1. Run Prettier, CSpell and secret scanning on the new Markdown and SVG.
2. Verify every relative link resolves to a tracked file.
3. Verify every command against the current package scripts.
4. Confirm the SVG renders as a standalone image and in GitHub-safe markup.
5. Confirm the Mermaid diagram parses on GitHub.
6. Search the README for the removed stale terms and claims.
7. Review the final document once as each audience:
   - a community visitor can identify the product and open it
   - an integrator can find the contract without reading contributor policy
   - a contributor can run the app and find the full standards

The unrelated untracked `apps/hub/.gitignore` is outside this change and remains
unstaged.
