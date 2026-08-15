/** One star, in normalised 0–1 space. */
export interface FieldPoint {
  /** Horizontal position, 0–1 across the viewport. */
  x: number;
  /** Vertical position, 0–1 down the viewport. */
  y: number;
  /** Radius in CSS pixels before the device ratio is applied. */
  r: number;
  /** Base opacity before either oscillator is applied. */
  alpha: number;
  /** Where in its twinkle cycle it starts. */
  phase: number;
  /** How fast it twinkles. */
  speed: number;
  /** Where in its second, slower shimmer it starts. */
  shimmerPhase: number;
  /** How fast that second oscillator runs. */
  flicker: number;
  /** How far between the theme's two colours it sits, 0–1. */
  tint: number;
}

/** One layer of the sky, drawn at its own density and brightness. */
export interface StarLayer {
  /** The stars. */
  stars: FieldPoint[];
  /** Multiplies every star's alpha, which is what makes the layers read apart. */
  brightness: number;
}

/**
 * A deterministic pseudo-random source.
 *
 * xorshift32, because this needs to be **the same sky on every render and on
 * every machine** and `Math.random` is neither. A field that reshuffled on each
 * resize would shimmer whenever somebody dragged a window, and one that differed
 * between the server and the client would be a hydration mismatch. This is the
 * one place this deliberately parts company with the canvas it is modelled on,
 * which rebuilds from `Math.random` on every resize.
 *
 * @param seed - any integer.
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
    // come back negative and every star lands off the left of the screen.
    return (state >>> 0) / 0xffffffff;
  };
}

/**
 * The three layers of the sky, far to near.
 *
 * **Density, size and brightness all rise together toward the front**, which is
 * what produces depth: the far layer is a haze of faint specks, the near one a
 * scattering of distinct stars. One flat layer — which is what this was — reads
 * as noise on a background rather than as a sky.
 *
 * **`yBias` pulls stars toward the top.** `random ** 6` spends most of its range
 * near zero, so the field is dense overhead and thins toward the horizon. It is
 * the single change that makes a scatter of dots look like a sky, and it is
 * worth more than any of the shimmer.
 *
 * @param seed - which sky.
 * @param count - how many stars in the far layer; the others scale from it.
 * @returns the layers, far first, in a stable order.
 */
export function starfield(seed: number, count: number): StarLayer[] {
  const random = seeded(seed);

  const build = (
    n: number,
    yLimit: number,
    yBias: number,
    rMin: number,
    rRange: number,
    aMin: number,
    aRange: number,
    sMin: number,
    sRange: number,
  ): FieldPoint[] =>
    Array.from({ length: n }, () => ({
      x: random(),
      y: random() ** yBias * yLimit,
      r: rMin + random() * rRange,
      alpha: aMin + random() * aRange,
      phase: random(),
      speed: sMin + random() * sRange,
      shimmerPhase: random(),
      flicker: 0.18 + random() * 0.82,
      tint: random(),
    }));

  return [
    {
      stars: build(count, 0.94, 6, 0.3, 0.9, 0.08, 0.24, 0.35, 1.2),
      brightness: 0.74,
    },
    {
      stars: build(
        Math.round(count * 0.38),
        0.86,
        5.4,
        0.6,
        1.2,
        0.16,
        0.42,
        0.6,
        1.4,
      ),
      brightness: 0.96,
    },
    {
      stars: build(
        Math.round(count * 0.16),
        0.78,
        4.8,
        0.9,
        1.8,
        0.28,
        0.54,
        0.95,
        2,
      ),
      brightness: 1.14,
    },
  ];
}

/**
 * How bright a star is at a moment.
 *
 * **Two oscillators, not one.** A single sine gives every star the same shape of
 * pulse and the field breathes in unison; a second, slower one at an unrelated
 * rate breaks that up, and the product of the two is what reads as twinkling
 * rather than as fading. The second is `abs(sin)`, so it spends longer dim than
 * bright — which is the asymmetry a real star has.
 *
 * Clamped away from zero at the bottom: a star that blinks fully out reads as a
 * rendering fault. Clamped below one at the top so nothing blows out to white.
 *
 * @param star - the star.
 * @param seconds - elapsed time in seconds.
 * @param brightness - the layer's multiplier.
 * @returns an alpha between 0.004 and 0.95.
 */
