import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { derivePalette } from "@/shared/domain/palette";
import {
  DEFAULT_SKIN,
  SKIN_SCOPE,
  SKINS,
  skinVars,
  type SkinId,
} from "@/shared/domain/skins";

/** Every colour a skin writes literally, rather than reading from the theme. */
const LITERAL_COLOUR = /rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;

/** The stylesheet that has to declare a default for everything a skin sets. */
const GLOBALS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

describe("the skins", () => {
  it("leaves the default overriding nothing", () => {
    expect(skinVars(DEFAULT_SKIN)).toEqual({});
  });

  it("gives every other skin something to change", () => {
    for (const skin of SKINS.filter((each) => each !== DEFAULT_SKIN)) {
      expect(Object.keys(skinVars(skin)).length).toBeGreaterThan(0);
    }
  });

  // A skin that shipped a table entry nobody could reach would be the control
  // that offers a choice, accepts it and does nothing — the same fault the
  // canvas list was trimmed for.
  it("has an entry for every name it offers", () => {
    for (const skin of SKINS) {
      expect(() => skinVars(skin)).not.toThrow();
    }
  });

  it("falls back to the default for a name it does not know", () => {
    expect(skinVars("stained-glass" as SkinId)).toEqual({});
  });

  // The table is a module constant. Handing it out directly would let one
  // page's edit reach every later page rendered by the same process.
  it("hands out a copy rather than the table", () => {
    const mine = skinVars("glass");
    mine["--skin-round"] = "99";
    expect(skinVars("glass")["--skin-round"]).not.toBe("99");
  });

  // **The rule the whole file rests on.** A skin decides form; the gradient
  // decides colour. A literal hue here would override a choice its author made
  // somewhere else, and it would do it silently — the page would simply not be
  // the colour they picked. Black and white at low alpha are allowed because
  // they read as light and shade against any hue rather than as a colour.
  it("names no colour of its own", () => {
    for (const skin of SKINS) {
      for (const [property, value] of Object.entries(skinVars(skin))) {
        const where = `${skin} ${property}: ${value}`;
        // Collected and asserted empty rather than checked one at a time, so a
        // failure names the skin and the value instead of reporting that false
        // was not true.
        const hues = /#[0-9a-f]{3}/i.test(value) ? [where] : [];
        for (const [, r, g, b] of value.matchAll(LITERAL_COLOUR)) {
          if (!(r === g && g === b)) hues.push(where);
        }
        expect(hues).toEqual([]);
      }
    }
  });

  // A skin setting a property `globals.css` never declares is a property with
  // no default: the page it is taken off would keep the last page's value, or
  // nothing at all, depending on which one the visitor loaded first.
  it("sets only properties the stylesheet gives a default", () => {
    const missing = new Set<string>();
    for (const skin of SKINS) {
      for (const property of Object.keys(skinVars(skin))) {
        if (!GLOBALS.includes(`${property}:`)) missing.add(property);
      }
    }
    expect([...missing]).toEqual([]);
  });

  // **A skin and a palette are spread into one object, so a name in both would
  // silently lose whichever came second — and the loser would be a colour its
  // author actually picked.** Nothing in `themeVars` can enforce that; the
  // order the two are spread in looks like a guarantee and is not one. This is
  // the guarantee: the sets do not overlap.
  //
  // `--surface` and `--bar` are the near miss that makes it worth pinning. A
  // skin sets them, and it would be entirely natural for the palette to as
  // well — it writes `--surface-solid` and `--bar-solid` precisely so it does
  // not, since a custom property cannot be composed from itself.
  it("writes no property the palette writes", () => {
    const palette = Object.keys(
      derivePalette(
        { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
        "#0f8",
      ),
    );
    for (const skin of SKINS) {
      const clash = Object.keys(skinVars(skin))
        .filter((name) => palette.includes(name))
        .map((name) => `${skin} overrides ${name}`);
      expect(clash).toEqual([]);
    }
  });

  // **A class on an element and a class in a stylesheet have drifted apart
  // here once already**, leaving an element wearing a name no rule matched.
  // That is invisible to every test that only reads the rule, so the two are
  // pinned to each other from both ends: this checks the stylesheet, and
  // `page-shell.test.tsx` checks the element.
  it("is the class the stylesheet gives the content's own face to", () => {
    expect(GLOBALS).toContain(`.${SKIN_SCOPE} {`);
  });

  // **A rule that reaches elements by a class they already have cannot see what
  // the element was asking for.** The default skin's `--skin-backdrop` is
  // `none`; it ties on specificity with Tailwind's `backdrop-blur` utility and
  // is declared later, so it wins — and every bordered element that had asked
  // for a blur silently got none. Exactly one had: the editor's language strip
  // carries `border`, while the two bars above it carry `border-b`, which `~=`
  // does not match. Two of the three bars blurred what passed under them, the
  // third did not, and the page's own text read straight through it.
  //
  // The shadow already had this exclusion for the same reason. Asserted on the
  // stylesheet because the symptom is a page that looks slightly wrong in one
  // place, which no assertion about a skin's values would ever notice.
  it("leaves alone an element that names its own backdrop", () => {
    expect(GLOBALS).toContain(
      '[class~="border"]:not([class*="backdrop-blur"])',
    );
    // And the broad selector must not set it any more, or the exclusion is
    // written down and overridden three lines later.
    const broad = GLOBALS.slice(
      GLOBALS.indexOf('[class~="border"] {'),
      GLOBALS.indexOf("}", GLOBALS.indexOf('[class~="border"] {')),
    );
    expect(broad).not.toContain("backdrop-filter");
  });

  // The other direction: a token declared and never reachable is a knob nobody
  // can turn, which is how `globals.css` grows values that look load-bearing
  // and are not.
  it("reaches every form token the stylesheet declares", () => {
    const declared = [...GLOBALS.matchAll(/(--skin-[a-z-]+):/g)].map(
      ([, name]) => name!,
    );
    const used = new Set(SKINS.flatMap((skin) => Object.keys(skinVars(skin))));
    expect(declared.filter((name) => !used.has(name))).toEqual([]);
  });
});
