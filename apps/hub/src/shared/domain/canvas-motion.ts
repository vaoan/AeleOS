import { slotsFor } from "@/shared/domain/canvas-slots";

/**
 * How much a canvas may be turned up or down.
 *
 * One range for all three. They could each have their own — five times the
 * speed is frantic where five times the size is merely large — but a dial that
 * stops at a different place from the one beside it, for no reason a person can
 * see, is worse than one that goes somewhere they will not want to leave it.
 *
 * **Two dials, not one.** Busy and fast are different complaints and different
 * fixes: a starfield can be crowded and still, and a single box can hurtle. A
 * combined "intensity" would move both and be wrong for one of them every time.
 *
 * The floor is not zero. Zero density is an empty canvas, which `none` already
 * says better and reversibly; zero speed is a frozen one, which
 * `prefers-reduced-motion` already gives to whoever asked for it. Neither wants
 * a second way to be reached by accident from a slider somebody dragged too far.
 */
export const CANVAS_RANGE = {
  /** The least either dial may be. */
  min: 0.25,
  /**
   * The most any dial may be.
   *
   * Five rather than three, because three was not much of a zoom: the point of
   * the size dial is a canvas that reads as a different one, and a starfield
   * only 3x larger still reads as the same sky. The caps below are what keep
   * the cost of that bounded, so raising this is safe in a way that removing
   * them would not be.
   */
  max: 5,
  /** What both are when nobody has touched them. */
  default: 1,
} as const;

/**
 * How many of a thing to draw, given the density somebody chose.
 *
 * **Capped, and the cap is not decoration.** The constellation compares every
 * pair of points, so its cost is the SQUARE of this number: at three times
 * density an uncapped field would be nine times the work, on a canvas that has
 * to hold sixty frames a second on somebody's phone. The cap is per canvas
 * because only some of them have that shape.
 *
 * @param base - how many at the default density.
 * @param density - the dial, already clamped.
 * @param cap - the most this canvas may draw whatever the dial says.
 * @returns how many to draw, at least one.
 */
export function many(base: number, density: number, cap = Infinity): number {
  return Math.max(1, Math.min(cap, Math.round(base * density)));
}

/**
 * Reads a dial, refusing anything that is not a usable number.
 *
 * Values arrive from a `jsonb` column and from a computed style, so `NaN`, an
 * empty string and a hostile number are all ordinary inputs rather than faults.
 * Every one of them falls back to the default, which is the same rule
 * `parseTheme` applies to every other field.
 *
 * @param value - whatever was stored or computed.
 * @returns a number inside the range.
 */
export function dial(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    return CANVAS_RANGE.default;
  }
  return Math.min(CANVAS_RANGE.max, Math.max(CANVAS_RANGE.min, parsed));
}

/**
 * Whether a canvas draws anything a dial could change.
 *
 * `none` is the one that does not, and offering somebody a density slider for
 * an empty canvas is the control-that-does-nothing this feature keeps being
 * trimmed for.
 *
 * @param canvas - the chosen canvas.
 * @returns true when the dials are worth showing.
 */
export function dialsApply(canvas: string): boolean {
  // `slotsFor` rather than an index and a `??`, and the difference is not
  // style. `CANVAS_SLOTS["toString"]` returns the INHERITED function, so the
  // nullish fallback is never reached and the comparison only happens to be
  // false. `slotsFor` asks `Object.hasOwn`, which is the trap this repository
  // has documented twice and which I walked into again here — caught by the
  // branch never being taken rather than by the behaviour being wrong.
  return slotsFor(canvas) > 0;
}
