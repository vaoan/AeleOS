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
(`scripts/hook-reinject-invariants.mjs`) re-injects this block after every
`/compact` (proved interactively 2026-09-16).

- **The user ID is sacred.** Every app stores `identity_sub` and never keys
  its own data to the IdP. Never weaken this.
- **Budget: $0.** A design that needs a paid tier or a card on file is wrong.
- **Never run anything against Libra's database.** It is in production. Each
  app has its own Supabase project; never cross credentials.
- **Branch from an explicit base**: `git checkout -b <name> origin/main`, and
  confirm with `git log --oneline origin/main..HEAD` before pushing. Lesson:
  `docs/lessons/conventions/always-branch-from-an-explicit-base-git-checkout-b-name.md`.
- **Do not commit unless asked.** Work on branches; open PRs when a plan
  licenses it. Every `git`/`gh` call uses the PAT in `.secrets` and identity
  from `gh api user`, set `--local` each session: `docs/git-with-gh-token.md`.
  Lesson: `docs/lessons/conventions/git.md`.
- **An edited migration is hand-applied to live LAST, immediately before
  merge, one PR at a time**, when `gh pr list --state open` shows nothing
  else. Procedure:
  `docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`
  Skill: `/apply-migration-edit`.
- **Picture proof on the PR is part of the work**, and the pictures are read
  back for what else is in the frame. Procedure:
  `docs/lessons/conventions/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`
  Skill: `/picture-proof`.
- **Every bug gets a regression test**, sabotage-verified against the
  original fault, at the level the bug lived. Procedure:
  `docs/lessons/conventions/every-bug-gets-a-regression-test-no-exceptions.md`;
  its two traps are rules 29 and 34. Skill: `/sabotage-verify`.
- **Zero tolerance for flakiness.** Diagnose the mechanism; never retry,
  widen a budget or skip.
- **One agent per working tree**, or a worktree each.
- **Secrets never in git.** `.secrets` and `.env*` are ignored; only
  `.secrets.example` is committed. Lesson:
  `docs/lessons/conventions/secrets-never-in-git.md`.

<!-- invariants:end -->

## Commands

Run everything from the repository root, never from `apps/hub`.

- `pnpm lint`, `pnpm typecheck`, `pnpm --filter hub test`, `pnpm test:tools`
- `pnpm check:tools` (the whole tooling gate), `pnpm check:docs`,
  `pnpm check:agent-notes`, `pnpm check:schema-drift`, `pnpm check:contrast`,
  `pnpm check:line-endings` (git's own `--eol` verdict on the index; a
  lone-CR file under a `text` attribute is refused, a real binary is not)
- `pnpm test:db` (resets the local Supabase stack from the migrations),
  `pnpm --filter hub test:e2e` (source `.secrets` first or half of it skips)
- `pnpm report:instructions` (what the instruction files cost per session;
  `sessions: 0` on a fresh clone, since the log is git-ignored)
- `pnpm check:docs` and `pnpm check:agent-notes` compare `origin/main...HEAD`,
  so on a branch with nothing committed they check nothing and pass. The
  pre-commit hook runs both with `--staged`; to see what it will say before
  committing, `git add` and pass `--staged` yourself.

## Where the rules live

- `.claude/rules/*.md` — one file per concern, loaded only when a matching
  file is read: `toolchain`, `testing`, `browser-proof`, `notes-and-docs`,
  `migrations`, `editor-and-blocks`, `pastiches`, `identity-package`,
  `editor-domain`, `editor-application`, `editor-presentation`.
- `.claude/skills/` — procedures, loaded only when invoked: `apply-migration-edit`,
  `picture-proof`, `sabotage-verify`, `reseed-pastiches`. `apply-migration-edit`,
  `picture-proof` and `reseed-pastiches` are user-invoked only
  (`disable-model-invocation`); Claude follows the Procedure link above and
  asks the owner to run the skill.
- `docs/lessons/rules/NN-*.md` — the 43 numbered rules in full, filenames cut
  at a word boundary. **A citation of "root rule N" anywhere in this
  repository means the file numbered N.**
- `docs/lessons/conventions/*.md` — the conventions in full.
- `docs/lessons/toolchain.md` — the toolchain's account and its rules in full.
- `docs/HISTORY.md` — the dated record of what shipped and what it cost.
- `apps/hub/src/features/actors/CLAUDE.md` — the addressing model and the
  block vocabulary; `HISTORY.md` beside it holds the feature's account, and
  `.claude/rules/editor-*.md` hold its rules by layer.
- `docs/superpowers/{specs,plans}/` — brainstorm → spec → plan → implement.

## Conventions in one line each

- Filenames are kebab-case (`docs/lessons/conventions/filenames.md`). Every
  export carries TSDoc stating the contract, not the types; `pnpm check:docs`
  fails when code moves and TSDoc does not.
- Every export is tested on its happy path and each failure mode; branch
  coverage gates it. Edge cases are owed at unit and browser level, and they
  are different questions at each.
- A directory `CLAUDE.md` constrains code that does not exist yet; TSDoc
  constrains what exists. `pnpm check:agent-notes` fails when a file changes
  under a note, or under a rule file's `paths:` globs, and the note or rule
  did not. Since 2026-09-15 it also fails when a rule's own `paths:` glob can
  never match a tracked file, or when its `paths:` key sits under frontmatter
  that does not start on line one — the vacuous passes a typo produces.
- Change an implementation, move its documentation. Whoever fixes a fault
  deletes the note saying it is open.
- Specs and plans follow `docs/superpowers/{specs,plans}/YYYY-MM-DD-*.md`.

## Current state, in one paragraph

Phases 1a, 0, 1b and the fursona studio are done; the hub is live and
bilingual; public pages, the block model, dragging, weighted places, the
page source dock, the canvas-first editor and drop-target legibility have
shipped (marks settled 2026-09-16: a bar for a gap, a host-filling mark for
a place). Drag-to-add from the palette tab shipped in nine tasks
(2026-09-05 → 06); the modal Add is retired and the palette is the only way
in. The dated account of each is in `docs/HISTORY.md`. What is still open
lives in each spec's own open-questions section, not in a list. The instruction-architecture move is delivered
(2026-09-15): the spec named at the top of this file carries the before and
after tables, this file is a map, the lessons live under `docs/lessons/`, and the actors feature's
account sits beside its note. Dragging on a page taller than the viewport is
proved for both drag origins (2026-09-17), and the mark a canvas move draws
follows the pointer across a block's midline now, which it did not before.

Claude's role throughout: build and test the hub here, specify exactly what
to configure in Clerk, and write the per-app integration code in the
respective app repositories.
