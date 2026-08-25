/**
 * Fails when any file that could reach a commit carries a control character.
 *
 * **This is a gate on the repository, not a unit test**, and it is a plain
 * script for that reason rather than for tidiness. It reads several hundred
 * files, which is bulk IO, and bulk IO inside a test runner is a body being
 * timed against a budget meant for unit tests. Its predecessor lived in the
 * hub's suite, where 128 jsdom workers compete for one disk, and it timed out
 * once at 8618ms against vitest's 5000ms default on the first run after a hard
 * reset and an install: the one moment none of those files is in the OS cache,
 * and the condition every CI run starts in.
 *
 * Nothing here raises a timeout, and nothing warms a cache first. A warm-up
 * would move the cost outside the assertion rather than remove it, and "the
 * warm pass leaves the real pass fast enough" is a claim about wall-clock that
 * can only be settled by observing a cold run — the same unmeasured claim, in a
 * different place, for twice the IO. Running where no budget exists removes the
 * failure mode by construction instead, which is the one form of this that
 * needs no observation at all. `check-contrast`, `check-doc-freshness` and
 * `check-schema-drift` are the same shape.
 *
 * **It is a regression gate for a NUL byte that reached `main`.**
 * `public-sections.tsx` carried `before:content-['—\00a0']` — an em dash
 * and a CSS-escaped non-breaking space. The `\00` was written as a literal NUL
 * by an editing tool that processed the escape. Browsers substitute U+FFFD for
 * a NUL in CSS, so every quote attribution on a public page rendered a
 * replacement glyph and the text `a0`.
 *
 * Nothing caught it and nothing was ever going to. TypeScript is happy: a JSX
 * attribute is literal text and a NUL is a valid character in one. Prettier
 * reformats around it, ESLint parses it, and the rendered-output tests assert
 * on text content, which generated content is not part of. The only visible
 * symptom was `grep` calling the file binary, in the output of an unrelated
 * search, which is not a test.
 *
 * Usage:
 *   node scripts/check-source-bytes.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The extensions worth reading. Anything else may legitimately be binary. */
const TEXT = /\.(ts|tsx|js|mjs|cjs|css|json|sql|md|ya?ml)$/;

/** Tab, newline, carriage return — the three a text file legitimately holds. */
const ALLOWED_CONTROL = new Set([9, 10, 13]);

/**
 * Every text file that could reach a commit — tracked, plus untracked files
 * git would not ignore.
 *
 * **Asked of git rather than crawled, and that is a correctness choice before
 * it is a speed one.** The crawl this replaced carried its own list of eight
 * directory names to skip, which is `.gitignore` restated by hand and free to
 * drift from it. Measured, it read 204 files git does not list — the local
 * Claude settings and every `.superpowers/sdd/` brief and report — none of
 * which exists on a CI runner and none of which can reach `main`. So the file
 * set was machine-dependent, and a third of the bytes it read were nobody's
 * source.
 *
 * `--others --exclude-standard` is what keeps a file written a moment ago and
 * not yet staged inside the gate: that is exactly when an editing tool's
 * mangled escape is still catchable. A file git ignores is deliberately outside
 * it, because an ignored file cannot reach `main`.
 *
 * The existence filter is not defensive padding. `--cached` reports what the
 * INDEX holds, and a file deleted in the working tree whose deletion is not yet
 * staged is one of those: a path git still lists with no bytes on disk behind
 * it. It resolves against `cwd` and not the process, which is invisible while
 * the two agree and drops every path once they do not.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns repository-relative paths that exist, slash-separated as git reports
 *   them.
 * @throws whatever `git` throws when it is absent or the directory is not a
 *   repository. Loud is correct here: a gate that cannot enumerate must not
 *   report success.
 */
export function textFiles(cwd = process.cwd()) {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd, maxBuffer: 1 << 28 },
  )
    .toString("utf8")
    .split("\0")
    .filter(
      (path) => path !== "" && TEXT.test(path) && existsSync(join(cwd, path)),
    );
}

/**
 * Whether a file's text carries a control character.
 *
 * **Compared by code point rather than matched by an escaped character class**,
 * which is not a style choice: the first version of this guard was written as
 * `/[\x00-\x08…]/` and the editing tool turned every escape into the byte it
 * named, so the file that was supposed to ban control characters contained six
 * of them. A number cannot be mangled that way.
 *
 * The same trap caught the obvious speed fix, which is why it was not taken:
 * handing the class to `git grep -P` puts those escapes back into this file,
 * and the first attempt at it died on a literal NUL in its own argument list.
 *
 * @param text - a file's contents.
 * @returns true when it holds one.
 */
export function hasControl(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 && !ALLOWED_CONTROL.has(code)) return true;
  }
  return false;
}

/** Reads every candidate file and reports the ones carrying a control byte. */
function main() {
  const files = textFiles();
  const offenders = files.filter((path) =>
    hasControl(readFileSync(path, "utf8")),
  );

  if (offenders.length > 0) {
    console.error("Control characters found in:");
    for (const path of offenders) console.error(`  ${path}`);
    console.error(
      `\n${offenders.length} file(s) carry a byte no text file should.`,
    );
    process.exit(1);
  }
  console.log(`All ${files.length} committable text files are clean.`);
}

// Only runs as a CLI, so the tests can import the pure functions.
if (process.argv[1]?.endsWith("check-source-bytes.mjs")) main();
