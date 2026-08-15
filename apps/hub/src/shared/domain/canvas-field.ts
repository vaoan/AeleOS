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

/** One point on an orbit. */
export interface Orbiter {
  /** How far from the centre, as a fraction of the viewport's smaller side. */
  radius: number;
  /** How fast it goes round, in turns per second. */
  speed: number;
  /** Where it starts, in radians. */
  phase: number;
  /** How long a trail it drags, in radians. */
  trail: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Points going round a common centre, each dragging a trail.
 *
 * **The trail is an arc behind the point, not a record of where it has been.**
 * A real trail needs the canvas not to be cleared, and every renderer here is a
 * pure function of seed and time — which is what lets a page be themed, resized
 * or re-read without the animation carrying state from before. An arc of the
 * same length is indistinguishable and costs nothing to reproduce.
 *
 * @param count - how many points.
 * @param seed - the seed to vary them from.
 * @returns the points.
 */
export function orbits(count: number, seed: number): Orbiter[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    radius: 0.08 + random() * 0.42,
    // Signed, so the rings do not all turn the same way — a field turning as
    // one reads as a single rotating object rather than as orbits.
    speed: (0.02 + random() * 0.06) * (random() < 0.5 ? -1 : 1),
    phase: random() * TAU,
    trail: 0.2 + random() * 0.9,
    tint: i % 3,
  }));
}

/** One cell of a honeycomb. */
export interface Cell {
  /** Its centre, 0..1 across the viewport. */
  x: number;
  /** Its centre, 0..1 down the viewport. */
  y: number;
  /** How fast it breathes, in turns per second. */
  speed: number;
  /** Where in that breath it starts, in radians. */
  phase: number;
}

/**
 * A honeycomb, laid out on a real hexagonal lattice.
 *
 * Odd rows are offset by half a column and the rows are spaced by three
 * quarters of a cell's height — that ratio is what makes hexagons tessellate.
 * Spacing them like a square grid leaves gaps that read as a mistake.
 *
 * @param columns - how many cells across.
 * @param rows - how many cells down.
 * @param seed - the seed to vary their breathing from.
 * @returns the cells.
 */
export function honeycomb(columns: number, rows: number, seed: number): Cell[] {
  const random = seeded(seed);
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        x: (column + (row % 2 === 0 ? 0 : 0.5)) / columns,
        y: (row * 0.75) / rows,
        speed: 0.08 + random() * 0.25,
        phase: random() * TAU,
      });
    }
  }
  return cells;
}

/** One ribbon of light. */
export interface Ribbon {
  /** Where it crosses the viewport, 0..1 down. */
  level: number;
  /** How far it swings from that line, as a fraction of the viewport. */
  swing: number;
  /** How thick it is, as a fraction of the viewport. */
  thickness: number;
  /** How many bends fit across the viewport. */
  bends: number;
  /** How fast it travels, in viewports per second. */
  speed: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Long bands of light crossing the viewport.
 *
 * A ribbon is drawn as a band between two offset sine curves rather than as a
 * thick stroke, so its width can vary along its length — which is the
 * difference between a ribbon and a wire.
 *
 * @param count - how many ribbons.
 * @param seed - the seed to vary them from.
 * @returns the ribbons.
 */
export function ribbons(count: number, seed: number): Ribbon[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    level: (i + 0.5) / count + (random() - 0.5) * 0.12,
    swing: 0.05 + random() * 0.12,
    thickness: 0.02 + random() * 0.05,
    bends: 0.8 + random() * 1.4,
    speed: 0.03 + random() * 0.06,
    tint: i % 3,
  }));
}

/** One piece of falling confetti. */
export interface Confetto {
  /** Where it falls, 0..1 across the viewport. */
  x: number;
  /** Its size, as a fraction of the viewport's smaller side. */
  size: number;
  /** How fast it falls, in viewports per second. */
  speed: number;
  /** How fast it tumbles, in turns per second. */
  spin: number;
  /** How far it drifts sideways, as a fraction of the viewport. */
  drift: number;
  /** Where in its fall it starts, 0..1. */
  offset: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Confetti, falling and tumbling.
 *
 * The tumble is what separates this from snow: a rectangle spun about its
 * centre presents a changing width, so a piece appears to flip edge-on and
 * vanish for an instant. Round particles cannot do that at any size.
 *
 * @param count - how many pieces.
 * @param seed - the seed to place them from.
 * @returns the pieces.
 */
export function confetti(count: number, seed: number): Confetto[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: random(),
    size: 0.004 + random() * 0.008,
    speed: 0.05 + random() * 0.12,
    spin: 0.2 + random() * 0.8,
    drift: 0.01 + random() * 0.04,
    offset: random(),
    tint: i % 4,
  }));
}

