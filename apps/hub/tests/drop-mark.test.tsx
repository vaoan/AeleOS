import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DropMark } from "@/features/actors/presentation/drop-mark";

describe("DropMark", () => {
  it("draws a slot above for a before target", () => {
    render(<DropMark kind="before" height={120} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveStyle({ height: "120px" });
  });

  it("draws a slot below for an after target", () => {
    render(<DropMark kind="after" height={120} />);
    expect(screen.getByTestId("canvas-drop-after")).toBeInTheDocument();
  });

  it("fills the place itself for a place target", () => {
    render(<DropMark kind="place" height={null} />);
    expect(screen.getByTestId("canvas-drop-place")).toBeInTheDocument();
  });

  // A palette drag carries a block that does not exist yet, so no height can
  // be measured for it. The slot must still be visible.
  it("stands at its own minimum when no height is known", () => {
    render(<DropMark kind="before" height={null} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark.className).toContain("min-h-12");
    expect(mark).not.toHaveStyle({ height: "0px" });
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
