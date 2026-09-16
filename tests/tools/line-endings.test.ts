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
  // autocrlf off, so whatever bytes are written are the bytes git stores —
  // otherwise normalisation would hide the very state this gate exists to
  // catch. The `.ts` files carry no attribute at all; only `*.md` is declared
  // text, which is what lets the lone-CR case below be told apart from a
  // binary git detected on its own.
  git("config", "core.autocrlf", "false");
  writeFileSync(join(dir, ".gitattributes"), "*.md text\n");
  writeFileSync(join(dir, "clean.ts"), "const a = 1;\nconst b = 2;\n");
  writeFileSync(join(dir, "crlf.ts"), "const a = 1;\r\nconst b = 2;\r\n");
  writeFileSync(join(dir, "mixed.ts"), "const a = 1;\r\nconst b = 2;\n");
  // Every newline a lone `\r` — the shape `prettier` under `endOfLine: "auto"`
  // produced from one stray CR on 2026-09-13. Git classes it binary.
  writeFileSync(join(dir, "cr-only.md"), "# Title\r\rline one\rline two\r");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return dir;
}

describe("eolReport", () => {
  it("reads git's own index verdict and attribute for every tracked file", () => {
    const dir = repoWithEndings();
    try {
      const byPath = new Map(eolReport(dir).map((e) => [e.path, e]));
      // The anti-vacuity half: a report that enumerated nothing would make
      // every negative assertion below pass for free.
      expect(byPath.size).toBe(5);
      expect(byPath.get("clean.ts")?.index).toBe("lf");
      expect(byPath.get("crlf.ts")?.index).toBe("crlf");
      expect(byPath.get("mixed.ts")?.index).toBe("mixed");
      // A lone-CR file is `-text` to git — the same word a PNG gets — and the
      // attribute column is the only thing that tells the two apart.
      expect(byPath.get("cr-only.md")?.index).toBe("-text");
      expect(byPath.get("cr-only.md")?.attr).toBe("text");
      expect(byPath.get("clean.ts")?.attr).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("offenders", () => {
  it("refuses crlf and mixed, and passes lf", () => {
    const bad = offenders([
      { path: "a.ts", index: "lf", attr: "text eol=lf" },
      { path: "b.ts", index: "crlf", attr: "text eol=lf" },
      { path: "c.ts", index: "mixed", attr: "text eol=lf" },
    ]);
    expect(bad.map((e) => e.path)).toEqual(["b.ts", "c.ts"]);
  });

  // A binary file reports `-text`. Treating "anything that is not lf" as an
  // offence would fail every PNG in the repository, so this case is what
  // separates the real rule from the tempting one — under a `binary`
  // attribute, under `text=auto` (git's own detection), and under none.
  it("does not refuse a binary file", () => {
    expect(
      offenders([
        { path: "logo.png", index: "-text", attr: "-text" },
        { path: "font.woff2", index: "-text", attr: "text=auto eol=lf" },
        { path: "blob.bin", index: "-text", attr: "" },
      ]),
    ).toEqual([]);
  });

  // The hole the first version of this gate had: a file declared `text` whose
  // every newline is a lone CR is `-text` to git, and "-text is a binary" let
  // it through. The `text=auto` case above is what this must NOT widen into.
  it("refuses -text on a file the attributes declare text", () => {
    const bad = offenders([
      { path: "CLAUDE.md", index: "-text", attr: "text eol=lf" },
      { path: "notes.md", index: "-text", attr: "text" },
    ]);
    expect(bad.map((e) => e.path)).toEqual(["CLAUDE.md", "notes.md"]);
  });

  it("answers nothing for an empty report", () => {
    expect(offenders([])).toEqual([]);
  });
});
