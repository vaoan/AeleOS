import { describe, expect, it } from "vitest";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import {
  derivePalette,
  hexFromOklchValue,
  isDarkBackground,
} from "@/shared/domain/palette";
import {
  contrastRatio,
  parseHex,
  srgbToOklch,
  type Oklch,
} from "@/shared/domain/color";

/**
 * Reads one token back out of a palette as OKLCH.
 *
 * @param palette - the derived palette.
 * @param token - the custom property name.
 * @returns the colour.
 */
function colourOf(palette: Record<string, string>, token: string): Oklch {
  const found = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(
    palette[token] ?? "",
  );
  if (!found) throw new Error(`${token} is not a colour: ${palette[token]}`);
  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

// Deliberately hostile: the extremes, the mid-lightness colours that are hard
// to be readable against in either direction, and the fully saturated hues.
/**
 * A gradient of one colour, which is what a flat background is now.
 *
 * @param color - the colour.
 * @returns the gradient.
 */
const flat = (color: string) => ({
  ...DEFAULT_GRADIENT,
  angle: 90,
  stops: [{ color, at: 0 }],
});

const BACKGROUNDS = [
  "#ffffff",
  "#000000",
  "#7f7f7f",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#1a1a2e",
  "#f5e6d3",
  "#2d1b4e",
  "#0a0a0a",
  "#fefefe",
];

describe("derivePalette", () => {
  // **The author's own colours are kept exactly.** This reverses an earlier
  // design that pushed a background's lightness away from the middle and capped
  // its chroma so text could always clear 4.5:1. Full creativity is the product
  // decision: a page may be as garish as its owner likes, because the visitor
  // can switch to the default light or dark theme. The escape hatch is what
  // makes the freedom safe, not the correction.
  // The field is the author's gradient VERBATIM. Nothing lifts it, shifts it,
  // or caps its chroma any more — a one-stop gradient carries exactly the hex
  // they picked, at both ends of a degenerate gradient from that colour to
  // itself, which is the strongest form this assertion can take.
  //
  // **Not a bare `#rrggbb` any more.** `gradientCss` used to return one for a
  // single stop; it now always returns a valid CSS `<image>`, because
  // `--field` is a LAYER in `body`'s own `background-image` list beside an
  // author's picture (`bodyBackgroundVars` in `actor-theme.ts`), and a bare
  // colour there is not a valid `<image>` — it invalidated the whole
  // declaration and silently deleted the picture beside it.
  it.each(BACKGROUNDS)("renders %s exactly as it was picked", (background) => {
    expect(derivePalette(flat(background), "#00ff88")["--field"]).toBe(
      `linear-gradient(${background}, ${background})`,
    );
  });

  it("renders a many-stop gradient verbatim", () => {
    const many = {
      ...DEFAULT_GRADIENT,
      angle: 45,
      stops: [
        { color: "#ff0000", at: 0 },
        { color: "#00ff00", at: 50 },
        { color: "#0000ff", at: 100 },
      ],
    };
    expect(derivePalette(many, "#00ff88")["--field"]).toBe(
      "linear-gradient(45deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)",
    );
  });

  it("renders the accent exactly as it was picked", () => {
    const chosen = srgbToOklch(parseHex("#00ff88") as number[]);
    const palette = derivePalette(flat("#1a1a2e"), "#00ff88");
    expect(colourOf(palette, "--accent")[0]).toBeCloseTo(chosen[0], 3);
    expect(colourOf(palette, "--accent")[1]).toBeCloseTo(chosen[1], 3);
  });

  // What the author does NOT pick is still chosen to be as readable as that
  // background allows. On ordinary backgrounds that means clearing the minimum.
  describe.each([
    "#ffffff",
    "#000000",
    "#1a1a2e",
    "#f5e6d3",
    "#2d1b4e",
    "#0a0a0a",
  ])("on the readable background %s", (background) => {
    const palette = derivePalette(flat(background), "#00ff88");
    const surface = colourOf(palette, "--surface-solid");

    it.each(["--ink", "--ink-2", "--muted"])(
      "%s clears the text minimum",
      (token) => {
        expect(
          contrastRatio(colourOf(palette, token), surface),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );

    it("the border clears the non-text minimum", () => {
      expect(
        contrastRatio(colourOf(palette, "--edge"), surface),
      ).toBeGreaterThanOrEqual(3);
    });
  });

  // A mid-grey has NO text colour that clears 4.5:1 in either direction. The
  // honest answer is the better of the two, not a promise — and not a silently
  // altered background, which is what this used to do.
  // Measured against the FIELD, which is the colour the author actually chose —
  // a card steps away from the middle and so buys back contrast the field does
  // not have.
  //
  // **This assertion used to say the opposite for a mid-grey**, on the strength
  // of a 2.97 measured back when the field was lifted toward the middle before
  // being solved against. The gradient model does not lift anything, so the
  // text is solved against the raw colour and reaches 4.9 even there. The
  // claim was true of a design that no longer exists.
  it.each(BACKGROUNDS)(
    "gives %s readable text on its own field",
    (background) => {
      const palette = derivePalette(flat(background), "#00ff88");
      // `--field` is a gradient string now even for one stop (see the note
      // above), so the colour to measure against comes from `background`
      // itself rather than from parsing it back out of `--field`.
      const field = srgbToOklch(parseHex(background) as number[]);
      expect(
        contrastRatio(colourOf(palette, "--ink"), field),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  // One measurement of "is this page dark", shared by every token. Deciding it
  // per token by `lightness < 0.5` is what once put a white heading and
  // near-black body text on the same blue field.
  it.each(BACKGROUNDS)("agrees with itself about %s", (background) => {
    const palette = derivePalette(flat(background), "#00ff88");
    const surface = colourOf(palette, "--surface-solid");
    const above = (token: string) => colourOf(palette, token)[0] > surface[0];
    expect(above("--muted")).toBe(above("--ink"));
    expect(above("--edge")).toBe(above("--ink"));
  });

  it("keeps a heading louder than a muted label", () => {
    const palette = derivePalette(flat("#1a1a2e"), "#00ff88");
    const surface = colourOf(palette, "--surface-solid");
    expect(contrastRatio(colourOf(palette, "--ink"), surface)).toBeGreaterThan(
      contrastRatio(colourOf(palette, "--muted"), surface),
    );
  });

  // The hue carries into every token, so a palette reads as one colour scheme
  // rather than as grey text dropped onto a tint.
  it("carries the background's hue into the text", () => {
    const palette = derivePalette(flat("#2d1b4e"), "#00ff88");
    expect(colourOf(palette, "--ink")[2]).toBeCloseTo(
      colourOf(palette, "--surface-solid")[2],
      0,
    );
  });

  // A one-stop background is a degenerate gradient, from its colour to
  // itself; more than one stop is an ordinary gradient. Both are the
  // author's, verbatim.
  it("writes a flat background as a gradient and a gradient as a gradient", () => {
    expect(derivePalette(flat("#1a1a2e"), "#00ff88")["--field"]).toBe(
      "linear-gradient(#1a1a2e, #1a1a2e)",
    );
    expect(
      derivePalette(
        {
          ...DEFAULT_GRADIENT,
          angle: 90,
          stops: [
            { color: "#1a1a2e", at: 0 },
            { color: "#2d1b4e", at: 100 },
          ],
        },
        "#00ff88",
      )["--field"],
    ).toContain("linear-gradient");
  });

  it.each([
    ["#0a0a0a", "screen"],
    ["#fefefe", "multiply"],
  ])("blends the cloud for %s with %s", (background, blend) => {
    expect(derivePalette(flat(background), "#00ff88")["--nebula-blend"]).toBe(
      blend,
    );
  });

  it("keeps a label on the accent readable, since nobody picks that one", () => {
    for (const accent of ["#00ff88", "#000000", "#ffffff", "#7f7f7f"]) {
      const palette = derivePalette(flat("#1a1a2e"), accent);
      expect(
        contrastRatio(
          colourOf(palette, "--on-accent"),
          colourOf(palette, "--accent"),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to the text colour when the accent is not a colour", () => {
    const palette = derivePalette(flat("#1a1a2e"), "nonsense");
    expect(palette["--accent"]).toBe(palette["--ink"]);
  });

  it.each(["", "not a colour", "#12345"])("derives nothing from %o", (bad) => {
    expect(derivePalette(flat(bad), "#00ff88")).toEqual({});
  });
});

describe("isDarkBackground", () => {
  it.each([
    ["#000000", true],
    ["#1a1a2e", true],
    ["#ffffff", false],
    ["#f5e6d3", false],
  ])("reads %s as dark=%s", (hex, dark) => {
    expect(isDarkBackground(flat(hex))).toBe(dark);
  });

  it("is not dark when the value is not a colour", () => {
    expect(isDarkBackground(flat("nonsense"))).toBe(false);
  });
});

describe("hexFromOklchValue", () => {
  // The configurator seeds its inputs from the live computed styles, so that
  // nothing moves the moment somebody starts theming.
  it("reads a computed value back to hex", () => {
    expect(hexFromOklchValue("oklch(0.46 0.15 25)")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("tolerates the spacing a browser produces", () => {
    expect(hexFromOklchValue("oklch( 0.46  0.15  25 )")).toMatch(
      /^#[0-9a-f]{6}$/,
    );
  });

  it.each(["", "rebeccapurple", "rgb(1 2 3)"])(
    "returns null for %o",
    (value) => {
      expect(hexFromOklchValue(value)).toBeNull();
    },
  );
});

describe("the memoised solve", () => {
  // The property that makes memoising correct: the solve depends on the hardest
  // stop and the accent, and on nothing else about the gradient. If this ever
  // stops holding, the cache starts serving the wrong palette.
  it("does not depend on the angle", () => {
    const stops = [
      { color: "#1a1a2e", at: 0 },
      { color: "#f3e3d3", at: 100 },
    ];
    const a = derivePalette(
      { ...DEFAULT_GRADIENT, angle: 0, stops },
      "#00ff88",
    );
    const b = derivePalette(
      { ...DEFAULT_GRADIENT, angle: 270, stops },
      "#00ff88",
    );
    expect(a["--ink"]).toBe(b["--ink"]);
    expect(a["--surface-solid"]).toBe(b["--surface-solid"]);
    // The field DOES follow the angle, which is why it is spliced in rather
    // than cached with the rest.
    expect(a["--field"]).not.toBe(b["--field"]);
  });

  it("does not depend on where a stop sits", () => {
    const at = (n: number) =>
      derivePalette(
        {
          ...DEFAULT_GRADIENT,
          angle: 90,
          stops: [
            { color: "#1a1a2e", at: 0 },
            { color: "#f3e3d3", at: n },
          ],
        },
        "#00ff88",
      );
    expect(at(60)["--ink"]).toBe(at(90)["--ink"]);
  });

  // A changed colour must still be honoured — a cache that never missed would
  // be a cache that had stopped working.
  it("follows a changed accent", () => {
    const stops = [{ color: "#1a1a2e", at: 0 }];
    expect(
      derivePalette({ ...DEFAULT_GRADIENT, angle: 90, stops }, "#00ff88")[
        "--accent"
      ],
    ).not.toBe(
      derivePalette({ ...DEFAULT_GRADIENT, angle: 90, stops }, "#ff0088")[
        "--accent"
      ],
    );
  });

  // Keyed on values a person types, so it is bounded: an unbounded cache keyed
  // on user input is a slow memory leak rather than an optimisation. Well past
  // the limit, and the answers must still be right.
  it("stays correct past its own limit", () => {
    for (let i = 0; i < 200; i += 1) {
      const shade = i.toString(16).padStart(2, "0");
      derivePalette(
        {
          ...DEFAULT_GRADIENT,
          angle: 90,
          stops: [{ color: `#1a1a${shade}`, at: 0 }],
        },
        "#00ff88",
      );
    }
    const again = derivePalette(
      { ...DEFAULT_GRADIENT, angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
      "#00ff88",
    );
    expect(again["--ink"]).toBeTruthy();
    expect(again["--field"]).toBe("linear-gradient(#1a1a2e, #1a1a2e)");
  });
});

describe("the menu colour", () => {
  // **THE REGRESSION TEST for a themed page's unreadable dropdown.** `--menu`
  // is declared per MODE in `globals.css`, so a page wearing an author's theme
  // used to keep the design's own menu while `--ink` became whatever their
  // gradient derived. An author picking a dark background on a light reader's
  // screen got near-white text on the near-white default menu — the original
  // dropdown bug, rebuilt by theming.
  //
  // Measured in a browser before the fix: menu `lab(98.8 …)`, ink
  // `oklch(0.97 …)`.
  it("is derived alongside every other colour", () => {
    expect(derivePalette(flat("#101736"), "#6ee7c8")["--menu"]).toBeTruthy();
  });

  // **Opaque, or it is the same bug with an extra step.** A translucent menu
  // composites onto whatever the browser paints behind it, which is the white
  // this exists to escape. `--surface` carries an alpha and cannot serve.
  it.each(["#101736", "#ffffff", "#808080", "#ff00ff"])(
    "is opaque on %s",
    (background) => {
      expect(derivePalette(flat(background), "#6ee7c8")["--menu"]).not.toMatch(
        /\//,
      );
    },
  );

  // The point of deriving it at all: text on it stays readable whatever the
  // author picked. Solved against the surface, which is a step from the field,
  // so this is the same guarantee the cards already carry.
  it.each(["#101736", "#ffffff", "#000000", "#808080", "#ff00ff", "#0000ff"])(
    "carries readable text on %s",
    (background) => {
      const palette = derivePalette(flat(background), "#6ee7c8");
      expect(
        contrastRatio(colourOf(palette, "--ink"), colourOf(palette, "--menu")),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
