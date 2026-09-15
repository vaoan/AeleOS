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

/** A line that begins a new list item: a marker followed by whitespace. */
const LIST_ITEM_START = /^[ \t]*(?:[-*]|\d+\.)[ \t]+/;

/**
 * A text's paragraphs, normalised for comparison.
 *
 * A paragraph is a blank-line-separated block, OR — within such a block —
 * one list item: a run starting at a line matching `LIST_ITEM_START` and
 * continuing through every following line that does not itself start a new
 * item, so a wrapped continuation line stays with the item it belongs to.
 * The first line of a block always starts its first item, whether or not it
 * carries a marker, which is what keeps an un-bulleted block a single
 * paragraph.
 *
 * @param text - Markdown.
 * @returns each paragraph with list markers, indentation and wrapping
 *   removed and every whitespace run collapsed to one space. Paragraphs that
 *   are only whitespace are dropped. A marker (`- `, `* `, `12. `) is
 *   recognised only when whitespace follows it, so a line starting with a
 *   decimal (`0.006 …`) or a bold lead (`**Four.**`) is left alone and stays
 *   a continuation of the item it follows.
 */
export function paragraphs(text) {
  return text
    .split(/\n[ \t]*\n/)
    .flatMap((block) => {
      const items = [];
      for (const line of block.split("\n")) {
        if (items.length === 0 || LIST_ITEM_START.test(line)) {
          items.push(line);
        } else {
          items[items.length - 1] += `\n${line}`;
        }
      }
      return items;
    })
    .map((item) =>
      item
        .split("\n")
        .map((line) =>
          line.replace(/^[ \t]*(?:(?:[-*]|\d+\.)[ \t]+)?[ \t]*/, ""),
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((item) => item !== "");
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
