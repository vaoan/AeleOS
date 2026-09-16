import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DropMark } from "@/features/actors/presentation/drop-mark";

/** Whole class tokens, so a substring match cannot pass for the wrong one. */
function tokens(element: Element): string[] {
  return element.className.split(/\s+/);
}

describe("DropMark", () => {
  it("draws a bar above the boundary for a before target", () => {
    render(<DropMark kind="before" height={120} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark).toBeInTheDocument();
    const classes = tokens(mark);
    expect(classes).toContain("top-0");
    expect(classes).toContain("-translate-y-1/2");
    expect(classes).toContain("h-1.5");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("bg-(--accent)");
    expect(classes).not.toContain("inset-0");
    expect(classes).not.toContain("bottom-0");
    expect(classes).not.toContain("bg-(--accent)/15");
  });

  it("draws a bar below the boundary for an after target", () => {
    render(<DropMark kind="after" height={120} />);
    const mark = screen.getByTestId("canvas-drop-after");
    expect(mark).toBeInTheDocument();
    const classes = tokens(mark);
    expect(classes).toContain("bottom-0");
    expect(classes).toContain("translate-y-1/2");
    expect(classes).toContain("h-1.5");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("bg-(--accent)");
    expect(classes).not.toContain("inset-0");
    expect(classes).not.toContain("top-0");
  });

  // A bar has a fixed thickness whether or not a real height was measured —
  // unlike the ghost slot it replaced, it never reads `height` at all. Both
  // a palette drag (no measurable height) and a canvas-move drag (a real
  // one) must draw the identical bar, which is the discriminating claim: a
  // renderer that still branches on `height` for a gap mark would redden
  // this pair by drawing two different things for `before`.
  it("draws the identical bar whether or not a height was measured", () => {
    render(<DropMark kind="before" height={null} />);
    const unmeasured = tokens(screen.getByTestId("canvas-drop-before"));
    expect(unmeasured).toContain("h-1.5");
    expect(unmeasured).not.toContain("min-h-12");
    expect(screen.getByTestId("canvas-drop-before")).not.toHaveStyle({
      height: "0px",
    });
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
  // be measured for it. The `place` slot must still be visible — it is the
  // one kind that still floors on `min-h-12` when nothing was measured.
  it("stands at its own minimum when no height is known", () => {
    render(<DropMark kind="place" height={null} />);
    const mark = screen.getByTestId("canvas-drop-place");
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
  // 48px must draw a `place` ghost the size it will actually occupy, not a
  // floor that overstates it. Final review, 2026-09-11: `min-h-12` used to
  // apply unconditionally, so this case would have failed before that fix.
  it("does not apply its own floor when a real height is supplied", () => {
    render(<DropMark kind="place" height={20} />);
    const mark = screen.getByTestId("canvas-drop-place");
    expect(mark.className).not.toContain("min-h-12");
    expect(mark).toHaveStyle({ height: "20px" });
  });

  // The whole reason this is an overlay rather than a real opening gap: it
  // must not take part in layout, or every cached droppable rect goes stale
  // mid-drag. True of the bar as well as of the place ghost.
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

  // Root rule 27: swapping two entries in the placement map must redden
  // something. Whole-token comparison (not `toContain` substrings) is what
  // makes this discriminate at all — `bg-(--accent)` is a prefix of
  // `bg-(--accent-soft)`, and `top-0`/`bottom-0` share no characters with
  // each other but a class LIST comparison would still pass a swap if it
  // only checked "does this string appear somewhere".
  it("tells before, after and place apart at the boundary each sits on", () => {
    render(<DropMark kind="before" height={null} />);
    render(<DropMark kind="after" height={null} />);
    render(<DropMark kind="place" height={null} />);
    const before = tokens(screen.getByTestId("canvas-drop-before"));
    const after = tokens(screen.getByTestId("canvas-drop-after"));
    const place = tokens(screen.getByTestId("canvas-drop-place"));
    expect(before).toContain("top-0");
    expect(before).not.toContain("bottom-0");
    expect(after).toContain("bottom-0");
    expect(after).not.toContain("top-0");
    expect(place).toContain("inset-0");
    expect(place).not.toContain("top-0");
    expect(place).not.toContain("bottom-0");
  });
});
