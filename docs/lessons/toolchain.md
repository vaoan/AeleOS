# The toolchain, and the rules it cost

Full account, with every measurement:
`docs/superpowers/specs/2026-08-15-toolchain-hardening-design.md`. Read it before
adding or disabling a linter. The short version, and the part that generalises:

**Everything the sister repos check, this repo now checks.** `stylelint`,
`eslint-plugin-boundaries`, `sherif`, `syncpack`,
`eslint-plugin-better-tailwindcss`, `eslint-plugin-sonarjs`,
`eslint-plugin-unicorn` — plus two the sisters do not have,
`@axe-core/playwright` and `fast-check`. AeleOS was the only one of the three
with **no CSS linting at all**, which is how `globals.css` grew a rule that beat
every Tailwind utility for months without anything noticing.

**Three findings were not style, and two of them were autofixes:**

- `unicorn/prefer-string-raw` rewrote the middleware `matcher` — the expression
  deciding which requests Clerk sees at all — into a `String.raw` template. Next
  reads that config **statically**, so the build failed naming no file. The rule
  is off.
- `stylelint --fix` deleted `-webkit-backdrop-filter` and left the standard
  property declared twice, three lines under a comment calling that line
  load-bearing. We have no autoprefixer, so a prefix in source is the only one
  that reaches a browser. `property-no-vendor-prefix` is off.
- The skin styled `[class~="border"]`, Tailwind's own generated class, from
  **outside every cascade layer** — where it beat every utility unconditionally.
  `@utility surface` replaced it across 74 class lists, and both hand-written
  `:not()` exclusions deleted themselves.

**Every instruction file Claude Code loads is now logged (2026-09-15).**
`scripts/hook-log-instructions.mjs` is registered as an `InstructionsLoaded`
hook in `.claude/settings.json` and appends one JSON line per loaded
instruction file to the git-ignored `.claude/instructions-log/<session>.jsonl`.
It never fails a load: a logging problem must not become a missing
instruction file. `pnpm report:instructions`
(`scripts/instructions-report.mjs`) turns that log into the numbers the plan
is judged by: instruction tokens per session, summarised by load reason and
by file, at three characters per token — the installed CLI's own factor for
this model. The installed CLI (2.1.272) actually sends the reason as
`load_reason` rather than the docs' `reason`, measured 2026-09-15 from a real
payload with no `reason` field at all; `logEntry` reads both spellings and
falls back to `"unknown"` when neither is present.

**A temporary gate proves nothing was lost while this file is split
(2026-09-15).** `pnpm check:lessons-preserved`
(`scripts/check-lessons-preserved.mjs`, run in `check:tools`) asserts that
every paragraph of each file under `docs/lessons/snapshots/` still exists
verbatim, whitespace-insensitively, somewhere in the tree — the
nothing-lost guard for the instruction-architecture move
(`docs/superpowers/plans/2026-09-15-instruction-architecture.md`). A list
marker (`- `, `* `, `12. `) is stripped only when whitespace follows it, so
a rewrapped decimal (`0.006 …`) or bold lead (`**Four.**`) starting a line
is left alone rather than mistaken for one. It is retired, with the
snapshots, once that move is complete and reviewed.

**The extraction itself is scripted, not hand-copied (2026-09-15).**
`scripts/extract-lessons.mjs` cuts this file's own sections into
`docs/overview.md`, `docs/HISTORY.md`, `docs/lessons/toolchain.md`,
`docs/lessons/rules/NN-*.md` and `docs/lessons/conventions/*.md`, verbatim.
It is one-shot and retired with the gate above once the move is reviewed.
The root itself is rewritten as a short map in the next task. Its two
throws — a missing boundary heading, an unterminated bold lead — are each
pinned by a sabotage-verified test case.

The numbered rules are one file each under `docs/lessons/rules/`.

**`@typescript-eslint/no-deprecated` is enabled, with no exceptions**, and it
is the only check that reads our DEPENDENCIES' deprecations rather than ours. It
found Clerk's warning that middleware path-matching "can leave protected
resources reachable", and next-intl's whole locale API.

Getting there cost a restructure worth knowing about. `next/root-params` only
exposes a segment belonging to the ROOT layout, so `[locale]/layout.tsx` owns
`<html>` now and `app/layout.tsx` is gone. **A language change therefore
REPLACES the document element** — proved with a marker attribute, not inferred —
so anything set imperatively on it is lost. `HtmlLang` puts back all three:
`lang`, `data-theme` recomputed from the same inputs the pre-paint script reads,
and `data-page-theme` from module memory, because `setPageTheme` persists
nothing by design.

