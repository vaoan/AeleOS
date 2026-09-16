// tests/tools/hook-reinject-invariants.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { invariantsFrom } from "../../scripts/hook-reinject-invariants.mjs";

describe("invariantsFrom", () => {
  it("returns exactly what sits between the markers", () => {
    const text =
      "before\n<!-- invariants:start -->\n## Invariants\n\n- one\n<!-- invariants:end -->\nafter\n";
    expect(invariantsFrom(text)).toBe("## Invariants\n\n- one");
  });

  // A hook that printed the whole file on a missing marker would re-inject
  // everything the architecture exists to keep out.
  it("returns nothing when a marker is missing", () => {
    expect(invariantsFrom("no markers here")).toBe("");
    expect(invariantsFrom("<!-- invariants:start -->\nopen only")).toBe("");
  });

  // `indexOf` already finds the first occurrence, so a doubled start marker
  // must not somehow prefer the second: the first pair wins.
  it("uses the first start marker when it appears twice", () => {
    const text =
      "<!-- invariants:start -->\nfirst\n<!-- invariants:start -->\nsecond\n<!-- invariants:end -->\n";
    expect(invariantsFrom(text)).toBe(
      "first\n<!-- invariants:start -->\nsecond",
    );
  });

  // The end marker sitting before the start marker is not a reversed block —
  // it is a file with no valid block at all, and must answer nothing rather
  // than a negative-length slice or a wrapped-around read.
  it("returns nothing when the end marker precedes the start marker", () => {
    const text =
      "<!-- invariants:end -->\nbetween\n<!-- invariants:start -->\n";
    expect(invariantsFrom(text)).toBe("");
  });

  // The real file must carry both markers, or the hook is silently empty.
  it("finds a non-empty block in the repository's own CLAUDE.md", () => {
    const block = invariantsFrom(readFileSync("CLAUDE.md", "utf8"));
    expect(block).toContain("identity_sub");
    // 40 is a BUDGET for the block re-sent after every compaction, not a
    // constant to bump when the block grows past it — raising it is a design
    // decision (open question in
    // docs/superpowers/specs/2026-09-15-instruction-architecture-design.md)
    // to record there, not a number to edit here to make a test pass.
    expect(block.split("\n").length).toBeLessThan(40);
  });
});
