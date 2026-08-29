import { MAX_CANVAS_COLOURS } from "@/shared/domain/canvas-slots";
import { describe, expect, it } from "vitest";
import { SKIN_SCOPE } from "@/shared/domain/skins";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import {
  DEFAULT_THEME,
  type ActorTheme,
  THEME_SEEDS,
  isCustomised,
  isThemed,
  parseTheme,
  withCanvasColour,
  withChosenColour,
} from "@/features/actors/domain/actor-theme";
import {
  accentPreview,
  bodyBackgroundVars,
  themeCss,
  themeVars,
} from "@/features/actors/presentation/theme-css";

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

describe("parseTheme", () => {
  it("reads a theme somebody chose", () => {
    expect(
      parseTheme({
        background: {
          ...DEFAULT_GRADIENT,
          angle: 90,
          stops: [{ color: "#1a1a2e", at: 0 }],
        },
        accent: "#00ff88",
        canvasColours: ["#112233", "#445566"],
        canvas: "none",
        skin: "retro",
      }),
    ).toEqual({
      // Every shape field a stored background does not carry reads back as the
      // default, which is the linear gradient this app used to be able to make.
      background: {
        kind: "linear",
        repeating: false,
        every: 25,
        angle: 90,
        shape: "ellipse",
        extent: "farthest-corner",
        x: 50,
        y: 50,
        stops: [{ color: "#1a1a2e", at: 0 }],
      },
      accent: "#00ff88",
      // Absent from the stored object above, so it reads back as null — the
      // stepped panel every page had before this key existed.
      surface: null,
      canvasColours: ["#112233", "#445566"],
      canvas: "none",
      cursor: null,
      backgroundUrl: null,
      backgroundFit: "cover",
      measure: null,
      // Both new and both OPTIONS: a stored theme that names neither reads
      // back as the design's own, which is what every page written before
      // them carries.
      font: null,
      spacing: null,
      skin: "retro",
      density: 1,
      speed: 1,
      scale: 1,
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
    background: {
      ...DEFAULT_GRADIENT,
      angle: 90,
      stops: [{ color: "#1a1a2e", at: 0 }],
    },
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
        ...DEFAULT_GRADIENT,
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
    background: {
      ...DEFAULT_GRADIENT,
      angle: 90,
      stops: [{ color: "#1a1a2e", at: 0 }],
    },
  };

  it("preserves the public stylesheet contract", () => {
    expect(themeCss(THEMED)).toMatchInlineSnapshot(
      `":root:not([data-page-theme="default"]){--surface-solid:oklch(0.1784 0.0384 282.93);--menu:oklch(0.1784 0.0384 282.93);--bar-solid:oklch(0.1784 0.0384 282.93 / 0.55);--ink:oklch(0.9700 0.0384 282.93);--ink-2:oklch(0.8014 0.0341 282.93);--muted:oklch(0.6328 0.0341 282.93);--edge:oklch(0.5297 0.0355 282.93);--accent:oklch(0.4596 0.1492 25.26);--on-accent:oklch(0.9700 0.0384 282.93);--accent-soft:oklch(0.6396 0.1074 25.26);--on-accent-soft:oklch(0.1500 0.0384 282.93);--nebula-blend:screen;--field:linear-gradient(#1a1a2e, #1a1a2e)}"`,
    );
  });

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

  // **The guarantee two new keys must not break.** `DEFAULT_THEME` now
  // carries `backgroundUrl: null` and `backgroundFit: "cover"` alongside
  // every other field, and an untouched page must still emit no style
  // element at all — `ThemeScope` renders nothing when this is empty. This is
  // the assertion most likely to be skipped in favour of the interesting
  // case, so it is pinned on its own rather than trusted to the general one
  // above.
  it("still emits nothing for an untouched theme, background picture keys included", () => {
    expect(themeCss(DEFAULT_THEME)).toBe("");
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

describe("bodyBackgroundVars", () => {
  // **On body, never at :root** — the fault the browser check exists to
  // catch. `--field` is consumed by `body`'s own background in globals.css;
  // `body` is a descendant of `<html>` with an opaque background of its own,
  // so a picture written at `:root` would sit on an element nothing shows.
  // This is why the picture is a SECOND LAYER of `body`'s own
  // `background-image`, `var(--field)` included, rather than a property at
  // `:root` beside the ones `themeVars` writes.
  it("paints an address as cover by default, layered over --field", () => {
    const vars = bodyBackgroundVars({
      ...DEFAULT_THEME,
      backgroundUrl: "https://example.test/wallpaper.png",
    });
    expect(vars["background-image"]).toBe(
      'url("https://example.test/wallpaper.png"), var(--field)',
    );
    expect(vars["background-size"]).toBe("cover, cover");
    expect(vars["background-repeat"]).toBe("no-repeat, no-repeat");
  });

  it("paints an address as a tile when that is the chosen fit", () => {
    const vars = bodyBackgroundVars({
      ...DEFAULT_THEME,
      backgroundUrl: "https://example.test/wallpaper.png",
      backgroundFit: "tile",
    });
    expect(vars["background-image"]).toBe(
      'url("https://example.test/wallpaper.png"), var(--field)',
    );
    expect(vars["background-repeat"]).toBe("repeat, no-repeat");
    expect(vars["background-size"]).toBe("auto, cover");
  });

  it("emits nothing when nobody chose a picture", () => {
    expect(bodyBackgroundVars(DEFAULT_THEME)).toEqual({});
  });

  // The reuse this feature exists to prove: `backgroundImageValue`'s refusal
  // — widened in an earlier phase to cover the host quote and the query
  // backslash `safeHttpUrl`'s own normalisation leaves untouched — applies
  // here exactly as it does to a section's own background picture. An
  // address it refuses paints nothing rather than reaching the stylesheet.
  it.each([
    'https://ex"ample.test/a.png',
    "https://example.test/?x\\",
    "javascript:alert(1)",
  ])("paints nothing for the refused address %s", (backgroundUrl) => {
    expect(bodyBackgroundVars({ ...DEFAULT_THEME, backgroundUrl })).toEqual({});
  });
});

describe("themeCss and a background picture", () => {
  // The picture sits OVER the gradient as a second background-image LAYER
  // of body's own rule, never in place of it and never at :root — both
  // reach the SAME element's stylesheet rule together, so a transparent or
  // partial picture still shows the author's own colours underneath.
  it("emits a body rule with the picture layered over --field", () => {
    const css = themeCss({
      ...DEFAULT_THEME,
      background: {
        ...DEFAULT_GRADIENT,
        angle: 90,
        stops: [{ color: "#1a1a2e", at: 0 }],
      },
      backgroundUrl: "https://example.test/wallpaper.png",
    });
    expect(css).toContain("--field");
    expect(css).toContain(
      'body{background-image:url("https://example.test/wallpaper.png"), var(--field)',
    );
  });

  // The whole point: the picture's declarations reach `body`, not `:root`.
  // A regression that moved them back to `:root` would still pass every test
  // that only checks for the SUBSTRING — this pins where the substring is.
  it("puts the picture's rule on body, not on :root's own rule", () => {
    const css = themeCss({
      ...DEFAULT_THEME,
      backgroundUrl: "https://example.test/wallpaper.png",
    });
    const [rootRule, bodyRule] = css.split("body{");
    expect(rootRule).not.toContain("background-image");
    expect(bodyRule).toContain("background-image");
  });

  it("emits no body rule when there is no picture", () => {
    expect(themeCss(DEFAULT_THEME)).not.toContain("body{");
  });

  // The escape hatch: `PageThemeSwitch` works by writing `data-page-theme`,
  // and every rule this function emits has to answer to it or a visitor who
  // opts out still keeps whatever that rule set. Neither test above pins
  // this — `toContain("body{background-image:…")` and a split on `"body{"`
  // both still pass with the gate missing from the front of the selector,
  // because neither looks at what precedes `body{`. This one does.
  it("gates the body rule the same way as the other two", () => {
    const css = themeCss({
      ...DEFAULT_THEME,
      backgroundUrl: "https://example.test/wallpaper.png",
    });
    expect(css).toContain(
      ':root:not([data-page-theme="default"]) body{background-image',
    );
  });
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

  // Same reason the cursor is not a colour: a picture is not one either.
  it("is not made true by a background picture", () => {
    expect(
      isThemed({ ...DEFAULT_THEME, backgroundUrl: "https://e.test/bg.png" }),
    ).toBe(false);
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
    ["a background picture", { backgroundUrl: "https://example.test/bg.png" }],
  ])("is true once there is %s to put back", (_what, part) => {
    expect(isCustomised({ ...DEFAULT_THEME, ...part })).toBe(true);
  });

  // `backgroundFit` renders nothing on its own while `backgroundUrl` is
  // null — the control that changes nothing this project keeps trimming.
  // Only the address flips this, exactly like the cursor.
  it("is not made true by the fit alone, with no picture chosen", () => {
    expect(isCustomised({ ...DEFAULT_THEME, backgroundFit: "tile" })).toBe(
      false,
    );
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

  // Asserted on the CSS rather than on `themeVars`, which no longer carries
  // it: the skin is emitted at its own scope, so the stylesheet is the only
  // place the two halves are visible together.
  it("travels as the properties it overrides, not as its name", () => {
    const css = themeCss({ ...DEFAULT_THEME, skin: "neobrutalism" });
    expect(css).toContain("--skin-round:0");
    expect(css).toContain("--skin-border:3px");
    expect(css).not.toContain("neobrutalism");
  });

  // **The skin stops at the person's own content and the colours do not.** The
  // colours have to reach the canvas and the field, both mounted outside
  // anything a page can wrap; a skin only ever restyles surfaces, and every
  // surface is inside that element. Emitting them at one scope would either
  // restyle the app's own bar or leave the canvas uncoloured.
  it("is scoped to the content while the colours are not", () => {
    const css = themeCss({
      ...DEFAULT_THEME,
      skin: "neobrutalism",
      background: flat("#1a1a2e"),
    });
    expect(css).toContain(`:root:not([data-page-theme="default"]){--`);
    expect(css).toContain(
      `:root:not([data-page-theme="default"]) .actor-skin{`,
    );
    // The gate is on both, so leaving the theme leaves all of it rather than
    // half.
    expect(css.split(`data-page-theme="default"`)).toHaveLength(3);
  });

  // A page with a style and no colours still has something for a visitor to
  // take off, so the rule has to be emitted.
  it("is enough on its own to produce a rule", () => {
    const css = themeCss({ ...DEFAULT_THEME, skin: "glass" });
    expect(css).toContain("--skin-round");
    // And ONLY the scoped rule: there is no colour to put at the root, so an
    // empty one would be a selector with nothing in it.
    expect(css.startsWith(`:root:not([data-page-theme="default"]) .`)).toBe(
      true,
    );
  });

  // Glass is the one that shows the composition working end to end: it sets
  // `--surface`, the palette sets `--surface-solid`, and both have to reach the
  // rule or the panel is either opaque or colourless. That the two names never
  // collide is `skins.test.ts`'s job — spreading them in a particular order is
  // not the guarantee it looks like, since a collision would simply be won by
  // whichever came second.
  it("lowers a surface's alpha without touching the palette's colour", () => {
    const css = themeCss({
      ...DEFAULT_THEME,
      skin: "glass",
      background: flat("#1a1a2e"),
    });
    expect(css).toContain("--surface-solid:oklch(");
    expect(css).toContain("--surface:color-mix(in oklab, var(--surface-solid)");
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

describe("a page background picture", () => {
  // Kept as pasted, unlike the cursor: safety is `themeCss`'s job, through
  // `backgroundImageValue`, exactly as `blockStyle` defers a block's own
  // background picture rather than sanitising it at parse time.
  it("reads an address somebody chose", () => {
    expect(
      parseTheme({ backgroundUrl: "https://example.test/wallpaper.png" })
        .backgroundUrl,
    ).toBe("https://example.test/wallpaper.png");
  });

  it("overrides nothing when nobody chose one", () => {
    expect(parseTheme({}).backgroundUrl).toBeNull();
  });

  it.each([null, undefined, 42, {}, []])(
    "falls back to null for %o, which is not a string",
    (value) => {
      expect(parseTheme({ backgroundUrl: value }).backgroundUrl).toBeNull();
    },
  );

  it("reads a fit somebody chose", () => {
    expect(parseTheme({ backgroundFit: "tile" }).backgroundFit).toBe("tile");
    expect(parseTheme({ backgroundFit: "cover" }).backgroundFit).toBe("cover");
  });

  // Not nullable, unlike the address: a select always carries the name of
  // what is picked, so garbage falls back to the same default DEFAULT_THEME
  // carries rather than to null.
  it.each(["diagonal", 42, null, undefined, "toString"])(
    "falls back to the default fit for %o",
    (value) => {
      expect(parseTheme({ backgroundFit: value }).backgroundFit).toBe(
        DEFAULT_THEME.backgroundFit,
      );
    },
  );
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

describe("the canvas dials", () => {
  // Emitted only when moved, like every other value here: a page nobody has
  // turned up carries no property at all and the canvas reads its own default.
  it("says nothing when nobody has moved them", () => {
    const vars = themeVars(DEFAULT_THEME);
    expect(vars["--canvas-density"]).toBeUndefined();
    expect(vars["--canvas-speed"]).toBeUndefined();
  });

  it("travels once turned up", () => {
    const vars = themeVars({
      ...DEFAULT_THEME,
      density: 2.5,
      speed: 0.5,
      scale: 1.75,
    });
    expect(vars["--canvas-density"]).toBe("2.5");
    expect(vars["--canvas-speed"]).toBe("0.5");
    expect(vars["--canvas-scale"]).toBe("1.75");
  });

  // The third dial changes what a canvas IS rather than how much of it there
  // is: a starfield at three times the size is a different sky, not a fuller
  // one. Which is why it is its own dial and not a second reading of density.
  it("says nothing about size until somebody changes it", () => {
    expect(themeVars(DEFAULT_THEME)["--canvas-scale"]).toBeUndefined();
  });

  // Clamped rather than refused: a value out of range is a slider from an older
  // build or a hand-edited row, and the nearest usable number is a better
  // answer than a page that will not render.
  it("clamps what was stored", () => {
    expect(parseTheme({ density: 99, speed: -3, scale: 0 })).toMatchObject({
      density: 5,
      speed: 0.25,
      scale: 0.25,
    });
  });

  it("is enough on its own to count as customised", () => {
    expect(isCustomised({ ...DEFAULT_THEME, density: 2 })).toBe(true);
    expect(isCustomised({ ...DEFAULT_THEME, speed: 2 })).toBe(true);
    expect(isCustomised({ ...DEFAULT_THEME, scale: 2 })).toBe(true);
  });
});

describe("the page measure", () => {
  it("reads a stored measure back", () => {
    expect(parseTheme({ measure: "full" }).measure).toBe("full");
  });

  // **A stop this build does not know falls back to the design's own**, the
  // same way an unknown canvas or skin does — a page written by a newer
  // deployment must still render, and null is a real answer rather than a gap.
  it("falls back to the design's own for a stop it does not know", () => {
    expect(parseTheme({ measure: "enormous" }).measure).toBeNull();
    expect(parseTheme({ measure: 7 }).measure).toBeNull();
  });

  it("is null when nobody chose one", () => {
    expect(parseTheme({}).measure).toBeNull();
  });
});

describe("the typeface and the spacing", () => {
  const themed = (over: Partial<ActorTheme>) =>
    themeCss({ ...DEFAULT_THEME, ...over });

  // Both are OPTIONS. A page that chose neither must emit exactly what it did
  // before either key existed, which is the only reason it is safe to add them
  // to every stored theme at once.
  it("emit nothing at all when neither is chosen", () => {
    expect(themed({})).toBe("");
  });

  it("names the face a page chose", () => {
    expect(themed({ font: "casual" })).toContain("Comic Sans MS");
  });

  // **The tokens, not just the property, and this was found on a real page.**
  // Eighteen elements across the leaf modules carry `font-display` or
  // `font-sans`, which are explicit `font-family: var(--font-…)` declarations
  // — and a declaration on the element beats a family inherited from an
  // ancestor. Setting `font-family` alone left every heading and display name
  // in the app's own face while body text changed: a control that half works.
  it("reaches the headings too, not only the body text", () => {
    const css = themed({ font: "classic" });
    expect(css).toContain("--font-display:Verdana");
    expect(css).toContain("--font-sans:Verdana");
  });

  it("sets the padding and the text size together", () => {
    const css = themed({ spacing: "compact" });
    expect(css).toContain("--block-pad:0.5rem");
    expect(css).toContain("font-size:0.8125rem");
  });

  // **And the page's own spacing, which is the half this originally missed.**
  // A `compact` page and a default page were measured differing in card
  // padding and type size and agreeing EXACTLY on the 40px between every
  // section, because the page box carried fixed classes no option could reach.
  // The type was already tighter than the sites being imitated while the page
  // still read as airy: the air was between the cards, not inside them.
  it("compresses the space between sections, not only inside them", () => {
    const css = themed({ spacing: "compact" });
    expect(css).toContain("--page-gap:0.5rem");
    expect(css).toContain("--page-edge:0.75rem");
  });

  it("opens that same space up for a roomy page", () => {
    const css = themed({ spacing: "roomy" });
    expect(css).toContain("--page-gap:4rem");
    expect(css).toContain("--page-edge:3rem");
  });

  // **The discriminating half. Absence must emit NEITHER**, because the
  // defaults live at `:root` and carry the `sm` breakpoint the page box used
  // to spell out — so a page choosing no spacing has to fall through to them
  // rather than be handed a constant at every width.
  it("emits no page spacing at all when the key is absent", () => {
    const css = themed({ font: "classic" });
    expect(css).not.toContain("--page-gap");
    expect(css).not.toContain("--page-edge");
  });

  // **The discriminating case, and the whole reason this is not in
  // `themeVars`.** A `font-family` at `:root` would reset the app's bar, the
  // account menu and the language toggle to whatever a page chose. A test that
  // only asserted "the CSS contains Verdana" would pass on exactly that bug,
  // so this asserts WHICH rule it landed in.
  it("puts the face on the author's content and never on the root", () => {
    const css = themed({ font: "classic" });
    const rules = css.split("}").filter(Boolean);
    const root = rules.find((rule) => !rule.includes(SKIN_SCOPE));
    const content = rules.find((rule) => rule.includes(SKIN_SCOPE));
    expect(content).toContain("Verdana");
    expect(root ?? "").not.toContain("Verdana");
  });
});

describe("parseTheme and the two new options", () => {
  it("reads a face and a spacing a page chose", () => {
    const theme = parseTheme({ font: "casual", spacing: "compact" });
    expect(theme.font).toBe("casual");
    expect(theme.spacing).toBe("compact");
  });

  // **The case that keeps a page openable.** A build that has never heard of a
  // value must render the page as the design's own rather than refuse it —
  // the same fallback the measure beside it has, and the reason neither is a
  // hard failure.
  it("falls back to the design's own for a value it does not know", () => {
    const theme = parseTheme({ font: "papyrus", spacing: "enormous" });
    expect(theme.font).toBeNull();
    expect(theme.spacing).toBeNull();
  });

  it("falls back for a value that is not text at all", () => {
    const theme = parseTheme({ font: 7, spacing: { compact: true } });
    expect(theme.font).toBeNull();
    expect(theme.spacing).toBeNull();
  });
});
