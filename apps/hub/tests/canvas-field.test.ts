import { describe, expect, it } from "vitest";
import {
  cells,
  curtains,
  fireflies,
  streamlines,
  valueNoise,
  seeded,
  shootingStars,
  shotProgress,
  starfield,
  twinkle,
  constellation,
  nodeAt,
  waves,
  bubbles,
  snow,
  blobs,
  orbits,
  honeycomb,
  ribbons,
  confetti,
  skyline,
  bokeh,
  bounced,
  mystify,
  wanderers,
  glyphAt,
  warpStars,
  rainColumns,
} from "@/shared/domain/canvas-field";

describe("seeded", () => {
  // The whole reason this exists rather than Math.random. A field that
  // reshuffled would shimmer whenever somebody dragged a window, and one that
  // differed between the server and the client is a hydration mismatch.
  it("gives the same sequence for the same seed", () => {
    const a = seeded(42);
    const b = seeded(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives different sequences for different seeds", () => {
    expect(seeded(1)()).not.toBe(seeded(2)());
  });

  it.each([0, 1, -7, 2 ** 31])("stays within 0 and 1 from seed %i", (seed) => {
    const random = seeded(seed);
    for (let i = 0; i < 200; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  // Zero is the one state xorshift cannot leave: seeded with it, every value
  // would be zero and every star would land in the same corner forever.
  it("does not get stuck when seeded with zero", () => {
    const random = seeded(0);
    expect(new Set([random(), random(), random()]).size).toBe(3);
  });

  // Without the unsigned shift half the values come back negative, which puts
  // half the field off the left of the screen — visible only as "the sky looks
  // sparse", which is exactly the kind of bug nobody traces back to a sign.
  it("never returns a negative value", () => {
    const random = seeded(123456789);
    for (let i = 0; i < 500; i += 1) expect(random()).toBeGreaterThanOrEqual(0);
  });
});

describe("starfield", () => {
  const layers = starfield(9, 500);
  const all = layers.flatMap((l) => l.stars);

  it("builds three layers, far to near", () => {
    expect(layers).toHaveLength(3);
  });

  // Density, size and brightness rise together toward the front. One flat layer
  // — which is what this was — reads as noise on a background, not as a sky.
  it("makes each layer sparser and brighter than the one behind it", () => {
    for (let i = 1; i < layers.length; i += 1) {
      expect(layers[i]!.stars.length).toBeLessThan(layers[i - 1]!.stars.length);
      expect(layers[i]!.brightness).toBeGreaterThan(layers[i - 1]!.brightness);
    }
  });

  it("is identical for the same seed", () => {
    expect(starfield(7, 100)).toEqual(starfield(7, 100));
  });

  it("places every star inside the viewport", () => {
    for (const star of all) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(1);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThanOrEqual(1);
    }
  });

  // THE thing that makes a scatter of dots read as a sky, and the one this got
  // wrong before: `random ** 6` spends most of its range near zero, so the
  // field is dense overhead and thins toward the horizon.
  it("crowds the stars toward the top", () => {
    const high = all.filter((s) => s.y < 0.25).length;
    expect(high).toBeGreaterThan(all.length * 0.5);
  });

  it("gives every star a visible radius and a usable alpha", () => {
    for (const star of all) {
      expect(star.r).toBeGreaterThan(0);
      expect(star.alpha).toBeGreaterThan(0);
      expect(star.alpha).toBeLessThanOrEqual(1);
    }
  });

  // Every star mixes between the author's two colours rather than taking one of
  // three fixed tints, which is what keeps the canvas wearing their palette.
  it("spreads the stars across both theme colours", () => {
    expect(Math.min(...all.map((s) => s.tint))).toBeLessThan(0.1);
    expect(Math.max(...all.map((s) => s.tint))).toBeGreaterThan(0.9);
  });

  it("gives the near layer bigger stars than the far one", () => {
    const mean = (l: (typeof layers)[number]) =>
      l.stars.reduce((t, s) => t + s.r, 0) / l.stars.length;
    expect(mean(layers[2]!)).toBeGreaterThan(mean(layers[0]!));
  });
});

describe("twinkle", () => {
  const [layer] = starfield(4, 40);

  it("stays inside its clamps", () => {
    for (const star of layer!.stars) {
      for (let s = 0; s < 12; s += 0.37) {
        const alpha = twinkle(star, s, 1);
        expect(alpha).toBeGreaterThanOrEqual(0.004);
        expect(alpha).toBeLessThanOrEqual(0.95);
      }
    }
  });

  // Two oscillators at unrelated rates, not one. With a single sine every star
  // shares the shape of its pulse and the whole field breathes in unison.
  it("does not repeat on the twinkle period alone", () => {
    const star = layer!.stars[0]!;
    const period = (Math.PI * 2) / star.speed;
    expect(twinkle(star, 0, 1)).not.toBeCloseTo(twinkle(star, period, 1), 3);
  });

  it("is brighter on a nearer layer", () => {
    const star = layer!.stars[0]!;
    expect(twinkle(star, 1.5, 1.14)).toBeGreaterThan(twinkle(star, 1.5, 0.74));
  });
});

describe("shootingStars", () => {
  const shots = shootingStars(3, 4, 14);

  it("is identical for the same seed", () => {
    expect(shootingStars(3, 4, 14)).toEqual(shots);
  });

  // Spread across the cycle rather than placed at random, so two streaks do not
  // land together and leave the rest of the cycle empty.
  it("spreads the streaks across the cycle", () => {
    const times = shots.map((s) => s.at).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThan(1);
    }
  });

  it("starts every streak in the upper part of the sky", () => {
    for (const shot of shots) expect(shot.y).toBeLessThan(0.35);
  });
});

describe("shotProgress", () => {
  const [shot] = shootingStars(3, 1, 10);

  it("reports nothing outside the flight", () => {
    expect(shotProgress(shot!, shot!.at + shot!.ttl + 0.5, 10)).toBeNull();
  });

  it("runs from nothing to one across the flight", () => {
    expect(shotProgress(shot!, shot!.at, 10)).toBeCloseTo(0, 5);
    expect(shotProgress(shot!, shot!.at + shot!.ttl * 0.5, 10)).toBeCloseTo(
      0.5,
      5,
    );
  });

  // The cycle repeats forever, and a negative modulo would make every streak
  // vanish for the first cycle after load.
  it("repeats on the next cycle and survives a time before the start", () => {
    expect(shotProgress(shot!, shot!.at + 10, 10)).toBeCloseTo(0, 5);
    expect(shotProgress(shot!, -5, 10)).not.toBeNaN();
  });
});

describe("constellation", () => {
  // The points drift on small circles rather than travelling, because a point
  // that crosses the viewport has to be re-seeded and a re-seed is a visible
  // jump. The pattern keeps changing anyway: the links depend on distances
  // between points, not on the points.
  it("places the asked-for number of points inside the viewport", () => {
    const nodes = constellation(20, 7);
    expect(nodes).toHaveLength(20);
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1);
    }
  });

  it("is the same field for the same seed", () => {
    expect(constellation(6, 3)).toEqual(constellation(6, 3));
  });

  it("returns a point to where it started after a full circuit", () => {
    const [node] = constellation(1, 11);
    const start = nodeAt(node!, 0);
    const round = nodeAt(node!, 1 / node!.speed);
    expect(round.x).toBeCloseTo(start.x, 6);
    expect(round.y).toBeCloseTo(start.y, 6);
  });

  it("moves a point away from its resting place in between", () => {
    const [node] = constellation(1, 11);
    const start = nodeAt(node!, 0);
    const later = nodeAt(node!, 1 / node!.speed / 2);
    expect(Math.hypot(later.x - start.x, later.y - start.y)).toBeGreaterThan(0);
  });
});

