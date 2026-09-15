import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appendEntry, logEntry } from "../../scripts/hook-log-instructions.mjs";

const payload = {
  session_id: "s-1",
  cwd: "/repo",
  hook_event_name: "InstructionsLoaded",
  load_reason: "nested_traversal",
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

  // The docs' spelling, read when the CLI's own `load_reason` is absent.
  it("reads the documented `reason` spelling when `load_reason` is absent", () => {
    const documented = {
      session_id: "s-1",
      cwd: "/repo",
      hook_event_name: "InstructionsLoaded",
      reason: "session_start",
      file_path: "/repo/apps/hub/src/features/actors/CLAUDE.md",
    };
    const entry = logEntry(documented, new Date(0), () => 1);
    expect(entry.reason).toBe("session_start");
  });

  // Neither spelling present: still logs, rather than writing `undefined`.
  it('records "unknown" when neither spelling is present', () => {
    const neither = {
      session_id: "s-1",
      cwd: "/repo",
      hook_event_name: "InstructionsLoaded",
      file_path: "/repo/apps/hub/src/features/actors/CLAUDE.md",
    };
    const entry = logEntry(neither, new Date(0), () => 1);
    expect(entry.reason).toBe("unknown");
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

  // A crafted session_id must never let the hook write outside its own log
  // directory.
  it("keeps a path-traversal session_id inside the log directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "instructions-log-"));
    try {
      const hostile = { ...payload, session_id: "../../../pwned" };
      const entry = logEntry(hostile, new Date(0), () => 1);
      const file = appendEntry(dir, entry);
      expect(resolve(file).startsWith(resolve(dir))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a missing log directory on first use", () => {
    const parent = mkdtempSync(join(tmpdir(), "instructions-log-"));
    const dir = join(parent, "nested", "log-dir");
    try {
      expect(existsSync(dir)).toBe(false);
      const entry = logEntry(payload, new Date(0), () => 1);
      const file = appendEntry(dir, entry);
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
