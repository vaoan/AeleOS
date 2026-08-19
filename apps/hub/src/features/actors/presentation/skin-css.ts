import type { CSSProperties } from "react";

import {
  mainBox,
  SLIDER_FRAME_HEIGHT,
  SLIDER_FRAMES,
} from "@/features/actors/domain/skin-layout";
import { skinSprite, spriteSheet } from "@/features/actors/domain/skin-sprites";

/**
 * Where each sheet of a loaded skin can be fetched from, by its atlas name.
 *
 * The values are whatever a browser can put in `url(...)` — in practice object
 * URLs minted from the blobs `readSkinArchive` answered. This module never
 * makes one, so it stays testable with plain strings and has no lifetime to
 * manage; the component that mints them is the one that revokes them.
 */
export type SkinSheets = ReadonlyMap<string, string>;

/**
 * One sprite, ready to paint as a background.
 *
 * **A skin that omits the sheet answers undefined rather than a broken URL**,
 * so the caller can fall back per sprite. That granularity is the point: a skin
 * missing `shufrep.bmp` must still draw its transport buttons.
 *
 * The sprite's own size is used, which is right for every control the main
 * window draws — {@link controlStyle} is what handles a box that differs.
 *
 * @param name - the sprite, such as `MAIN_PLAY_BUTTON`.
 * @param sheets - the loaded skin.
 * @returns the style, or undefined when this skin cannot draw it.
 */
export function spriteStyle(
  name: string,
  sheets: SkinSheets,
): CSSProperties | undefined {
  const sprite = skinSprite(name);
  const sheet = spriteSheet(name);
  if (!sprite || !sheet) return undefined;
  const url = sheets.get(sheet);
  if (url === undefined) return undefined;
  return {
    backgroundImage: `url(${url})`,
    backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
    backgroundRepeat: "no-repeat",
    width: `${sprite.width}px`,
    height: `${sprite.height}px`,
  };
}

/**
 * One control, positioned in the window and painted with its sprite.
 *
 * The BOX comes from the layout and the PICTURE from the atlas, and the two are
 * deliberately allowed to disagree: `next` is a 22-wide box cut from a 22-wide
 * sprite, while `repeat` sits in a 28-wide box whose sprite is also 28 but
 * whose neighbour `shuffle` is 47 — one table cannot state both without
 * repeating itself.
 *
 * @param control - the layout name, such as `play`.
 * @param name - the sprite name, such as `MAIN_PLAY_BUTTON`.
 * @param sheets - the loaded skin.
 * @returns the style, or undefined when the control or the sprite is unknown.
 */
export function controlStyle(
  control: string,
  name: string,
  sheets: SkinSheets,
): CSSProperties | undefined {
  const box = mainBox(control);
  if (!box) return undefined;
  const sprite = spriteStyle(name, sheets);
  return {
    position: "absolute",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    ...sprite,
  };
}

/**
 * Clamps a fraction into 0..1.
 *
 * A slider's value arrives from an `<input>` and from stored state, and NaN
 * reaches CSS as a background position of `NaN`, which the browser drops —
 * leaving the slider showing frame zero and looking like a slider that does
 * nothing.
 *
 * @param fraction - the proposed value.
 * @returns it, clamped, with NaN answering 0.
 */
function clampFraction(fraction: number): number {
  if (Number.isNaN(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * The volume or balance background at a given setting.
 *
 * Both sheets stack {@link SLIDER_FRAMES} frames of
 * {@link SLIDER_FRAME_HEIGHT}, so the frame is chosen by the fraction and cut
 * from that offset — this is the one place a sprite's own `y` is added to
 * rather than used.
 *
 * @param name - `MAIN_VOLUME_BACKGROUND` or `MAIN_BALANCE_BACKGROUND`.
 * @param sheets - the loaded skin.
 * @param fraction - where the slider sits, 0 to 1.
 * @returns the style, or undefined when this skin cannot draw it.
 */
export function sliderStyle(
  name: string,
  sheets: SkinSheets,
  fraction: number,
): CSSProperties | undefined {
  const sprite = skinSprite(name);
  const sheet = spriteSheet(name);
  if (!sprite || !sheet) return undefined;
  const url = sheets.get(sheet);
  if (url === undefined) return undefined;
  const frame = Math.round(clampFraction(fraction) * (SLIDER_FRAMES - 1));
  return {
    backgroundImage: `url(${url})`,
    backgroundPosition: `-${sprite.x}px -${sprite.y + frame * SLIDER_FRAME_HEIGHT}px`,
    backgroundRepeat: "no-repeat",
    width: `${sprite.width}px`,
    height: `${SLIDER_FRAME_HEIGHT}px`,
  };
}

/**
 * How far along a track the position thumb sits, in skin pixels.
 *
 * The thumb is 29 wide in a 248-wide trough, so it may travel 219 — using the
 * trough's full width instead puts the thumb 29px past the end at the close of
 * every track, which reads as a seek bar that overshoots.
 *
 * @param fraction - how far through the track, 0 to 1.
 * @param trough - the trough's width in skin pixels.
 * @param thumb - the thumb's width in skin pixels.
 * @returns the thumb's left offset within the trough.
 */
export function thumbOffset(
  fraction: number,
  trough: number,
  thumb: number,
): number {
  return Math.round(clampFraction(fraction) * Math.max(0, trough - thumb));
}
