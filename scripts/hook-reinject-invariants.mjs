/**
 * `SessionStart` hook, matcher `compact`: prints the root `CLAUDE.md`'s
 * invariants block to stdout, which Claude Code adds to Claude's context
 * after every compaction (code.claude.com/docs/en/hooks-guide, "Re-inject
 * context after compaction").
 *
 * Only the project-root `CLAUDE.md` survives compaction on its own, and it
 * survives by being re-read whole; this hook is what lets the root stay a
 * map while the dozen rules that must hold for a whole session are restated
 * in under forty lines. The block is the one between
 * `<!-- invariants:start -->` and `<!-- invariants:end -->` — HTML comments
 * are stripped before injection, so the markers cost nothing.
 *
 * Prints nothing, and exits 0, when a marker is missing: an empty
 * re-injection is a gap, a whole-file one is the fault this architecture
 * exists to remove.
 *
 * Usage (registered in `.claude/settings.json`):
 *   node scripts/hook-reinject-invariants.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const START = "<!-- invariants:start -->";
const END = "<!-- invariants:end -->";

/**
 * The invariants block of a root note.
 *
 * @param text - the whole `CLAUDE.md`.
 * @returns the text strictly between the two markers, trimmed, or `""` when
 *   either marker is absent or they are out of order.
 */
export function invariantsFrom(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return "";
  return text.slice(start + START.length, end).trim();
}

/** Prints the block for the repository the hook runs in. */
function main() {
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  try {
    const block = invariantsFrom(
      readFileSync(path.join(root, "CLAUDE.md"), "utf8"),
    );
    if (block !== "") process.stdout.write(`${block}\n`);
  } catch {
    // A missing root note is somebody else's problem; a hook must not fail a session.
  }
}

if (process.argv[1]?.endsWith("hook-reinject-invariants.mjs")) main();
