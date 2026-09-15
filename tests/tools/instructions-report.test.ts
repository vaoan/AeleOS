import { describe, expect, it } from "vitest";
import { summarise } from "../../scripts/instructions-report.mjs";

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
});