/** One building in a skyline. */
export interface Building {
  /** Where its left edge sits, in layer-widths from the start. */
  at: number;
  /** How wide it is, in layer-widths. */
  width: number;
  /** How tall it is, as a fraction of the viewport. */
  height: number;
}

/** One layer of a skyline, nearer or further. */
export interface Skyline {
  /** The buildings, left to right. */
  buildings: Building[];
  /** How fast the layer scrolls, in viewports per second. */
  speed: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Layers of buildings, nearer ones taller and faster.
 *
 * **Each layer's buildings tile exactly one layer-width**, so the renderer can
 * draw it twice side by side and scroll for ever without a seam. Generating a
 * screen's worth and wrapping the position instead leaves a visible cut every
 * time it repeats.
 *
 * @param layers - how many layers, far to near.
 * @param seed - the seed to build them from.
 * @returns the layers, far to near.
 */
export function skyline(layers: number, seed: number): Skyline[] {
  const random = seeded(seed);
  return Array.from({ length: layers }, (_, i) => {
    const near = i / Math.max(1, layers - 1);
    const buildings: Building[] = [];
    let at = 0;
    while (at < 1) {
      const width = 0.03 + random() * 0.06;
      buildings.push({
        at,
        width,
        height: 0.08 + near * 0.22 + random() * (0.06 + near * 0.12),
      });
      at += width;
    }
    return { buildings, speed: 0.004 + near * 0.02, tint: i % 3 };
  });
}

/** One out-of-focus spot of light. */
export interface Spot {
  /** Where it sits, 0..1 across the viewport. */
  x: number;
  /** Where it sits, 0..1 down the viewport. */
  y: number;
  /** Its radius, as a fraction of the viewport's smaller side. */
  radius: number;
  /** How far it wanders, as a fraction of the viewport. */
  drift: number;
  /** How fast it wanders, in turns per second. */
  speed: number;
  /** Where in that wander it starts, in radians. */
  phase: number;
  /** How bright it is, 0..1. */
  glow: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Out-of-focus spots of light, drifting.
 *
 * **Size and brightness move together**, because that is what being out of
 * focus does: a nearer light spreads over more of the lens and is dimmer for
 * it. Rolling them apart gives small bright discs beside large dull ones, which
 * reads as flat circles rather than as depth of field.
 *
 * @param count - how many spots.
 * @param seed - the seed to place them from.
 * @returns the spots.
 */
export function bokeh(count: number, seed: number): Spot[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const near = random();
    return {
      x: random(),
      y: random(),
      radius: 0.02 + near * 0.1,
      drift: 0.01 + random() * 0.04,
      speed: 0.01 + random() * 0.04,
      phase: random() * TAU,
      glow: 0.35 - near * 0.22,
      tint: i % 3,
    };
  });
}

/**
 * A value that bounces between 0 and 1 instead of wrapping.
 *
 * **The whole of a screensaver's motion is this function.** A modulo wraps —
 * the thing leaves one edge and reappears at the other, which is a teleport.
 * Folding the sawtooth back on itself is a reflection, and a reflection is a
 * bounce. Every retro saver here is built from it, which is also why none of
 * them needs to remember a velocity.
 *
 * @param value - how far along, unbounded.
 * @returns the folded position, 0..1.
 */
export function bounced(value: number): number {
  const wrapped = ((value % 2) + 2) % 2;
  return wrapped > 1 ? 2 - wrapped : wrapped;
}

/** One corner of a bouncing polygon. */
export interface Corner {
  /** How fast it crosses, in viewports per second. */
  speedX: number;
  /** How fast it descends, in viewports per second. */
  speedY: number;
  /** Where it starts across. */
  startX: number;
  /** Where it starts down. */
  startY: number;
}

/** A polygon whose corners bounce independently, with echoes behind it. */
export interface Mystified {
  /** Its corners. */
  corners: Corner[];
  /** How many echoes trail it. */
  echoes: number;
  /** How far apart the echoes are, in seconds. */
  spacing: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Polygons whose corners bounce around the viewport, trailing echoes.
 *
 * **Mystify, and the echoes are the whole point.** The original kept a history
 * of past shapes; this draws the same polygon at earlier TIMES instead, which
 * looks identical and needs no memory — `bounced` makes any past moment as
 * cheap to compute as the present one.
 *
 * @param count - how many polygons.
 * @param corners - how many corners each has.
 * @param seed - the seed to vary them from.
 * @returns the polygons.
 */
export function mystify(
  count: number,
  corners: number,
  seed: number,
): Mystified[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    corners: Array.from({ length: corners }, () => ({
      // Never zero, or a corner sits still and the polygon collapses to a
      // shape with a pinned vertex, which reads as broken rather than as calm.
      speedX: 0.03 + random() * 0.09,
      speedY: 0.03 + random() * 0.09,
      startX: random(),
      startY: random(),
    })),
    echoes: 5 + Math.floor(random() * 4),
    spacing: 0.35 + random() * 0.3,
    tint: i % 3,
  }));
}

