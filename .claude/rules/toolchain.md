---
paths:
  - "eslint.config.mjs"
  - "package.json"
  - "cspell.json"
  - ".prettierrc.json"
  - ".ls-lint.yml"
  - "knip.json"
  - "stylelint.config.*"
  - "scripts/**/*.mjs"
  - "scripts/**/*.d.mts"
  - ".github/**"
  - ".husky/**"
---

# Toolchain

Loaded when a linter, formatter, spell-check or CI config file, or a script under `scripts/`, is read. Each line is the rule; the link is why.

- **A newly adopted tool must be shown to fail before it is believed.** → `docs/lessons/rules/01-a-newly-adopted-tool-must-be-shown-to-fail-before-it-is.md`
- **Never run an autofix over code a build tool parses rather than executes** → `docs/lessons/rules/02-never-run-an-autofix-over-code-a-build-tool-parses-rather.md`
- **Do not style a class the framework generated.** → `docs/lessons/rules/03-do-not-style-a-class-the-framework-generated.md`
- **Custom CSS belongs in a cascade layer.** → `docs/lessons/rules/04-custom-css-belongs-in-a-cascade-layer.md`
- **When a rule disagrees with the code, decide which is wrong and write the answer down.** → `docs/lessons/rules/05-when-a-rule-disagrees-with-the-code-decide-which-is-wrong.md`
- **Two tools fighting is a configuration bug.** → `docs/lessons/rules/06-two-tools-fighting-is-a-configuration-bug.md`
- **A migration's cost is not the diff.** → `docs/lessons/rules/08-a-migration-s-cost-is-not-the-diff.md`
- **`check:docs` is per symbol and not a formality.** → `docs/lessons/rules/09-check-docs-is-per-symbol-and-not-a-formality.md`
- **Anything that ships file CONTENT to a server, rather than committing it, is exposed to the checkout's line endings — and in this repo `.gitattributes` closed that door, which is why this rule no longer tells you to convert anything.** → `docs/lessons/rules/28-anything-that-ships-file-content-to-a-server-rather-than.md`
- **A test's cost is a property of the SUITE it lives in, and a flake there is fixed by moving it, never by widening its budget.** → `docs/lessons/rules/32-a-test-s-cost-is-a-property-of-the-suite-it-lives-in-and-a.md`
- **A CHECKER IS ONLY AS WIDE AS ITS GLOB, and the prose nobody checks is the prose in somebody else's language.** → `docs/lessons/rules/42-a-checker-is-only-as-wide-as-its-glob-and-the-prose-nobody.md`
- **A hook script Claude Code runs must never throw or exit non-zero — a broken hook must not break the session it serves.** → `scripts/hook-reinject-invariants.mjs`
- **2026-09-15:** the `check:lessons-preserved` gate, its `docs/lessons/snapshots/` fixtures and the one-shot `scripts/extract-lessons.mjs` were retired once the instruction-architecture move had been reviewed paragraph by paragraph in place. `check:tools` no longer runs it.
- **2026-09-15, final fix wave:** `check-agent-notes.mjs` gained `ruleGlobProblems`, so `check:agent-notes` now fails when a rule file's `paths:` frontmatter parses to zero globs or a glob matches no tracked file — a typo'd glob no longer passes silently. `ruleGlobs` also accepts a `paths:` list item at column 0, not only an indented one. `instructions-report.mjs`'s `readLog` returns `[]` for a missing log directory instead of throwing, skips a line that fails to parse as JSON, and the new `readLogReport` reports how many were skipped. `hook-log-instructions.mjs` sanitises `session_id` into a safe filename so a crafted id cannot write outside the log directory. `hasPathsKey` looks for the `paths:` key on ANY line, independently of the frontmatter parser: read with the same parser, a `paths:` under a `---` that is not on line one gave `[]` and `false` together — a rule that never fires and nobody is told — and is reported now.
- **Full account:** `docs/lessons/toolchain.md` is the toolchain's own narrative behind this file's one-liners, referenced from the root map's "Where the rules live".
- **2026-09-15, polish:** `instructions-report.mjs` lays its table out through an exported `render(summary, skipped)`, so `main()` only reads and prints and the skipped-lines footer is a pure function with its own cases; `trackedFiles` in `check-agent-notes.mjs` is tested on its own, including the throw outside a repository — a gate that cannot enumerate must never answer an empty list.
- **`pnpm check:line-endings` (in `check:tools`) refuses `crlf`, `mixed`, and `-text` on a path whose attributes declare `text` outright — a lone-CR file, which git classes as binary.** Under `text=auto` or no attribute, `-text` is git's own verdict on a real binary and stays excused. It reads `git ls-files --eol`, never bytes a pipeline may already have converted; the hand check it replaced silently counted lines instead. → `docs/lessons/rules/28-anything-that-ships-file-content-to-a-server-rather-than.md`
- **Prettier's `endOfLine` is `"lf"`, never `"auto"`.** `auto` guesses the whole file's ending from the FIRST carriage return it meets, and one stray CR inside a code span had it rewrite every newline of the root note as lone CR (2026-09-13); `.gitattributes` already mandates LF for the index. → `docs/lessons/rules/28-anything-that-ships-file-content-to-a-server-rather-than.md`
- **`eslint.config.mjs` and `.prettierignore` skip `.claude/worktrees/**` (2026-09-16).** A Claude Code worktree is a whole nested checkout under the repository root; `eslint .` from the main checkout linted one a second time and reported 128 `no-undef` errors in scripts that are clean in place, because the config's `files` globs anchor at the root and never match the nested copy. `.gitignore` already hid the directory from git; the crawlers had to be told separately.
