---
paths:
  - "**/CLAUDE.md"
  - "**/AGENTS.md"
  - "**/HISTORY.md"
  - "docs/**"
  - ".claude/rules/**"
  - ".claude/skills/**"
---

# Notes and docs

Loaded when an instruction file, a doc under `docs/`, or a rule or skill file is read. Each line is the rule; the link is why.

- **A summary wrong in the safe-sounding direction is worse than one that is simply wrong, because it closes the question.** → `docs/lessons/rules/16-a-summary-wrong-in-the-safe-sounding-direction-is-worse-than.md`
- **`check:docs` catches a symbol whose CODE moved. It cannot catch one whose WORLD moved.** → `docs/lessons/rules/18-check-docs-catches-a-symbol-whose-code-moved-it-cannot-catch.md`
- **A guard credited in REASONING is harder to catch than one credited in a comment, because there is nothing to read.** → `docs/lessons/rules/19-a-guard-credited-in-reasoning-is-harder-to-catch-than-one.md`
- **A dormant guard names the conditions under which it wakes, and somebody has to READ them when that condition arrives.** → `docs/lessons/rules/21-a-dormant-guard-names-the-conditions-under-which-it-wakes.md`
- **A brief's premise can be wrong, and an implementation that says so is doing the job rather than refusing it.** → `docs/lessons/rules/24-a-brief-s-premise-can-be-wrong-and-an-implementation-that.md`
- **A premise about the DATA is dated the moment it is written, and `main` moves.** → `docs/lessons/rules/25-a-premise-about-the-data-is-dated-the-moment-it-is-written.md`
- **A comment describing what ANOTHER file does is a claim nothing checks, and it shipped two broken headline features on one branch.** → `docs/lessons/rules/30-a-comment-describing-what-another-file-does-is-a-claim.md`
- **Every export carries TSDoc, and it states the contract — not the types.** → `docs/lessons/conventions/every-export-carries-tsdoc-and-it-states-the-contract-not.md`
- **Change an implementation, move its documentation.** → `docs/lessons/conventions/change-an-implementation-move-its-documentation.md`
- **Constraints about an export live in its TSDoc** → `docs/lessons/conventions/constraints-about-an-export-live-in-its-tsdoc.md`
- **Specs & plans:** → `docs/lessons/conventions/specs-plans.md`
- **A skill's `disable-model-invocation` frontmatter governs who may run it, not
  whether this note governs it.** `.claude/skills/**` is covered by the
  `paths:` list above exactly as `.claude/rules/**` is, confirmed 2026-09-15
  when the first four skills (`apply-migration-edit`, `picture-proof`,
  `sabotage-verify`, `reseed-pastiches`) were added and this file was the one
  `check:agent-notes` asked for.
