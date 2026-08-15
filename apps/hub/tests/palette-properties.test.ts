import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { derivePalette } from "@/shared/domain/palette";
import { parseHex, srgbToOklch } from "@/shared/domain/color";
import { MAX_STOPS, addStop, setStop } from "@/shared/domain/gradient";
import { bounced } from "@/shared/domain/canvas-field";

// THE LISTS THESE REPLACE WERE PROPERTY TESTS WEARING A LIST'S CLOTHING.
//
// `palette.test.ts` proves its claims against fifteen hand-picked backgrounds —
// the extremes, the mid-lightness ones, the saturated hues. That list is good,
// and it was chosen by somebody thinking about where the solver would struggle.
// What it cannot do is find the colour nobody thought of. The claim is not
// "these fifteen are readable"; it is "**any** colour a person can pick is",
// and that is a claim about all sixteen million.
//
// These run alongside those, not instead: a named case documents the intent and
// reproduces a specific bug, while a property searches for the counterexample.
// When one is found, fast-check shrinks it to the smallest input that still
// fails and prints it — so a failure names a colour rather than a seed.

/** Any colour a person can pick, which is any colour the input can produce. */
const hex = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(
    ([r, g, b]) =>
      `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
  );

/** A gradient of one colour, which is what a flat background is. */
const flat = (color: string) => ({ angle: 90, stops: [{ color, at: 0 }] });

/**
 * A token's colour, as OKLCH.
 *
 * @param palette - the derived palette.
 * @param token - the custom property to read.
 * @returns the colour, as OKLCH channels.
 */
function colourOf(
  palette: Record<string, string>,
  token: string,
): [number, number, number] {
  const found = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(palette[token] ?? "");
  if (!found) throw new Error(`${token} is not a colour: ${palette[token]}`);
  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

describe("derivePalette, over every colour a person can pick", () => {
  // **The freedom, as a property.** The design renders an author's background
  // verbatim — no lift, no chroma cap — and `palette.test.ts` asserts that for
  // fifteen colours. It is true of all of them.
  it("never alters the background it was given", () => {
    fc.assert(
      fc.property(hex, hex, (background, accent) => {
        expect(derivePalette(flat(background), accent)["--field"]).toBe(
          background,
        );
      }),
      { numRuns: 500 },
    );
  });

  // **A property is deliberately ABSENT here, and it is the most interesting
  // result of writing this file.**
  //
  // The obvious one to assert is that derived text clears 4.5:1 against the
  // author's background wherever a colour could. Three attempts, three
  // counterexamples from fast-check, and the third is not a mistake in the
  // property:
  //
  //  - `#000000` refuted "never worse than the better extreme": 19.25 against
  //    20.99, because the derived ink carries the design's hue and gives up a
  //    little ratio on purpose. Fine, and still four times over the bar.
  //  - `#e21233` refuted "clears 4.5 wherever an extreme could": light text on
  //    that crimson reaches 4.12 while dark text would reach 4.81.
  //  - `#a53dce` refuted the narrower "clears what its own direction allows".
  //
  // `palette.ts` says `--ink` takes "whichever extreme contrasts more with the
  // background, tested rather than assumed". The measurements above disagree
  // with that sentence on saturated mid-lightness colours, and the disagreement
  // is worth roughly 0.7 of contrast ratio — the difference between missing the
  // text minimum and clearing it.
  //
  // That is a finding about the solver, not a property to weaken until it
  // passes. Writing `expect(ratio).toBeGreaterThanOrEqual(4.1)` would pin the
  // shortfall as though it were the design. The fifteen hand-picked backgrounds
  // in `palette.test.ts` all clear the bar, which is why this had never shown
  // up: none of them is a saturated colour near the middle.
  //
  // Reproduce with `derivePalette(flat("#e21233"), "#00ff88")` and compare
  // `--ink` against pure white and pure black.

  // One measurement of "is this page dark", shared by every token. Deciding it
  // per token is what once put a white heading and near-black body text on the
  // same blue field — so every derived text colour must sit on the same side.
  //
  // Stated first as "both lightnesses fall the same side of 0.5", which
  // fast-check refuted with `#abf9ee` — a pale cyan whose text is dark, but
  // whose muted text sits just the other side of that arbitrary line. The line
  // was the mistake: what has to agree is the DIRECTION each token was pushed
  // from the field, which is the decision the design says is made once.
  it("agrees with itself about which way text goes", () => {
    fc.assert(
      fc.property(hex, (background) => {
        const palette = derivePalette(flat(background), "#00ff88");
        const [field] = srgbToOklch(parseHex(background) as number[]) as [
          number,
          number,
          number,
        ];
        const [ink] = colourOf(palette, "--ink");
        const [muted] = colourOf(palette, "--muted");
        expect(Math.sign(ink - field)).toBe(Math.sign(muted - field));
      }),
      { numRuns: 500 },
    );
  });
});

