import { describe, expect, it } from "vitest";
import {
  PREVIEW_GAP,
  previewFollowsPointer,
} from "@/features/actors/presentation/preview-follows-pointer";

type Args = Parameters<typeof previewFollowsPointer>[0];

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const transform = { x: 100, y: 50, scaleX: 1, scaleY: 1 };

const args = (over: Partial<Args>): Args =>
  ({
    activatorEvent: null,
    active: null,
    activeNodeRect: null,
    draggingNodeRect: null,
    containerNodeRect: null,
    over: null,
    overlayNodeRect: null,
    scrollableAncestors: [],
    scrollableAncestorRects: [],
    windowRect: null,
    transform,
    ...over,
  }) as Args;

describe("previewFollowsPointer", () => {
  it("shifts the overlay so its top-left sits a gap below-right of where the pointer went down, whatever the active node's size", () => {
    // A 720px-wide frame lifted by a grip at its top-right: the pointer went
    // down 700px right of the frame's left edge and 15px below its top.
    const pointer = new MouseEvent("pointerdown", {
      clientX: 724,
      clientY: 402,
    });
    const shifted = previewFollowsPointer(
      args({
        activatorEvent: pointer,
        activeNodeRect: rect(24, 387, 720, 60),
      }),
    );
    expect(shifted).toEqual({
      ...transform,
      x: transform.x + (724 - 24) + PREVIEW_GAP,
      y: transform.y + (402 - 387) + PREVIEW_GAP,
    });
  });

  it("leaves the transform alone for a keyboard lift, which has no pointer to follow", () => {
    const keyboard = new KeyboardEvent("keydown", { code: "Space" });
    expect(
      previewFollowsPointer(
        args({ activatorEvent: keyboard, activeNodeRect: rect(0, 0, 10, 10) }),
      ),
    ).toBe(transform);
  });

  it("leaves the transform alone before the active node has a rectangle", () => {
    const pointer = new MouseEvent("pointerdown", { clientX: 5, clientY: 5 });
    expect(previewFollowsPointer(args({ activatorEvent: pointer }))).toBe(
      transform,
    );
  });

  it("leaves the transform alone with no activator event at all", () => {
    expect(
      previewFollowsPointer(args({ activeNodeRect: rect(0, 0, 10, 10) })),
    ).toBe(transform);
  });
});
