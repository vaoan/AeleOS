import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEntry, logEntry } from "../../scripts/hook-log-instructions.mjs";

const payload = {
  session_id: "s-1",
  cwd: "/repo",
  hook_event_name: "InstructionsLoaded",
  reason: "nested_traversal",
  file_path: "/repo/apps/hub/src/features/actors/CLAUDE.md",
};

describe("logEntry", () => {
  it("records when, which session, why, which file and how big", () => {
    const entry = logEntry(
      payload,
      new Date("2026-09-15T10:00:00Z"),
      () => 26120,
    );
    expect(entry).toEqual({
      at: "2026-09-15T10:00:00.000Z",
      session: "s-1",
      reason: "nested_traversal",
      file: "/repo/apps/hub/src/features/actors/CLAUDE.md",
      bytes: 26120,
    });
  });

  // A file the hook cannot size must still be logged: the load happened.
  it("records a size of -1 when the file cannot be read", () => {
    const entry = logEntry(payload, new Date(0), () => {
      throw new Error("ENOENT");
    });
    expect(entry.bytes).toBe(-1);
  });
});

describe("appendEntry", () => {
  it("appends one JSON line per entry to the session's file", () => {
    const dir = mkdtempSync(join(tmpdir(), "instructions-log-"));
    try {
      const entry = logEntry(payload, new Date(0), () => 1);
      const file = appendEntry(dir, entry);
      appendEntry(dir, entry);
      expect(file).toBe(join(dir, "s-1.jsonl"));
      const lines = readFileSync(file, "utf8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0] ?? "")).toEqual(entry);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
