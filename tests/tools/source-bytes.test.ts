import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasControl, textFiles } from "../../scripts/check-source-bytes.mjs";

/** A control character, built from its code point so no escape can be mangled. */
const ctl = (code: number): string => String.fromCharCode(code);

describe("hasControl", () => {
  it("passes ordinary text", () => {
    expect(hasControl("const x = 1;")).toBe(false);
  });

  it("passes the empty string", () => {
    expect(hasControl("")).toBe(false);
  });

  it("allows tab, newline and carriage return", () => {
    expect(hasControl(ctl(9) + ctl(10) + ctl(13))).toBe(false);
  });

  // The byte that caused the original fault, and the one an editing tool
  // produces from a CSS escape.
  it("catches a NUL", () => {
    expect(hasControl("a" + ctl(0) + "b")).toBe(true);
  });

  // Every other control code, checked by enumeration rather than by a sample,
  // because the guard is a range test and a sample cannot tell a wrong bound
  // from a right one.
  it("catches every control code that is not one of the three", () => {
    const missed = [];
    for (let code = 0; code < 32; code += 1) {
      if (code === 9 || code === 10 || code === 13) continue;
      if (!hasControl(ctl(code))) missed.push(code);
    }
    expect(missed).toEqual([]);
  });

  it("leaves the first character above the control range alone", () => {
    expect(hasControl(ctl(32))).toBe(false);
  });
});

describe("textFiles", () => {
  /**
   * A throwaway repository holding one file of every kind the filter decides
   * about.
   *
   * **Built rather than borrowed.** Asking these questions of the real tree
   * makes the answers depend on what happens to be checked out, and the
   * ignored-file case in particular would pass against a crawl and against git
   * alike on a checkout that has no ignored text file in it — a fixture that
   * cannot tell the two apart.
   *
   * @returns the repository's path.
   */
  const buildRepo = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "aeleos-source-bytes-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir });

    git("init", "-q");
    writeFileSync(join(dir, ".gitignore"), "ignored/", "utf8");
    writeFileSync(join(dir, "tracked.ts"), "export const a = 1;", "utf8");
    writeFileSync(join(dir, "untracked.md"), "written a moment ago", "utf8");
    writeFileSync(join(dir, "picture.png"), "not text", "utf8");
    writeFileSync(join(dir, "staged-then-deleted.ts"), "gone", "utf8");
    mkdirSync(join(dir, "ignored"));
    writeFileSync(join(dir, "ignored", "note.md"), "cannot reach main", "utf8");

    git("add", "tracked.ts", "staged-then-deleted.ts");
    rmSync(join(dir, "staged-then-deleted.ts"));
    return dir;
  };

  /**
   * Runs a case against a fresh throwaway repository.
   *
   * @param assert - given the enumerated paths.
   */
  const inRepo = (assert: (paths: string[]) => void): void => {
    const dir = buildRepo();
    try {
      assert(textFiles(dir).sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("reports the tracked file and the untracked one together", () => {
    inRepo((paths) => {
      expect(paths).toEqual(["tracked.ts", "untracked.md"]);
    });
  });

  // The `--others` half. A file written a moment ago and not yet staged is
  // exactly when an editing tool's mangled escape is still catchable.
  it("reports a file that has never been staged", () => {
    inRepo((paths) => expect(paths).toContain("untracked.md"));
  });

  // The narrowing this gate accepts on purpose: an ignored file cannot reach
  // `main`, so it is not read. Asserted rather than described, because the
  // crawl this replaced would have read it.
  it("does not report a file git ignores", () => {
    inRepo((paths) => expect(paths).not.toContain("ignored/note.md"));
  });

  it("does not report a file whose extension is not text", () => {
    inRepo((paths) => expect(paths).not.toContain("picture.png"));
  });

  // `--cached` reports what the INDEX holds, so a deletion that is not yet
  // staged is a path git still lists with no bytes on disk behind it. Reading
  // it throws ENOENT before the gate can check anything.
  it("does not report a staged file whose working copy is gone", () => {
    inRepo((paths) => expect(paths).not.toContain("staged-then-deleted.ts"));
  });
});
