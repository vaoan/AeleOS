import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRADIENT,
  MAX_STOPS,
  addStop,
  colourAt,
  gradientCss,
  hardestStop,
  parseGradient,
  removeStop,
  setStop,
  type Gradient,
} from "@/shared/domain/gradient";

/**
 * A gradient, briefly.
 *
 * @param stops - colour and position pairs.
 * @param angle - which way it runs.
 * @returns the gradient.
 */
const g = (
  stops: [string, number][],
  angle = 90,
  over: Partial<Gradient> = {},
): Gradient => ({
  ...DEFAULT_GRADIENT,
  angle,
  stops: stops.map(([color, at]) => ({ color, at })),
  ...over,
});

describe("parseGradient", () => {
  it("reads a gradient somebody built", () => {
    expect(
      parseGradient({
        ...DEFAULT_GRADIENT,
        angle: 45,
        stops: [
          { color: "#ff0000", at: 0 },
          { color: "#0000ff", at: 100 },
        ],
      }),
    ).toEqual({
      // A background stored before this app could make anything but a linear
      // gradient reads back as exactly that gradient: absence means the old
      // shape, and no version marker is needed to say so.
      kind: "linear",
      repeating: false,
      every: 25,
      angle: 45,
      shape: "ellipse",
      extent: "farthest-corner",
      x: 50,
      y: 50,
      stops: [
        { color: "#ff0000", at: 0 },
        { color: "#0000ff", at: 100 },
      ],
    });
  });

  // The column predates gradients, so absence is the ordinary case.
  it.each([null, undefined, 42, "red", [], true, {}, { stops: "many" }])(
    "overrides nothing for %o",
    (value) => {
      expect(parseGradient(value)).toBeNull();
    },
  );

  // An unreadable value is not a choice. Defaulting it to black would put a
  // colour on somebody's page that nobody picked.
  it("drops a stop whose colour is not one", () => {
    const parsed = parseGradient({
      stops: [
        { color: "#ff0000", at: 0 },
        { color: "chartreuse", at: 50 },
        { color: "#0000ff", at: 100 },
      ],
    });
    expect(parsed?.stops).toHaveLength(2);
  });

  it("overrides nothing when no stop survives", () => {
    expect(parseGradient({ stops: [{ color: "nope", at: 0 }] })).toBeNull();
  });

  it("drops a stop with no usable position", () => {
    expect(
      parseGradient({
        stops: [
          { color: "#ff0000", at: Number.NaN },
          { color: "#0000ff", at: 100 },
        ],
      })?.stops,
    ).toHaveLength(1);
  });

  it("normalises an angle from anywhere on the circle", () => {
    expect(
      parseGradient({
        ...DEFAULT_GRADIENT,
        angle: -90,
        stops: [{ color: "#fff", at: 0 }],
      })?.angle,
    ).toBe(270);
    expect(
      parseGradient({
        ...DEFAULT_GRADIENT,
        angle: 450,
        stops: [{ color: "#fff", at: 0 }],
      })?.angle,
    ).toBe(90);
  });

  it("falls back to the default angle when there is none", () => {
    expect(parseGradient({ stops: [{ color: "#fff", at: 0 }] })?.angle).toBe(
      DEFAULT_GRADIENT.angle,
    );
  });

  // CSS renders stops in the order they are written, so an out-of-order list
  // produces a gradient that doubles back — bands where nobody put one.
  it("puts the stops in order", () => {
    expect(
      parseGradient({
        stops: [
          { color: "#0000ff", at: 90 },
          { color: "#ff0000", at: 10 },
        ],
      })?.stops.map((s) => s.at),
    ).toEqual([10, 90]);
  });

  it("clamps a position outside the bar", () => {
    expect(
      parseGradient({
        stops: [
          { color: "#ff0000", at: -50 },
          { color: "#0000ff", at: 500 },
        ],
      })?.stops.map((s) => s.at),
    ).toEqual([0, 100]);
  });

  it("refuses to hold more stops than the cap", () => {
    const many = Array.from({ length: MAX_STOPS + 8 }, (_, i) => ({
      color: "#ff0000",
      at: i,
    }));
    expect(parseGradient({ stops: many })?.stops).toHaveLength(MAX_STOPS);
  });
});

