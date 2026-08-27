import { describe, expect, it } from "vitest";
import {
  PREVIEW_DEVICES,
  nearestDevice,
  previewScale,
} from "@/features/actors/domain/preview-devices";

describe("PREVIEW_DEVICES", () => {
  it("names three sizes, each with a real viewport", () => {
    expect(PREVIEW_DEVICES.map((d) => [d.id, d.width, d.height])).toEqual([
      ["phone", 390, 844],
      ["tablet", 768, 1024],
      ["desktop", 1280, 900],
    ]);
  });
});

describe("nearestDevice", () => {
  it("answers the size whose WIDTH is nearest the window's", () => {
    expect(nearestDevice(360)).toBe("phone");
    expect(nearestDevice(800)).toBe("tablet");
    expect(nearestDevice(1440)).toBe("desktop");
  });

  // The midpoint between phone (390) and tablet (768) is 579. A `<=` rather
  // than `<` comparison answers differently on exactly that value, and nothing
  // else in the range discriminates the two — so the boundary is asserted
  // rather than left to whichever way the loop happens to fall.
  it("resolves an exact midpoint without ambiguity", () => {
    expect(nearestDevice(579)).toBe("phone");
    expect(nearestDevice(580)).toBe("tablet");
  });
});

describe("previewScale", () => {
  it("shrinks a device wider than the space", () => {
    expect(previewScale(1280, 640)).toBe(0.5);
  });

  // **Never magnify.** A scaled-up preview misrepresents sharpness and text
  // rendering, which is most of what somebody is looking at.
  it("never exceeds one, however much room there is", () => {
    expect(previewScale(390, 1280)).toBe(1);
    expect(previewScale(390, 390)).toBe(1);
  });

  // A container that has not been measured yet reports 0. Scaling to 0 makes
  // the preview vanish; treating it as "no constraint yet" shows it at full
  // size for one frame, which is the honest degrade.
  it("treats an unmeasured container as unconstrained", () => {
    expect(previewScale(1280, 0)).toBe(1);
  });

  // **Height binds only because the frame is PINNED.** A sticky box taller
  // than the window pins with its lower half off-screen and cannot be
  // scrolled to, because the scroll that would reveal it is the one holding
  // it in place.
  it("shrinks a device taller than the room down the screen", () => {
    // Width alone would allow 1.0 here, so this case can only pass if the
    // height is actually consulted — the two constraints disagree on purpose.
    expect(previewScale(390, 1280, 844, 422)).toBe(0.5);
  });

  it("takes whichever constraint binds harder", () => {
    // Width binds: 0.25 across against 0.5 down.
    expect(previewScale(1280, 320, 900, 450)).toBe(0.25);
    // Height binds: 0.5 across against 0.25 down.
    expect(previewScale(1280, 640, 900, 225)).toBe(0.25);
  });

  // Both halves of the "not measured yet" rule, and they are separate
  // branches: a caller that never pins passes no height at all.
  it("ignores a height it has not been given", () => {
    expect(previewScale(1280, 640)).toBe(0.5);
    expect(previewScale(1280, 640, 900, 0)).toBe(0.5);
    expect(previewScale(1280, 640, 0, 450)).toBe(0.5);
  });
});
