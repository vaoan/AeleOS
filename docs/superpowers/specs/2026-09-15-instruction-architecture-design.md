# Where the rules should live — instruction architecture design

**Status: DELIVERED (2026-09-15).** The gate and the extractor were retired
in this PR once every snapshot paragraph had been reviewed in place. Plan:
`docs/superpowers/plans/2026-09-15-instruction-architecture.md`.

## The problem, measured

Claude Code warns when a single loaded memory file exceeds a threshold. The
threshold is not a fixed 150k: read out of the installed CLI (2.1.272), it is
five percent of the model's context window, converted at three characters per
token, floored at 40,000 characters. For the current model that computes to
150,000 characters per file. The file still loads in full; only a file over
4 MiB is skipped. So the warning says one file takes a large fixed slice of
every turn. Three files here cross it.

| file                            |   bytes | lines | tokens (÷3) | loads                           |
| ------------------------------- | ------: | ----: | ----------: | ------------------------------- |
| `CLAUDE.md` (root)              | 239,709 | 3,676 |      79,500 | every session, every turn       |
| `actors/presentation/CLAUDE.md` | 206,610 | 3,298 |      68,500 | first read under it, then stays |
| `actors/domain/CLAUDE.md`       |  99,246 | 1,547 |      32,900 | first read under it, then stays |
| `actors/application/CLAUDE.md`  |  30,945 |   472 |      10,300 | first read under it, then stays |
| `actors/CLAUDE.md`              |  26,120 |   474 |       8,700 | first read under it, then stays |

The root file was 8 KB on 2026-08-05 and 233 KB on 2026-09-09. Measured by
paragraph, 36 to 41 percent of it by bytes is dated incident narrative rather
than a standing rule. Anthropic's stated target is under 200 lines per file.

**These are claims about the day they were measured**, per root rule 25. The
sizes move with every merge; the mechanism below does not.

## How instruction files actually load

Measured in a live session on 2026-09-15, then confirmed against the docs:

- Root `CLAUDE.md`, every ancestor `CLAUDE.md` between the filesystem root and
  the working directory, and every `@import` load at launch. An import does
  not defer anything: it is concatenated at launch.
- A nested `CLAUDE.md` loads the first time a file under its directory is
  read, and every note on the path loads with it. One `Read` of a path under
  `actors/application/` injected the `apps/hub` pointer, the `AGENTS.md` it
  imports, `actors/CLAUDE.md` and `actors/application/CLAUDE.md`. The read did
  not have to succeed: a nonexistent path triggered it. Once loaded, a nested
  note stays for the session.
- A `.claude/rules/*.md` file with `paths:` frontmatter loads the same lazy
  way, on the first read matching its globs, and several may match one file.
  A rule file without `paths:` loads at launch like the root.
- A skill costs its `description` at launch (combined description and
  `when_to_use` capped at 1,536 characters) and its body only when invoked.
- **On compaction only the project-root `CLAUDE.md` and unscoped rules are
  re-injected.** Nested notes and path-scoped rules are summarised away and
  return only when a matching file is read again. Invoked skill bodies are
  re-attached capped at 5,000 tokens each and 25,000 in total.
- **Block-level HTML comments are stripped before injection**, so prose kept
  for maintainers in a `CLAUDE.md` costs no context at all.
- An `InstructionsLoaded` hook reports every load with its reason
  (`session_start`, `nested_traversal`, `path_glob_match`, `include`,
  `compact`), which is how the cost of any arrangement is measured rather than
  estimated.

What a turn carries here today, in instruction tokens at three characters per
token:

| working in                        | tokens per turn | of a 1M window |
| --------------------------------- | --------------: | -------------: |
| anywhere                          |          80,200 |           8.0% |
| `actors/application`              |          99,100 |           9.9% |
| `actors/domain`                   |         121,800 |          12.2% |
| `actors/presentation`             |         157,400 |          15.7% |
| a vertical actors task, all three |         268,600 |          26.9% |

