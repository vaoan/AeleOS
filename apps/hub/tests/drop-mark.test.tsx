import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DropMark } from "@/features/actors/presentation/drop-mark";

/** Whole class tokens, so a substring match cannot pass for the wrong one. */
function tokens(element: Element): string[] {
  return element.className.split(/\s+/);
}

describe("DropMark", () => {
  it("draws a slot above for a before target", () => {
    render(<DropMark kind="before" height={120} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveStyle({ height: "120px" });
    const classes = tokens(mark);
    expect(classes).toContain("top-0");
    expect(classes).toContain("-translate-y-1/2");
    expect(classes).not.toContain("inset-0");
    expect(classes).not.toContain("bottom-0");
  });

  it("draws a slot below for an after target", () => {
    render(<DropMark kind="after" height={120} />);
    const mark = screen.getByTestId("canvas-drop-after");
    expect(mark).toBeInTheDocument();
    const classes = tokens(mark);
    expect(classes).toContain("bottom-0");
    expect(classes).toContain("translate-y-1/2");
    expect(classes).not.toContain("inset-0");
    expect(classes).not.toContain("top-0");
  });

  it("fills the place itself for a place target", () => {
    render(<DropMark kind="place" height={null} />);
    const mark = screen.getByTestId("canvas-drop-place");
    expect(mark).toBeInTheDocument();
    const classes = tokens(mark);
    expect(classes).toContain("inset-0");
    expect(classes).not.toContain("top-0");
    expect(classes).not.toContain("bottom-0");
    expect(classes).not.toContain("-translate-y-1/2");
    expect(classes).not.toContain("translate-y-1/2");
  });

  // A palette drag carries a block that does not exist yet, so no height can
  // be measured for it. The slot must still be visible.
  it("stands at its own minimum when no height is known", () => {
    render(<DropMark kind="before" height={null} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark.className).toContain("min-h-12");
    expect(mark).not.toHaveStyle({ height: "0px" });
    // `min-h-12` and an unset inline height are not enough on their own to
    // rule out the element being hidden a different way (display: none,
    // visibility: hidden, zero opacity) — this is the assertion that would
    // catch that.
    expect(mark).toBeVisible();
  });

  // A canvas-move drag DOES measure a real height — `carriedHeightRef`, read
  // at `onDragStart` from the block being lifted — and a block shorter than
  // 48px must draw a ghost the size it will actually occupy, not a floor
  // that overstates it. Final review, 2026-09-11: `min-h-12` used to apply
  // unconditionally, so this case would have failed before the fix.
  it("does not apply its own floor when a real height is supplied", () => {
    render(<DropMark kind="place" height={20} />);
    const mark = screen.getByTestId("canvas-drop-place");
    expect(mark.className).not.toContain("min-h-12");
    expect(mark).toHaveStyle({ height: "20px" });
  });

  // The whole reason this is an overlay rather than a real opening gap: it
  // must not take part in layout, or every cached droppable rect goes stale
  // mid-drag.
  it("never takes part in layout or swallows the pointer", () => {
    render(<DropMark kind="before" height={80} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark.className).toContain("absolute");
    expect(mark.className).toContain("pointer-events-none");
  });

  it("wears the chrome scope so an author's theme cannot restyle it", () => {
    render(<DropMark kind="place" height={null} />);
    expect(screen.getByTestId("canvas-drop-place").className).toContain(
      "aeleos-chrome",
    );
  });
});
