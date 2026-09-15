/**
 * Fails when a paragraph of a snapshot under `docs/lessons/snapshots/` no
 * longer exists, verbatim, in any tracked Markdown file.
 *
 * It is the mechanical form of "nothing was lost" for the instruction
 * architecture move (`docs/superpowers/specs/2026-09-15-instruction-architecture-design.md`):
 * the pre-move root `CLAUDE.md` and the actors feature note are snapshotted,
 * the text is extracted into `docs/lessons/`, `docs/HISTORY.md` and the rule
 * files, and this gate proves that every paragraph made the trip.
 *
 * Whitespace-insensitive, because prettier rewraps prose; nothing else is
 * forgiven. A changed word is a changed paragraph.
 *
 * TEMPORARY. It is retired, with the snapshots and `extract-lessons.mjs`,
 * once the move is complete and reviewed — a permanent gate pinning old
 * text would forbid ever rewriting a lesson.
 *
 * Usage:
 *   node scripts/check-lessons-preserved.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Where the pre-move files are kept. */
export const SNAPSHOT_DIR = "docs/lessons/snapshots";

/**
 * A text's paragraphs, normalised for comparison.
 *
 * @param text - Markdown.
 * @returns each blank-line-separated block with list markers, indentation and
 *   wrapping removed and every whitespace run collapsed to one space. Blocks
 *   that are only whitespace are dropped.
 */
export function paragraphs(text) {
  return text
    .split(/\n[ \t]*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/^[ \t]*(?:[-*]|\d+\.)?[ \t]*/, ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((block) => block !== "");
}

/**
 * The snapshot paragraphs the corpus no longer holds.
 *
 * @param snapshot - the pre-move text.
 * @param corpus - every current Markdown file, concatenated.
 * @returns the missing paragraphs, normalised, in snapshot order.
 */
export function missingParagraphs(snapshot, corpus) {
  const haystack = paragraphs(corpus).join("\n");
  return paragraphs(snapshot).filter(
    (paragraph) => !haystack.includes(paragraph),
  );
}

/**
 * Every tracked or unignored Markdown file, concatenated.
 *
 * `git ls-files` rather than a crawl, for the reason root rule 32 records.
 *
 * @param cwd - the repository.
 * @param exclude - which paths to leave out (the snapshots themselves).
 * @returns the corpus.
 */
export function markdownCorpus(cwd, exclude) {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter((file) => file !== "" && !exclude(file))
    .map((file) => {
      try {
        return readFileSync(path.join(cwd, file), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n\n");
}

/** Runs the gate over the repository. */
function main() {
  const cwd = process.cwd();
  const snapshots = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      `${SNAPSHOT_DIR}/*.md`,
    ],
    { cwd, encoding: "utf8" },
  )
    .split("\n")
    .filter((file) => file !== "");
  const corpus = markdownCorpus(cwd, (file) =>
    file.startsWith(`${SNAPSHOT_DIR}/`),
  );
  let missing = 0;
  for (const snapshot of snapshots) {
    const lost = missingParagraphs(
      readFileSync(path.join(cwd, snapshot), "utf8"),
      corpus,
    );
    if (lost.length === 0) continue;
    missing += lost.length;
    console.error(
      `\n${snapshot}: ${lost.length} paragraph(s) no longer exist anywhere:`,
    );
    for (const paragraph of lost.slice(0, 5))
      console.error(`  ${paragraph.slice(0, 160)}…`);
    if (lost.length > 5) console.error(`  …and ${lost.length - 5} more`);
  }
  if (missing > 0) {
    console.error(
      "\nEvery paragraph of a snapshot must survive verbatim until this gate is retired.",
    );
    process.exit(1);
  }
  console.log(
    `check:lessons-preserved — every paragraph of ${snapshots.length} snapshot(s) still exists.`,
  );
}

if (process.argv[1]?.endsWith("check-lessons-preserved.mjs")) main();
