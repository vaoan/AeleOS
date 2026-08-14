import { MAX_CANVAS_COLOURS } from "@/shared/domain/canvas-slots";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEME_SEEDS,
  accentPreview,
  isCustomised,
  isThemed,
  parseTheme,
  themeCss,
  themeVars,
  withCanvasColour,
  withChosenColour,
} from "@/features/actors/domain/actor-theme";

/**
 * A gradient of one colour, which is what a flat background is now.
 *
 * @param color - the colour.
 * @returns the gradient.
 */
const flat = (color: string) => ({ angle: 90, stops: [{ color, at: 0 }] });

describe("parseTheme", () => {
  it("reads a theme somebody chose", () => {
    expect(
      parseTheme({
        background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
        accent: "#00ff88",
        canvasColours: ["#112233", "#445566"],
        canvas: "none",
        skin: "retro",
      }),
    ).toEqual({
      background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
      accent: "#00ff88",
      canvasColours: ["#112233", "#445566"],
      canvas: "none",
      cursor: null,
      skin: "retro",
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
    background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
    accent: "#00ff88",
  };

  // The point of the redesign, asserted on the OUTPUT rather than by trusting
  // derivePalette: a theme brings its own background, so the page is one
  // palette that reads the same for everybody.
  it("emits a whole palette, not just an accent", () => {
    const vars = themeVars(THEMED);
    // `--field` is the author's own background, verbatim — flat when they chose
    // one colour, a gradient when they chose several.
    expect(vars["--field"]).toBeTruthy();
    for (const token of [
      "--surface-solid",
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
  ])("blends the cloud for %s with %s", (colour, blend) => {
    expect(
      themeVars({ ...THEMED, background: flat(colour) })["--nebula-blend"],
    ).toBe(blend);
  });

  // One property per slot, indexed from one, so a canvas asks for the slot it
  // wants rather than for a letter that meant something only while there were
  // two of them.
  it("passes each canvas colour through as the channels the canvas reads", () => {
    const vars = themeVars({
      ...THEMED,
      canvasColours: ["#0a141e", "#ffffff", "#000000"],
    });
    expect(vars["--canvas-1"]).toBe("10 20 30");
    expect(vars["--canvas-2"]).toBe("255 255 255");
    expect(vars["--canvas-3"]).toBe("0 0 0");
  });

  // `none` travels as the canvas's NAME. It used to travel as an opacity of
  // zero, which silently did nothing: the canvas rejects a non-positive opacity
  // as unset and draws the ordinary cloud instead.
  // themeVars is exported and its input is only typed, not proven — a theme
  // assembled by hand can carry a colour that is not one, and it must emit
  // nothing for that slot rather than a property containing NaN.
  it("emits nothing for a canvas colour it cannot read", () => {
    const vars = themeVars({
      ...THEMED,
      canvasColours: ["#0a141e", "chartreuse", "#ffffff"],
    });
    expect(vars["--canvas-1"]).toBe("10 20 30");
    expect(vars["--canvas-2"]).toBeUndefined();
    expect(vars["--canvas-3"]).toBe("255 255 255");
  });

  it("switches the cloud off by naming the canvas, not by zeroing it", () => {
    const vars = themeVars({ ...THEMED, canvas: "none" });
    expect(vars["--canvas"]).toBe("none");
    expect(vars["--nebula-opacity"]).toBeUndefined();
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
    expect(themeVars({ ...DEFAULT_THEME, canvasColours: ["#0a141e"] })).toEqual(
      {
        "--canvas-1": "10 20 30",
      },
    );
  });

  // A gradient whose every stop is unreadable parses to nothing at all, so
  // there is no background to solve against and no palette to emit.
  it.each(["not a colour", "#12345", ""])(
    "emits no palette for the unparseable background %o",
    (colour) => {
      expect(
        themeVars({
          ...DEFAULT_THEME,
          background: parseTheme({
            background: { stops: [{ color: colour, at: 0 }] },
          }).background,
        }),
      ).toEqual({});
    },
  );
});

describe("accentPreview", () => {
  it("reports the accent as rendered on the chosen background", () => {
    expect(accentPreview("#00ff88", flat("#1a1a2e"))).toMatch(/^oklch\(/);
  });

  // A background whose stops are unreadable derives no palette, so there is
  // nothing to solve against and the accent comes back exactly as picked.
  it("gives the accent back unchanged when there is no palette", () => {
    expect(
      accentPreview("#00ff88", {
        angle: 90,
        stops: [{ color: "nope", at: 0 }],
      }),
    ).toBe("#00ff88");
  });

  // The accent is the author's, exactly, whatever they put it on. It used to be
  // solved against the background and therefore differed by it; that correction
  // was given up deliberately in favour of full creativity, with the visitor's
  // ability to switch to a default theme as the safeguard.
  it("does not change with the background", () => {
    expect(accentPreview("#00ff88", flat("#0a0a0a"))).toBe(
      accentPreview("#00ff88", flat("#fefefe")),
    );
  });
});

describe("themeCss", () => {
  const THEMED = {
    ...DEFAULT_THEME,
    background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
  };

  // One rule, no media queries. Both are consequences of a theme being one
  // palette: there is only one rendering, so there is nothing to pick between.
  it("emits a single rule with no scheme to pick between", () => {
    const css = themeCss(THEMED);
    expect(css).not.toContain("prefers-color-scheme");
    expect(css.match(/\{/g)).toHaveLength(1);
  });

  // Gated on the ABSENCE of an opt-out rather than the presence of an opt-in,
  // so a page still wears its owner's colours when the pre-paint script never
  // ran — a visitor with no JavaScript gets the theme, not the fallback.
  it("applies unless the visitor has opted out", () => {
    expect(themeCss(THEMED)).toContain(
      ':root:not([data-page-theme="default"]){',
    );
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
  // A hostile stop does not parse as a colour, so it is dropped entirely and
  // never reaches the stylesheet — the same rule that drops any unreadable
  // value rather than defaulting it.
  it.each(["#1a1a2e}body{display:none", "red;}*{color:red", "</style>"])(
    "cannot be escaped through the background %s",
    (colour) => {
      const css = themeCss({
        ...DEFAULT_THEME,
        background: parseTheme({
          background: { stops: [{ color: colour, at: 0 }] },
        }).background,
      });
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
    expect(chosen.background).not.toBeNull();
    expect(chosen.canvasColours).not.toBeNull();
  });

  // Nothing may move at the moment of promotion: the values written are the
  // ones the page was already showing. What changes is that they stop moving.
  it("promotes the others to what the page already looked like", () => {
    const chosen = withChosenColour(DEFAULT_THEME, "accent", "#00ff88");
    expect(chosen.canvasColours).toEqual([...THEME_SEEDS.canvasColours]);
  });

  it("leaves colours somebody already chose alone", () => {
    const themed = { ...DEFAULT_THEME, canvasColours: ["#112233"] };
    expect(withChosenColour(themed, "accent", "#00ff88").canvasColours).toEqual(
      ["#112233"],
    );
  });

  it("keeps the canvas", () => {
    const themed = { ...DEFAULT_THEME, canvas: "stars" as const };
    expect(withChosenColour(themed, "accent", "#00ff88").canvas).toBe("stars");
  });

  it.each(["accent"] as const)("sets %s when that is the one picked", (key) => {
    expect(withChosenColour(DEFAULT_THEME, key, "#00ff88")[key]).toBe(
      "#00ff88",
    );
  });
});

describe("isThemed", () => {
  // A colour input always carries a value, so without this the design's own
  // colour is presented as though somebody had picked it.
  it("is false until somebody picks something", () => {
    expect(isThemed(DEFAULT_THEME)).toBe(false);
  });

  it.each(["accent"] as const)("is true once %s is set", (key) => {
    expect(isThemed({ ...DEFAULT_THEME, [key]: "#00ff88" })).toBe(true);
  });

  // Deliberately narrow: this drives the "default" mark beside the colour
  // inputs, and a canvas, a cursor and a skin each say what they are. Reset
  // asks `isCustomised` instead, which is the wider question.
  it("is not made true by the canvas, the skin or the cursor", () => {
    expect(isThemed({ ...DEFAULT_THEME, canvas: "stars" })).toBe(false);
    expect(isThemed({ ...DEFAULT_THEME, skin: "glass" })).toBe(false);
    expect(isThemed({ ...DEFAULT_THEME, cursor: "https://e.test/c.png" })).toBe(
      false,
    );
  });
});

describe("isCustomised", () => {
  it("is false for a theme nobody has touched", () => {
    expect(isCustomised(DEFAULT_THEME)).toBe(false);
  });

  // Reset used to ask `isThemed`, so somebody who had chosen only one of these
  // faced a disabled button with nothing saying why.
  it.each([
    ["a colour", { accent: "#00ff88" }],
    ["a canvas", { canvas: "stars" as const }],
    ["a cursor", { cursor: "https://example.test/c.png" }],
    ["a skin", { skin: "neobrutalism" as const }],
  ])("is true once there is %s to put back", (_what, part) => {
    expect(isCustomised({ ...DEFAULT_THEME, ...part })).toBe(true);
  });
});

describe("the skin", () => {
  it("survives being stored and read back", () => {
    expect(parseTheme({ skin: "candy" }).skin).toBe("candy");
  });

  // Matched against the list rather than with `in`, exactly as the canvas is:
  // `toString` is a property of every object and would otherwise be accepted
  // as the name of a style.
  it.each(["stained-glass", "toString", "__proto__", 42, null])(
    "falls back to the default for %o",
    (skin) => {
      expect(parseTheme({ skin }).skin).toBe(DEFAULT_THEME.skin);
    },
  );

  it("contributes nothing when it is the default", () => {
    const vars = themeVars(DEFAULT_THEME);
    expect(Object.keys(vars).filter((k) => k.startsWith("--skin"))).toEqual([]);
  });

  it("travels as the properties it overrides, not as its name", () => {
    const vars = themeVars({ ...DEFAULT_THEME, skin: "neobrutalism" });
    expect(vars["--skin-round"]).toBe("0");
    expect(vars["--skin-border"]).toBe("3px");
    expect(Object.values(vars)).not.toContain("neobrutalism");
  });

  // A page with a style and no colours still has something for a visitor to
  // take off, so the rule has to be emitted.
  it("is enough on its own to produce a rule", () => {
    expect(themeCss({ ...DEFAULT_THEME, skin: "glass" })).toContain(
      "--skin-round",
    );
  });

  // Glass is the one that shows the composition working end to end: it sets
  // `--surface`, the palette sets `--surface-solid`, and both have to reach the
  // rule or the panel is either opaque or colourless. That the two names never
  // collide is `skins.test.ts`'s job — spreading them in a particular order is
  // not the guarantee it looks like, since a collision would simply be won by
  // whichever came second.
  it("lowers a surface's alpha without touching the palette's colour", () => {
    const vars = themeVars({
      ...DEFAULT_THEME,
      skin: "glass",
      background: flat("#1a1a2e"),
    });
    expect(vars["--surface-solid"]).toMatch(/^oklch\(/);
    expect(vars["--surface"]).toContain("var(--surface-solid)");
  });
});

describe("withCanvasColour", () => {
  // The same all-or-nothing rule the other colours follow: a theme half
  // following the design and half not is one whose preview depends on which
  // half somebody happens to be looking at.
  it("makes the rest of the theme explicit too", () => {
    const chosen = withCanvasColour(DEFAULT_THEME, 0, "#00ff88");
    expect(chosen.canvasColours?.[0]).toBe("#00ff88");
    expect(chosen.background).not.toBeNull();
    expect(chosen.accent).not.toBeNull();
  });

  it("leaves the other slots as they were", () => {
    const chosen = withCanvasColour(DEFAULT_THEME, 1, "#00ff88");
    expect(chosen.canvasColours?.[0]).toBe(THEME_SEEDS.canvasColours[0]);
    expect(chosen.canvasColours?.[1]).toBe("#00ff88");
  });

  // A canvas taking four colours must let its fourth be picked before its
  // third, so the list grows to reach the slot rather than refusing it.
  it("grows the list to reach a slot beyond the end", () => {
    const short = { ...DEFAULT_THEME, canvasColours: ["#112233"] };
    const chosen = withCanvasColour(short, 3, "#00ff88");
    expect(chosen.canvasColours).toHaveLength(4);
    expect(chosen.canvasColours?.[3]).toBe("#00ff88");
  });

  // What makes the growth loop total without a fallback: there is a seed for
  // every slot the greediest canvas can ask for. A canvas added with more slots
  // than seeds would otherwise fill the gap with undefined.
  it("has a seed for every slot any canvas can use", () => {
    expect(THEME_SEEDS.canvasColours).toHaveLength(MAX_CANVAS_COLOURS);
  });

  // Clamped rather than refused: a slot beyond the end is a caller mistake, and
  // silently doing nothing is harder to notice than colouring the last one.
  it("clamps a slot beyond what any canvas uses", () => {
    const chosen = withCanvasColour(DEFAULT_THEME, 40, "#00ff88");
    expect(chosen.canvasColours).toHaveLength(MAX_CANVAS_COLOURS);
    expect(chosen.canvasColours?.[MAX_CANVAS_COLOURS - 1]).toBe("#00ff88");
  });

  it("keeps the canvas", () => {
    expect(
      withCanvasColour({ ...DEFAULT_THEME, canvas: "aurora" }, 0, "#00ff88")
        .canvas,
    ).toBe("aurora");
  });
});

describe("the canvas colours a stored theme carries", () => {
  it("reads a list somebody chose", () => {
    expect(
      parseTheme({ canvasColours: ["#00ff88", "#112233"] }).canvasColours,
    ).toEqual(["#00ff88", "#112233"]);
  });

  // Dropped rather than defaulted, exactly as a gradient stop is: inventing one
  // puts a colour on the page nobody picked.
  it("drops an entry that is not a colour", () => {
    expect(
      parseTheme({ canvasColours: ["#00ff88", "chartreuse"] }).canvasColours,
    ).toEqual(["#00ff88"]);
  });

  it("overrides nothing when no entry survives", () => {
    expect(parseTheme({ canvasColours: ["nope"] }).canvasColours).toBeNull();
  });

  it.each([null, "#00ff88", 42, {}])(
    "overrides nothing for %o, which is not a list",
    (value) => {
      expect(parseTheme({ canvasColours: value }).canvasColours).toBeNull();
    },
  );

  it("keeps no more than the greediest canvas can use", () => {
    expect(
      parseTheme({
        canvasColours: Array.from({ length: 20 }, () => "#00ff88"),
      }).canvasColours,
    ).toHaveLength(MAX_CANVAS_COLOURS);
  });
});

describe("a custom cursor", () => {
  it("is emitted with a fallback keyword", () => {
    const vars = themeVars({
      ...DEFAULT_THEME,
      cursor: "https://example.test/paw.png",
    });
    expect(vars.cursor).toBe('url("https://example.test/paw.png") 0 0, auto');
  });

  // The fallback is mandatory: a `cursor` carrying a url and no keyword is an
  // invalid declaration, and the browser drops the whole rule.
  it("never emits a url without one", () => {
    const vars = themeVars({
      ...DEFAULT_THEME,
      cursor: "https://example.test/paw.png",
    });
    expect(vars.cursor).toMatch(/, auto$/);
  });

  // The hotspot is fixed and not the author's to choose. An offset one makes
  // the arrow somebody sees disagree with where their click lands, which is a
  // clickjacking primitive on a page anybody can publish.
  it("pins the hotspot to the corner", () => {
    expect(
      themeVars({ ...DEFAULT_THEME, cursor: "https://example.test/p.png" })
        .cursor,
    ).toContain(") 0 0,");
  });

  it("emits nothing when nobody chose one", () => {
    expect(themeVars(DEFAULT_THEME).cursor).toBeUndefined();
  });

  // **A CSS injection sink, and the boundary is not where it looks.** `new URL`
  // already neutralises some of what would break out — a quote becomes `%22`, a
  // space `%20`, a backslash is normalised to a slash — so those arrive safe.
  //
  // What it does NOT touch is a parenthesis or an apostrophe in a path: both
  // survive parsing verbatim, and either closes the `url("…")` early. Those are
  // what this refuses, and the list was written believing the quote was the
  // dangerous one.
  it.each([
    "https://example.test/a').png",
    "https://example.test/a)x.png",
    "https://example.test/a(x.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "not a url",
  ])("refuses %s", (cursor) => {
    expect(parseTheme({ cursor }).cursor).toBeNull();
  });

  // Accepted BECAUSE parsing already made them harmless. Refusing these too
  // would turn a safety rule into an arbitrary one, and an author pasting a URL
  // with a space in it would be told no for no reason.
  it.each([
    ['https://example.test/a".png', "https://example.test/a%22.png"],
    ["https://example.test/a x.png", "https://example.test/a%20x.png"],
    ["https://example.test/a\\x.png", "https://example.test/a/x.png"],
  ])("accepts %s, which parsing already made safe", (cursor, expected) => {
    expect(parseTheme({ cursor }).cursor).toBe(expected);
  });

  it("keeps an ordinary address", () => {
    expect(
      parseTheme({ cursor: "https://example.test/cursors/paw-32.png?v=2" })
        .cursor,
    ).toBe("https://example.test/cursors/paw-32.png?v=2");
  });

  // Hyphens are everywhere in real URLs. An earlier version of the refusal list
  // rejected them by accident, which would have refused most of the internet.
  it("keeps hyphens and the ordinary path characters", () => {
    expect(
      parseTheme({ cursor: "https://ex.test/a-b_c.d/e~f/g.png" }).cursor,
    ).toBe("https://ex.test/a-b_c.d/e~f/g.png");
  });
});

describe("a cursor address carrying a control character", () => {
  // Parsing percent-encodes it, so it arrives safe rather than refused. Stated
  // because a check for control characters was written here first and could
  // never fire — the same dead guard this file keeps catching.
  it("is made safe by parsing rather than refused", () => {
    const withControl = `https://example.test/a${String.fromCharCode(1)}b.png`;
    expect(parseTheme({ cursor: withControl }).cursor).toBe(
      "https://example.test/a%01b.png",
    );
  });
});
