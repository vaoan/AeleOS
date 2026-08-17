import { describe, expect, it } from "vitest";
import { renderScale } from "@/shared/domain/canvas-resolution";
import { CANVAS_SLOTS } from "@/shared/domain/canvas-slots";

describe("renderScale", () => {
  it("turns the soft canvases down, which is where the fill saving comes from", () => {
    expect(renderScale("nebula")).toBeLessThan(1);
    expect(renderScale("aurora")).toBeLessThan(1);
  });

  it("leaves anything with a visible edge at full resolution", () => {
    // A star is one or two pixels across and a glyph of rain has to stay
    // legible; halving the bitmap would blur both for a saving neither needs.
    expect(renderScale("stars")).toBe(1);
    expect(renderScale("rain")).toBe(1);
    expect(renderScale("constellation")).toBe(1);
  });

  it("gives an unknown canvas full resolution rather than a blurry one", () => {
    expect(renderScale("no-such-canvas")).toBe(1);
    // **This line is the bug's other half, kept deliberately.** It is the right
    // answer to the question this function asks — the empty string names no
    // canvas — and it was the WRONG answer for the caller, because the renderer
    // went on to draw the nebula for it. Nothing may hand a raw `--canvas`
    // value here any more; `resolveCanvas` decides the name first. See
    // `canvas-slots.test.ts`, which pins the two together.
    expect(renderScale("")).toBe(1);
  });

  it("does not answer for an inherited property", () => {
    // `SOFT_CANVASES["toString"]` is the inherited function, so a bare index
    // with a `??` fallback would report a truthy non-number here. This is the
    // trap the repository has documented in `slotsFor` and `dialsApply`.
    expect(renderScale("toString")).toBe(1);
    expect(renderScale("constructor")).toBe(1);
    expect(renderScale("__proto__")).toBe(1);
  });

  it("only ever names a canvas that exists", () => {
    // A fraction recorded against a misspelled name is a saving nobody gets
    // and nothing else would report — the renderer would simply draw at full
    // resolution for ever.
    for (const canvas of Object.keys(CANVAS_SLOTS)) {
      expect(renderScale(canvas)).toBeGreaterThan(0);
      expect(renderScale(canvas)).toBeLessThanOrEqual(1);
    }
  });

  it("never returns a fraction that would collapse the bitmap", () => {
    for (const canvas of Object.keys(CANVAS_SLOTS)) {
      // A bitmap at a tenth of a 320px phone is 32 pixels wide, which is a
      // different picture rather than the same one cheaper.
      expect(renderScale(canvas)).toBeGreaterThanOrEqual(0.25);
    }
  });
});