describe("waves", () => {
  // **Each band is slower and taller than the one behind it**, which is the
  // whole of the depth: bands sharing a speed read as one striped object
  // sliding sideways, however many there are.
  it("slows and grows toward the front", () => {
    const bands = waves(3, 5);
    expect(bands).toHaveLength(3);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]!.speed).toBeLessThan(bands[i - 1]!.speed);
      expect(bands[i]!.height).toBeGreaterThan(bands[i - 1]!.height);
    }
  });

  it("survives being asked for a single band", () => {
    expect(waves(1, 5)).toHaveLength(1);
  });
});

describe("bubbles", () => {
  it("gives every bubble its own place in the climb", () => {
    const rising = bubbles(30, 9);
    expect(rising).toHaveLength(30);
    expect(new Set(rising.map((b) => b.offset)).size).toBeGreaterThan(1);
  });

  it("alternates the two tints", () => {
    expect(bubbles(4, 9).map((b) => b.tint)).toEqual([0, 1, 0, 1]);
  });
});

describe("snow", () => {
  // Size, speed and sway are correlated on purpose: a near flake is larger,
  // faster and swings wider. Rolling them independently gives big slow flakes
  // beside small fast ones, which reads as noise rather than depth.
  it("makes the faster flakes the larger ones", () => {
    const flakes = snow(60, 4);
    const sorted = [...flakes].sort((a, b) => a.speed - b.speed);
    expect(sorted[0]!.radius).toBeLessThan(sorted.at(-1)!.radius);
  });

  it("keeps every flake within the viewport's width", () => {
    for (const flake of snow(40, 4)) {
      expect(flake.x).toBeGreaterThanOrEqual(0);
      expect(flake.x).toBeLessThanOrEqual(1);
    }
  });
});