/** A rectangle bouncing around the viewport. */
export interface Wanderer {
  /** Its width, as a fraction of the viewport. */
  width: number;
  /** Its height, as a fraction of the viewport. */
  height: number;
  /** How fast it crosses, in viewports per second. */
  speedX: number;
  /** How fast it descends, in viewports per second. */
  speedY: number;
  /** Where it starts across. */
  startX: number;
  /** Where it starts down. */
  startY: number;
}

/**
 * The bouncing logo, and its friends.
 *
 * Speeds are deliberately not in any tidy ratio: a rectangle whose two speeds
 * divide evenly retraces one path for ever, and the whole appeal of this is
 * waiting to see whether it hits a corner.
 *
 * @param count - how many rectangles.
 * @param seed - the seed to vary them from.
 * @returns the rectangles.
 */
export function wanderers(count: number, seed: number): Wanderer[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    width: 0.06 + random() * 0.06,
    height: 0.035 + random() * 0.035,
    speedX: 0.05 + random() * 0.07,
    speedY: 0.04 + random() * 0.06,
    startX: random(),
    startY: random(),
  }));
}

/** One column of falling glyphs. */
export interface Column {
  /** Where it sits, 0..1 across the viewport. */
  x: number;
  /** How fast the head falls, in viewports per second. */
  speed: number;
  /** How many glyphs trail the head. */
  length: number;
  /** Where the head starts, 0..1. */
  offset: number;
  /** Its own seed, so its glyphs differ from its neighbours'. */
  seed: number;
}

/**
 * Columns of glyphs falling down the viewport.
 *
 * Each column carries its own seed rather than sharing one, or every column
 * shows the same glyphs at the same moment and the screen reads as a single
 * scrolling image.
 *
 * Unchanged in behaviour; its seed constant keeps the unseparated hex form people recognise it by.
 *
 * @param count - how many columns.
 * @param seed - the seed to vary them from.
 * @returns the columns.
 */
export function rainColumns(count: number, seed: number): Column[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: (i + 0.5) / count,
    speed: 0.08 + random() * 0.3,
    length: 6 + Math.floor(random() * 16),
    offset: random(),
    seed: Math.floor(random() * 100_000),
  }));
}

/**
 * Which glyph a column shows at a given row and step.
 *
 * Deterministic in all three, so the same frame always draws the same
 * characters — a `Math.random()` here would make every glyph flicker at the
 * frame rate, which is noise rather than rain.
 *
 * Unchanged in behaviour; the bitwise mixing is deliberate int32 arithmetic and is left exactly as it was.
 *
 * @param column - the column's own seed.
 * @param row - which row down the column.
 * @param step - which change of glyph, from the clock.
 * @param alphabet - how many glyphs to choose between.
 * @returns the glyph's index.
 */
export function glyphAt(
  column: number,
  row: number,
  step: number,
  alphabet: number,
): number {
  // A cheap integer hash: multiply, mix the high bits down, take the modulus.
  let hash = (column * 73_856_093) ^ (row * 19_349_663) ^ (step * 83_492_791);
  hash = Math.imul(hash ^ (hash >>> 15), 2_246_822_519);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  return hash % alphabet;
}

/** One star streaking outward. */
export interface Streak {
  /** Which way it goes from the centre, in radians. */
  angle: number;
  /** How fast it flies, in viewports per second. */
  speed: number;
  /** Where in its flight it starts, 0..1. */
  offset: number;
}

/**
 * Stars flying outward from the centre, as through a windscreen.
 *
 * The distance grows by a SQUARE law rather than evenly: a star near the
 * centre is far away and barely moves, and one at the edge is passing the
 * viewer. Even spacing gives a flat disc of dots sliding outward, which is
 * exactly what the effect is not.
 *
 * @param count - how many stars.
 * @param seed - the seed to vary them from.
 * @returns the stars.
 */
export function warpStars(count: number, seed: number): Streak[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: random() * TAU,
    speed: 0.1 + random() * 0.35,
    offset: random(),
  }));
}