## What the sources say

Three investigations on 2026-09-15: the official documentation, Anthropic's
own published guidance, and practitioners plus the empirical papers. Sources
are listed at the end.

### Where they agree

- **The always-loaded file is small.** Anthropic: under 200 lines. OpenAI's
  harness post kept a million-line codebase to a 100-line map. HumanLayer's
  own root is under 60 lines. Anthropic names the failure directly: "If your
  CLAUDE.md is too long, Claude ignores half of it because important rules get
  lost in the noise."
- **Progressive disclosure.** The root is a table of contents with pointers;
  detail lives in docs, path-scoped rules, skills and nested notes that load
  only when relevant. Thoughtworks' April 2026 Radar put "agent instruction
  bloat" on Hold and "progressive context disclosure" on Trial in the same
  volume.
- **Enforce mechanically, then stop describing it.** "An instruction is a
  request, not a guarantee. A hook that blocks the edit is enforcement." This
  repository already does the enforcement half well; the paragraphs restating
  each gate no longer earn a place in an always-loaded file.
- **Rationale in a sentence, incident in a linked record.** Anthropic's
  prompting guide says a short why helps Claude generalise, and warns that
  newer models over-trigger on heavy emphasis ("if you emphasize many lines,
  none of them stands out"). The closest published pattern to this repository
  keeps the root short and points each rule at a file holding the full story.
- **Stale beats absent for harm.** Every source repeats it; root rule 25
  already says it.
- **Ablate on a cadence.** Anthropic's advice for the Claude 5 generation is
  to periodically remove rules and see whether the model still stumbles; they
  removed over 80 percent of Claude Code's own system prompt with no measured
  loss on coding evaluations.

### Where the evidence is thin or split

- **Whether context files move correctness at all.** Two controlled studies
  (ETH, 138 tasks; a 288-run ablation) find no task-success gain and over 20
  percent more cost. The sharper finding is the useful one: agents follow
  INSTRUCTIONS well, and it is repository overviews and narration that add
  cost without measured benefit.
- **Instruction count versus adherence.** IFScale is the only controlled
  measurement: near-perfect through roughly 150 instructions for reasoning
  models, then decline, with omission the dominant error. Its unit is
  instructions, not tokens; 43 rules with paragraphs of narrative each are
  many hundreds of implicit instructions.
- **Position.** "Lost in the Middle" measured a fact in the middle of a long
  document performing worse than no document at all. Nobody has measured
  narrative length per rule specifically.
- **Layer versus feature notes.** No source addresses a clean-architecture
  split directly. The ruling below is derived from the loading mechanism.

## The architecture question

Nested loading saves context only when a task's reads stay inside one
subtree. A change to a block mode touches `domain/block-schema.ts`, an
application hook and `presentation/blocks.tsx`, so it loads all three layer
notes plus the feature note plus the root. **The layer split has no exclusion
power against the tasks this repository actually does.**

Clean architecture is the right shape for the code, because the dependency
rule points inward and `eslint-plugin-boundaries` enforces it. It is the wrong
shape for the notes, because a note's job is to load when its subject is
touched and stay quiet otherwise, and the subject of most lessons here is a
concern that cuts across layers: dragging, the page document, the theme,
migrations, the pastiche seeder.

The instrument for a concern is a path-scoped rule. A file such as
`.claude/rules/dragging.md` with
`paths: ["**/block-drops.ts", "**/block-moves.ts", "**/editable-block-frame.tsx", "tests/e2e/section-drag-reorder.spec.ts"]`
loads when any of those is read and never otherwise, several rules may match
one file, and the layer folders are untouched.

## The proposed shape

The rules stay. Their receipts move. Every tier below exists today in some
form; what changes is which content sits in which tier.

| tier             | loads            | holds                                                                                                                                                                                                                                                            |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hooks and gates  | always           | Already the strongest layer: `check:docs`, `check:agent-notes`, `check:line-endings`, boundaries, coverage. Add a `SessionStart` hook matched on `compact` re-injecting the invariants in under twenty lines, and the `InstructionsLoaded` hook for measurement. |
| root `CLAUDE.md` | every session    | Under 200 lines: what the project is, the invariants that must survive compaction, the command list, and an index of pointers to everything below.                                                                                                               |
| `.claude/rules/` | on matching read | One file per concern, under 100 lines each: imperative rules with a one-clause reason and a link. The 43 numbered rules become one line each, in the file their subject belongs to.                                                                              |
| skills           | on invocation    | Procedures: hand-applying a migration edit, picture proof through a gist, sabotage verification, re-seeding pastiches from `main`.                                                                                                                               |
| `docs/lessons/`  | on demand        | The incident narratives, moved verbatim and dated, one file per lesson, never imported. Every rule links to its lesson. The root's "Current state" log becomes its own `HISTORY.md`, as `presentation/HISTORY.md` already is.                                    |
| feature notes    | on matching read | `actors/CLAUDE.md` keeps the addressing model and product invariants in a few hundred lines. The three layer notes dissolve: standing rules to concern-scoped rule files, narratives to `HISTORY.md`. The folders stay.                                          |

The invariants for the root and the compaction hook, as a starting list and
not a ruling: the sacred `identity_sub`; the $0 budget; never Libra's
database; branch from `origin/main`; apply an edited migration last,
immediately before merge, one pull request at a time; no commit without being
asked; picture proof on the pull request; a regression test for every bug; the
git identity procedure.

## What the gates must learn

- **`check:agent-notes` is directory-keyed.** A rule file's `paths:` globs
  should become its governed set, so a change to a matched file still obliges
  whoever made it to re-read the rule that governs it. Without this the move
  silently un-guards everything that leaves a directory note.
- **A temporary gate, `check:lessons-preserved`** (retired 2026-09-15 in
  phase 7), asserted that every paragraph of the pre-move root file existed
  verbatim somewhere in the tree. It was the mechanical form of "nothing
  lost", written before the first move and watched go red on a deliberately
  dropped paragraph. It was retired once the move was complete and reviewed,
  because a permanent gate that pins old text would forbid ever rewriting a
  lesson.
- **`check:tools`' cspell glob already covers `**/*.md`**, so the lessons tree
  and the rule files are spell-checked on the day they land.

## What it costs and what it buys

| scenario                                   |                  today |                           proposed |
| ------------------------------------------ | ---------------------: | ---------------------------------: |
| tokens loaded at session start             |                 80,200 |                             ~8,000 |
| a vertical actors task, all layers touched |                268,600 |                            ~25,000 |
| rules that survive compaction              | all, by re-reading 80k | invariants by hook, rest by reload |
| lessons available when relevant            |            all, always |               all, by link or grep |

Proposed figures are estimates from the split by section. The
`InstructionsLoaded` hook is what turns them into measurements, and the
before-and-after comparison is the acceptance test for the whole design.

The honest cost is the one the research names: a lesson that is not in
context cannot be followed unless the agent is sent to it. The rule line and
its link are that sending. The rules in the root today are followed no better
than a link would be, because at this size the file is exactly the
over-specified note Anthropic describes, and the evidence is this branch:
rule 28 warned about counting the newlines of a prose file a script has
touched, in the file that then shipped as one line.

## Phases

Each phase is its own branch and pull request, in this order, and the root
file stays valid throughout because every step leaves a working pointer where
it took something away.

1. **Measure first.** Install the `InstructionsLoaded` hook and log a week of
   real tasks. That is the baseline the migration is judged against.
2. **Extract, do not rewrite.** Move each narrative into `docs/lessons/` byte
   for byte, leaving a one-line rule and a link behind. Write
   `check:lessons-preserved` first and sabotage it before trusting it (done;
   the gate was retired in phase 7 once the move was reviewed).
3. **Scope by concern.** Sort the one-liners into `.claude/rules/` files by
   the files they govern, and teach `check:agent-notes` to read `paths:`.
4. **Hook the invariants.** Twenty lines on `SessionStart` matched to
   `compact`, sabotage-verified by removing one line and watching a
   post-compaction probe fail to state it.
5. **Procedures into skills.** Four to start: migration apply, picture proof,
   sabotage verification, pastiche re-seed.
6. **Dissolve the layer notes.** The actors note keeps the model; its accounts
   move beside it into `HISTORY.md`; its rules become per-layer rule files.
7. **Ablate on a cadence.** After each phase, compare the hook log against the
   baseline. A rule that no longer fires is retired to the lessons tree with a
   date rather than deleted.

## Open questions

- **Whether the sister repositories follow.** Puck and Libra carry single
  root notes far under the threshold today. Orrery's ADR 0019 (2026-09-15)
  already records the agent-note size finding and leaves the threshold open;
  this design is the aeleos answer and should be reconciled there rather than
  duplicated.
- **The compaction hook's own size.** Twenty lines is a budget chosen from
  community practice, not a measurement; phase 4 should measure what a
  post-compaction turn actually retains with and without it. **2026-09-15:**
  the hook was proved headlessly, under a `startup` matcher rather than the
  interactive `/compact` (Ruling 17 in the plan's ledger); the `compact`
  matcher itself is registered but was never exercised headlessly, and the
  interactive check is the owner's to run.
- **Whether `docs/lessons/` or per-feature `HISTORY.md` is the home for a
  narrative that belongs to one feature.** The proposal says both exist; the
  rule of thumb is that a lesson about a mechanism goes beside the feature and
  a lesson about how we work goes in the tree.
- **2026-09-15, ablation:** none observed — no rule file loaded in every
  session despite `paths:` scoping. The root `CLAUDE.md` is the only file in
  all five, by design, and each `.claude/rules/editor-*.md` layer file loaded
  only for the sessions that read its layer. `.claude/rules/editor-and-blocks.md`
  (glob `apps/hub/src/**`) is the widest glob in use, a candidate should a
  later pass want to narrow one.
- **2026-09-15, final fix wave:** no `infrastructure` rule file was created.
  `.claude/rules/editor-and-blocks.md`'s `apps/hub/src/**` already governs
  that layer, and no section moved by phase 6 named an infrastructure file of
  its own; create one the day a section does.
- **2026-09-15, final fix wave:** two rule-file lines — `testing.md`'s hook
  test comment and `toolchain.md`'s hook-script line — link a script or test
  directly rather than a `docs/lessons/` file. Accepted as the pattern for a
  rule ABOUT a script rather than about how we work in general (Ruling R31).

## Baseline (measured)

Taken on 2026-09-15 on `main` at 35cdb3b, after phase 1 landed its hook:
five headless sessions in a fresh worktree, one reading nothing under a
nested note and four reading a file under `apps/hub/src/features/actors/`
(domain, application, presentation, and one vertical task across all three),
then `pnpm report:instructions`.

```
sessions: 5
instruction tokens per session: 196589
by reason:
  390470	session_start
  591572	nested_traversal
  904	include
by file (tokens, sessions):
  591556	4	apps/hub/src/features/actors/CLAUDE.md
  390470	5	CLAUDE.md
  904	4	apps/hub/AGENTS.md
  16	4	apps/hub/CLAUDE.md
```

Two shapes, not one average: a session that touches nothing under `actors/`
carries about 78,000 instruction tokens, and any session that reads a file
under `actors/` carries about 226,000. Every one of the four `actors/`
sessions ran on a 200k-window model and died with "Prompt is too long" after
the hook had logged the loads, so on `main` that model could not open a file
under the feature at all.

**The per-layer table above was measured on the unmerged branch
`drop-target-legibility`, where the actors note is split into a feature note
and three layer notes.** On `main` the feature note is one file of 443,665
bytes, which is what these numbers reflect. Phase 6 is briefed against
whatever `main` holds when it starts.

One more thing the measurement corrected: the CLI sends the load reason as
`load_reason`, where the hooks documentation says `reason`; the hook reads
both, and the first real session logged no reason at all until it did.

## After (measured)

Taken on 2026-09-15 on the phase 7 branch, cut from `main` at 3505314 (phase
6 merged), by the SAME method as the baseline: five headless sessions in a
fresh worktree — one reading nothing under a nested note, and four reading a
file under `apps/hub/src/features/actors/` (domain, application,
presentation, and one vertical task across all three) — then
`pnpm report:instructions`. The prompts were byte-identical to the
baseline's.

```
sessions: 5
instruction tokens per session: 17860
by reason:
  9920	session_start
  58508	nested_traversal
  904	include
  19966	path_glob_match
by file (tokens, sessions):
  58492	4	apps/hub/src/features/actors/CLAUDE.md
  10294	2	.claude/rules/editor-presentation.md
  9920	5	CLAUDE.md
  6234	2	.claude/rules/editor-domain.md
  2764	4	.claude/rules/editor-and-blocks.md
  904	4	apps/hub/AGENTS.md
  674	2	.claude/rules/editor-application.md
  16	4	apps/hub/CLAUDE.md
```

Ratio: 17,860 / 196,589 = 0.091 — tokens per session fell to about one
eleventh, well past the "at least halved" acceptance. The two shapes the
baseline named are now: a session touching nothing under `actors/` carries
about 2,000 instruction tokens (was ~78,000), and a session reading a file
under `actors/` carries about 20,000–24,000 (was ~226,000). All five ran on
the 200k-window model that could not open a file under the feature at all on
`main` before this plan.

Both tables were taken by the same method; the baseline sessions ran on
`main` at 35cdb3b and these on `main` at 3505314.

## Sources

- Claude Code docs: Memory, Context window (what survives compaction), Large
  codebases, Best practices, Extend Claude Code, Hooks, Skills — all under
  `https://code.claude.com/docs/en/`.
- Anthropic engineering: "Effective context engineering for AI agents"
  (2025-09-29); "Equipping agents for the real world with Agent Skills"
  (2025-10-16); the skill authoring best-practices page on
  `platform.claude.com`.
- Claude blog: "Steering Claude Code" (2026-06-18); "How Claude Code works in
  large codebases" (2026-05-14); "The new rules of context engineering for
  Claude 5 generation models" (2026-07-24).
- Boris Cherny on the Claude Code team's own `CLAUDE.md` practice
  (2026-01-02) and third-party notes from YC Startup School 2026.
- HumanLayer: "Writing a good CLAUDE.md" (2025-11-25); "Advanced Context
  Engineering for Coding Agents" (2025-08-29).
- OpenAI: "Harness engineering" (2026-02-11).
- Thoughtworks: "Context engineering for coding agents" (2026-02-05); Radar
  Vol. 34 (April 2026), "agent instruction bloat" and "progressive context
  disclosure".
- Addy Osmani, "Audit your agent files" (2026-08-27); Michel Faure, "4
  incidents, 4 rules" (2026-04-28); Simon Willison, "Setting up a codebase for
  coding agents" (2025-10-25).
- Papers: IFScale (arXiv 2507.11538); Lost in the Middle (arXiv 2307.03172);
  Context Rot (Chroma, 2025); LLMs Get Lost in Multi-Turn Conversation (arXiv
  2505.06120); Evaluating AGENTS.md (arXiv 2602.11988); a two-agent ablation
  (arXiv 2607.27250); Configuration smells in AGENTS.md (arXiv 2606.15828).
- Measured in this repository on 2026-09-15: file and section sizes, the
  per-folder load test, and the CLI's warning formula read out of the
  installed bundle.

The same report with live links is published at
`https://claude.ai/artifact/XRayNHR5E4mKQmHFg1Ffy6`.
