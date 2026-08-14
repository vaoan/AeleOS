# Hub placement — `aeleos-hub` becomes `apps/hub` inside `aeleos`

- **Date:** 2026-08-10
- **Status:** Decided
- **Supersedes:** the separate-repo assumption in `CLAUDE.md` and in
  `2026-08-02-phase-1b-i-hub-foundation.md` / `-ii-fursonas-and-picker.md`

## What forced the change

Phase 0 pushed the canonical migrations to the hosted **AeleOS** Supabase
project (`vmmpssydbrtkgvrlkijh`) from this repo. Its
`supabase_migrations.schema_migrations` table now records eight migrations, all
applied from `aeleos`.

The hub uses that same project. Not by preference — by budget. The free plan
allows two active projects, `CandyShop` (Libra's production database) and
`AeleOS` hold both, and a third costs money, which is a hard stop.

So the separate-repo plan produces **two repositories issuing
`supabase db push` at one database**. `aeleos-hub` would carry copies of
`0001`–`0007` plus its own migrations, while `aeleos` owns the same history.
The drift is not hypothetical: the plan specifies copying `0001`–`0007`, and
`0008_idp_introspection.sql` already exists here. The copy is stale before the
repository exists.

Two sources of truth for one database is the defect. Everything below follows
from removing it.

## The decision

The hub is built as **`apps/hub` inside this repository**, a package in a pnpm
workspace. `aeleos-hub` is not created.

`aeleos` stops being non-deployable. The repository is still not itself
deployed — the application inside it is.

## Why this over the alternatives

**Separate repositories, as planned.** Rejected: two repos own one schema
history, and `aeleos` adding `0009` leaves the hub silently stale until someone
re-copies. It also means a second toolchain kept in parity forever. `CLAUDE.md`
sets the constraint this violates — _"Near-zero ops. Effectively one
maintainer."_

**Separate repositories, with `aeleos` as the only schema owner.** The hub holds
no `supabase/` directory at all; `aeleos` owns every migration. This solves
duplicate ownership but relocates the cost: every Phase 1b-ii feature adds a
`security definer` RPC _and_ the UI that calls it, so each becomes two pull
requests in two repositories with an ordering dependency. Ship the UI first and
it calls a function that does not exist.

**One repository.** Chosen. One migration history for one database, and
schema-plus-UI changes land in a single reviewable commit.

There is a second argument, and it is about what this project is for. AeleOS
exists to end configuration duplication across apps. A design whose first task
is `cp` of the most sacred files in the system argues against its own premise.

Portfolio shape was explicitly **not** a factor; the maintainer asked for this
to be decided on engineering grounds.

## Layout

```
Z:\Github\aeleos\
├── apps/
│   └── hub/                    the Next.js application
├── supabase/migrations/        the one schema — canonical and hub-local alike
├── docs/
├── scripts/
├── tests/idp/                  the Phase 0 trust suite
└── package.json                shared toolchain, workspace root
```

Two ownership rules carry the decision:

**The root owns the database.** `supabase/migrations/` stays at the root, not
inside `apps/hub/`. Phase 1b-ii's `security definer` RPCs land there as `0009`,
`0010`, … beside the canonical ones. One directory, one history, one
`supabase db push`.

Two kinds of ownership are easy to conflate here, so to be explicit: the
**schema** is owned by the repository root, not by the `apps/hub` package — the
application ships no migrations of its own. The **data** is a separate question,
and is unchanged from the Phase 1b-i plan: this project's `actors` table is the
platform's source of truth, and every consuming app holds a mirror of it.

**The root owns the toolchain.** ESLint, Prettier, secretlint, cspell, husky,
lint-staged and `check:tools` stay where they are and extend to `apps/hub/`.
`apps/hub/package.json` carries only what the application needs.

`pnpm-workspace.yaml` currently has no `packages:` key. It gains one:

```yaml
packages:
  - apps/*
```

## What does not change

The architecture is untouched. The actor model, RLS keyed to
`auth.jwt()->>'sub'`, the sacred `identity_sub`, the UUIDv5 namespace in `0002`,
and Supabase's trust of Clerk all stand exactly as designed and as validated in
Phase 0.

Per-app integration code still lives in each app's own repository. Puck, Libra
and Janus remain separate. This decision is about the hub only.

## Continuous integration

Three jobs, no path filtering.

| Job           | Runs on                            | Secrets                                                                 |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `conformance` | every pull request                 | none                                                                    |
| `hub`         | every pull request                 | `CLERK_PUBLISHABLE_KEY`, which is public by design                      |
| `idp-cloud`   | every pull request, same-repo only | `CLERK_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN`, new `SUPABASE_DB_PASSWORD` |

**No path filter.** Filtering would save roughly two minutes and introduces a
class of failure this project has already been bitten by — a filter that skips
the very changes it guards, while reporting success. Total runtime lands near
six minutes. Revisit only if it becomes genuinely obstructive.

**`idp-cloud` needs two changes before it can run per pull request.** The runner
currently uses a fixed identity, `phase0+cloud_test@example.com`, and its
`afterAll` deletes every row for that `identity_sub`. Two concurrent runs would
delete each other's rows mid-test. It needs a unique identity per run and must
delete that Clerk user afterwards. Workflow-level `concurrency` prevents overlap
on one branch but not across branches, so both are required.

**`idp-cloud` must be guarded to same-repository pull requests.** This
repository is public, and GitHub withholds secrets from fork pull requests, so
without a guard the job fails on any outside contribution — a required check
that can never pass.

**Required-check ordering.** Add each job, let it report green once, then mark it
required. A required check that has never reported blocks every pull request
while GitHub waits for a status that is not coming.

Mutating the hosted project from CI is intentional and safe: the Clerk instance
is a development instance and the AeleOS project is a test bed. Realistic data
is what they are for.

## Configuration that must change

Each of these is currently correct for a single-package repository and becomes
wrong under a workspace:

| File                | Change                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.ls-lint.yml`      | add an `apps/hub` entry; its comment still asserts AeleOS is not a monorepo                                     |
| `knip.json`         | `entry` and `project` name only `tests/`, `scripts/` and the root, so the hub's dependencies would be invisible |
| `.prettierignore`   | add `.next/`                                                                                                    |
| `.gitignore`        | add `.next/` and `next-env.d.ts`                                                                                |
| `cspell` glob       | `**/*.{ts,md,json}` omits `.tsx`, so hub components would go unchecked                                          |
| `madge`             | scoped to `tests scripts`; add the application                                                                  |
| `eslint.config.mjs` | needs Next.js rules scoped to `apps/hub`                                                                        |

Next.js App Router directories such as `[id]` and `(group)` are safe:
`.ls-lint.yml` declares no `.dir` rule, so directory names are unchecked.

## Deployment

`apps/hub` targets **Vercel Hobby**. It is free, requires no card, and has no
overage — limits pause the deployment rather than charging. Against a hard-stop
budget, that failure mode is correct: disruptive, never expensive.

Hobby is restricted to personal, non-commercial use. **AeleOS never generates
revenue** — no advertising, nothing for sale, no paid tier — so it sits inside
that restriction. Libra may eventually take money; where Libra is hosted is a
separate decision and is out of scope here.

The residual risk is that Vercel takes a broader view and treats identity for a
platform that includes a shop as commercial. The mitigation is the rule that
drove the IdP choice: **do not get trapped.** `apps/hub` carries no
Vercel-specific configuration beyond what Next.js generates, so moving to
Cloudflare — whose free tier permits commercial use, and where the DNS for
`furrycolombia.com` already lives — is a configuration change rather than a
rewrite.

A production Clerk instance and a hostname are prerequisites for deploying, and
both belong to Phase 3 rather than to this decision. Phase 1b-i stops at a
signed-in person running locally.

## Testing

Unchanged in kind. `pnpm test:db` runs the schema suite against the local stack;
`pnpm test:idp` and `pnpm test:idp:cloud` run the Phase 0 trust suite locally and
against the hosted project. The hub adds its own unit tests under `apps/hub`.

Playwright stays out of CI. It needs real Clerk credentials, and it follows the
rule the Phase 0 suite already established: **skip cleanly when credentials are
absent, never gate CI.**

## Documents this changes

- `CLAUDE.md` — lines 50–53 and 186 assert the hub is its own deployable
  repository. Both change. The rule that per-app integration code lives in each
  app's own repository stays.
- `2026-08-02-phase-1b-i-hub-foundation.md` — Task 1 collapses to adding
  `apps/hub` to the workspace. Task 3 Step 3, which copies the canonical
  migrations, is deleted. Task 3 Step 1's free-slot check is stale and is
  replaced by the resolved constraint.
- `2026-08-02-phase-1b-ii-fursonas-and-picker.md` — "hub-local migration" now
  means a numbered migration in the single `supabase/migrations/`.
