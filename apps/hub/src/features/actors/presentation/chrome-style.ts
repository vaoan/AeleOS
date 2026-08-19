import type { CSSProperties } from "react";

import {
  chromeFor,
  chromeTokens,
  type ChromeKind,
} from "@/features/actors/domain/chromes";

/**
 * The custom properties one chrome paints with, as a `style` object.
 *
 * **Complete rather than differential, always.** A page may hold two players,
 * and a token set carrying only its overrides is correct at exactly one scope —
 * nest a second and "not set" falls through to the ENCLOSING chrome rather than
 * to the default. That is the fault `nestedSkinVars` already had to fix for
 * skins, and it is silent: the second player simply wears half of the first.
 *
 * @param kind - the leaf's kind, which decides which roster is consulted.
 * @param id - the chrome name stored on the leaf's `icon`.
 * @returns every property, ready to spread onto an element.
 */
export function chromeStyle(
  kind: ChromeKind,
  id: string | undefined,
): CSSProperties {
  return chromeTokens(chromeFor(kind, id)) as CSSProperties;
}

/**
 * Whether a chrome draws itself from sprites rather than from tokens.
 *
 * **The renderer branches on this to decide what to LOAD, not merely what to
 * draw.** The sprite path carries the archive reader, the atlas and the sprite
 * CSS; a page whose player is a token chrome must not pay for any of it.
 *
 * @param kind - the leaf's kind.
 * @param id - the chrome name stored on the leaf's `icon`.
 * @returns true when the sprite path is needed.
 */
export function needsSprites(
  kind: ChromeKind,
  id: string | undefined,
): boolean {
  return chromeFor(kind, id).sprites === true;
}

/**
 * How far along a trough a thumb sits, as a percentage string.
 *
 * **Clamped, and NaN answers the start.** `elapsed / duration` is `NaN` before a
 * track reports its length, and `NaN%` is a value CSSOM rejects outright — which
 * leaves the fill at whatever it last was rather than at zero, so a new track
 * appears to begin part-played. That is the same class of fault the position
 * slider's own clamp exists for.
 *
 * @param fraction - how far through, 0 to 1.
 * @returns a percentage between `0%` and `100%`.
 */
export function fillPercent(fraction: number): string {
  if (Number.isNaN(fraction)) return "0%";
  const bounded = Math.min(1, Math.max(0, fraction));
  return `${(bounded * 100).toFixed(3)}%`;
}