export function twinkle(
  star: FieldPoint,
  seconds: number,
  brightness: number,
): number {
  const wave = 0.55 + 0.45 * Math.sin(seconds * star.speed + star.phase * TAU);
  const pulse =
    0.2 +
    0.8 *
      Math.abs(
        Math.sin(
          seconds * (0.3 + star.flicker * 0.9) + star.shimmerPhase * TAU,
        ),
      );
  return Math.min(
    0.95,
    Math.max(0.004, star.alpha * wave * pulse * brightness),
  );
}

/** One turn, in radians. */
const TAU = Math.PI * 2;

/** One streak crossing the sky. */
export interface Shot {
  /** Where it starts, 0–1 across the viewport. */
  x: number;
  /** Where it starts, 0–1 down the viewport. */
  y: number;
  /** How long it takes to cross, in seconds. */
  ttl: number;
  /** When in the cycle it begins, in seconds. */
  at: number;
  /** How long its tail is, as a fraction of the viewport width. */
  length: number;
}

/**
 * The shooting stars, and when each one runs.
 *
 * **Precomputed rather than spawned**, which is the one structural change from
 * the canvas this copies. That one pushes to an array on a random timer and
 * splices dead entries out; this states up front when each streak begins and
 * how long it lasts, and the draw step asks which are alive. Same effect, and
 * it keeps the whole field deterministic — no accumulated state to diverge
 * between two renders, and nothing to leak if a frame is dropped.
 *
 * @param seed - which sky.
 * @param count - how many streaks are in the cycle.
 * @param cycle - how long the cycle is, in seconds.
 * @returns the streaks, in a stable order.
 */
export function shootingStars(
  seed: number,
  count: number,
  cycle: number,
): Shot[] {
  const random = seeded(seed ^ 0x5f5f);
  return Array.from({ length: count }, (_, i) => ({
    // Spread across the cycle rather than placed at random, so two streaks do
    // not land together and leave the rest of the cycle empty.
    at: (i / count) * cycle + random() * (cycle / count) * 0.6,
    x: 0.26 + random() * 0.58,
    y: 0.08 + random() * 0.24,
    ttl: 0.95 + random() * 0.75,
    length: 0.08 + random() * 0.08,
  }));
}

/**
 * How far through its flight a streak is, or null when it is not flying.
 *
 * @param shot - the streak.
 * @param seconds - elapsed time in seconds.
 * @param cycle - the cycle length the streak was built for.
 * @returns progress from 0 to 1, or null.
 */
export function shotProgress(
  shot: Shot,
  seconds: number,
  cycle: number,
): number | null {
  const into = (((seconds - shot.at) % cycle) + cycle) % cycle;
  return into < shot.ttl ? into / shot.ttl : null;
}

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

/** One drifting point in a constellation. */
export interface Node {
  /** Where it sits, 0..1 across the viewport. */
  x: number;
  /** Where it sits, 0..1 down the viewport. */
  y: number;
  /** How far it travels from that place, as a fraction of the viewport. */
  drift: number;
  /** How fast it goes round, in turns per second. */
  speed: number;
  /** Where in its circuit it starts, in radians. */
  phase: number;
}

/**
 * A field of points that drift and are joined when they come close.
 *
 * **The joining is the whole effect**, and it is why the points drift on small
 * circles rather than travelling: a point crossing the viewport leaves and
 * never comes back, so a drifting field has to be re-seeded, and a re-seed is
 * visible as a jump. A circuit means every point is always somewhere sensible
 * and the pattern of links keeps changing anyway, because the links depend on
 * distances between points and not on the points themselves.
 *
 * @param count - how many points.
 * @param seed - the seed to place them from.
 * @returns the points, in no particular order.
 */
export function constellation(count: number, seed: number): Node[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    drift: 0.02 + random() * 0.05,
    speed: 0.02 + random() * 0.05,
    phase: random() * TAU,
  }));
}

/**
 * Where a drifting point is at a given moment.
 *
 * @param node - the point.
 * @param seconds - seconds since the animation started.
 * @returns its position, 0..1 in each axis.
 */
export function nodeAt(node: Node, seconds: number): { x: number; y: number } {
  const angle = node.phase + seconds * node.speed * TAU;
  return {
    x: node.x + Math.cos(angle) * node.drift,
    y: node.y + Math.sin(angle) * node.drift,
  };
}