describe("blobs", () => {
  // Few and large rather than many and small: the effect is colours bleeding
  // into one another, which needs them to overlap. Many small ones are spots,
  // and spots are the bubbles.
  it("keeps them large enough to overlap", () => {
    for (const blob of blobs(3, 2)) {
      expect(blob.radius).toBeGreaterThan(0.2);
    }
  });

  it("spreads the three tints", () => {
    expect(blobs(3, 2).map((b) => b.tint)).toEqual([0, 1, 2]);
  });
});

describe("orbits", () => {
  // Signed speeds, so the rings do not all turn the same way — a field turning
  // as one reads as a single rotating object rather than as orbits.
  it("turns some of them the other way", () => {
    const ring = orbits(30, 8);
    expect(ring.some((o) => o.speed < 0)).toBe(true);
    expect(ring.some((o) => o.speed > 0)).toBe(true);
  });

  it("keeps every orbit inside the viewport", () => {
    for (const o of orbits(30, 8)) expect(o.radius).toBeLessThanOrEqual(0.5);
  });
});

describe("honeycomb", () => {
  // Odd rows offset by half a column, rows spaced three quarters of a cell —
  // that ratio is what makes hexagons tessellate. Square spacing leaves gaps
  // that read as a mistake.
  it("offsets every other row by half a column", () => {
    const cells = honeycomb(4, 2, 1);
    expect(cells[0]!.x).toBeCloseTo(0, 6);
    expect(cells[4]!.x).toBeCloseTo(0.5 / 4, 6);
  });

  it("lays out one cell per place in the lattice", () => {
    expect(honeycomb(5, 3, 1)).toHaveLength(15);
  });
});

describe("ribbons", () => {
  it("spreads them down the viewport", () => {
    const bands = ribbons(3, 6);
    expect(bands).toHaveLength(3);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]!.level).toBeGreaterThan(bands[i - 1]!.level);
    }
  });
});

describe("confetti", () => {
  it("spreads the four colours", () => {
    expect(confetti(4, 3).map((c) => c.tint)).toEqual([0, 1, 2, 3]);
  });

  it("gives every piece its own place in the fall", () => {
    expect(new Set(confetti(30, 3).map((c) => c.offset)).size).toBeGreaterThan(
      1,
    );
  });
});

describe("skyline", () => {
  // **Each layer tiles exactly one layer-width**, so the renderer draws it
  // twice and scrolls for ever without a seam. Generating a screen's worth and
  // wrapping leaves a visible cut every time it repeats.
  it("fills a whole layer-width with buildings", () => {
    for (const layer of skyline(3, 12)) {
      const last = layer.buildings.at(-1)!;
      expect(last.at + last.width).toBeGreaterThanOrEqual(1);
    }
  });

  it("makes the nearer layers faster and taller", () => {
    const layers = skyline(3, 12);
    for (let i = 1; i < layers.length; i += 1) {
      expect(layers[i]!.speed).toBeGreaterThan(layers[i - 1]!.speed);
    }
  });

  it("survives being asked for a single layer", () => {
    expect(skyline(1, 12)).toHaveLength(1);
  });
});

