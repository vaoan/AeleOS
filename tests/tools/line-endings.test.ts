import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eolReport, offenders } from "../../scripts/check-line-endings.mjs";

// THE FIXTURE IS A REAL REPOSITORY, BUILT HERE, and that is the point rather
// than ceremony. This gate's whole claim is that git — not a byte scan — is
// the authority on what the index holds, because a shell pipeline can convert
// line endings before any byte check sees them. A hand-built stand-in for
// `git ls-files --eol` would be asserting the parser against my own idea of
// git's output, which is the thing most likely to be wrong.

/** A throwaway repository holding one file per case the gate decides about. */
function repoWithEndings(): string {
  const dir = mkdtempSync(join(tmpdir(), "eol-"));
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  };
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  // No `.gitattributes` and autocrlf off, so whatever bytes are written are
  // the bytes git stores — otherwise normalisation would hide the very state
  // this gate exists to catch.
  git("config", "core.autocrlf", "false");
  writeFileSync(join(dir, "clean.ts"), "const a = 1;\nconst b = 2;\n");
  writeFileSync(join(dir, "crlf.ts"), "const a = 1;\r\nconst b = 2;\r\n");
  writeFileSync(join(dir, "mixed.ts"), "const a = 1;\r\nconst b = 2;\n");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return dir;
}

describe("eolReport", () => {
  it("reads git's own index verdict for every tracked file", () => {
    const dir = repoWithEndings();
    try {
      const byPath = new Map(eolReport(dir).map((e) => [e.path, e.index]));
      // The anti-vacuity half: a report that enumerated nothing would make
      // every negative assertion below pass for free.
      expect(byPath.size).toBe(3);
      expect(byPath.get("clean.ts")).toBe("lf");
      expect(byPath.get("crlf.ts")).toBe("crlf");
      expect(byPath.get("mixed.ts")).toBe("mixed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("offenders", () => {
  it("refuses crlf and mixed, and passes lf", () => {
    const bad = offenders([
      { path: "a.ts", index: "lf" },
      { path: "b.ts", index: "crlf" },
      { path: "c.ts", index: "mixed" },
    ]);
    expect(bad.map((e) => e.path)).toEqual(["b.ts", "c.ts"]);
  });

  // A binary file reports `-text`. Treating "anything that is not lf" as an
  // offence would fail every PNG in the repository, so this case is what
  // separates the real rule from the tempting one.
  it("does not refuse a binary file", () => {
    expect(offenders([{ path: "logo.png", index: "-text" }])).toEqual([]);
  });

  it("answers nothing for an empty report", () => {
    expect(offenders([])).toEqual([]);
  });
});
