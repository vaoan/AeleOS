---
paths:
  - "**/HISTORY.md"
  - "docs/**"
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
- **What this file governs, and why `CLAUDE.md`, `AGENTS.md` and
  `.claude/rules/*.md` are not in the list above (2026-09-15, final fix
  wave).** `check-agent-notes.mjs` never treats a `CLAUDE.md`, an `AGENTS.md`
  or a `.claude/rules/*.md` file as governed by a note or by another rule — a
  rule file is never governed, and the note that governs a directory is
  never governed by another note — with one exception: a second note in a
  directory that already holds one (`apps/hub/CLAUDE.md`, the eleven-byte
  pointer beside `apps/hub/AGENTS.md`) is charged to the note that won. So
  `**/CLAUDE.md`, `**/AGENTS.md` and `.claude/rules/**` in this file's
  `paths:` could fire only on that one pointer; they were removed, and that
  narrowing is deliberate rather than a no-op. What this file
  governs is `**/HISTORY.md`, `docs/**` and `.claude/skills/**`; a skill edit
  owes this file (through `.claude/skills/**`) and, since a skill lives under
  no note of its own, the root `CLAUDE.md` as well.
- **A skill's `disable-model-invocation` frontmatter governs who may run it,
  not whether this note governs it.** `.claude/skills/**` is covered by the
  `paths:` list above, confirmed 2026-09-15 when the first four skills
  (`apply-migration-edit`, `picture-proof`, `sabotage-verify`,
  `reseed-pastiches`) were added and this file was the one `check:agent-notes`
  asked for; the reseed skill links the seeder lessons since the same day.
- **A `HISTORY.md` is documentation, not a note.** It matches `**/HISTORY.md`
  above, so an edit to one owes this file a re-read and nothing else; it
  carries no gate obligation of its own. Established 2026-09-15 when
  `apps/hub/src/features/actors/HISTORY.md` was created. **A gate-demanded
  re-read is answered by a sentence that carries information or by deleting
  stale text, never by a "re-read on <date>" note** — the root map and every
  rule file load into sessions, and a dated re-read line there costs every
  session and tells nobody anything.
- **2026-09-15:** `docs/lessons/snapshots/` was deleted along with the
  `check:lessons-preserved` gate and the `scripts/extract-lessons.mjs`
  extractor once the instruction-architecture move had been reviewed
  paragraph by paragraph in place. `check:tools` no longer runs it, and the
  spec, the root map and `docs/lessons/toolchain.md` describe it in the past
  tense — a retired gate named in the present tense is a live instruction to
  run something that does not exist.
- **A branch whose note prose predates a note split RE-HOMES it into the split; it never lands a second, parallel split (2026-09-16).** `drop-target-legibility` had split the actors note its own way while main shipped phase 6 of the instruction architecture. On merge its own split was dropped; its seven sections and the bar reversal were appended to `apps/hub/src/features/actors/HISTORY.md` with one rule line each, the root's delivered bullet went to `docs/HISTORY.md`, and the line-endings gate's account went to rule 28's own file. Two notes describing one feature in two shapes is the contradicting document this file forbids.
- **A spec's open question closes in place, with a dated bold marker appended to the bullet that asked it (2026-09-16).** The question and every earlier dated answer stay; the reader sees what was open, when, and what settled it, and a later reader can tell a question nobody revisited from one that was answered. First applied to the instruction-architecture spec's compaction-hook question when the owner's interactive `/compact` proved the `compact` matcher fires; the size half of that question is still open and the marker says so.
- **A second reversal on the same spec section is a second dated addendum after the first, never an edit of the first (2026-09-16).** `docs/superpowers/specs/2026-09-07-drop-target-legibility-design.md` §4 now reads C-over-A, then 09-13 (gaps became a bar), then 09-16 (`place` became its host's box), each dated in order so the reader sees what each decision knew; `docs/HISTORY.md`'s bullet gained the matching paragraph and the feature `HISTORY.md` the full account. A spec that rewrites its own history reads as if the second decision was the first.
