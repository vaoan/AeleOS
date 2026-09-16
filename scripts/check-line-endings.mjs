/**
 * Fails when a tracked text file would be committed with CRLF line endings.
 *
 * **`.gitattributes` already normalises on the way into the index, so this is
 * a backstop rather than the mechanism** — `* text=auto eol=lf` plus
 * `*.sql text eol=lf` is what actually keeps blobs LF, and it beats
 * `core.autocrlf`. What this gate defends is the case that slips past
 * normalisation: a path that acquires its own attribute, a file type added
 * later that nothing marks as text, or a checkout on a machine where those
 * attributes are not in force.
 *
 * **It exists because the obvious hand check is wrong in this repository's own
 * shell.** `grep -c $'\r' FILE` inside a command substitution reports the
 * file's LINE COUNT, not its carriage-return count: the `\r` is stripped
 * before `grep` sees it, leaving an empty pattern that matches every line.
 * Measured on a committed blob with zero `0d` bytes — `od` found none,
 * `grep -cU` with a real carriage return answered 0, and `grep -c $'\r'`
 * answered 332, which is exactly how many lines the file has. A check that
 * silently becomes a line counter is worse than no check, because it answers
 * confidently.
 *
 * `git ls-files --eol` is asked instead. Git is the authority on what is in
 * its own index, and it reports that directly rather than being inferred from
 * bytes a pipeline may have already converted.
 *
 * **`crlf` and `mixed` fail, and so does `-text` on a file the attributes
 * declare text.** A binary file reports `i/-text` and is not a finding on its
 * own; treating "anything that is not lf" as an offence would fail every PNG
 * in the repository. But `i/-text` beside `attr/text` is a contradiction: git
 * was told the file is text and still classed the blob as binary, which it
 * does for exactly one kind of text — a file whose line endings are lone
 * carriage returns. That is the state the first version of this gate waved
 * through on 2026-09-13: `prettier` under `endOfLine: "auto"` met one stray
 * `\r` inside a code span of `CLAUDE.md`, guessed the whole file was
 * CR-terminated, rewrote all 3,648 newlines as `\r`, and the blob went into
 * the index with no LF in it. `wc -l` said 0; this gate said clean, because a
 * lone-CR blob is `-text` to git and `-text` was excused without asking why.
 * Only an EXPLICIT `text` attribute counts — `text=auto` delegates the
 * decision to git's own detection, so `-text` under it is git's honest answer
 * about a real binary rather than a contradiction.
 *
 * The root `CLAUDE.md` records what CRLF in the index actually costs here:
 * `migra` compares function SOURCE, so a `\r` on every line of a migration
 * makes ten untouched functions report as schema drift at once, and the local
 * drift check agrees the database is fine because it builds both sides from
 * the same converted files. The failure surfaces only in CI, about files
 * nobody edited.
 *
 * Usage:
 *   node scripts/check-line-endings.mjs
 */
import { execFileSync } from "node:child_process";

/** Index line endings that must never reach a commit, whatever the file. */
const REFUSED = new Set(["crlf", "mixed"]);

/**
 * Whether git was told outright that a file is text.
 *
 * `text=auto` is not that: it asks git to decide from the bytes, so a `-text`
 * verdict under it is git's answer rather than a contradiction of ours.
 *
 * @param attr - the `attr/` column as `git ls-files --eol` prints it, e.g.
 *   `text eol=lf`, `text=auto eol=lf`, `-text`, or `` when nothing applies.
 * @returns true only for an explicit, unqualified `text` attribute.
 */
function declaredText(attr) {
  return attr.split(/\s+/).includes("text");
}

/**
 * What git reports about every tracked file's line endings.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns one entry per tracked file: `index` is git's own `i/` value — `lf`,
 *   `crlf`, `mixed`, `none` for a file with no line ending at all, or `-text`
 *   for a blob git classes as binary — and `attr` is the `attr/` column
 *   verbatim, empty when no attribute applies.
 * @throws whatever `git` throws when it is absent or the directory is not a
 *   repository. A gate that cannot enumerate must not report success.
 */
export function eolReport(cwd = process.cwd()) {
  const out = execFileSync("git", ["ls-files", "--eol"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const entries = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    // `i/lf    w/lf    attr/text eol=lf      	path/with spaces.ts`
    const index = /(?:^|\s)i\/(\S+)/.exec(line)?.[1];
    const attr = /(?:^|\s)attr\/([^\t]*)/.exec(line)?.[1]?.trim() ?? "";
    const path = line.split("\t").slice(1).join("\t").trim();
    if (!index || !path) continue;
    entries.push({ path, index, attr });
  }
  return entries;
}

/**
 * The entries a commit must not carry.
 *
 * @param entries - as {@link eolReport} answers them.
 * @returns those whose index copy is `crlf` or `mixed`, plus those git classes
 *   `-text` while an explicit `text` attribute says otherwise — a lone-CR
 *   file, in practice. In the order given.
 */
export function offenders(entries) {
  return entries.filter(
    (entry) =>
      REFUSED.has(entry.index) ||
      (entry.index === "-text" && declaredText(entry.attr)),
  );
}

/** Runs the gate, reporting every refused file before exiting non-zero. */
function main() {
  const entries = eolReport();
  const bad = offenders(entries);
  if (bad.length > 0) {
    console.error(
      `check:line-endings — ${bad.length} file(s) would be committed with the wrong line endings:`,
    );
    for (const entry of bad) {
      const why =
        entry.index === "-text"
          ? "-text (declared text, but git sees no LF — lone CR endings?)"
          : entry.index;
      console.error(`  ${why}\t${entry.path}`);
    }
    console.error(
      "\nThe index is what ships. Re-normalise with `git add --renormalize .`,",
    );
    console.error(
      "and check the file's own attributes if it keeps coming back.",
    );
    console.error(
      "A `-text` finding is not fixed by renormalising: git will not touch a blob",
    );
    console.error(
      "it classes as binary. Rewrite the file's line endings as LF and re-add it.",
    );
    process.exit(1);
  }
  console.log(
    `check:line-endings — every tracked text file is LF in the index (${entries.length} checked).`,
  );
}

if (process.argv[1]?.endsWith("check-line-endings.mjs")) main();
