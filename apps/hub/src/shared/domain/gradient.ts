import { parseHex, toHex } from "@/shared/domain/color";

/** One colour, at one place along the gradient. */
export interface GradientStop {
  /** The colour, as `#rrggbb`. */
  color: string;
  /** Where it sits, 0 at the start and 100 at the end. */
  at: number;
}

/**
 * The kinds of gradient CSS has.
 *
 * All three, because they are genuinely different shapes rather than three
 * settings of one: a linear runs along an axis, a radial runs outward from a
 * point, and a conic runs AROUND one. Offering only the first made the control
 * look like the whole of what a background could be.
 */
export const GRADIENT_KINDS = ["linear", "radial", "conic"] as const;

/** Which shape a background's gradient runs in. */
export type GradientKind = (typeof GRADIENT_KINDS)[number];

/** The two shapes a radial gradient may take. */
export const RADIAL_SHAPES = ["ellipse", "circle"] as const;

/** A radial gradient's shape. */
export type RadialShape = (typeof RADIAL_SHAPES)[number];

/**
 * How far a radial gradient reaches before its last stop.
 *
 * CSS's four `<extent-keyword>`s, in the order they grow. They are the reason a
 * radial gradient is not just "a circle": the same stops against
 * `closest-side` and `farthest-corner` are two different backgrounds, and on a
 * page that is not square the difference is large.
 */
export const RADIAL_EXTENTS = [
  "closest-side",
  "closest-corner",
  "farthest-side",
  "farthest-corner",
] as const;

/** How far a radial gradient reaches. */
export type RadialExtent = (typeof RADIAL_EXTENTS)[number];

/**
 * A page's background.
 *
 * **Every field but the stops is only read by some of the kinds**, and the
 * picker renders a control for a field only where the chosen kind reads it. A
 * radial gradient has no direction, a linear one has no centre, and the length
 * of a repetition means nothing while repetition is off. Storing them anyway
 * is deliberate: switching kind and back keeps what somebody had set.
 */
export interface Gradient {
  /** Which shape it runs in. */
  kind: GradientKind;
  /**
   * Whether the stops repeat outward.
   *
   * Paired with `every`, never alone — see that field for why.
   */
  repeating: boolean;
  /**
   * How much of the gradient one repetition covers, as a percentage.
   *
   * **Repeating without this does nothing, which is why the two ship
   * together.** `repeating-linear-gradient` restates its stops beyond the last
   * one — so stops spanning 0 to 100, which is what every gradient here starts
   * with, leave no room after the last and render identically to the plain
   * form. Somebody would turn repetition on, see no change, and have no way to
   * learn that the stops were the reason. The stops are scaled into this length
   * instead, so the switch always does something visible.
   *
   * Ignored entirely when `repeating` is false.
   */
  every: number;
  /**
   * Which way it runs, in degrees. 0 points up, 90 points right.
   *
   * A linear gradient's direction, and a conic gradient's starting angle. A
   * radial gradient has no direction and ignores it.
   */
  angle: number;
  /** A radial gradient's shape. Ignored by the other kinds. */
  shape: RadialShape;
  /** How far a radial gradient reaches. Ignored by the other kinds. */
  extent: RadialExtent;
  /**
   * Where a radial or conic gradient is centred, as a percentage across.
   *
   * Ignored by a linear gradient, which has a direction rather than a centre.
   */
  x: number;
  /** Where a radial or conic gradient is centred, as a percentage down. */
  y: number;
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
 *
 * It opens on a **linear** gradient that does not repeat, which is what this
 * app could make before it could make anything else — so a theme promoted today
 * looks like a theme promoted before the other kinds existed. The fields the
 * other kinds read carry CSS's own defaults, an ellipse to the farthest corner
 * centred in the middle, so choosing a kind is one click rather than four.
 */
export const DEFAULT_GRADIENT: Gradient = {
  kind: "linear",
  repeating: false,
  every: 25,
  angle: 160,
  shape: "ellipse",
  extent: "farthest-corner",
  x: 50,
  y: 50,
  stops: [
    { color: "#fbf4ec", at: 0 },
    { color: "#f3e3d3", at: 100 },
  ],
};

/**
 * The shortest and longest one repetition may be.
 *
 * The floor is not zero and not close to it. A repetition of a few percent is
 * a moiré rather than a background — it renders as flicker at most sizes, and
 * it is the kind of thing a slider reaches by accident on the way somewhere
 * else. The ceiling is the whole gradient, which is repetition doing nothing,
 * and it is where the slider starts.
 */
export const REPEAT_RANGE = { min: 5, max: 100 } as const;

/**
 * Reads a value that must be one of a fixed set.
 *
 * @param value - whatever was stored.
 * @param allowed - the set.
 * @param fallback - what to use when it is not one of them.
 * @returns one of the allowed values.
 */
function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Reads a stored number, clamped and rounded.
 *
 * @param value - whatever was stored.
 * @param low - the smallest allowed.
 * @param high - the largest allowed.
 * @param fallback - what to use when it is not a finite number.
 * @returns a whole number within the range.
 */
function within(
  value: unknown,
  low: number,
  high: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(low, Math.min(high, Math.round(value)));
}

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
 * **A background stored before this app could make anything but a linear
 * gradient reads back as exactly that gradient.** Every field but the stops
 * falls back to the default, so absence already means "the old shape" and no
 * version marker is needed to say so. A value outside one of the fixed lists —
 * a kind, a radial shape, an extent — falls back the same way rather than
 * throwing, for the same reason a bad colour is dropped: a public page must
 * still render.
 *
 * @param value - whatever was stored.
 * @returns the gradient, or null to override nothing.
 */
export function parseGradient(value: unknown): Gradient | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
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
  return {
    // Every field but the stops falls back to the default, so a background
    // stored before this app had anything but linear gradients reads back as
    // exactly the linear gradient it was. There is no version marker and there
    // does not need to be one: absence already means "the old shape".
    kind: oneOf(raw.kind, GRADIENT_KINDS, DEFAULT_GRADIENT.kind),
    repeating: raw.repeating === true,
    every: within(
      raw.every,
      REPEAT_RANGE.min,
      REPEAT_RANGE.max,
      DEFAULT_GRADIENT.every,
    ),
    angle,
    shape: oneOf(raw.shape, RADIAL_SHAPES, DEFAULT_GRADIENT.shape),
    extent: oneOf(raw.extent, RADIAL_EXTENTS, DEFAULT_GRADIENT.extent),
    x: within(raw.x, 0, 100, DEFAULT_GRADIENT.x),
    y: within(raw.y, 0, 100, DEFAULT_GRADIENT.y),
    stops: tidy(stops),
  };
}

