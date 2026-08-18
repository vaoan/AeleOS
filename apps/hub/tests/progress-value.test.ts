import { describe, expect, it } from "vitest";
import { progressValue } from "@/features/actors/domain/progress-value";

// A digit run long enough that `Number` overflows to `Infinity`. 400 is
// comfortably past the ~309 digits where that happens, and comfortably inside
// the 2000-character text cap — which is the point: this is reachable input,
// not a hypothetical.
const OVERFLOW = "9".repeat(400);

describe("progressValue", () => {
  it.each([
    ["a bare number", "60", 60],
    ["a percentage", "60%", 60],
    ["a fraction", "3/5", 60],
    ["a bare decimal", "2.5", 2.5],
    ["a decimal percentage", "7.5%", 7.5],
    ["a decimal fraction", "7.5/10", 75],
    ["zero", "0", 0],
    ["a whole", "5/5", 100],
  ])("reads %s", (_form, written, percent) => {
    expect(progressValue(written)).toBe(percent);
  });

  // Whitespace around the value and inside a fraction, because somebody typing
  // "3 / 5" meant the same thing.
  it.each(["  60%  ", "3 / 5", " 60 "])("trims %s", (written) => {
    expect(progressValue(written)).toBe(60);
  });

  // Clamped rather than refused: a bar cannot draw past its own edge, and
  // refusing would throw away a value whose meaning is perfectly clear.
  it.each([
    ["a percentage over 100", "150%"],
    ["a bare number over 100", "150"],
    ["a fraction over 1", "5/2"],
  ])("clamps %s to the top of the range", (_form, written) => {
    expect(progressValue(written)).toBe(100);
  });

  it.each([
    ["prose", "Almost there"],
    ["an empty string", ""],
    ["whitespace alone", "   "],
    // Not a supported form — every pattern requires a digit first, so a
    // leading `-` falls through all three rather than being read and clamped.
    ["a negative number", "-10"],
    ["a unit it does not know", "60 px"],
    ["a number with words after it", "60% done"],
    ["a number with words before it", "about 60%"],
    ["two fractions", "3/5/7"],
    ["a fraction with no denominator", "3/"],
    ["a trailing dot", "60."],
  ])("refuses %s", (_form, written) => {
    expect(progressValue(written)).toBeNull();
  });

  // A divide by zero would be `Infinity`, which is not a proportion.
  it("refuses a fraction with a zero denominator", () => {
    expect(progressValue("3/0")).toBeNull();
  });

  // The guard the renderer's whole refusal rests on. Both sides overflowing
  // gives `Infinity / Infinity`, which is `NaN` — neither side is zero, so the
  // check above does not catch it, and `NaN` is not `null`, so without this the
  // caller would go on to draw a bar from it.
  it("refuses a fraction whose numerator and denominator both overflow", () => {
    expect(progressValue(`${OVERFLOW}/${OVERFLOW}`)).toBeNull();
  });

  // The same check, for the same reason: `Infinity / 5` is `Infinity`, which
  // nobody could read as a proportion either.
  it("refuses a fraction whose numerator alone overflows", () => {
    expect(progressValue(`${OVERFLOW}/5`)).toBeNull();
  });

  // The one overflow that survives, and not as a special case: `5 / Infinity`
  // is a real, finite `0`, which is exactly what an unreadably large total
  // should draw.
  it("reads a fraction whose denominator alone overflows as zero", () => {
    expect(progressValue(`5/${OVERFLOW}`)).toBe(0);
  });

  // The patterns are compiled once at module load and reused across calls.
  // That is only safe because none carries `g` or `y`, which would make `exec`
  // resume from `lastIndex` and answer differently the second time — a fault
  // that shows up as an intermittently missing bar rather than as an error.
  it("answers the same on a second call with the same value", () => {
    expect(progressValue("60%")).toBe(progressValue("60%"));
    expect(progressValue("3/5")).toBe(progressValue("3/5"));
    expect(progressValue("60")).toBe(progressValue("60"));
  });
});
