# Constraints about an export live in its TSDoc

- **Constraints about an export live in its TSDoc**, where they are enforced and
  freshness-checked. A `CLAUDE.md` beside the code is optional, for rules
  constraining code that does not exist yet. TSDoc constrains what exists; a
  directory note constrains what comes next.

  **A directory note is no longer unenforced (2026-08-27).**
  `pnpm check:agent-notes` fails when a file changed under a note and the note
  did not — the companion to `check:docs`, which is per exported symbol and so
  structurally blind to a note whose subject is a different file. It is generic:
  every `CLAUDE.md` and `AGENTS.md` governs its own directory, so a note written
  tomorrow is guarded on the day it lands, with nothing to register.

  Three rulings it is built on, each of which changes what it costs:

  - **Nearest note only, and a skipped note does not fall through.** A pointer
    (`apps/hub/CLAUDE.md` is the eleven bytes `@AGENTS.md`) and a wholly
    generated file (`apps/hub/AGENTS.md` is Next.js's own rules) govern nothing,
    and their subtree is then unguarded rather than handed up. Falling through
    would put every change under `apps/hub` on THIS file — 118KB of running
    record — and a gate that fires on a workflow tweak is one people satisfy
    with a blank line. So the run PRINTS what it skipped: the fix for an
    unguarded subtree is to write a real note in it, not to bend the rule.
  - **Both exemptions are mechanical, not a list.** A pointer is a file whose
    every non-blank line starts with `@`; a vendored file is one where stripping
    `BEGIN`/`END` blocks leaves nothing. Prose beside a generated block is
    prose. Rule 32's hand-maintained skip list is why neither is a list.
  - **No suppression flag**, matching `check:docs` and for its reason: a
    suppression flag becomes the thing everyone types. Restating something that
    still holds counts, and the failure message prints the three questions the
    actors note already asks rather than only naming a file.

  Gap 3 is closed too: `list` is a container mode that lays a stack with a
  hairline between its children and no gap, which is the shape every modern
  feed has and the one `stack` cannot be asked for. It is an arrangement and
  decides nothing about its children — a feed is `list` plus `chrome: "bare"`.

  The pastiche pages are rebuilt against real archived captures, and the one
  real thing that found was about USING an option rather than reasoning about
  one: a page-level typeface did not reach headings until it set the font
  TOKENS as well as the property. (The other, "an author cannot turn the
  backdrop off", was a false diagnosis twice over — see the findings, which now
  carry the correction rather than the claim.)

  It runs as a step in `conformance` beside `check:docs`, taking the base ref
  the same way, and in pre-commit as `--staged`. Both modes only see what is
  committed or staged — an edit sitting unstaged in the working tree is invisible
  to it, exactly as it is to its sibling.
