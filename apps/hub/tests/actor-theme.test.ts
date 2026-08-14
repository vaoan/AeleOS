import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEME_SEEDS,
  accentPreview,
  isThemed,
  withChosenColour,
  parseTheme,
  themeCss,
  themeVars,
} from "@/features/actors/domain/actor-theme";

describe("parseTheme", () => {
  it("reads a theme somebody chose", () => {
    expect(
      parseTheme({
        background: "#1a1a2e",
        accent: "#00ff88",
        backdropA: "#112233",
        backdropB: "#445566",
        canvas: "none",
      }),
    ).toEqual({
      background: "#1a1a2e",
      accent: "#00ff88",
      backdropA: "#112233",
      backdropB: "#445566",
      canvas: "none",
    });
  });

  it("normalises a short colour", () => {
    expect(parseTheme({ accent: "#0f8" }).accent).toBe("#00ff88");
  });

  // Null is not a fallback here, it is the answer: override nothing and let
  // globals.css keep its own accent. A stored value that is not a colour has
  // to mean the same thing, because the alternative is inventing one.
  it("overrides nothing when a colour was never chosen", () => {
    expect(parseTheme({}).accent).toBeNull();
    expect(parseTheme({ accent: "chartreuse" }).accent).toBeNull();
  });

  // The column predates theming, so an absent value is the ordinary case.
  it.each([null, undefined, 42, "blue", [], true])(
    "falls back completely for %o",
    (value) => {
      expect(parseTheme(value)).toEqual(DEFAULT_THEME);
    },
  );

  it("keeps the half that is valid", () => {
    expect(parseTheme({ accent: "#00ff88", canvas: "not-a-canvas" })).toEqual({
      ...DEFAULT_THEME,
      accent: "#00ff88",
    });
  });

  // `"toString"` is a property of every object, so a membership test written
  // as `canvas in CANVASES` rather than against the list would accept it and
  // then look for a canvas by that name.
  it.each(["toString", "constructor", "__proto__"])(
    "falls back for the inherited key %s",
    (canvas) => {
      expect(parseTheme({ canvas }).canvas).toBe(DEFAULT_THEME.canvas);
    },
  );
});

