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

  // The real file must carry both markers, or the hook is silently empty.
  it("finds a non-empty block in the repository's own CLAUDE.md", () => {
    const block = invariantsFrom(readFileSync("CLAUDE.md", "utf8"));
    expect(block).toContain("identity_sub");
    expect(block.split("\n").length).toBeLessThan(40);
  });
});