/**
 * Smooth 1D value noise, sampled at any point in time.
 *
 * **This is what an aurora is made of.** The previous one swayed each curtain
 * with a sine, which is a pendulum rather than a ribbon: every part of a
 * curtain moved together, so it read as a column sliding left and right. Value
 * noise gives neighbouring points along the ribbon slightly different offsets,
 * which is the folding an aurora actually does.
 *
 * Value noise rather than gradient (Perlin) noise, for the reason the technique
 * is usually chosen for this: it is a handful of lines, and the transitions it
 * makes are smooth enough at the scale a curtain is drawn. Gradient noise costs
 * more and would not be visible here.
 *
 * Cosine interpolation between lattice points, so the curve has no corners at
 * the integers — linear interpolation gives a ribbon visible creases.
 *
 * @param x - where to sample.
 * @param seed - which noise field to sample.
 * @returns a value in 0..1.
 */
export function valueNoise(x: number, seed: number): number {
  const whole = Math.floor(x);
  const part = x - whole;
  // A cheap integer hash per lattice point, so the field is deterministic in
  // both arguments and needs no table to be allocated or kept.
  const at = (i: number): number => {
    let hash = Math.imul(i ^ seed, 2_246_822_519);
    hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_917);
    return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
  };
  const eased = (1 - Math.cos(part * Math.PI)) / 2;
  return at(whole) * (1 - eased) + at(whole + 1) * eased;
}

/** One folding curtain of an aurora. */
export interface Fold {
  /** Where it hangs, 0..1 across the viewport. */
  x: number;
  /** How wide it is, as a fraction of the viewport. */
  width: number;
  /** How far down it reaches, 0..1. */
  reach: number;
  /** How fast it folds. */
  speed: number;
  /** Its own noise field, so two curtains never fold identically. */
  seed: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Curtains of light, each folding independently.
 *
 * @param count - how many curtains.
 * @param seed - the seed to vary them from.
 * @returns the curtains.
 */
export function curtains(count: number, seed: number): Fold[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: (i + 0.5) / count + (random() - 0.5) * 0.1,
    width: 0.1 + random() * 0.16,
    reach: 0.45 + random() * 0.4,
    speed: 0.05 + random() * 0.09,
    seed: Math.floor(random() * 100_000),
    tint: i % 4,
  }));
}

/** One point a cellular pattern is measured from. */
export interface Site {
  /** Where it sits, 0..1 across. */
  x: number;
  /** Where it sits, 0..1 down. */
  y: number;
  /** How far it drifts from there. */
  drift: number;
  /** How fast it drifts. */
  speed: number;
  /** Where in its drift it starts. */
  phase: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Points that a cellular pattern is measured from.
 *
 * The pattern is not drawn from these directly — what is drawn is the DISTANCE
 * to the nearest two of them, which is what makes a Voronoi edge. They drift, so
 * the cells breathe rather than sitting still.
 *
 * @param count - how many points.
 * @param seed - the seed to vary them from.
 * @returns the points.
 */
export function cells(count: number, seed: number): Site[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: random(),
    y: random(),
    drift: 0.02 + random() * 0.06,
    speed: 0.05 + random() * 0.12,
    phase: random() * TAU,
    tint: i % 3,
  }));
}

/** One streamline through a flow field. */
export interface Streamline {
  /** Where it starts, 0..1 across. */
  x: number;
  /** Where it starts, 0..1 down. */
  y: number;
  /** How far along its travel it begins. */
  offset: number;
  /** How fast it travels. */
  speed: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Seeds for lines that follow a field of angles.
 *
 * **The line is walked at draw time rather than stored.** A flow field is
 * usually built by stepping particles and keeping their trails, which is state;
 * walking the same field from the same seed every frame gives the identical
 * curve without remembering anything, which is what every canvas here has to do.
 *
 * @param count - how many lines.
 * @param seed - the seed to vary them from.
 * @returns the seeds.
 */
export function streamlines(count: number, seed: number): Streamline[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: random(),
    y: random(),
    offset: random(),
    speed: 0.02 + random() * 0.05,
    tint: i % 3,
  }));
}

/** One firefly. */
export interface Firefly {
  /** Where it wanders around, 0..1 across. */
  x: number;
  /** Where it wanders around, 0..1 down. */
  y: number;
  /** How far it wanders. */
  range: number;
  /** How fast it wanders. */
  speed: number;
  /** How fast it pulses. */
  pulse: number;
  /** Where in its pulse it starts. */
  phase: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * Lights that drift and breathe.
 *
 * Two independent rates per light — one for where it goes, one for how bright
 * it is. Tying them together makes a swarm blink in unison, which is a string
 * of fairy lights rather than a field of insects.
 *
 * @param count - how many.
 * @param seed - the seed to vary them from.
 * @returns the lights.
 */
export function fireflies(count: number, seed: number): Firefly[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: random(),
    y: random(),
    range: 0.03 + random() * 0.1,
    speed: 0.05 + random() * 0.15,
    pulse: 0.3 + random() * 0.9,
    phase: random() * TAU,
    tint: i % 2,
  }));
}