describe("gradientCss", () => {
  it("writes the stops with their positions", () => {
    expect(
      gradientCss(
        g(
          [
            ["#ff0000", 0],
            ["#0000ff", 100],
          ],
          45,
        ),
      ),
    ).toBe("linear-gradient(45deg, #ff0000 0%, #0000ff 100%)");
  });

  // A degenerate gradient rather than a bare colour, even for one stop: it
  // renders identically (a flat fill) but stays a valid CSS <image>, which a
  // bare colour is not — `--field` is this value, and it is now a LAYER in
  // `body`'s own `background-image` list beside an author's picture (see
  // `bodyBackgroundVars` in actor-theme.ts). One invalid layer makes the
  // whole `background-image` declaration invalid.
  it("writes a single stop as a gradient from that colour to itself", () => {
    expect(gradientCss(g([["#ff0000", 0]]))).toBe(
      "linear-gradient(#ff0000, #ff0000)",
    );
  });

  it("writes them in order however they arrive", () => {
    expect(
      gradientCss(
        g([
          ["#0000ff", 80],
          ["#ff0000", 20],
        ]),
      ),
    ).toContain("#ff0000 20%, #0000ff 80%");
  });

  // Nothing a person typed may reach a stylesheet: a `}` that survived would
  // close the rule and everything after it would be CSS somebody else wrote.
  it("cannot be escaped through a stop", () => {
    const css = gradientCss(
      parseGradient({
        stops: [
          { color: "#ff0000}body{display:none", at: 0 },
          { color: "#0000ff", at: 100 },
        ],
      }) ?? DEFAULT_GRADIENT,
    );
    expect(css).not.toContain("body");
    expect(css).not.toContain("}");
  });
});

describe("addStop", () => {
  // Sampling rather than defaulting is what makes adding a handle feel like
  // adding a handle: the gradient does not visibly change until it is moved.
  it("takes its colour from the gradient at that point", () => {
    const added = addStop(
      g([
        ["#000000", 0],
        ["#ffffff", 100],
      ]),
      50,
    );
    expect(added.stops).toHaveLength(3);
    expect(added.stops[1]?.color).toBe("#808080");
  });

  it("keeps the stops in order", () => {
    expect(
      addStop(
        g([
          ["#000000", 0],
          ["#ffffff", 100],
        ]),
        30,
      ).stops.map((s) => s.at),
    ).toEqual([0, 30, 100]);
  });

  it("refuses once the cap is reached", () => {
    const full: Gradient = {
      ...DEFAULT_GRADIENT,
      stops: Array.from({ length: MAX_STOPS }, (_, i) => ({
        color: "#ff0000",
        at: i * 5,
      })),
    };
    expect(addStop(full, 99)).toBe(full);
  });
});

describe("removeStop", () => {
  it("removes the one named", () => {
    expect(
      removeStop(
        g([
          ["#ff0000", 0],
          ["#00ff00", 50],
          ["#0000ff", 100],
        ]),
        1,
      ).stops.map((s) => s.color),
    ).toEqual(["#ff0000", "#0000ff"]);
  });

  // A background with no colours is not a background, and a control that can
  // empty itself into an invalid state is one somebody will empty.
  it("refuses to remove the last", () => {
    const one = g([["#ff0000", 0]]);
    expect(removeStop(one, 0)).toBe(one);
  });
});