describe("bokeh", () => {
  // Size and brightness move together, because that is what being out of focus
  // does: a nearer light spreads over more of the lens and is dimmer for it.
  it("dims the larger spots", () => {
    const spots = bokeh(40, 10);
    const sorted = [...spots].sort((a, b) => a.radius - b.radius);
    expect(sorted[0]!.glow).toBeGreaterThan(sorted.at(-1)!.glow);
  });
});

describe("bounced", () => {
  // **The whole of a screensaver's motion is this function.** A modulo wraps —
  // the thing leaves one edge and reappears at the other, which is a teleport.
  // Folding the sawtooth back on itself is a reflection, and a reflection is a
  // bounce. It is also why none of these savers remembers a velocity.
  it("folds back instead of wrapping", () => {
    expect(bounced(0)).toBeCloseTo(0, 9);
    expect(bounced(0.5)).toBeCloseTo(0.5, 9);
    expect(bounced(1)).toBeCloseTo(1, 9);
    expect(bounced(1.25)).toBeCloseTo(0.75, 9);
    expect(bounced(2)).toBeCloseTo(0, 9);
  });

  it("stays inside the viewport for any input", () => {
    for (const v of [-9.3, -1, -0.2, 0, 3.7, 12.9, 101.4]) {
      expect(bounced(v)).toBeGreaterThanOrEqual(0);
      expect(bounced(v)).toBeLessThanOrEqual(1);
    }
  });

  // Negative time is reached by the echoes, which draw the shape at earlier
  // moments — so it has to behave there as it does anywhere else.
  it("handles time before the start", () => {
    expect(bounced(-0.25)).toBeCloseTo(0.25, 9);
  });
});

describe("mystify", () => {
  // A corner with zero speed sits still and pins the polygon, which reads as
  // broken rather than as calm.
  it("never leaves a corner motionless", () => {
    for (const shape of mystify(3, 4, 5)) {
      for (const corner of shape.corners) {
        expect(corner.speedX).toBeGreaterThan(0);
        expect(corner.speedY).toBeGreaterThan(0);
      }
    }
  });

  it("gives every polygon the corners it was asked for", () => {
    for (const shape of mystify(2, 5, 5)) expect(shape.corners).toHaveLength(5);
  });
});

describe("wanderers", () => {
  it("keeps every box small enough to move", () => {
    for (const box of wanderers(3, 7)) {
      expect(box.width).toBeLessThan(1);
      expect(box.height).toBeLessThan(1);
    }
  });
});

describe("glyphAt", () => {
  // Deterministic in all three, so a frame always draws the same characters.
  // `Math.random()` here would reroll every glyph at the frame rate, which is
  // noise rather than rain.
  it("is the same glyph for the same column, row and step", () => {
    expect(glyphAt(3, 4, 5, 20)).toBe(glyphAt(3, 4, 5, 20));
  });

  it("changes when the clock steps", () => {
    const before = glyphAt(3, 4, 5, 20);
    const after = [6, 7, 8, 9].map((step) => glyphAt(3, 4, step, 20));
    expect(after.some((g) => g !== before)).toBe(true);
  });

  it("stays inside the alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const g = glyphAt(i, i * 7, i * 13, 20);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(20);
    }
  });
});

describe("warpStars", () => {
  it("sends them out in every direction", () => {
    const angles = warpStars(60, 2).map((s) => s.angle);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(3);
  });

  it("gives every star its own place in the flight", () => {
    expect(new Set(warpStars(40, 2).map((s) => s.offset)).size).toBeGreaterThan(
      1,
    );
  });
});

describe("rainColumns", () => {
  // Each column carries its own seed rather than sharing one, or every column
  // shows the same glyphs at the same moment and the screen reads as a single
  // scrolling image rather than as rain.
  it("gives every column its own seed", () => {
    const columns = rainColumns(20, 3);
    expect(new Set(columns.map((c) => c.seed)).size).toBeGreaterThan(1);
  });

  it("spreads them evenly across the viewport", () => {
    const columns = rainColumns(4, 3);
    expect(columns.map((c) => c.x)).toEqual([0.125, 0.375, 0.625, 0.875]);
  });
});