This was refused once, on the argument that a layout effect is a weaker
guarantee than a script the browser cannot paint before. **That argument was
wrong and the way it was wrong is rule 10 below**: 184 frames were sampled across
a language change and none painted without the theme.

**A second finding is open.** `fast-check` refuted the claim that derived text
clears 4.5:1 wherever a colour could: on `#e21233` light text reaches 4.12 where
dark would reach 4.81, and none of the fifteen hand-picked backgrounds in
`palette.test.ts` is such a colour. Nothing asserts it, the reproduction is in
`palette-properties.test.ts`, and it is not a property to weaken until it
passes.

**CI gates on `main`:** six jobs are **required**, and a pull request cannot
merge until all six report green — `conformance` (schema suite), `hub` (hub and
`@aeleos/identity` unit tests, both at 100% coverage, plus the production build),
`idp-cloud` (real Clerk ⇄ Supabase trust), `e2e` (the Playwright suite against
a real Chromium — the only browser-level proof the signed-out app handoff works),
`schema-drift` (live database vs `supabase/migrations/`) and `canvas` (dial and
throttled-page cost). Branch protection is `strict`, so a branch must also be
up to date with `main` before it merges, and **admins are not exempt**: there is
no one who can push past a red check. Merges are **squash only** (merge commits
and rebases are off), history on `main` is linear, force-pushes and deleting
`main` are off, and unresolved review threads block merge. Same-repo PRs turn
**squash auto-merge on when they open** (`.github/workflows/auto-merge.yml`),
using `GH_TOKEN` so the merge is the PAT's user and still fires `deploy`.
Drafts wait until they are marked ready; fork PRs are left alone. The required-check
list still lives in repository settings, not in the workflow file — read it
from the API rather than inferring it from the YAML:

```bash
gh api repos/vaoan/AeleOS/branches/main/protection/required_status_checks --jq '.contexts'
```

Fork pull requests are the other catch. `e2e`, `idp-cloud`, `schema-drift` and
`canvas` all skip on forks because secrets are withheld there — on a fork they
cannot report green at all, so that route needs the owner.

`canvas` and `schema-drift` are on that required list (2026-08-20). `canvas`
measures every canvas at the top of both dials and then what a
personalised page costs on a throttled phone; both faults it guards against
shipped to `main` under a green tick. Its dial half was stood down while the
block model's first phases landed, because the fixture is built from mode and
kind pairs the flat editor of the day had no name for, so the route it measures
opened empty; the editor port restored it and both halves run. That guard's own
note is where rule 21 came from.

**The recursive inspector changed the dial fixture's CONTROL count, not its
page (2026-09-02).** Its shallow Options scope reduced the mounted document from
10,946 nodes to 1,808 while every preview leaf remained. The guard now counts
those leaves directly; a whole-DOM threshold was measuring the control tree the
feature deliberately removed. The scrolling half also takes three samples and
uses their median after one unchanged build read 80.8% once and 24.2% on the
job's automatic retry. The 80% ceiling is unchanged: one scheduling spike no
longer decides whether the page has sustained scroll cost.

`schema-drift` runs `pnpm check:schema-drift`, and it exists because of the
in-place-migration hazard above:
it compares `supabase/migrations/` against the **live** project, which is the
one thing no other check looks at. It carries the same fork `if:` guard as
`idp-cloud`, because it needs the database password.

It runs `supabase db diff` under each of the engines it needs, and **no pass is
ever skipped because an earlier one was clean** — that ordering is the design
rather than belt-and-braces. `migra` reads structure with no noise and is
**blind to `COMMENT ON`**, proven by perturbing a live column comment and
watching it report nothing, so a `pg-delta` pass counting only `COMMENT ON`
runs first. That pass is also what makes a green verdict honest: given a wrong
password the CLI's migra engine exits 0 and prints "No schema changes found",
byte-identical to a clean project, so a migra-only job would have gone
permanently green the moment the secret rotated. Where it goes red for
something other than drift, it is still working: a pull request that **adds** a
migration stays red until it is pushed to live, which is how this repo already
works, and a new table stays red until it grants `service_role`.

Claude's role throughout: build and test the hub here, specify exactly what to
configure in Clerk, and write the per-app integration code in the respective app
repos.
