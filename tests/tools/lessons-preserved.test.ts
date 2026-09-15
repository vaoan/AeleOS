// tests/tools/lessons-preserved.test.ts
import { describe, expect, it } from "vitest";
import {
  missingParagraphs,
  paragraphs,
} from "../../scripts/check-lessons-preserved.mjs";

describe("paragraphs", () => {
  it("splits on blank lines and collapses wrapping", () => {
    expect(paragraphs("a b\nc\n\n  d   e\n")).toEqual(["a b c", "d e"]);
  });

  it("strips list markers and numbering so a bullet moved into prose still matches", () => {
    expect(paragraphs("- one two\n  three\n\n12. **Four.** five")).toEqual([
      "one two three",
      "**Four.** five",
    ]);
  });

  it("ignores blank-only blocks", () => {
    expect(paragraphs("\n\n   \n")).toEqual([]);
  });
});

describe("missingParagraphs", () => {
  const snapshot = "First lesson,\nwrapped here.\n\n- Second lesson.\n";

  it("answers nothing when every paragraph survives, however rewrapped", () => {
    const corpus =
      "# Elsewhere\n\nFirst lesson, wrapped\nhere.\n\nSecond\nlesson.\n";
    expect(missingParagraphs(snapshot, corpus)).toEqual([]);
  });

  // The discriminating half: a dropped paragraph is named, a rewrapped one is not.
  it("names a paragraph that was dropped", () => {
    expect(missingParagraphs(snapshot, "First lesson, wrapped here.")).toEqual([
      "Second lesson.",
    ]);
  });

  // A changed word is a changed paragraph; the gate is whitespace-insensitive only.
  it("names a paragraph whose words changed", () => {
    expect(
      missingParagraphs(
        snapshot,
        "First lesson, wrapped there.\n\nSecond lesson.",
      ),
    ).toEqual(["First lesson, wrapped here."]);
  });
});