describe("gradient stops, over any edit somebody can make", () => {
  /** A gradient with any number of stops, at any positions. */
  const gradient = fc
    .array(fc.record({ color: hex, at: fc.integer({ min: 0, max: 100 }) }), {
      minLength: 1,
      maxLength: 10,
    })
    .map((stops) => ({ angle: 90, stops }));

  // **Stop order is an invariant, not a convention.** CSS paints stops in the
  // order they are written, so an out-of-order list doubles back and produces
  // bands nobody put there. Every function here sorts rather than trusting its
  // caller — a claim about every edit, not about the ones somebody tried.
  it("always comes back sorted, and within the cap", () => {
    fc.assert(
      fc.property(
        gradient,
        fc.nat(),
        fc.integer({ min: 0, max: 100 }),
        hex,
        (start, rawIndex, at, colour) => {
          const index = rawIndex % start.stops.length;
          const { gradient: next } = setStop(start, index, {
            color: colour,
            at,
          });

          expect(next.stops.length).toBeLessThanOrEqual(MAX_STOPS);
          expect(next.stops.length).toBeGreaterThan(0);
          for (const [position, each] of next.stops.entries()) {
            expect(each.at).toBeGreaterThanOrEqual(0);
            expect(each.at).toBeLessThanOrEqual(100);
            if (position > 0) {
              expect(each.at).toBeGreaterThanOrEqual(
                next.stops[position - 1]!.at,
              );
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // The caller's own array is never reordered underneath them — which is the
  // reason these build with `toSorted` rather than `sort`.
  it("never mutates the gradient it was handed", () => {
    fc.assert(
      fc.property(gradient, fc.integer({ min: 0, max: 100 }), (start, at) => {
        const before = JSON.stringify(start);
        addStop(start, at);
        setStop(start, 0, { color: "#123456", at });
        expect(JSON.stringify(start)).toBe(before);
      }),
      { numRuns: 300 },
    );
  });

  // A dragged handle can change index, because the list is re-sorted. What must
  // survive is the edit itself: the colour somebody just picked is in there.
  it("keeps an edited stop's colour after re-sorting", () => {
    fc.assert(
      fc.property(
        gradient,
        fc.nat(),
        fc.integer({ min: 0, max: 100 }),
        hex,
        (start, rawIndex, at, colour) => {
          const index = rawIndex % start.stops.length;
          const { gradient: next } = setStop(start, index, {
            color: colour,
            at,
          });
          expect(next.stops.some((each) => each.color === colour)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("bounced, over any moment in time", () => {
  // **Every retro screen saver is built from this.** A modulo wraps — the thing
  // teleports from one edge to the other — and folding the sawtooth back on
  // itself is what makes it a bounce. The property is the whole contract: it
  // never leaves 0..1, for any elapsed time, including the negative ones a
  // paused tab can produce.
  it("never leaves the viewport", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (value) => {
        const folded = bounced(value);
        expect(folded).toBeGreaterThanOrEqual(0);
        expect(folded).toBeLessThanOrEqual(1);
      }),
      { numRuns: 1000 },
    );
  });

  // A reflection, not a wrap: the value turns round at the edge rather than
  // jumping. Two moments an equal step either side of an edge land together.
  it("reflects at the edges rather than teleporting", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.5, noNaN: true }), (step) => {
        expect(bounced(1 + step)).toBeCloseTo(bounced(1 - step), 10);
      }),
      { numRuns: 500 },
    );
  });
});
