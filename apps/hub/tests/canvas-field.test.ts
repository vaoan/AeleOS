import { describe, expect, it } from "vitest";
import {
  aurora,
  seeded,
  starfield,
  swayOf,
  twinkle,
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
  it("makes as many points as asked", () => {
    expect(starfield(50, 1)).toHaveLength(50);
  });

  it("is identical for the same seed", () => {
    expect(starfield(20, 7)).toEqual(starfield(20, 7));
  });

  it("places every point inside the viewport", () => {
    for (const point of starfield(300, 9)) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it("gives every point a visible radius", () => {
    for (const point of starfield(300, 9)) {
      expect(point.r).toBeGreaterThan(0);
    }
  });

  // Weighted small on purpose: a field of evenly sized dots reads as a texture
  // rather than as a sky. Most should be near the floor.
  it("makes most stars small and a few not", () => {
    const radii = starfield(500, 3).map((p) => p.r);
    const small = radii.filter((r) => r < 1).length;
    expect(small).toBeGreaterThan(radii.length / 2);
    expect(Math.max(...radii)).toBeGreaterThan(1.5);
  });

  it("uses both theme colours", () => {
    const tints = new Set(starfield(200, 5).map((p) => p.tint));
    expect(tints).toEqual(new Set([0, 1]));
  });
});

describe("twinkle", () => {
  it("stays between its floor and one", () => {
    const [point] = starfield(1, 4);
    for (let s = 0; s < 40; s += 0.37) {
      const alpha = twinkle(point!, s);
      expect(alpha).toBeGreaterThanOrEqual(0.25);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  // A star that blinks fully out reads as a rendering fault rather than a sky.
  it("never goes dark", () => {
    const points = starfield(50, 6);
    for (const point of points) {
      for (let s = 0; s < 10; s += 0.25) {
        expect(twinkle(point, s)).toBeGreaterThan(0);
      }
    }
  });

  it("actually varies over time", () => {
    const [point] = starfield(1, 8);
    const samples = new Set(
      [0, 0.5, 1, 1.5, 2].map((s) => twinkle(point!, s).toFixed(3)),
    );
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe("aurora", () => {
  it("makes as many curtains as asked", () => {
    expect(aurora(4, 2)).toHaveLength(4);
  });

  it("is identical for the same seed", () => {
    expect(aurora(4, 2)).toEqual(aurora(4, 2));
  });

  // The failure mode of this effect is a picket fence, so the curtains are
  // spread rather than placed at random and every one is wide.
  it("spreads the curtains rather than clustering them", () => {
    const centres = aurora(4, 2)
      .map((c) => c.centre)
      .sort((a, b) => a - b);
    for (let i = 1; i < centres.length; i += 1) {
      expect(centres[i]! - centres[i - 1]!).toBeGreaterThan(0.05);
    }
  });

  it("keeps every curtain wide", () => {
    for (const curtain of aurora(6, 11)) {
      expect(curtain.width).toBeGreaterThanOrEqual(0.35);
    }
  });

  it("alternates the two theme colours", () => {
    expect(aurora(4, 2).map((c) => c.tint)).toEqual([0, 1, 0, 1]);
  });
});

describe("swayOf", () => {
  it("stays near its centre", () => {
    const [curtain] = aurora(1, 3);
    for (let s = 0; s < 40; s += 0.31) {
      expect(
        Math.abs(swayOf(curtain!, s) - curtain!.centre),
      ).toBeLessThanOrEqual(curtain!.sway + 1e-9);
    }
  });

  it("moves over time", () => {
    const [curtain] = aurora(1, 3);
    expect(swayOf(curtain!, 0)).not.toBe(swayOf(curtain!, 1.7));
  });
});
