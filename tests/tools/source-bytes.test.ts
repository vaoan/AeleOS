import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";

/** The repository root. The tooling suite runs from it. */
const ROOT = process.cwd();

/** The extensions worth reading. Anything else may legitimately be binary. */
const TEXT = /\.(ts|tsx|js|mjs|cjs|css|json|sql|md|ya?ml)$/;

/**
 * Every text file that could reach a commit — tracked, plus untracked files
 * git would not ignore.
 *
 * **Asked of git rather than crawled, and that is a correctness choice before
 * it is a speed one.** The crawl this replaced carried its own list of eight
 * directory names to skip, which is `.gitignore` restated by hand and free to
 * drift from it. On the machine this was written it read 204 files git does not
 * list — `.claude/settings.local.json` and every `.superpowers/sdd/` brief and
 * report — none of which exists on a CI runner and none of which can reach
 * `main`. So the guard's file set was machine-dependent, and a third of the
 * bytes it read were nobody's source. Git's answer is the set that can be
 * committed, on every machine, with no list to maintain.
 *
 * `--others --exclude-standard` is what keeps a file written a moment ago and
 * not yet staged inside the guard: that is exactly when an editing tool's
 * mangled escape is still catchable.
 *
 * The existence filter is not defensive padding. `--cached` reports what the
 * INDEX holds, and a file deleted in the working tree whose deletion is not yet
 * staged is one of those: a path git still lists with no bytes on disk behind
 * it. Deleting this guard's own predecessor put the suite in exactly that
 * state, and it failed on ENOENT before it could read anything.
 *
 * @returns repository-relative paths that exist, slash-separated as git reports
 *   them.
 */
function textFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: ROOT, maxBuffer: 1 << 28 },
  )
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "" && TEXT.test(path) && existsSync(path));
}

/** Tab, newline, carriage return — the three a text file legitimately holds. */
const ALLOWED_CONTROL = new Set([9, 10, 13]);

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
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 && !ALLOWED_CONTROL.has(code)) return true;
  }
  return false;
}

describe("the repository's source bytes", () => {
  // **This is a regression test for a NUL byte that reached `main`.**
  //
  // `public-sections.tsx` carried `before:content-['—\00a0']` — an em dash and
  // a CSS-escaped non-breaking space. The `\00` was written as a literal NUL by
  // an editing tool that processed the escape, leaving `content: "—<NUL>a0"`.
  // Browsers substitute U+FFFD for a NUL in CSS, so every quote attribution on
  // a public page rendered a replacement glyph and the text `a0`.
  //
  // Nothing caught it, and nothing was ever going to. TypeScript is happy: a
  // JSX attribute is literal text and a NUL is a valid character in one.
  // Prettier reformats around it, ESLint parses it, and the rendered-output
  // tests assert on text content, which generated content is not part of. The
  // only visible symptom was `grep` calling the file binary — in the output of
  // an unrelated search, which is not a test.
  //
  // So the guard sits at the level the fault actually lived at: the bytes of
  // the file, across the whole repository rather than one app.
  //
  // **It lived in `apps/hub/tests/` until 2026-08-25 and that was the wrong
  // pool.** A whole-repository byte scan is a gate on the repository, not a
  // unit test of the hub, and running it there put several hundred cold reads
  // in a worker pool of 128 jsdom files all competing for the same disk. It
  // timed out once at 8618ms against the 5000ms default — on the first run
  // after a hard reset and an install, which is the one moment none of those
  // files is in the OS cache, and which is the condition every CI run starts
  // in. It reads 67ms alone and 265ms under three sustained load generators,
  // so the contention could not be reproduced on demand and the single
  // observation is the whole of the evidence.
  //
  // What was NOT done about it: raise the timeout. The number was never the
  // problem, and a budget widened until a flake stops showing is a check that
  // has quietly stopped meaning anything. It runs here instead — a node
  // environment, no jsdom, a suite of six files rather than 128 — over the set
  // git says is committable rather than everything on the disk, which is a
  // third fewer files and the same guarantee. `check:tools` runs in
  // `conformance`, so it is gated by a required check either way.
  it("contains no control characters", () => {
    const offenders = textFiles().filter((path) =>
      hasControl(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  // **A file git ignores is outside this guard, and that is a narrowing worth
  // asserting rather than describing.** The crawl this replaced would have read
  // it; git will not. The reasoning is that the guard exists to stop a mangled
  // byte reaching `main`, and an ignored file cannot reach it — but somebody
  // reading the case above could reasonably conclude the whole disk is policed,
  // so the hole is a passing case here instead of a sentence.
  //
  // The probe has to be WRITTEN rather than assumed. A checkout with no ignored
  // text file in it passes this either way, which would make it one of the
  // fixtures that cannot tell the two implementations apart.
  it("does not police a file git ignores", () => {
    mkdirSync("coverage", { recursive: true });
    const probe = "coverage/source-bytes-scope-probe.md";
    try {
      writeFileSync(probe, "probe", "utf8");
      expect(existsSync(probe)).toBe(true);
      expect(textFiles()).not.toContain(probe);
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