describe("setStop", () => {
  it("changes a colour", () => {
    expect(
      setStop(
        g([
          ["#ff0000", 0],
          ["#0000ff", 100],
        ]),
        0,
        { color: "#00ff00" },
      ).gradient.stops[0]?.color,
    ).toBe("#00ff00");
  });

  it("changes a position", () => {
    expect(
      setStop(
        g([
          ["#ff0000", 0],
          ["#0000ff", 100],
        ]),
        0,
        { at: 40 },
      ).gradient.stops[0]?.at,
    ).toBe(40);
  });

  // The list comes back sorted, so a dragged handle can pass its neighbour and
  // change index. A caller tracking a selection by index would silently start
  // editing the other one.
  it("reorders when a stop passes its neighbour", () => {
    expect(
      setStop(
        g([
          ["#ff0000", 0],
          ["#0000ff", 50],
          ["#00ff00", 100],
        ]),
        0,
        {
          at: 70,
        },
      ).gradient.stops.map((s) => s.color),
    ).toEqual(["#0000ff", "#ff0000", "#00ff00"]);
  });

  // Two stops landing on the same position is a tie, and the sort is stable —
  // so the one that was already there stays first. Asserted because it is
  // arbitrary either way and a future change to the sort would otherwise flip
  // it silently.
  it("keeps the earlier stop first on a tie", () => {
    expect(
      setStop(
        g([
          ["#ff0000", 0],
          ["#0000ff", 100],
        ]),
        0,
        { at: 100 },
      ).gradient.stops.map((s) => s.color),
    ).toEqual(["#ff0000", "#0000ff"]);
  });

  it("clamps a position dragged past the end", () => {
    expect(
      setStop(
        g([
          ["#ff0000", 0],
          ["#0000ff", 100],
        ]),
        0,
        { at: 400 },
      ).gradient.stops.map((s) => s.at),
    ).toEqual([100, 100]);
  });
});

