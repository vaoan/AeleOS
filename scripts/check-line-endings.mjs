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
 * **Only `crlf` and `mixed` fail.** A binary file reports `i/-text` and is not
 * a finding; treating "anything that is not lf" as an offence would fail every
 * PNG in the repository.
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

/** Index line endings that must never reach a commit. */
const REFUSED = new Set(["crlf", "mixed"]);

/**
 * What git reports about every tracked file's line endings.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns one entry per tracked file, its `index` being git's own `i/` value
 *   — `lf`, `crlf`, `mixed`, or `-text` for something git treats as binary.
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
    const path = line.split("\t").slice(1).join("\t").trim();
    if (!index || !path) continue;
    entries.push({ path, index });
  }
  return entries;
}

/**
 * The entries a commit must not carry.
 *
 * @param entries - as {@link eolReport} answers them.
 * @returns those whose index copy is `crlf` or `mixed`, in the order given.
 */
export function offenders(entries) {
  return entries.filter((entry) => REFUSED.has(entry.index));
}

/** Runs the gate, reporting every refused file before exiting non-zero. */
function main() {
  const entries = eolReport();
  const bad = offenders(entries);
  if (bad.length > 0) {
    console.error(
      `check:line-endings — ${bad.length} file(s) would be committed with CRLF:`,
    );
    for (const entry of bad) console.error(`  ${entry.index}\t${entry.path}`);
    console.error(
      "\nThe index is what ships. Re-normalise with `git add --renormalize .`,",
    );
    console.error(
      "and check the file's own attributes if it keeps coming back.",
    );
    process.exit(1);
  }
  console.log(
    `check:line-endings — every tracked text file is LF in the index (${entries.length} checked).`,
  );
}

if (process.argv[1]?.endsWith("check-line-endings.mjs")) main();
