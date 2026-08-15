import { describe, expect, it } from "vitest";
import {
  CANVAS_RANGE,
  dial,
  dialsApply,
  many,
} from "@/shared/domain/canvas-motion";

describe("dial", () => {
  it("keeps a value that is already usable", () => {
    expect(dial(1.5)).toBe(1.5);
  });

  it("reads the string a computed style hands back", () => {
    expect(dial("2.25")).toBe(2.25);
  });

  // **Every one of these is an ordinary input, not a fault.** The value arrives
  // from a `jsonb` column and from a computed style, so an absent property, a
  // hand-edited row and a slider from an older build all land here — and a page
  // that refused to render for any of them would be worse than one that draws
  // its default.
  it.each([undefined, null, "", "wide", NaN, Infinity, {}, []])(
    "falls back to the default for %o",
    (value) => {
      expect(dial(value)).toBe(CANVAS_RANGE.default);
    },
  );

  // The floor is not zero on purpose: zero density is an empty canvas, which
  // `none` already says better and reversibly, and zero speed is a frozen one,
  // which `prefers-reduced-motion` already gives whoever asked for it.
  it("clamps rather than refusing", () => {
    expect(dial(-5)).toBe(CANVAS_RANGE.min);
    expect(dial(0)).toBe(CANVAS_RANGE.min);
    expect(dial(9000)).toBe(CANVAS_RANGE.max);
  });
});

describe("many", () => {
  it("scales the base count", () => {
    expect(many(100, 2)).toBe(200);
    expect(many(100, 0.5)).toBe(50);
  });

  // **The cap is not decoration.** The constellation compares every pair of
  // points, so its cost is the square of this number — at three times density
  // an uncapped field is nine times the work, on a canvas that has to hold
  // sixty frames a second on somebody's phone.
  it("never exceeds the cap it was given", () => {
    expect(many(200, 3, 220)).toBe(220);
  });

  // The default cap: no canvas but the constellation and the skyline has a
  // shape that needs one, so most calls pass two arguments and rely on it.
  it("is unbounded when no cap is given", () => {
    expect(many(1000, 3)).toBe(3000);
  });

  it("never draws nothing", () => {
    expect(many(1, 0.25)).toBe(1);
    expect(many(2, 0.25)).toBe(1);
  });
});

describe("dialsApply", () => {
  // Offering a density slider for a canvas that draws nothing is the
  // control-that-does-nothing this feature keeps being trimmed for.
  it("is false for the canvas that draws nothing", () => {
    expect(dialsApply("none")).toBe(false);
  });

  it.each(["nebula", "stars", "warp", "rain"])("is true for %s", (canvas) => {
    expect(dialsApply(canvas)).toBe(true);
  });

  // Matched against the table rather than with `in`, so an inherited key is not
  // read as the name of a canvas.
  it("is false for a name it does not know", () => {
    expect(dialsApply("toString")).toBe(false);
  });
});