/** One band in a field of waves. */
export interface Wave {
  /** Where its resting line sits, 0..1 down the viewport. */
  level: number;
  /** How tall its crests are, as a fraction of the viewport. */
  height: number;
  /** How many crests fit across the viewport. */
  length: number;
  /** How fast it travels, in viewports per second. */
  speed: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Bands of moving water, stacked back to front.
 *
 * Each band is **slower and taller than the one behind it**, which is the whole
 * of the depth: a set of waves sharing one speed reads as a single striped
 * object sliding sideways, however many of them there are.
 *
 * @param count - how many bands.
 * @param seed - the seed to vary them from.
 * @returns the bands, back to front.
 */
export function waves(count: number, seed: number): Wave[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const depth = i / Math.max(1, count - 1);
    return {
      level: 0.45 + depth * 0.4 + (random() - 0.5) * 0.05,
      height: 0.03 + depth * 0.05 + random() * 0.02,
      length: 1.6 - depth * 0.7 + random() * 0.3,
      speed: 0.05 + (1 - depth) * 0.09 + random() * 0.02,
      tint: i % 3,
    };
  });
}

/** One rising bubble. */
export interface Bubble {
  /** Where it rises, 0..1 across the viewport. */
  x: number;
  /** Its radius, as a fraction of the viewport's smaller side. */
  radius: number;
  /** How fast it climbs, in viewports per second. */
  speed: number;
  /** How far it wanders sideways, as a fraction of the viewport. */
  wander: number;
  /** Where in its climb it starts, 0..1. */
  offset: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Bubbles climbing from the bottom of the viewport.
 *
 * The vertical position is `(offset + t * speed) % 1`, so a bubble that reaches
 * the top reappears at the bottom without any bookkeeping — and because each
 * carries its own offset, they do not all restart together.
 *
 * @param count - how many bubbles.
 * @param seed - the seed to place them from.
 * @returns the bubbles.
 */
export function bubbles(count: number, seed: number): Bubble[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: random(),
    radius: 0.004 + random() ** 2 * 0.03,
    speed: 0.02 + random() * 0.06,
    wander: 0.01 + random() * 0.03,
    offset: random(),
    tint: (i % 2) as 0 | 1,
  }));
}

/** One falling flake. */
export interface Flake {
  /** Where it falls, 0..1 across the viewport. */
  x: number;
  /** Its radius, as a fraction of the viewport's smaller side. */
  radius: number;
  /** How fast it falls, in viewports per second. */
  speed: number;
  /** How far it swings sideways, as a fraction of the viewport. */
  sway: number;
  /** How fast it swings, in turns per second. */
  swaySpeed: number;
  /** Where in its fall it starts, 0..1. */
  offset: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Snow, falling and swinging.
 *
 * **Size, speed and sway are correlated on purpose.** A near flake is larger,
 * faster and swings wider; a far one is small, slow and nearly straight. Rolling
 * the three independently gives big slow flakes beside small fast ones, which
 * reads as noise rather than as depth.
 *
 * @param count - how many flakes.
 * @param seed - the seed to place them from.
 * @returns the flakes.
 */
export function snow(count: number, seed: number): Flake[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const near = random();
    return {
      x: random(),
      radius: 0.0015 + near * 0.004,
      speed: 0.02 + near * 0.07,
      sway: 0.004 + near * 0.02,
      swaySpeed: 0.1 + random() * 0.3,
      offset: random(),
      tint: (i % 2) as 0 | 1,
    };
  });
}

/** One soft drifting glow. */
export interface Blob {
  /** Where it sits, 0..1 across the viewport. */
  x: number;
  /** Where it sits, 0..1 down the viewport. */
  y: number;
  /** Its radius, as a fraction of the viewport's larger side. */
  radius: number;
  /** How far it wanders, as a fraction of the viewport. */
  drift: number;
  /** How fast it wanders, in turns per second. */
  speed: number;
  /** Where in its wander it starts, in radians. */
  phase: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * A few large, soft glows drifting past each other.
 *
 * Few and large rather than many and small: the effect is colours bleeding into
 * one another, which needs the glows to overlap. A dozen small ones read as
 * spots, which is the bubbles.
 *
 * Each wanders on its own ellipse — `drift` is used unequally in the two axes
 * by the renderer — so two glows sharing a speed do not travel in parallel.
 *
 * @param count - how many glows.
 * @param seed - the seed to place them from.
 * @returns the glows.
 */
export function blobs(count: number, seed: number): Blob[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: 0.2 + random() * 0.6,
    y: 0.2 + random() * 0.6,
    radius: 0.25 + random() * 0.3,
    drift: 0.05 + random() * 0.12,
    speed: 0.01 + random() * 0.03,
    phase: random() * TAU,
    tint: i % 3,
  }));
}
