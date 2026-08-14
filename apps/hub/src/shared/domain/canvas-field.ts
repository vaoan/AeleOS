/** One point of a starfield, in normalised 0–1 space. */
export interface FieldPoint {
  /** Horizontal position, 0–1 across the viewport. */
  x: number;
  /** Vertical position, 0–1 down the viewport. */
  y: number;
  /** Radius in CSS pixels before the device ratio is applied. */
  r: number;
  /** Where in its twinkle cycle this point starts, 0–1. */
  phase: number;
  /** How fast it drifts and twinkles, relative to the others. */
  speed: number;
  /** Which of the two theme colours it takes: 0 for `a`, 1 for `b`. */
  tint: 0 | 1;
}

/**
 * A deterministic pseudo-random source.
 *
 * xorshift32, because this needs to be **the same field on every render and on
 * every machine** and `Math.random` is neither. A starfield that reshuffled on
 * each resize would shimmer whenever somebody dragged a window, and one that
 * differed between the server and the client would be a hydration mismatch.
 *
 * @param seed - any non-zero integer.
 * @returns a function yielding successive values in 0–1.
 */
export function seeded(seed: number): () => number {
  // Zero is the one state xorshift cannot leave, so it is replaced rather than
  // trusted not to arrive.
  let state = seed | 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // `>>> 0` makes it unsigned before the divide; without it half the values
    // come back negative and every point lands off the left of the screen.
    return (state >>> 0) / 0xffffffff;
  };
}

/**
 * A starfield, in normalised space.
 *
 * Normalised rather than in pixels so the same field survives a resize: the
 * canvas multiplies by the current width and height each frame, and nothing has
 * to be regenerated when a window changes shape.
 *
 * Radii are weighted toward the small end — `r ** 2` rather than `r` — because
 * a field of evenly sized dots reads as a texture rather than as a sky. Most
 * stars are faint and a few are not, which is what gives it depth.
 *
 * @param count - how many points.
 * @param seed - which field.
 * @returns the points, in a stable order.
 */
export function starfield(count: number, seed: number): FieldPoint[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    r: 0.4 + random() ** 2 * 1.6,
    phase: random(),
    speed: 0.3 + random() * 0.9,
    tint: (random() < 0.5 ? 0 : 1) as 0 | 1,
  }));
}

/**
 * How bright a point is at a moment.
 *
 * A sine so it eases at both ends rather than pulsing linearly, and it never
 * reaches zero — a star that blinks fully out reads as a rendering fault rather
 * than as a sky.
 *
 * @param point - the point.
 * @param seconds - elapsed time in seconds.
 * @returns an alpha between `MIN_TWINKLE` and 1.
 */
export function twinkle(point: FieldPoint, seconds: number): number {
  const wave = Math.sin(
    (point.phase + seconds * point.speed * 0.35) * Math.PI * 2,
  );
  return MIN_TWINKLE + ((wave + 1) / 2) * (1 - MIN_TWINKLE);
}

/** The dimmest a star goes. Never zero — see {@link twinkle}. */
const MIN_TWINKLE = 0.25;

/** One vertical curtain of an aurora. */
export interface Curtain {
  /** Where its centre sits, 0–1 across the viewport. */
  centre: number;
  /** How wide it is, as a fraction of the viewport. */
  width: number;
  /** How far it sways, as a fraction of the viewport. */
  sway: number;
  /** Its own rate, relative to the others. */
  speed: number;
  /** Which of the two theme colours it takes. */
  tint: 0 | 1;
}

/**
 * The curtains of an aurora.
 *
 * Deliberately few and wide. The failure mode of this effect is a picket fence
 * — many narrow bands that read as stripes — so the widths start above a third
 * of the viewport and the count is small.
 *
 * @param count - how many curtains.
 * @param seed - which aurora.
 * @returns the curtains, in a stable order.
 */
export function aurora(count: number, seed: number): Curtain[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    // Spread across the viewport rather than placed at random: a random centre
    // clusters, and two curtains on top of each other is one bright smear.
    centre: (i + 0.5) / count + (random() - 0.5) * 0.15,
    width: 0.35 + random() * 0.3,
    sway: 0.04 + random() * 0.08,
    speed: 0.25 + random() * 0.5,
    tint: (i % 2) as 0 | 1,
  }));
}

/**
 * Where a curtain's centre sits at a moment.
 *
 * @param curtain - the curtain.
 * @param seconds - elapsed time in seconds.
 * @returns its centre, 0–1 across the viewport.
 */
export function swayOf(curtain: Curtain, seconds: number): number {
  return curtain.centre + Math.sin(seconds * curtain.speed) * curtain.sway;
}
