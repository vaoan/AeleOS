/**
 * Where each control sits inside the 275x116 main window.
 *
 * **Layout is a different table from the atlas and must not be folded into
 * it.** `skin-sprites.ts` says where a picture is cut FROM its sheet; this says
 * where the cut picture is placed IN the window. A sprite's own size is
 * usually — but not always — the size of the box it lands in, so conflating
 * them silently mis-sizes the two that differ.
 *
 * The numbers are read off `packages/webamp/css/main-window.css` in
 * https://github.com/captbaritone/webamp (MIT, (c) Jordan Eldredge) rather than
 * recalled, because recalled ones were wrong: the marquee is at y=24, not the
 * y=27 a first draft of this file used, and the time display starts at x=39
 * rather than x=48. Both are the kind of error that renders a plausible-looking
 * window nobody can point at.
 */
export interface SkinBox {
  /** Offset from the window's left edge, in skin pixels. */
  readonly left: number;
  /** Offset from the window's top edge, in skin pixels. */
  readonly top: number;
  /** How wide the control is, in skin pixels. */
  readonly width: number;
  /** How tall the control is, in skin pixels. */
  readonly height: number;
}

/**
 * How wide the main window is.
 *
 * Fixed, and it cannot reflow — Winamp itself only ever offered 1x and 2x. A
 * container query picks a scale from the PLACE's width; nothing here changes.
 */
export const MAIN_WIDTH = 275;

/** How tall the main window is. */
export const MAIN_HEIGHT = 116;

/**
 * How many frames the volume and balance sheets stack.
 *
 * Both sheets are 420 tall and hold 28 frames of 15, so the frame for a given
 * setting is `round(fraction * 27) * 15` down the sheet. Derived rather than
 * written as 15, so the two numbers cannot disagree.
 */
export const SLIDER_FRAMES = 28;

/** How tall one frame of a slider background is. */
export const SLIDER_FRAME_HEIGHT = 15;

/**
 * Every control's box in the main window.
 *
 * A `Map` for the same reason every other lookup in this feature is one: names
 * reach it from rendering code rather than from a closed union today, and a
 * record answers `__proto__` with an inherited value.
 */
export const MAIN_LAYOUT: ReadonlyMap<string, SkinBox> = new Map<
  string,
  SkinBox
>([
  ["titleBar", { left: 0, top: 0, width: 275, height: 14 }],
  ["playPause", { left: 26, top: 28, width: 9, height: 9 }],
  ["time", { left: 39, top: 26, width: 59, height: 13 }],
  ["visualiser", { left: 24, top: 43, width: 76, height: 16 }],
  ["marquee", { left: 111, top: 24, width: 154, height: 6 }],
  ["monoStereo", { left: 212, top: 41, width: 57, height: 12 }],
  ["volume", { left: 107, top: 57, width: 68, height: 13 }],
  ["balance", { left: 177, top: 57, width: 38, height: 13 }],
  ["position", { left: 16, top: 72, width: 248, height: 10 }],
  ["previous", { left: 16, top: 88, width: 23, height: 18 }],
  ["play", { left: 39, top: 88, width: 23, height: 18 }],
  ["pause", { left: 62, top: 88, width: 23, height: 18 }],
  ["stop", { left: 85, top: 88, width: 23, height: 18 }],
  ["next", { left: 108, top: 88, width: 22, height: 18 }],
  ["eject", { left: 136, top: 89, width: 22, height: 16 }],
  ["shuffle", { left: 164, top: 89, width: 47, height: 15 }],
  ["repeat", { left: 210, top: 89, width: 28, height: 15 }],
]);

/**
 * Where the four time digits sit, relative to the time box.
 *
 * Not evenly spaced: there is a wider gap between the minutes and the seconds
 * than between the two digits of either, which is what makes it read as a clock
 * rather than as four numbers. Spacing them evenly is the obvious
 * simplification and it is wrong.
 */
export const TIME_DIGITS: readonly number[] = [9, 21, 39, 51];

/**
 * One control's box.
 *
 * @param name - the control, such as `play` or `marquee`.
 * @returns its box, or undefined when the window has no such control.
 */
export function mainBox(name: string): SkinBox | undefined {
  return MAIN_LAYOUT.get(name);
}
