import { parseHex, toHex } from "@/shared/domain/color";

/** One colour, at one place along the gradient. */
export interface GradientStop {
  /** The colour, as `#rrggbb`. */
  color: string;
  /** Where it sits, 0 at the start and 100 at the end. */
  at: number;
}

/** A page's background. */
export interface Gradient {
  /** Which way it runs, in degrees. 0 points up, 90 points right. */
  angle: number;
  /** The colours along it, in order. Never empty. */
  stops: GradientStop[];
}

/**
 * The most stops a background may carry.
 *
 * High enough that nobody sensible hits it — a fursona with a dozen colours is
 * a fursona, not an abuse — and low enough that the stored value stays small
 * and the CSS stays something a browser will render without complaint.
 */
export const MAX_STOPS = 12;

/** The fewest. A gradient with no colours is not a background. */
export const MIN_STOPS = 1;

/**
 * Puts the stops in order and gives each a position inside the bar.
 *
 * **Order is an invariant, not a convention.** CSS renders stops in the order
 * they are written, so an out-of-order list produces a gradient that doubles
 * back on itself — bands appearing where nobody put one. Every function here
 * returns a sorted list rather than trusting its caller to have kept one.
 *
 * @param stops - the stops, in any order.
 * @returns them sorted, clamped, and never empty.
 */
function tidy(stops: GradientStop[]): GradientStop[] {
  const cleaned = stops
    .map((stop) => ({
      color: stop.color,
      at: Math.max(0, Math.min(100, Math.round(stop.at))),
    }))
    .toSorted((a, b) => a.at - b.at)
    .slice(0, MAX_STOPS);
  return cleaned.length > 0 ? cleaned : DEFAULT_GRADIENT.stops;
}

/**
 * What the picker opens on before anybody has chosen.
 *
 * Two stops rather than one, because a gradient control showing a single flat
 * colour does not look like a gradient control and nobody finds the second
 * stop. The values are the design's own light field, so promoting a theme
 * changes nothing on screen at the moment it happens.
 */
export const DEFAULT_GRADIENT: Gradient = {
  angle: 160,
  stops: [
    { color: "#fbf4ec", at: 0 },
    { color: "#f3e3d3", at: 100 },
  ],
};

/**
 * Reads a stored gradient, or gives nothing back.
 *
 * **Every branch falls back rather than throwing.** The value comes out of a
 * `jsonb` column that predates gradients, so absence is ordinary; and a page
 * whose stored background is nonsense must still render, because the
 * alternative is somebody's public page going blank for a reason they can
 * neither see nor fix.
 *
 * A stop whose colour is not a colour is **dropped**, rather than defaulted to
 * black — an unreadable value is not a choice, and inventing one puts a colour
 * on their page that nobody picked. If that leaves no stops at all, the whole
 * gradient is treated as absent.
 *
 * @param value - whatever was stored.
 * @returns the gradient, or null to override nothing.
 */
export function parseGradient(value: unknown): Gradient | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as { angle?: unknown; stops?: unknown };
  if (!Array.isArray(raw.stops)) return null;

  const stops = raw.stops
    .map((stop) => {
      if (typeof stop !== "object" || stop === null) return null;
      const { color, at } = stop as { color?: unknown; at?: unknown };
      const rgb = typeof color === "string" ? parseHex(color) : null;
      if (!rgb || typeof at !== "number" || !Number.isFinite(at)) return null;
      return { color: toHex(rgb), at };
    })
    .filter((stop): stop is GradientStop => stop !== null);

  if (stops.length === 0) return null;
  const angle =
    typeof raw.angle === "number" && Number.isFinite(raw.angle)
      ? ((Math.round(raw.angle) % 360) + 360) % 360
      : DEFAULT_GRADIENT.angle;
  return { angle, stops: tidy(stops) };
}

/**
 * The gradient as a CSS value.
 *
 * A **single stop renders as a flat colour**, not as a gradient from a colour
 * to itself. Browsers cope with either, but the flat form is what somebody
 * reading the stylesheet expects to see for a page that has one colour.
 *
 * Every number here is generated — angles and positions are rounded integers,
 * colours are rebuilt by `toHex` — so nothing a person typed reaches the
 * string. That is what keeps it safe to put in a stylesheet.
 *
 * @param gradient - the background.
 * @returns a `linear-gradient(…)`, or a plain colour for one stop.
 */
export function gradientCss(gradient: Gradient): string {
  const stops = tidy(gradient.stops);
  if (stops.length === 1) return stops[0]!.color;
  const parts = stops.map((stop) => `${stop.color} ${stop.at}%`).join(", ");
  return `linear-gradient(${gradient.angle}deg, ${parts})`;
}

/**
 * Adds a stop, taking its colour from the gradient at that point.
 *
 * Sampling rather than defaulting to black is what makes clicking the bar feel
 * like adding a handle rather than like dropping a foreign colour into the
 * middle of somebody's design — the gradient does not visibly change until the
 * new stop is actually moved or recoloured.
 *
 * @param gradient - the background.
 * @param at - where to add it, 0 to 100.
 * @returns the gradient with the stop added, or unchanged when it is full.
 */
