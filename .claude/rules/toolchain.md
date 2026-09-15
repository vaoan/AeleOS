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
