import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DropMark } from "@/features/actors/presentation/drop-mark";

/** Whole class tokens, so a substring match cannot pass for the wrong one. */
function tokens(element: Element): string[] {
  return element.className.split(/\s+/);
}

describe("DropMark", () => {
  it("draws a bar above the boundary for a before target", () => {
    render(<DropMark kind="before" />);
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
    render(<DropMark kind="after" />);
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

  // A bar has a fixed thickness and no inline size: it is the same element
  // for a palette drag and a canvas-move drag alike, since nothing about
  // the carried block reaches it any more (2026-09-16 — see the `place`
  // case below for the last field that did).
  it("gives a gap mark a fixed thickness and no inline size", () => {
    render(<DropMark kind="before" />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(tokens(mark)).toContain("h-1.5");
    expect(tokens(mark)).not.toContain("min-h-12");
    expect(mark).not.toHaveAttribute("style");
  });

  it("fills the place itself for a place target", () => {
    render(<DropMark kind="place" />);
    const mark = screen.getByTestId("canvas-drop-place");
    expect(mark).toBeInTheDocument();
    const classes = tokens(mark);
    expect(classes).toContain("inset-0");
    expect(classes).not.toContain("top-0");
    expect(classes).not.toContain("bottom-0");
    expect(classes).not.toContain("-translate-y-1/2");
    expect(classes).not.toContain("translate-y-1/2");
  });

  // **A `place` mark is its HOST's box and carries no size of its own
  // (2026-09-16).** It used to take an inline `height` from the carried
  // block, floored at `min-h-12` when nothing could be measured — and an
  // absolutely positioned overlay sized to the carried block, drawn over a
  // host of a different height, spilled past that host onto the neighbour
  // below it: the same "lands ON the neighbour" read that turned the gap
  // ghost into a bar. The wrong behaviour this case excludes is a mark that
  // sizes itself at all: any inline style or any `min-h-*` token reddens it,
  // and `inset-0` is what pins it to the host instead.
  it("carries no size of its own for a place target — it is the host's box", () => {
    render(<DropMark kind="place" />);
    const mark = screen.getByTestId("canvas-drop-place");
    expect(mark).not.toHaveAttribute("style");
    expect(tokens(mark).some((token) => token.startsWith("min-h-"))).toBe(
      false,
    );
    expect(tokens(mark).some((token) => /^h-/.test(token))).toBe(false);
    expect(tokens(mark)).toContain("inset-0");
    // `inset-0` and no inline size are not enough on their own to rule out
    // the element being hidden a different way (display: none, visibility:
    // hidden, zero opacity) — this is the assertion that would catch that.
    expect(mark).toBeVisible();
  });

  // The whole reason this is an overlay rather than a real opening gap: it
  // must not take part in layout, or every cached droppable rect goes stale
  // mid-drag. True of the bar as well as of the place fill.
  it("never takes part in layout or swallows the pointer", () => {
    render(<DropMark kind="before" />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark.className).toContain("absolute");
    expect(mark.className).toContain("pointer-events-none");
  });

  it("wears the chrome scope so an author's theme cannot restyle it", () => {
    render(<DropMark kind="place" />);
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
    render(<DropMark kind="before" />);
    render(<DropMark kind="after" />);
    render(<DropMark kind="place" />);
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
