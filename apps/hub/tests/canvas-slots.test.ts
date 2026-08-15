import { describe, expect, it } from "vitest";
import {
  CANVAS_SLOTS,
  MAX_CANVAS_COLOURS,
  slotsFor,
} from "@/shared/domain/canvas-slots";
import { CANVASES } from "@/features/actors/domain/actor-theme";

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