describe("colourAt", () => {
  it("gives a stop's own colour at its position", () => {
    expect(
      colourAt(
        g([
          ["#ff0000", 0],
          ["#0000ff", 100],
        ]),
        0,
      ),
    ).toBe("#ff0000");
  });

  it("mixes between the two either side", () => {
    expect(
      colourAt(
        g([
          ["#000000", 0],
          ["#ffffff", 100],
        ]),
        25,
      ),
    ).toBe("#404040");
  });

  // What CSS itself does past the last stop.
  it("holds the end colour beyond the last stop", () => {
    expect(
      colourAt(
        g([
          ["#ff0000", 20],
          ["#0000ff", 80],
        ]),
        100,
      ),
    ).toBe("#0000ff");
    expect(
      colourAt(
        g([
          ["#ff0000", 20],
          ["#0000ff", 80],
        ]),
        0,
      ),
    ).toBe("#ff0000");
  });

  // Two stops in one place is a hard transition, which is what CSS renders.
  // The exact point is a tie and either answer is defensible; what matters is
  // that either side of it is right and nothing produces NaN.
  it("makes two stops in the same place a hard edge", () => {
    const hard = g([
      ["#ff0000", 50],
      ["#0000ff", 50],
    ]);
    expect(colourAt(hard, 49)).toBe("#ff0000");
    expect(colourAt(hard, 51)).toBe("#0000ff");
    expect(colourAt(hard, 50)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("hardestStop", () => {
  // Text crosses the whole gradient, so the palette has to be solved against
  // the worst of it — the stop nearest mid-lightness, which leaves the least
  // room for text in either direction.
  it("picks the stop nearest the middle", () => {
    expect(
      hardestStop(
        g([
          ["#000000", 0],
          ["#808080", 50],
          ["#ffffff", 100],
        ]),
      ),
    ).toBe("#808080");
  });

  it("picks the only stop when there is one", () => {
    expect(hardestStop(g([["#123456", 0]]))).toBe("#123456");
  });

  // Solving against the first stop is the obvious implementation and it makes a
  // page readable at one end and not at the other.
  it("does not simply take the first", () => {
    expect(
      hardestStop(
        g([
          ["#ffffff", 0],
          ["#767676", 100],
        ]),
      ),
    ).toBe("#767676");
  });
});

describe("what it does with a gradient nobody validated", () => {
  // These functions are exported and their input is only typed, not proven.
  // A gradient assembled by hand — or one from a future caller that skipped
  // `parseGradient` — must not produce `NaN` in a stylesheet.
  // The STOPS fall back; the angle is still the caller's, because an empty
  // stop list says nothing about which way the gradient should run.
  it("falls back to the default stops when there are none", () => {
    expect(gradientCss({ ...DEFAULT_GRADIENT, angle: 90, stops: [] })).toBe(
      "linear-gradient(90deg, #fbf4ec 0%, #f3e3d3 100%)",
    );
  });

  it.each([null, "red", 42])("drops the stop %o, which is not one", (stop) => {
    expect(
      parseGradient({ stops: [stop, { color: "#ff0000", at: 0 }] })?.stops,
    ).toHaveLength(1);
  });

  it("drops a stop whose colour is not even a string", () => {
    expect(
      parseGradient({
        stops: [
          { color: 42, at: 0 },
          { color: "#ff0000", at: 100 },
        ],
      })?.stops,
    ).toHaveLength(1);
  });

  // `colourAt` mixes between two stops, and either of them being unreadable
  // would otherwise put NaN into the mix and `#NaNNaNNaN` on the page. Both
  // sides are checked because they are two separate fallbacks.
  it.each([
    ["nope", "#ffffff"],
    ["#ffffff", "nope"],
  ])("mixes safely between %s and %s", (from, to) => {
    expect(
      colourAt(
        {
          ...DEFAULT_GRADIENT,
          angle: 90,
          stops: [
            { color: from, at: 0 },
            { color: to, at: 100 },
          ],
        },
        50,
      ),
    ).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("where a moved stop ends up", () => {
  // **The caller cannot work this out and must not try.** `setStop` sorts, so a
  // stop dragged past its neighbour changes index — and a picker tracking its
  // selection by the old index silently starts editing the neighbour halfway
  // through the drag. Only this function knows where the stop landed, because
  // only it did the sorting, so it reports it.
  it("reports the new index when a stop passes its neighbour", () => {
    const moved = setStop(
      g([
        ["#ff0000", 0],
        ["#0000ff", 50],
        ["#00ff00", 100],
      ]),
      0,
      { at: 70 },
    );
    expect(moved.index).toBe(1);
    expect(moved.gradient.stops[moved.index]?.color).toBe("#ff0000");
  });

  it("reports the same index when nothing reorders", () => {
    const moved = setStop(
      g([
        ["#ff0000", 0],
        ["#0000ff", 100],
      ]),
      0,
      { at: 20 },
    );
    expect(moved.index).toBe(0);
  });

  it("reports where a stop dragged to the far end landed", () => {
    const moved = setStop(
      g([
        ["#ff0000", 0],
        ["#0000ff", 50],
        ["#00ff00", 100],
      ]),
      0,
      { at: 100 },
    );
    expect(moved.gradient.stops[moved.index]?.color).toBe("#ff0000");
  });

  // A colour change reorders nothing, so the index is untouched.
  it("reports the same index for a colour change", () => {
    const moved = setStop(
      g([
        ["#ff0000", 0],
        ["#0000ff", 100],
      ]),
      1,
      {
        color: "#00ff00",
      },
    );
    expect(moved.index).toBe(1);
    expect(moved.gradient.stops[1]?.color).toBe("#00ff00");
  });
});

describe("a gradient handed in over the cap", () => {
  // `parseGradient` never produces one, but `setStop` is exported and its input
  // is only typed. When the edited stop sorts past the cap it is sliced away,
  // and the reported index must still point at a stop that exists rather than
  // past the end of the list.
  it("reports an index that is still in the list", () => {
    const over: Gradient = {
      ...DEFAULT_GRADIENT,
      stops: Array.from({ length: MAX_STOPS + 3 }, (_, i) => ({
        color: "#ff0000",
        at: i,
      })),
    };
    const moved = setStop(over, 0, { at: 100 });
    expect(moved.index).toBeLessThan(moved.gradient.stops.length);
    expect(moved.gradient.stops[moved.index]).toBeDefined();
  });
});

describe("gradientCss, by kind", () => {
  const stops: [string, number][] = [
    ["#ff0000", 0],
    ["#0000ff", 100],
  ];

  it("runs a radial gradient outward from its centre", () => {
    expect(gradientCss(g(stops, 45, { kind: "radial", x: 20, y: 80 }))).toBe(
      "radial-gradient(ellipse farthest-corner at 20% 80%, #ff0000 0%, #0000ff 100%)",
    );
  });

  // Each of the four is a different background on a page that is not square,
  // which is why all four are offered rather than the default alone.
  it("carries the shape and the extent it was given", () => {
    expect(
      gradientCss(
        g(stops, 0, {
          kind: "radial",
          shape: "circle",
          extent: "closest-side",
        }),
      ),
    ).toContain("radial-gradient(circle closest-side at 50% 50%");
  });

  // The angle a radial gradient ignores is a conic gradient's starting point.
  it("starts a conic gradient at its angle", () => {
    expect(gradientCss(g(stops, 270, { kind: "conic", x: 10, y: 90 }))).toBe(
      "conic-gradient(from 270deg at 10% 90%, #ff0000 0%, #0000ff 100%)",
    );
  });

  it("leaves a linear gradient as it was", () => {
    expect(gradientCss(g(stops, 45))).toBe(
      "linear-gradient(45deg, #ff0000 0%, #0000ff 100%)",
    );
  });

  it("is a flat gradient for one stop, whatever shape was chosen", () => {
    for (const kind of ["linear", "radial", "conic"] as const) {
      expect(gradientCss(g([["#123456", 0]], 0, { kind }))).toBe(
        "linear-gradient(#123456, #123456)",
      );
    }
  });
});

describe("gradientCss, repeating", () => {
  const stops: [string, number][] = [
    ["#ff0000", 0],
    ["#0000ff", 100],
  ];

  // The whole reason `every` exists. `repeating-linear-gradient` restates its
  // stops BEYOND the last one, so stops spanning 0 to 100 — which is what every
  // gradient here starts with — repeat outside what is drawn and render exactly
  // like the plain form. Somebody would turn repetition on and see nothing.
  it("compresses the stops into one repetition", () => {
    expect(gradientCss(g(stops, 90, { repeating: true, every: 25 }))).toBe(
      "repeating-linear-gradient(90deg, #ff0000 0%, #0000ff 25%)",
    );
  });

  it("repeats a radial and a conic gradient too", () => {
    expect(
      gradientCss(g(stops, 0, { kind: "radial", repeating: true, every: 20 })),
    ).toContain("repeating-radial-gradient(");
    expect(
      gradientCss(g(stops, 0, { kind: "conic", repeating: true, every: 20 })),
    ).toContain("repeating-conic-gradient(");
  });

  it("ignores the length while repetition is off", () => {
    expect(gradientCss(g(stops, 90, { repeating: false, every: 10 }))).toBe(
      "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)",
    );
  });
});

describe("parseGradient, the shape fields", () => {
  const stored = {
    stops: [{ color: "#ff0000", at: 0 }],
  };

  it("reads a shape somebody chose", () => {
    expect(
      parseGradient({
        ...stored,
        kind: "conic",
        repeating: true,
        every: 30,
        shape: "circle",
        extent: "closest-corner",
        x: 10,
        y: 90,
      }),
    ).toMatchObject({
      kind: "conic",
      repeating: true,
      every: 30,
      shape: "circle",
      extent: "closest-corner",
      x: 10,
      y: 90,
    });
  });

  // A stored value that is not one of the allowed ones is nonsense rather than
  // a choice, and a public page must still render — so it falls back rather
  // than throwing, exactly as a bad colour does.
  it("falls back on a value that is not one of the allowed ones", () => {
    expect(
      parseGradient({
        ...stored,
        kind: "spiral",
        shape: "hexagon",
        extent: "somewhere",
      }),
    ).toMatchObject({
      kind: "linear",
      shape: "ellipse",
      extent: "farthest-corner",
    });
  });

  it("clamps a centre and a repetition to their ranges", () => {
    expect(
      parseGradient({ ...stored, x: -40, y: 900, every: 4000 }),
    ).toMatchObject({ x: 0, y: 100, every: 100 });
    expect(parseGradient({ ...stored, every: -3 })).toMatchObject({ every: 5 });
  });

  it("falls back on a centre that is not a number", () => {
    expect(
      parseGradient({ ...stored, x: "left", y: null, every: Number.NaN }),
    ).toMatchObject({ x: 50, y: 50, every: 25 });
  });

  // `repeating` is read as an identity rather than for truthiness, so a stored
  // `"false"` — which is truthy — cannot silently turn repetition on.
  it("treats anything but true as not repeating", () => {
    expect(parseGradient({ ...stored, repeating: "false" })).toMatchObject({
      repeating: false,
    });
  });
});