describe("themeVars", () => {
  const THEMED = {
    ...DEFAULT_THEME,
    background: "#1a1a2e",
    accent: "#00ff88",
  };

  // The point of the redesign, asserted on the OUTPUT rather than by trusting
  // derivePalette: a theme brings its own background, so the page is one
  // palette that reads the same for everybody.
  it("emits a whole palette, not just an accent", () => {
    const vars = themeVars(THEMED);
    // `--field` is a gradient rather than a colour, so it is checked apart.
    expect(vars["--field"]).toContain("radial-gradient");
    for (const token of [
      "--surface",
      "--ink",
      "--ink-2",
      "--muted",
      "--edge",
      "--accent",
      "--on-accent",
    ]) {
      expect(vars[token]).toMatch(/^oklch\(/);
    }
  });

  // It used to take a mode and return a different accent for each, because an
  // accent cannot be legible on both a near-white and a near-black surface.
  // That made a custom theme two themes. There is one rendering now.
  it("renders one accent, not one per scheme", () => {
    expect(themeVars(THEMED)).toEqual(themeVars(THEMED));
    expect(themeVars(THEMED)["--accent"]).toBeDefined();
  });

  // Read from the background rather than the reader's mode, which is what stops
  // a custom theme inverting when somebody switches scheme.
  it.each([
    ["#0a0a0a", "screen"],
    ["#fefefe", "multiply"],
  ])("blends the cloud for %s with %s", (background, blend) => {
    expect(themeVars({ ...THEMED, background })["--nebula-blend"]).toBe(blend);
  });

  it("passes the cloud colours through as the channels the canvas reads", () => {
    const vars = themeVars({
      ...THEMED,
      backdropA: "#0a141e",
      backdropB: "#ffffff",
    });
    expect(vars["--nebula-a"]).toBe("10 20 30");
    expect(vars["--nebula-b"]).toBe("255 255 255");
  });

  it("switches the cloud off for the none canvas", () => {
    expect(themeVars({ ...THEMED, canvas: "none" })["--nebula-opacity"]).toBe(
      "0",
    );
  });

  it("names the canvas when it is not the default", () => {
    expect(themeVars({ ...THEMED, canvas: "stars" })["--canvas"]).toBe("stars");
  });

  it("does not name the canvas when it is the default", () => {
    expect(themeVars(THEMED)["--canvas"]).toBeUndefined();
  });

  // An unthemed page must emit NOTHING, so a page nobody has touched is exactly
  // what it was before any of this existed.
  it("overrides nothing at all for the default theme", () => {
    expect(themeVars(DEFAULT_THEME)).toEqual({});
  });

  // Unreachable from the editor, which fills every colour the moment one is
  // picked — but the column predates all of this and may hold it.
  it("emits no palette without a background to solve against", () => {
    expect(themeVars({ ...DEFAULT_THEME, backdropA: "#0a141e" })).toEqual({
      "--nebula-a": "10 20 30",
    });
  });

  it.each(["not a colour", "#12345", ""])(
    "emits no palette for the unparseable background %o",
    (background) => {
      expect(themeVars({ ...DEFAULT_THEME, background })).toEqual({});
    },
  );
});

describe("accentPreview", () => {
  it("reports the accent as rendered on the chosen background", () => {
    expect(accentPreview("#00ff88", "#1a1a2e")).toMatch(/^oklch\(/);
  });

  // A background that is not a colour derives no palette, so there is nothing
  // to solve against and the accent comes back exactly as picked. Reachable
  // from a stored value, never from the editor.
  it("gives the accent back unchanged when there is no palette", () => {
    expect(accentPreview("#00ff88", "not a colour")).toBe("#00ff88");
  });

  // The accent is the author's, exactly, whatever they put it on. It used to be
  // solved against the background and therefore differed by it; that correction
  // was given up deliberately in favour of full creativity, with the visitor's
  // ability to switch to a default theme as the safeguard.
  it("does not change with the background", () => {
    expect(accentPreview("#00ff88", "#0a0a0a")).toBe(
      accentPreview("#00ff88", "#fefefe"),
    );
  });
});

describe("themeCss", () => {
  const THEMED = { ...DEFAULT_THEME, background: "#1a1a2e" };

  // One rule, no media queries. Both are consequences of a theme being one
  // palette: there is only one rendering, so there is nothing to pick between.
  it("emits a single :root rule", () => {
    const css = themeCss(THEMED);
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).not.toContain("data-theme");
  });

  // The field the body paints and the canvas in the root layout are both
  // outside anything a page could scope to. Scoping to a nested element is why
  // an earlier version reached neither.
  it("puts the palette where the body and the canvas can see it", () => {
    expect(themeCss(THEMED)).toContain("--field");
  });

  it("emits nothing for a theme that overrides nothing", () => {
    expect(themeCss(DEFAULT_THEME)).toBe("");
  });

  // Nothing a person typed may reach a stylesheet. A `}` that survived would
  // close the rule and everything after it would be CSS somebody else wrote.
  it.each(["#1a1a2e}body{display:none", "red;}*{color:red", "</style>"])(
    "cannot be escaped through the background %s",
    (background) => {
      const css = themeCss({ ...DEFAULT_THEME, background });
      expect(css).not.toContain("body{");
      expect(css).not.toContain("*{");
      expect(css).not.toContain("</style>");
    },
  );
});

describe("withChosenColour", () => {
  // A theme is all-default or all-chosen, never half of each. Picking only an
  // accent left the cloud colours following the design, so they moved with the
  // reader's scheme while the accent did not — and what an author saw depended
  // on which mode they happened to be editing in.
  it("makes every colour explicit when the first one is picked", () => {
    const chosen = withChosenColour(DEFAULT_THEME, "accent", "#00ff88");
    expect(chosen.accent).toBe("#00ff88");
    expect(chosen.backdropA).not.toBeNull();
    expect(chosen.backdropB).not.toBeNull();
  });

  // Nothing may move at the moment of promotion: the values written are the
  // ones the page was already showing. What changes is that they stop moving.
  it("promotes the others to what the page already looked like", () => {
    const chosen = withChosenColour(DEFAULT_THEME, "accent", "#00ff88");
    expect(chosen.backdropA).toBe(THEME_SEEDS.backdropA);
    expect(chosen.backdropB).toBe(THEME_SEEDS.backdropB);
  });

  it("leaves colours somebody already chose alone", () => {
    const themed = { ...DEFAULT_THEME, backdropA: "#112233" };
    expect(withChosenColour(themed, "accent", "#00ff88").backdropA).toBe(
      "#112233",
    );
  });

  it("keeps the canvas", () => {
    const themed = { ...DEFAULT_THEME, canvas: "stars" as const };
    expect(withChosenColour(themed, "accent", "#00ff88").canvas).toBe("stars");
  });

  it.each(["accent", "backdropA", "backdropB"] as const)(
    "sets %s when that is the one picked",
    (key) => {
      expect(withChosenColour(DEFAULT_THEME, key, "#00ff88")[key]).toBe(
        "#00ff88",
      );
    },
  );
});

describe("isThemed", () => {
  // A colour input always carries a value, so without this the design's own
  // colour is presented as though somebody had picked it.
  it("is false until somebody picks something", () => {
    expect(isThemed(DEFAULT_THEME)).toBe(false);
  });

  it.each(["accent", "backdropA", "backdropB"] as const)(
    "is true once %s is set",
    (key) => {
      expect(isThemed({ ...DEFAULT_THEME, [key]: "#00ff88" })).toBe(true);
    },
  );

  // The canvas alone is not a colour, and the reset button reads this to decide
  // whether there is anything to put back.
  it("is not made true by the canvas alone", () => {
    expect(isThemed({ ...DEFAULT_THEME, canvas: "stars" })).toBe(false);
  });
});
