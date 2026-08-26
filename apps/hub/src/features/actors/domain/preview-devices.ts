/** One named viewport the complete preview may be rendered at. */
export interface PreviewDevice {
  /** Its stable name, used as a catalogue key and as a test id. */
  id: "phone" | "tablet" | "desktop";
  /** The viewport width in CSS pixels. */
  width: number;
  /** The viewport height in CSS pixels. */
  height: number;
}

/** The name of one entry in {@link PREVIEW_DEVICES}. */
export type PreviewDeviceId = PreviewDevice["id"];

/**
 * The sizes the complete preview may be rendered at.
 *
 * **Three named boxes rather than "fill the space", and that is the honest
 * framing rather than a feature.** A preview in an iframe is exactly as
 * faithful as its viewport matches a real one, so it is always at SOME size.
 * Filling the editor's width would invent a viewport HEIGHT no visitor has,
 * which is the same class of quiet error as the fault this route exists to
 * close: something that looks faithful and is wrong in a way nobody can see.
 * A named size makes the preview's claim checkable.
 *
 * The values are ordinary device viewports rather than this repository's own
 * measured container thresholds (`2026-08-19-weighted-places-design.md`). The
 * subject here is what a VISITOR's window is, not the width at which a grid
 * changes its mind.
 */
export const PREVIEW_DEVICES: readonly PreviewDevice[] = [
  { id: "phone", width: 390, height: 844 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "desktop", width: 1280, height: 900 },
];

/**
 * The device whose width is nearest the author's own window.
 *
 * This decides the size the preview OPENS at, so a phone editor opens on phone
 * and a desktop editor on desktop — the least surprising default, because it
 * is the size the author is already looking at.
 *
 * **A tie resolves to the NARROWER device**, which matters only on the exact
 * midpoint between two widths. It is stated because it is a decision rather
 * than an accident of which way the comparison happens to fall, and
 * `preview-devices.test.ts` pins both sides of that midpoint.
 *
 * @param windowWidth - the author's viewport width in CSS pixels.
 * @returns the nearest device's name.
 */
export function nearestDevice(windowWidth: number): PreviewDeviceId {
  let best = PREVIEW_DEVICES[0]!;
  for (const device of PREVIEW_DEVICES) {
    if (
      Math.abs(device.width - windowWidth) < Math.abs(best.width - windowWidth)
    ) {
      best = device;
    }
  }
  return best.id;
}

/**
 * How far to shrink a device box to fit the space available.
 *
 * **Clamped to one, so the preview is never magnified.** Scaling up would
 * misrepresent sharpness and text rendering, which is most of what an author
 * is looking at. Scaling DOWN is safe in a way worth stating: the layout
 * inside is still computed at the true viewport, because a transform does not
 * change the box the page believes it is in — what shrinks is only the pixels
 * being looked at.
 *
 * **HEIGHT is a constraint too, and only because the frame is pinned.** A
 * sticky box taller than the window pins with its lower half off-screen and
 * cannot be scrolled to, because the thing that would scroll it is the very
 * scroll that holds it in place — so the part of a page an author most wants
 * to check would be permanently unreachable. The height constraint is what
 * keeps the whole device visible while the page scroll scrubs through its
 * content. It costs magnification: a 1280×900 desktop box in a 900-tall window
 * is bounded by height rather than width, where a box that scrolled inside
 * itself was not.
 *
 * Either dimension may be given as zero, which means "not measured yet" and is
 * treated as no constraint rather than as no room — a scale of zero would make
 * the preview vanish for a frame. Passing neither height reproduces the
 * width-only behaviour exactly, which is what the callers that do not pin use.
 *
 * @param deviceWidth - the chosen viewport's width.
 * @param available - the room the editor can give it across.
 * @param deviceHeight - the chosen viewport's height, or zero to ignore it.
 * @param availableHeight - the room down the screen, or zero to ignore it.
 * @returns a scale factor in `(0, 1]`.
 */
export function previewScale(
  deviceWidth: number,
  available: number,
  deviceHeight = 0,
  availableHeight = 0,
): number {
  const byWidth = available > 0 ? available / deviceWidth : 1;
  const byHeight =
    availableHeight > 0 && deviceHeight > 0
      ? availableHeight / deviceHeight
      : 1;
  return Math.min(1, byWidth, byHeight);
}
