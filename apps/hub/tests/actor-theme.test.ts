import { describe, expect, it } from "vitest";
import {
  CANVASES,
  DEFAULT_THEME,
  THEME_SEEDS,
  accentPreview,
  isThemed,
  withChosenColour,
  parseTheme,
  themeCss,
  themeVars,
} from "@/features/actors/domain/actor-theme";
import { SURFACE, contrastRatio } from "@/shared/domain/color";

describe("parseTheme", () => {
  it("reads a theme somebody chose", () => {
    expect(
      parseTheme({
        accent: "#00ff88",
        backdropA: "#112233",
        backdropB: "#445566",
        canvas: "none",
      }),
    ).toEqual({
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
  // The point of the whole design: whatever was stored, what reaches the page
  // is readable. This is asserted on the OUTPUT rather than trusting
  // legibleAccent, because this is the function the page actually calls.
  it.each([
    "#ffffff",
    "#000000",
    "#ffff00",
    "#0000ff",
    "#7f7f7f",
    // `not a colour` is deliberately absent: it emits no accent at all now,
    // which the test below owns. A value that cannot be read as a colour is
    // not a choice, so there is nothing for it to be a readable rendering of.
  ])("emits a readable accent for %s in both modes", (accent) => {
    for (const mode of ["light", "dark"] as const) {
      const value = themeVars({ ...DEFAULT_THEME, accent }, mode)["--accent"];
      const [, l, c, h] = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(
        value as string,
      ) as RegExpExecArray;
      expect(
        contrastRatio([Number(l), Number(c), Number(h)], SURFACE[mode]),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  // One stored colour renders differently in the two schemes, and that is
  // correct rather than a bug — an accent that glows on black is washed out on
  // white. Pinning it stops somebody "fixing" it into one value later.
  it("renders one stored colour differently per mode", () => {
    const light = themeVars({ ...DEFAULT_THEME, accent: "#ff0088" }, "light");
    const dark = themeVars({ ...DEFAULT_THEME, accent: "#ff0088" }, "dark");
    expect(light["--accent"]).not.toBe(dark["--accent"]);
  });

  it("passes the cloud colours through as the channels the canvas reads", () => {
    const vars = themeVars(
      { ...DEFAULT_THEME, backdropA: "#0a141e", backdropB: "#ffffff" },
      "dark",
    );
    expect(vars["--nebula-a"]).toBe("10 20 30");
    expect(vars["--nebula-b"]).toBe("255 255 255");
  });

  // An unparseable value is not a choice, so it overrides nothing — black
  // would have been the obvious fallback and it invents a decision nobody made.
  it.each(["not a colour", "#12345", ""])(
    "emits no override for the unparseable value %s",
    (bad) => {
      expect(
        themeVars(
          { ...DEFAULT_THEME, accent: bad, backdropA: bad, backdropB: bad },
          "light",
        ),
      ).toEqual({});
    },
  );

  it("switches the cloud off for the none canvas", () => {
    expect(
      themeVars({ ...DEFAULT_THEME, canvas: "none" }, "dark")[
        "--nebula-opacity"
      ],
    ).toBe("0");
  });

  it.each(CANVASES.filter((c) => c !== "none"))(
    "leaves the cloud on for %s",
    (canvas) => {
      expect(
        themeVars({ ...DEFAULT_THEME, canvas }, "dark")["--nebula-opacity"],
      ).toBeUndefined();
    },
  );

  // An unthemed page must emit NOTHING, in either mode. This is the assertion
  // that keeps the shipped design intact: globals.css uses different accent
  // HUES for light and dark on purpose, so any single stored default would have
  // restyled every unthemed page in one of the two modes. Emitting no override
  // is the only answer that leaves both alone.
  it.each(["light", "dark"] as const)(
    "overrides nothing at all in %s for the default theme",
    (mode) => {
      expect(themeVars(DEFAULT_THEME, mode)).toEqual({});
    },
  );

  // And a half-chosen theme overrides only the half that was chosen, rather
  // than filling the rest in with values copied out of the stylesheet — a copy
  // looks identical today and silently stops tracking the design tomorrow.
  it("emits only what was chosen", () => {
    expect(
      themeVars({ ...DEFAULT_THEME, backdropA: "#0a141e" }, "dark"),
    ).toEqual({ "--nebula-a": "10 20 30" });
  });
});

describe("accentPreview", () => {
  it("reports the colour as rendered in each mode", () => {
    const preview = accentPreview("#ff0088");
    expect(preview.light).toMatch(/^#[0-9a-f]{6}$/);
    expect(preview.dark).toMatch(/^#[0-9a-f]{6}$/);
  });

  // The two swatches are the disclosure, so they have to actually differ where
  // the solver moved the colour. If they were ever equal for every input the
  // configurator would be showing the same thing twice and explaining nothing.
  it("shows a different rendering per mode where the colour needed moving", () => {
    const preview = accentPreview("#7f7f7f");
    expect(preview.light).not.toBe(preview.dark);
  });

  it("still reports a colour for a value that is not one", () => {
    expect(accentPreview("not a colour").light).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("themeCss", () => {
  const CHOSEN = { ...DEFAULT_THEME, accent: "#00ff88" };

  it("scopes every rule to the class it was given", () => {
    for (const rule of themeCss(CHOSEN, "t1").split("}").filter(Boolean)) {
      expect(rule).toContain(".t1");
    }
  });

  // The visitor's scheme is the visitor's, and the page is rendered on a server
  // that cannot know it — so both renderings have to be present as rules.
  it("carries both schemes", () => {
    const css = themeCss(CHOSEN, "t1");
    expect(css).toContain("prefers-color-scheme:dark");
    expect(css).toContain('[data-theme="dark"]');
  });

  // The media query alone is not enough. A visitor who has chosen dark on a
  // light-preferring system gets the light accent unless the attribute rule
  // exists as well, which is the failure `globals.css` is already shaped to
  // avoid and which this had to copy rather than reinvent.
  it("lets an explicit choice win in both directions", () => {
    const css = themeCss(CHOSEN, "t1");
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"] .t1');
  });

  // The canvas reads its colours from the document root, so they have to be
  // emitted there — scoped to the content element, the only thing that reads
  // them would never see them. That was a real bug: an author could pick two
  // backdrop colours, they were stored, emitted, and read by nothing.
  it("puts the backdrop on :root and the accent on the class", () => {
    const css = themeCss(
      { ...DEFAULT_THEME, accent: "#00ff88", backdropA: "#112233" },
      "t1",
    );
    const rootRule = css.slice(css.indexOf(":root{"), css.indexOf("}") + 1);
    expect(rootRule).toContain("--nebula-a");
    expect(rootRule).not.toContain("--accent");
    expect(css).toContain(".t1{--accent");
  });

  // Nothing in the root scope varies by mode: an author picks two colours and
  // those are the colours in both schemes. What adapts is `--nebula-blend`,
  // which stays in globals.css.
  it("emits the backdrop once rather than per scheme", () => {
    const css = themeCss({ ...DEFAULT_THEME, backdropA: "#112233" }, "t1");
    expect(css.match(/--nebula-a/g)).toHaveLength(1);
  });

  // An unthemed page must emit no stylesheet at all, rather than three empty
  // rules that override nothing but still ship on every request.
  it("emits nothing for a theme that overrides nothing", () => {
    expect(themeCss(DEFAULT_THEME, "t1")).toBe("");
  });

  // Nothing a person typed may reach a stylesheet. A `}` that survived would
  // close the rule and everything after it would be CSS somebody else wrote.
  it.each(["#00ff88}body{display:none", "red;}*{color:red", "</style>"])(
    "cannot be escaped through the accent %s",
    (accent) => {
      const css = themeCss({ ...DEFAULT_THEME, accent }, "t1");
      expect(css).not.toContain("body");
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
