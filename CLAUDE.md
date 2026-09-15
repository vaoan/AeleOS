# CLAUDE.md

Guidance for Claude Code in this repository. The rules here are short on
purpose: each links to the lesson that produced it, and the lessons are read
when they are relevant rather than on every turn. Design:
`docs/superpowers/specs/2026-09-15-instruction-architecture-design.md`.

## What AeleOS is

The central identity provider for the Furry Colombia platform: one person,
one login, across every app under `furrycolombia.com`. The identity provider
is Clerk, configured rather than built. This repository ships exactly one
app, the hub at `apps/hub`, plus the canonical actor-model schema in
`supabase/migrations/`, the handoff contract in `docs/integrating.md`, and
the shared package `packages/identity`. The long form, with every decision
and why: `docs/overview.md`.

<!-- invariants:start -->

## Invariants

These hold in every session and survive compaction; a `SessionStart` hook
re-injects this block after every `/compact`.

- **The user ID is sacred.** Every app stores `identity_sub` and never keys
  its own data to the IdP. Never weaken this.
- **Budget: $0.** A design that needs a paid tier or a card on file is wrong.
- **Never run anything against Libra's database.** It is in production. Each
  app has its own Supabase project; never cross credentials.
- **Branch from an explicit base**: `git checkout -b <name> origin/main`, and
  confirm with `git log --oneline origin/main..HEAD` before pushing.
- **Do not commit unless asked.** Work on branches; open PRs when a plan
  licenses it. Every `git`/`gh` call uses the PAT in `.secrets` and identity
  from `gh api user`, set `--local` each session: `docs/git-with-gh-token.md`.
- **An edited migration is hand-applied to live LAST, immediately before
  merge, one PR at a time**, when `gh pr list --state open` shows nothing
  else. Procedure:
  `docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`
  (a skill in phase 5).
- **Picture proof on the PR is part of the work**, and the pictures are read
  back for what else is in the frame. Procedure:
  `docs/lessons/conventions/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`
  (a skill in phase 5).
- **Every bug gets a regression test**, sabotage-verified against the
  original fault, at the level the bug lived. Procedure:
  `docs/lessons/rules/29-*.md` and `34-*.md` (a skill in phase 5).
- **Zero tolerance for flakiness.** Diagnose the mechanism; never retry,
  widen a budget or skip.
- **One agent per working tree**, or a worktree each.
- **Secrets never in git.** `.secrets` and `.env*` are ignored; only
  `.secrets.example` is committed.

<!-- invariants:end -->

## Commands

Run everything from the repository root, never from `apps/hub`.

- `pnpm lint`, `pnpm typecheck`, `pnpm --filter hub test`, `pnpm test:tools`
- `pnpm check:tools` (the whole tooling gate), `pnpm check:docs`,
  `pnpm check:agent-notes`, `pnpm check:schema-drift`, `pnpm check:contrast`,
  `pnpm check:lessons-preserved`
- `pnpm test:db` (resets the local Supabase stack from the migrations),
  `pnpm --filter hub test:e2e` (source `.secrets` first or half of it skips)
- `pnpm report:instructions` (what the instruction files cost per session)

## Where the rules live

- `.claude/rules/*.md` — one file per concern, loaded only when a matching
  file is read: `toolchain`, `testing`, `browser-proof`, `notes-and-docs`,
  `migrations`, `editor-and-blocks`, `pastiches`, `identity-package` (lands
  in phase 3 of the plan; nothing is in that folder yet).
- `.claude/skills/` — procedures: `apply-migration-edit`, `picture-proof`,
  `sabotage-verify`, `reseed-pastiches` (lands in phase 5; nothing is in
  that folder yet).
- `docs/lessons/rules/NN-*.md` — the 43 numbered rules in full. **A citation
  of "root rule N" anywhere in this repository means the file numbered N.**
- `docs/lessons/conventions/*.md` — the conventions in full.
- `docs/HISTORY.md` — the dated record of what shipped and what it cost.
- `apps/hub/src/features/actors/CLAUDE.md` — the addressing model and the
  feature's own account, still one file on `main`; phase 6 splits it.
- `docs/superpowers/{specs,plans}/` — brainstorm → spec → plan → implement.

## Conventions in one line each

- Filenames are kebab-case. Every export carries TSDoc stating the contract,
  not the types; `pnpm check:docs` fails when code moves and TSDoc does not.
- Every export is tested on its happy path and each failure mode; branch
  coverage gates it. Edge cases are owed at unit and browser level, and they
  are different questions at each.
- A directory `CLAUDE.md` constrains code that does not exist yet; TSDoc
  constrains what exists. `pnpm check:agent-notes` fails when a file changes
  under a note, or under a rule file's `paths`, and the note did not.
- Change an implementation, move its documentation. Whoever fixes a fault
  deletes the note saying it is open.
- Specs and plans follow `docs/superpowers/{specs,plans}/YYYY-MM-DD-*.md`.

## Current state, in one paragraph

Phases 1a, 0, 1b and the fursona studio are done; the hub is live and
bilingual; public pages, the block model, dragging, weighted places, the
page source dock, the canvas-first editor and drop-target legibility have
shipped. Drag-to-add from a palette tab is designed and partly built. The
dated account of each is in `docs/HISTORY.md`; the open work is at the end
of it.

Claude's role throughout: build and test the hub here, specify exactly what
to configure in Clerk, and write the per-app integration code in the
respective app repositories.
