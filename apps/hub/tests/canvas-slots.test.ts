import { describe, expect, it } from "vitest";
import {
  CANVAS_SLOTS,
  DEFAULT_CANVAS,
  MAX_CANVAS_COLOURS,
  resolveCanvas,
  slotsFor,
} from "@/shared/domain/canvas-slots";
import { renderScale } from "@/shared/domain/canvas-resolution";
import { CANVASES, DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

describe("CANVAS_SLOTS", () => {
  // The editor renders this many pickers, so the table has to cover every
  // canvas somebody can choose — a missing entry silently offers none.
  it("has an entry for every canvas", () => {
    for (const canvas of CANVASES) {
      expect(CANVAS_SLOTS).toHaveProperty(canvas);
    }
  });

  it("gives the still canvas nothing to colour", () => {
    expect(CANVAS_SLOTS.none).toBe(0);
  });

  it("gives every canvas that draws at least two colours", () => {
    // Collected and asserted once rather than asserted inside the filter. An
    // `expect` under an `if` runs only when the branch does, so if the filter
    // ever matched nothing this would pass while checking nothing — which is
    // the one way a test can be worse than absent.
    const drawing = Object.entries(CANVAS_SLOTS).filter(
      ([canvas]) => canvas !== "none",
    );
    expect(drawing.length).toBeGreaterThan(0);
    expect(drawing.filter(([, slots]) => slots < 2)).toEqual([]);
  });

  // Derived rather than written down, so it cannot fall behind the table.
  it("caps at the greediest canvas", () => {
    expect(MAX_CANVAS_COLOURS).toBe(Math.max(...Object.values(CANVAS_SLOTS)));
  });
});

describe("slotsFor", () => {
  it.each(Object.entries(CANVAS_SLOTS))("reads %s as %i", (canvas, slots) => {
    expect(slotsFor(canvas)).toBe(slots);
  });

  // A name the table does not know takes none, matching the renderer — which
  // falls through to the nebula but must not offer pickers for a canvas nobody
  // can select.
  it.each(["not-a-canvas", "", "toString", "constructor"])(
    "gives the unknown canvas %o nothing",
    (canvas) => {
      expect(slotsFor(canvas)).toBe(0);
    },
  );
});

describe("resolveCanvas", () => {
  it.each(Object.keys(CANVAS_SLOTS))("leaves %s alone", (canvas) => {
    expect(resolveCanvas(canvas)).toBe(canvas);
  });

  // An unset `--canvas` is what nearly every page in the app serves, because
  // `themeVars` emits the property only for a canvas other than the default.
  it("reads an unset property as the default canvas", () => {
    expect(resolveCanvas("")).toBe(DEFAULT_CANVAS);
  });

  it("reads a canvas that no longer exists as the default one", () => {
    expect(resolveCanvas("no-such-canvas")).toBe(DEFAULT_CANVAS);
  });

  it.each(["toString", "constructor", "__proto__"])(
    "does not answer %o with an inherited property",
    (canvas) => {
      expect(resolveCanvas(canvas)).toBe(DEFAULT_CANVAS);
    },
  );
});

describe("the default canvas and its named equivalent", () => {
  // **The fault this pair exists for.** `renderScale("")` answered 1 where
  // `renderScale("nebula")` answered 0.5, so the canvas nearly every page
  // serves was drawn at four times the pixels it was designed for. Naming the
  // default and resolving to it in one place is what makes the two agree; this
  // asserts they still do.
  it("costs the same whether it is named or left unset", () => {
    expect(renderScale(resolveCanvas(""))).toBe(
      renderScale(resolveCanvas(DEFAULT_CANVAS)),
    );
    expect(renderScale(resolveCanvas(""))).toBeLessThan(1);
  });

  // The theme's default and the renderer's fallback are one constant, so a
  // page that keeps the default and a page that names it are the same page.
  it("is the canvas a theme starts on", () => {
    expect(DEFAULT_THEME.canvas).toBe(DEFAULT_CANVAS);
  });
});