/**
 * The gradient as a CSS value.
 *
 * A **single stop renders as a gradient from that colour to itself**, not as
 * a bare `#rrggbb`. Visually the two are identical — a flat fill either way —
 * but only the gradient form is a valid CSS `<image>`. This return value is
 * `--field` (see `derivePalette`), and `--field` is now a LAYER in a
 * multi-layer `background-image` list — `bodyBackgroundVars` in
 * `actor-theme.ts` writes `background-image: url(picture), var(--field)` on
 * `body` so an author's picture paints above their own colour. A bare colour
 * is not a valid `<image>`, and one invalid layer makes the WHOLE
 * `background-image` declaration invalid — which used to mean picking a
 * single-stop background silently deleted the picture layer beside it. This
 * used to say the flat form was kept because it is "what somebody reading the
 * stylesheet expects" — true, and the wrong thing to optimise for once this
 * value became load-bearing in a second sink it has no way to know about.
 *
 * Every number here is generated — angles and positions are rounded integers,
 * colours are rebuilt by `toHex` — so nothing a person typed reaches the
 * string. That is what keeps it safe to put in a stylesheet.
 *
 * **Repetition scales the stops rather than trusting them.** A repeating
 * gradient restates its stops beyond the last one, so stops spanning the whole
 * length repeat outside what is drawn and render identically to the plain form.
 * Positions are compressed into `every` first, which is what makes the switch
 * do something for every gradient somebody already had.
 *
 * @param gradient - the background.
 * @returns a CSS gradient — a degenerate one, from a colour to itself, for a
 *   single stop.
 */
export function gradientCss(gradient: Gradient): string {
  const stops = tidy(gradient.stops);
  // A degenerate gradient rather than a bare colour, even for one stop: this
  // return value has to stay a valid CSS <image> at every stop count — see
  // the doc above for why a bare colour broke silently the moment it became
  // one layer of several.
  if (stops.length === 1) {
    return `linear-gradient(${stops[0]!.color}, ${stops[0]!.color})`;
  }

  // A radial or a conic gradient between a colour and itself is the same flat
  // colour regardless of shape, so every kind collapses to the same linear
  // form above for one stop — there is no "flat radial" to distinguish it
  // from a "flat linear".

  const span = gradient.repeating ? gradient.every / 100 : 1;
  const parts = stops
    .map((stop) => `${stop.color} ${Math.round(stop.at * span)}%`)
    .join(", ");
  const prefix = gradient.repeating ? "repeating-" : "";
  const at = `at ${gradient.x}% ${gradient.y}%`;

  if (gradient.kind === "radial") {
    return `${prefix}radial-gradient(${gradient.shape} ${gradient.extent} ${at}, ${parts})`;
  }
  if (gradient.kind === "conic") {
    return `${prefix}conic-gradient(from ${gradient.angle}deg ${at}, ${parts})`;
  }
  return `${prefix}linear-gradient(${gradient.angle}deg, ${parts})`;
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
