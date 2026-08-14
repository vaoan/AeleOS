import {
  contrastRatio,
  oklchToSrgb,
  parseHex,
  srgbToOklch,
  type Oklch,
} from "@/shared/domain/color";
import {
  gradientCss,
  hardestStop,
  type Gradient,
} from "@/shared/domain/gradient";

/** Text needs this much. Anything below it is a page somebody cannot read. */
const TEXT = 4.5;

/** Borders and other non-text need this much. */
const NON_TEXT = 3;

/** How far a card sits from the field, in lightness. */
const SURFACE_STEP = 0.05;

/** Where a page stops being light and starts being dark. */
const MID = 0.5;

/**
 * Every custom property a chosen background decides.
 *
 * Keyed by the custom property name so it can be spread straight into the
 * values a theme emits.
 */
export type Palette = Record<string, string>;

/**
 * Formats a colour the way the stylesheet does.
 *
 * Scalar parameters rather than a destructured tuple: destructuring in the
 * signature makes the lint rules demand `@param colour."0"`, which the TSDoc
 * syntax rule then rejects. The repository resolves that collision this way
 * everywhere it appears.
 *
 * @param l - lightness.
 * @param c - chroma.
 * @param h - hue in degrees.
 * @returns an `oklch(…)` value.
 */
function css(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

/**
 * The dimmest colour of this hue that is still readable on a background.
 *
 * Walks the lightness away from the background and stops at the FIRST value
 * that clears the ratio, which is what makes it dim: a muted label wants to be
 * as quiet as it is allowed to be, not as loud as possible. `--ink` uses the
 * far end instead, because a heading wants the opposite.
 *
 * Chroma eases off alongside, which is what rescues the hues that have no
 * readable rendering at full saturation — the same trick `legibleAccent` uses,
 * and for the same reason.
 *
 * @param hue - the hue to keep.
 * @param chroma - the chroma to start from.
 * The direction is **passed in, not guessed from the background's lightness**.
 * Guessing is what let one page answer "is this dark?" two different ways — the
 * heading going white while the muted text went black, on the same blue field.
 * There is one measurement of that now and every token here shares it.
 *
 * Where nothing clears the ratio — a mid-grey has no readable text colour in
 * either direction — the walk runs to the extreme and returns it. That is the
 * best available rather than a promise, and the caller knows it.
 *
 * @param background - what it has to be readable on.
 * @param minRatio - the contrast it must clear.
 * @param lighter - true to walk toward white, false toward black.
 * @returns the dimmest colour that clears it, or the extreme.
 */
function dimmestLegible(
  hue: number,
  chroma: number,
  background: Oklch,
  minRatio: number,
  lighter: boolean,
): Oklch {
  const towards = lighter ? 1 : 0;
  let colour: Oklch = [background[0], chroma, hue];
  for (let step = 0; step < 100; step += 1) {
    if (contrastRatio(colour, background) >= minRatio) break;
    colour = [colour[0] + (towards - colour[0]) * 0.06, colour[1] * 0.99, hue];
  }
  return colour;
}

/**
 * A whole palette, built around one background colour.
 *
 * **The author's colours are rendered exactly as chosen. Nothing is corrected.**
 * That is a deliberate product decision and it reverses an earlier one: this
 * used to push a background's lightness away from the middle and cap its
 * chroma, so that text could always clear 4.5:1. It no longer does. A person may
 * pick a background as garish or as unreadable as they like, because the visitor
 * can switch the page to the default light or dark theme — the escape hatch is
 * what makes the freedom safe, not the correction.
 *
 * What IS still derived is everything the author does not pick: the text, the
 * secondary text, the muted text and the border. Those are chosen to be as
 * readable as that background allows, which is not the same as promising they
 * are readable — on a mid-grey no text colour clears 4.5:1 in either direction,
 * and this returns the better of the two rather than pretending otherwise.
 *
 *  * `--ink` takes whichever extreme contrasts more with the background, tested
 *    rather than assumed — the midpoint is not where the crossover actually is,
 *    and a saturated hue moves it.
 *  * `--muted` takes the dimmest value that still clears 4.5:1, or the extreme
 *    when nothing does. A quiet label wants to be as quiet as it is allowed.
 *  * `--ink-2` sits between them.
 *  * `--edge` clears the 3:1 non-text minimum where it can.
 *
 * The hue carries into all of them, so a palette reads as one colour scheme
 * rather than as grey text dropped onto a tint.
 *
 * `--field` is **the author's gradient, verbatim** — however many stops they
 * built and at whatever angle. Nothing here adjusts it.
 *
 * `--nebula-blend` follows the background's lightness: `screen` on a dark field
 * because dust emits light, `multiply` on a light one because it absorbs it.
 * Reading it from the background rather than from the reader's mode is what
 * stops a custom theme inverting when somebody switches scheme.
 *
 * @param background - the gradient somebody built.
 * @param accentHex - their accent, as `#rrggbb`.
 * @returns every custom property the theme sets.
 */
export function derivePalette(
  background: Gradient,
  accentHex: string,
): Palette {
  // **Solved against the hardest stop, not the first.** Text crosses the whole
  // gradient, so the colour that matters is the one leaving least room for it —
  // the stop nearest mid-lightness. Solving against the first stop, or against
  // an average, makes a page readable at one end and not at the other.
  const rgb = parseHex(hardestStop(background));
  // A value that is not a colour derives nothing. The caller emits no override
  // at all in that case, which leaves the design's own palette in charge.
  if (!rgb) return {};

  const [bgL, bgC, bgH] = srgbToOklch(rgb);

  // The card steps away from the hardest stop; the field is the author's own
  // gradient and is not adjusted at all.
  const dark = bgL < MID;
  // What every ratio below is solved against: the gradient at its hardest.
  const lifted: Oklch = [bgL, bgC, bgH];
  const surface: Oklch = [
    Math.max(0, Math.min(1, dark ? bgL - SURFACE_STEP : bgL + SURFACE_STEP)),
    bgC,
    bgH,
  ];

  // **Which extreme reads better is measured, not assumed.** A saturated
  // background moves the crossover away from the midpoint, and deciding by
  // `lightness < 0.5` is what once put white headings and near-black body text
  // on the same blue page — each solver having reached its own answer about
  // which kind of page it was. One measurement, used by all of them.
  const textChroma = Math.min(bgC, 0.05);
  const light: Oklch = [0.97, textChroma, bgH];
  const shade: Oklch = [0.15, textChroma, bgH];
  const inkIsLight =
    contrastRatio(light, lifted) >= contrastRatio(shade, lifted);
  const ink = inkIsLight ? light : shade;

  const muted = dimmestLegible(bgH, textChroma, lifted, TEXT, inkIsLight);
  const inkTwo: Oklch = [(ink[0] + muted[0]) / 2, muted[1], bgH];
  const edge = dimmestLegible(
    bgH,
    Math.min(bgC, 0.09),
    lifted,
    NON_TEXT,
    inkIsLight,
  );

  // The accent is the author's, exactly. Only the label ON it is chosen, and
  // only because nobody picks that.
  const accentRgb = parseHex(accentHex);
  const accent = accentRgb ? srgbToOklch(accentRgb) : ink;
  const onAccent =
    contrastRatio(light, accent) >= contrastRatio(shade, accent)
      ? light
      : shade;

  return {
    "--field": gradientCss(background),
    "--surface": css(...surface),
    // The bar is a translucent wash over whatever is behind it, so it is the
    // surface again with an alpha rather than a solved colour.
    "--bar": `oklch(${surface[0].toFixed(4)} ${surface[1].toFixed(4)} ${bgH.toFixed(2)} / 0.55)`,
    "--ink": css(...ink),
    "--ink-2": css(...inkTwo),
    "--muted": css(...muted),
    "--edge": css(...edge),
    "--accent": css(...accent),
    "--on-accent": css(...onAccent),
    "--nebula-blend": dark ? "screen" : "multiply",
  };
}

/**
 * Whether a derived palette reads as a dark one.
 *
 * The canvas and the star toggle both need to know, and asking the reader's
 * scheme would give the wrong answer for a custom theme.
 *
 * @param background - the chosen gradient.
 * @returns true when the page is dark.
 */
export function isDarkBackground(background: Gradient): boolean {
  const rgb = parseHex(hardestStop(background));
  return rgb ? srgbToOklch(rgb)[0] < MID : false;
}

/**
 * The colour a picker should open on, given what is on screen now.
 *
 * Exported for the configurator, which seeds its inputs from the live computed
 * styles so that **nothing moves at the moment somebody starts theming** — the
 * values written are the ones the page was already wearing.
 *
 * @param value - a computed `oklch(l c h)` value.
 * @returns the colour as `#rrggbb`, or null when it could not be read.
 */
export function hexFromOklchValue(value: string): string | null {
  const found = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (!found) return null;
  const channels = oklchToSrgb(
    Number(found[1]),
    Number(found[2]),
    Number(found[3]),
  );
  return `#${channels
    .map((ch) =>
      Math.round(Math.max(0, Math.min(1, ch)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