export function addStop(gradient: Gradient, at: number): Gradient {
  if (gradient.stops.length >= MAX_STOPS) return gradient;
  return {
    ...gradient,
    stops: tidy([...gradient.stops, { color: colourAt(gradient, at), at }]),
  };
}

/**
 * Removes a stop.
 *
 * Refuses to remove the last one: a background with no colours is not a
 * background, and a control that can empty itself into an invalid state is a
 * control somebody will empty.
 *
 * @param gradient - the background.
 * @param index - which stop.
 * @returns the gradient without it, or unchanged when it is the last.
 */
export function removeStop(gradient: Gradient, index: number): Gradient {
  if (gradient.stops.length <= MIN_STOPS) return gradient;
  return {
    ...gradient,
    stops: tidy(gradient.stops.filter((_, i) => i !== index)),
  };
}

/**
 * Changes one stop, by colour or by position or both.
 *
 * Returns a **sorted** list, which means the index of the stop being edited can
 * change as it passes its neighbours — so it returns **where that stop ended
 * up** alongside the gradient.
 *
 * That is not a convenience. A caller cannot work it out: `tidy` rebuilds every
 * stop to clamp its position, so identity does not survive, and ties make the
 * position unrecoverable from the values alone. A picker that guessed — by
 * keeping its old index, say — silently starts editing the neighbour halfway
 * through a drag, which is exactly what shipped here once behind a line of code
 * that looked like it was tracking identity and was in fact a no-op.
 *
 * Returns a sorted list built with `toSorted`, so the caller's stops cannot be reordered underneath them.
 *
 * @param gradient - the background.
 * @param index - which stop.
 * @param change - the colour, the position, or both.
 * @returns the gradient with that stop changed, and where that stop now sits.
 */
export function setStop(
  gradient: Gradient,
  index: number,
  change: Partial<GradientStop>,
): { gradient: Gradient; index: number } {
  // Tagged, then sorted, so the edited stop can be found afterwards. Identity
  // will not survive `tidy` — it rebuilds every stop to clamp the position —
  // and a caller cannot recompute this from the outside, which is the whole
  // reason it is returned rather than left to be guessed.
  const tagged = gradient.stops
    .map((stop, i) => ({
      stop: i === index ? { ...stop, ...change } : stop,
      edited: i === index,
    }))
    .map(({ stop, edited }) => ({
      stop: {
        color: stop.color,
        at: Math.max(0, Math.min(100, Math.round(stop.at))),
      },
      edited,
    }))
    .toSorted((a, b) => a.stop.at - b.stop.at)
    .slice(0, MAX_STOPS);

  const moved = tagged.findIndex((each) => each.edited);
  return {
    gradient: { ...gradient, stops: tidy(tagged.map((each) => each.stop)) },
    // The slice can drop the edited stop when a gradient is already at the cap
    // and it sorted to the end; the selection then stays where it was rather
    // than pointing past the list.
    index: moved === -1 ? Math.min(index, tagged.length - 1) : moved,
  };
}

/**
 * The colour the gradient shows at a point.
 *
 * Linear between the two stops either side, and the end stop's colour beyond
 * the last one — which is what CSS itself does.
 *
 * Walks the stops with `toReversed`, which copies by construction — the previous spread-then-reverse did the same thing and relied on remembering the spread.
 *
 * @param gradient - the background.
 * @param at - the point, 0 to 100.
 * @returns the colour there, as `#rrggbb`.
 */
export function colourAt(gradient: Gradient, at: number): string {
  const stops = tidy(gradient.stops);
  const before = stops.toReversed().find((stop) => stop.at <= at) ?? stops[0]!;
  const after = stops.find((stop) => stop.at >= at) ?? stops.at(-1)!;
  if (before === after || before.at === after.at) return before.color;

  const t = (at - before.at) / (after.at - before.at);
  const from = parseHex(before.color) ?? [0, 0, 0];
  const to = parseHex(after.color) ?? [0, 0, 0];
  return toHex(from.map((channel, i) => channel + (to[i]! - channel) * t));
}

/**
 * The stop a page's text has the hardest time sitting on.
 *
 * **Text crosses the whole gradient, so the palette has to be solved against
 * the worst of it.** That is the stop nearest mid-lightness: the one with the
 * least room for a text colour in either direction. Solving against the first
 * stop, or against an average, produces a page that is readable at one end and
 * not at the other.
 *
 * @param gradient - the background.
 * @returns the hardest stop's colour, as `#rrggbb`.
 */
export function hardestStop(gradient: Gradient): string {
  const stops = tidy(gradient.stops);
  let worst = stops[0]!;
  let worstDistance = Number.POSITIVE_INFINITY;
  for (const stop of stops) {
    const rgb = parseHex(stop.color);
    if (!rgb) continue;
    // Relative luminance is close enough to "how much room is there for text"
    // and needs no colour-space conversion to compute.
    const luminance = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    const distance = Math.abs(luminance - 0.5);
    if (distance < worstDistance) {
      worstDistance = distance;
      worst = stop;
    }
  }
  return worst.color;
}