describe("valueNoise", () => {
  it("stays inside 0..1 for any input", () => {
    for (const x of [-1e6, -3.7, 0, 0.5, 12.25, 1e6]) {
      const value = valueNoise(x, 7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  // The whole reason for choosing value noise over a sine: neighbouring points
  // differ a little, which is the folding an aurora does. A sine gives every
  // point on a curtain the same offset, which is a pendulum.
  it("moves smoothly between neighbouring points", () => {
    const a = valueNoise(3, 11);
    const b = valueNoise(3.02, 11);
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });

  it("is deterministic in both its arguments", () => {
    expect(valueNoise(2.5, 3)).toBe(valueNoise(2.5, 3));
    expect(valueNoise(2.5, 3)).not.toBe(valueNoise(2.5, 4));
  });

  // Cosine interpolation, so the curve has no corner where it crosses a
  // lattice point — linear interpolation gives a ribbon visible creases.
  it("has no kink at a whole number", () => {
    const before = valueNoise(4 - 0.01, 5);
    const at = valueNoise(4, 5);
    const after = valueNoise(4 + 0.01, 5);
    expect(Math.abs(before - at)).toBeLessThan(0.02);
    expect(Math.abs(after - at)).toBeLessThan(0.02);
  });
});

describe("curtains", () => {
  it("makes the number asked for", () => {
    expect(curtains(5, 1)).toHaveLength(5);
  });

  it("spreads them across the viewport", () => {
    const made = curtains(4, 2);
    const places = made.map((curtain) => curtain.x);
    expect(Math.max(...places) - Math.min(...places)).toBeGreaterThan(0.3);
  });

  // Each folds from its own noise field, or four curtains fold identically and
  // the sky reads as one object repeated.
  it("gives every curtain its own noise field", () => {
    const seeds = curtains(4, 3).map((curtain) => curtain.seed);
    expect(new Set(seeds).size).toBe(4);
  });

  it("hangs them from the top rather than filling the height", () => {
    for (const curtain of curtains(6, 4)) {
      expect(curtain.reach).toBeGreaterThan(0.4);
      expect(curtain.reach).toBeLessThanOrEqual(0.85);
    }
  });
});

describe("cells", () => {
  it("makes the number asked for", () => {
    expect(cells(9, 1)).toHaveLength(9);
  });

  it("keeps every point inside the viewport", () => {
    for (const cell of cells(20, 2)) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThanOrEqual(1);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThanOrEqual(1);
    }
  });

  // They drift, so cells take territory from each other rather than sitting in
  // a fixed mosaic — but never so far that the pattern stops being cellular.
  it("gives every point a drift it cannot exceed", () => {
    for (const cell of cells(20, 3)) {
      expect(cell.drift).toBeGreaterThan(0);
      expect(cell.drift).toBeLessThan(0.1);
    }
  });
});

describe("streamlines", () => {
  it("makes the number asked for", () => {
    expect(streamlines(12, 1)).toHaveLength(12);
  });

  it("starts every line somewhere in the viewport", () => {
    for (const line of streamlines(30, 2)) {
      expect(line.x).toBeGreaterThanOrEqual(0);
      expect(line.x).toBeLessThanOrEqual(1);
      expect(line.y).toBeGreaterThanOrEqual(0);
      expect(line.y).toBeLessThanOrEqual(1);
    }
  });

  // Never zero, or a line sits still while the rest of the current moves.
  it("gives every line a speed", () => {
    for (const line of streamlines(30, 3)) {
      expect(line.speed).toBeGreaterThan(0);
    }
  });
});

describe("fireflies", () => {
  it("makes the number asked for", () => {
    expect(fireflies(15, 1)).toHaveLength(15);
  });

  // Two independent rates per light. Tying them together makes the swarm blink
  // in unison, which is a string of fairy lights rather than insects.
  it("varies where a light goes separately from how it pulses", () => {
    const swarm = fireflies(24, 2);
    const wander = new Set(swarm.map((light) => light.speed));
    const pulse = new Set(swarm.map((light) => light.pulse));
    expect(wander.size).toBeGreaterThan(1);
    expect(pulse.size).toBeGreaterThan(1);
    expect(swarm.some((light) => light.speed !== light.pulse)).toBe(true);
  });

  it("keeps every light inside the viewport", () => {
    for (const light of fireflies(30, 3)) {
      expect(light.x).toBeGreaterThanOrEqual(0);
      expect(light.x).toBeLessThanOrEqual(1);
      expect(light.range).toBeGreaterThan(0);
    }
  });
});
