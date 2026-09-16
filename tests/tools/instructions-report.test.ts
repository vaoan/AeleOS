import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readLog,
  readLogReport,
  render,
  summarise,
} from "../../scripts/instructions-report.mjs";

const line = (
  session: string,
  reason: string,
  file: string,
  bytes: number,
) => ({
  at: "2026-09-15T00:00:00.000Z",
  session,
  reason,
  file,
  bytes,
});

describe("summarise", () => {
  it("answers zero for an empty log rather than dividing by nothing", () => {
    expect(summarise([])).toEqual({
      sessions: 0,
      tokensPerSession: 0,
      byReason: {},
      byFile: [],
    });
  });

  it("averages tokens per session and groups by reason and file", () => {
    const summary = summarise([
      line("a", "session_start", "/r/CLAUDE.md", 300),
      line("a", "nested_traversal", "/r/x/CLAUDE.md", 60),
      line("b", "session_start", "/r/CLAUDE.md", 300),
    ]);
    expect(summary.sessions).toBe(2);
    // (100 + 20 + 100) / 2, at three characters per token
    expect(summary.tokensPerSession).toBe(110);
    expect(summary.byReason).toEqual({
      session_start: 200,
      nested_traversal: 20,
    });
    expect(summary.byFile).toEqual([
      { file: "/r/CLAUDE.md", tokens: 200, sessions: 2 },
      { file: "/r/x/CLAUDE.md", tokens: 20, sessions: 1 },
    ]);
  });

  // A `-1` is "could not measure", not a credit.
  it("counts an unmeasured file as zero tokens", () => {
    const summary = summarise([line("a", "include", "/r/gone.md", -1)]);
    expect(summary.byFile).toEqual([
      { file: "/r/gone.md", tokens: 0, sessions: 1 },
    ]);
  });

  // Same token total: the secondary key breaks the tie, or the table's order
  // would depend on Map insertion order rather than on anything meaningful.
  it("breaks a tokens tie in byFile by file name ascending", () => {
    const summary = summarise([
      line("a", "session_start", "/r/z.md", 30),
      line("a", "session_start", "/r/a.md", 30),
    ]);
    expect(summary.byFile.map((row) => row.file)).toEqual([
      "/r/a.md",
      "/r/z.md",
    ]);
  });
});

describe("render", () => {
  it("prints sessions: 0 and empty tables for an empty log, never NaN", () => {
    const text = render(summarise([]));
    expect(
      text.startsWith("sessions: 0\ninstruction tokens per session: 0\n"),
    ).toBe(true);
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("skipped");
  });

  it("lays out the reason and file tables", () => {
    const text = render(
      summarise([line("a", "session_start", "/r/CLAUDE.md", 30)]),
    );
    expect(text).toContain("by reason:\n  10\tsession_start\n");
    expect(text).toContain(
      "by file (tokens, sessions):\n  10\t1\t/r/CLAUDE.md\n",
    );
  });

  // The footer is the one branch `main` alone could reach; a clean log must
  // not mention it, and a dirty one must say how dirty.
  it("adds the skipped footer only when something was skipped", () => {
    const summary = summarise([]);
    expect(render(summary, 0)).not.toContain("skipped malformed lines");
    expect(render(summary, 2)).toContain("\nskipped malformed lines: 2\n");
  });
});

describe("readLog / readLogReport", () => {
  const withTempDir = (run: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "instructions-report-"));
    try {
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("answers [] for a directory that does not exist", () => {
    withTempDir((dir) => {
      const missing = join(dir, "does-not-exist");
      expect(readLog(missing)).toEqual([]);
      expect(readLogReport(missing)).toEqual({ entries: [], skipped: 0 });
    });
  });

  it("answers [] for an empty directory", () => {
    withTempDir((dir) => {
      expect(readLog(dir)).toEqual([]);
    });
  });

  it("ignores a .txt file beside a .jsonl one", () => {
    withTempDir((dir) => {
      // Valid JSON on purpose: if the extension filter were dropped, this
      // line would silently become a second entry instead of being skipped
      // as unparsable, and the malformed-line test could not tell the two
      // failures apart.
      writeFileSync(
        join(dir, "notes.txt"),
        `${JSON.stringify(line("txt", "session_start", "/r/should-not-count.md", 999))}\n`,
      );
      writeFileSync(
        join(dir, "s-1.jsonl"),
        `${JSON.stringify(line("s-1", "session_start", "/r/CLAUDE.md", 30))}\n`,
      );
      expect(readLog(dir)).toEqual([
        line("s-1", "session_start", "/r/CLAUDE.md", 30),
      ]);
    });
  });

  it("skips a malformed line and counts it, while good lines survive", () => {
    withTempDir((dir) => {
      const good = line("s-1", "session_start", "/r/CLAUDE.md", 30);
      writeFileSync(
        join(dir, "s-1.jsonl"),
        `${JSON.stringify(good)}\nnot json at all\n`,
      );
      const report = readLogReport(dir);
      expect(report.entries).toEqual([good]);
      expect(report.skipped).toBe(1);
    });
  });

  // ENOTDIR, not ENOENT: the path exists, so this must not be read as "no log
  // yet" — that would hide a real misconfiguration behind a quiet zero.
  it("rethrows a non-ENOENT error, such as a file where the directory should be", () => {
    withTempDir((dir) => {
      const notADirectory = join(dir, "log-dir");
      writeFileSync(notADirectory, "i am a file");
      expect(() => readLog(notADirectory)).toThrow(
        expect.objectContaining({ code: "ENOTDIR" }),
      );
    });
  });
});
