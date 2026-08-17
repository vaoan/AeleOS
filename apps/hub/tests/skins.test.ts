import { describe, expect, it } from "vitest";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { derivePalette } from "@/shared/domain/palette";
import {
  DEFAULT_SKIN,
  nestedSkinVars,
  SKIN_DEFAULTS,
  SKIN_SCOPE,
  SKINS,
  skinVars,
  type SkinId,
} from "@/shared/domain/skins";

/** Every colour a skin writes literally, rather than reading from the theme. */
const LITERAL_COLOUR = /rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/gi;

/** The stylesheet that has to declare a default for everything a skin sets. */
const GLOBALS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

/**
 * The same stylesheet with its comments removed.
 *
 * **Every test below that looks for a declaration reads THIS, not `GLOBALS`.**
 * All of them are substring or loose-regex searches, and this file's comments
 * are long and quote tokens constantly — `--skin-clip`, `var(--skin-shadow)`
 * and `border-style: var(--tw-border-style)` all appear in prose. A comment
 * satisfying a check that a RULE was meant to satisfy would leave the check
 * permanently green with nothing behind it, which is the failure mode every
 * guard in this file exists to prevent.
 */
const RULES = GLOBALS.replaceAll(/\/\*[\s\S]*?\*\//g, "");

/**
 * Every word a skin's values may legitimately contain.
 *
 * CSS function names, keywords and directions — everything except a colour.
 * A bare identifier outside this set is, in practice, a named colour, which
 * is the one thing a skin may never write; see the test that uses it.
 */
const ALLOWED_WORDS = new Set([
  "auto",
  "blur",
  "bottom",
  "calc",
  "color-mix",
  "in",
  "inset",
  "left",
  "linear-gradient",
  "max",
  "min",
  "none",
  "oklab",
  "polygon",
  "radial-gradient",
  "repeating-linear-gradient",
  "rgb",
  "right",
  "solid",
  "to",
  "top",
  "transparent",
  "var",
]);

/**
 * A bare identifier: a word not attached to a number and not a custom
 * property's name.
 *
 * The lookbehind is what excludes both — `px` in `8px` and `ink` in `--ink`
 * are each preceded by a character this refuses, so neither is reported as a
 * word the skin chose.
 *
 * **Case-insensitive, and that was a real hole rather than a tidy-up.** CSS
 * keywords are case-insensitive, so `CYAN` is a working named colour; without
 * the flag it matched nothing at all and sailed straight through the guard
 * whose own TSDoc warns about that exact literal. Matched words are lowered
 * before the allowlist is consulted, so the flag adds no second spelling of
 * every permitted keyword.
 */
const BARE_WORD = /(?<![\w.-])[a-z][a-z-]*/gi;

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

  // **The test above cannot see the literal its own TSDoc warns about.** It
  // matches `#rgb` and a non-grey `rgb()`; `neon`'s doc says out loud that the
  // mistake somebody will make is "fixed with a literal cyan" — a NAMED
  // keyword, which sails through both patterns. That warning lived in prose
  // while every other rule in this file lived in an assertion.
  //
  // Inverted rather than listing colour names: a keyword list is a list of the
  // hues somebody happened to think of, and `hotpink` is not on it until it
  // has already shipped. Every word a value may contain is a CSS function,
  // keyword or direction, and there are few of them — so anything else is
  // either a colour or a construct nobody has decided about yet, and both are
  // worth failing on.
  it("writes no word that is not a CSS function or keyword", () => {
    for (const skin of SKINS) {
      const foreign = Object.entries(skinVars(skin)).flatMap(
        ([property, value]) =>
          [...value.matchAll(BARE_WORD)]
            .map(([word]) => word.toLowerCase())
            .filter((word) => !ALLOWED_WORDS.has(word))
            .map((word) => `${skin} ${property}: ${word}`),
      );
      expect(foreign).toEqual([]);
    }
  });

  // A skin setting a property `globals.css` never declares is a property with
  // no default: the page it is taken off would keep the last page's value, or
  // nothing at all, depending on which one the visitor loaded first.
  it("sets only properties the stylesheet gives a default", () => {
    const missing = new Set<string>();
    for (const skin of SKINS) {
      for (const property of Object.keys(skinVars(skin))) {
        if (!RULES.includes(`${property}:`)) missing.add(property);
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
        {
          ...DEFAULT_GRADIENT,
          angle: 90,
          stops: [{ color: "#1a1a2e", at: 0 }],
        },
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
  // the element was asking for**, and this is the assertion that the mechanism
  // stopped doing that.
  //
  // The skin used to be `[class~="border"]` — Tailwind's own generated class,
  // selected as if it were ours. It sat outside every cascade layer, and
  // unlayered CSS beats anything inside a layer whatever its specificity, so it
  // won against every utility for the properties it set. The editor's language
  // strip asked for `backdrop-blur` and silently got none; the one card that
  // names its own `shadow-sm` had to be rescued by a hand-written `:not()`.
  // Each exclusion covered one collision somebody had happened to notice.
  //
  // A `@utility` is sorted among the other utilities by how many properties it
  // declares, so a single-property utility on the same element wins by the
  // ordinary rules. That is why there are no exclusions left to assert: the
  // absence IS the fix, so what is pinned here is that the old shape has not
  // come back.
  it("styles a class of its own rather than Tailwind's", () => {
    expect(GLOBALS).toContain("@utility surface {");
    expect(GLOBALS).not.toContain('[class~="border"] {');
    expect(GLOBALS).not.toContain('[class*="backdrop-blur"])');
    expect(GLOBALS).not.toContain('[class*="shadow"])');
  });

  // The other direction: a token declared and never reachable is a knob nobody
  // can turn, which is how `globals.css` grows values that look load-bearing
  // and are not.
  //
  // Two tokens are exempt, and both deliberately rather than by oversight.
  // Every other form token is reachable ONLY through a skin choosing a value;
  // these two are reachable a different way, so "no skin uses it" is not the
  // same claim as "nobody can turn it".
  //
  //  * `--skin-border-style`'s default is the unresolved reference
  //    `var(--tw-border-style)`, so Tailwind's own
  //    `border-dashed`/`border-dotted`/… utilities turn it directly, with no
  //    skin involved at all. A skin may still gain the ability to override
  //    it; the control that turns it today is a SECTION, through
  //    `sectionStyle`.
  //  * `--skin-border-min` is turned by that same control and by nothing
  //    else: it is a floor a section's own border choice raises, never a
  //    property a skin sets. A skin setting it would be wrong — it would
  //    silently widen every edge on the page.
  it("reaches every form token the stylesheet declares", () => {
    const reachableWithoutASkin = new Set([
      "--skin-border-style",
      "--skin-border-min",
    ]);
    const declared = [...RULES.matchAll(/(--skin-[a-z-]+):/g)]
      .map(([, name]) => name!)
      .filter((name) => !reachableWithoutASkin.has(name));
    const used = new Set(SKINS.flatMap((skin) => Object.keys(skinVars(skin))));
    expect(declared.filter((name) => !used.has(name))).toEqual([]);
  });

  // **Declaring a token is half of wiring one, and the missing half is
  // silent.** `sets only properties the stylesheet gives a default` above
  // checks that `globals.css` DECLARES each one; nothing checked that any rule
  // ever READS it. A skin whose property no rule consumes is stored, emitted,
  // inherited correctly and invisible — the same shape as the canvases named
  // after animations nobody had written, and as `--skin-backdrop` before glass
  // was found to be translucent rather than frosted, where the token was set
  // and read only by four elements that were not the panels.
  //
  // `--skin-clip` is why this exists: it is the first token whose consumer is
  // a property (`clip-path`) that no other skin sets, so forgetting the one
  // line in `@utility surface` would have left `cutout` a name in a select
  // that changed nothing at all.
  it("is read by a rule and not merely declared", () => {
    const unread = Object.keys(SKIN_DEFAULTS).filter(
      (name) => !RULES.includes(`var(${name})`),
    );
    expect(unread).toEqual([]);
  });

  // **A clipped surface cannot cast a shadow**, because `clip-path` clips an
  // element's whole paint and `box-shadow` is part of it. So a skin that sets
  // both would ship a shadow nobody can ever see — the control that accepts a
  // choice and does nothing, which is the fault this feature keeps producing.
  // Written as a rule over every skin rather than an assertion about `cutout`,
  // since what must hold is the pairing and not the one skin that has it
  // today.
  it("casts no shadow from a skin that cuts its own shape", () => {
    const clipped = SKINS.filter((skin) => {
      const clip = skinVars(skin)["--skin-clip"];
      return clip !== undefined && clip !== "none";
    });
    // Collected and asserted empty rather than checked one at a time, so a
    // failure names the skin — the idiom this file already uses above.
    expect(clipped).not.toEqual([]);

    expect(
      clipped.filter(
        (skin) => nestedSkinVars(skin)["--skin-shadow"] !== "none",
      ),
    ).toEqual([]);
  });

  // **A notch measured only in pixels inverts on a small surface.** The
  // `progress` layout's track is `h-2` and carries `surface`, so a flat 10px
  // chamfer put its vertical vertices at `10px` and `-2px`: the path crossed
  // itself, and what a browser paints for a self-intersecting clip is a
  // winding-rule artefact rather than a chamfer. Every surface in the app is a
  // candidate, and nobody adding a skin will remember which of them are short.
  //
  // A percentage inside `polygon()` resolves against the box's WIDTH on an x
  // coordinate and its HEIGHT on a y one, so one bounded expression clamps
  // each axis by itself. This asserts the SHAPE of the value rather than its
  // number: strip every `min()` or `clamp()` that carries a percentage, and no
  // bare length may be left.
  //
  // **Two things it deliberately does not claim.** It checks `polygon()` only,
  // because that is the shape function whose vertices can cross — `inset()`
  // and `circle()` degenerate to an empty shape rather than an inverted one,
  // so a bare length is not a fault there and flagging it would be a rule
  // against a correct value. And a bound that does not bind — `min(10px,
  // 400%)` — passes: catching it means evaluating the arithmetic against a box
  // size this test does not have, which is the browser's job and not a unit
  // test's. What it does catch is the version that shipped, which had no bound
  // at all.
  it("bounds every length in a polygon clip path against the box", () => {
    const unbounded = SKINS.map((skin) => ({
      skin,
      clip: skinVars(skin)["--skin-clip"],
    }))
      .filter(({ clip }) => clip?.startsWith("polygon("))
      .filter(({ clip }) =>
        clip!.replaceAll(/(?:min|clamp)\([^()]*%[^()]*\)/g, "").includes("px"),
      )
      .map(({ skin }) => skin);
    expect(unbounded).toEqual([]);
  });
});

describe("SKIN_DEFAULTS", () => {
  // The defaults are duplicated from globals.css, which this repo would
  // normally refuse. The duplication is pinned rather than trusted — the same
  // idiom skins.test.ts already uses to read the stylesheet.
  it("matches what globals.css declares", () => {
    for (const [name, value] of Object.entries(SKIN_DEFAULTS)) {
      const declared = new RegExp(
        `${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`,
      ).exec(RULES);
      expect(declared, `${name} is not declared in globals.css`).not.toBeNull();
      expect(declared![1].trim()).toBe(value);
    }
  });

  it("covers every property any skin overrides", () => {
    for (const skin of SKINS) {
      for (const name of Object.keys(skinVars(skin))) {
        expect(Object.keys(SKIN_DEFAULTS)).toContain(name);
      }
    }
  });
});

describe("nestedSkinVars", () => {
  it("emits every property, so nothing falls through to an enclosing skin", () => {
    for (const skin of SKINS) {
      expect(Object.keys(nestedSkinVars(skin)).sort()).toEqual(
        Object.keys(SKIN_DEFAULTS).sort(),
      );
    }
  });

  // The regression the spike found. `paper` never mentions --skin-gloss, so
  // nested inside `comic` it used to inherit the halftone.
  it("resets a property the chosen skin does not set", () => {
    expect(nestedSkinVars("paper")["--skin-gloss"]).toBe(
      SKIN_DEFAULTS["--skin-gloss"],
    );
    expect(nestedSkinVars("paper")["--skin-gloss"]).not.toBe(
      skinVars("comic")["--skin-gloss"],
    );
  });

  it("keeps what the chosen skin does set", () => {
    expect(nestedSkinVars("comic")["--skin-gloss"]).toBe(
      skinVars("comic")["--skin-gloss"],
    );
  });

  // `default` overrides nothing, which is exactly why it needs the full reset:
  // a section set to `default` inside a `glass` page must not still be glass.
  it("makes default a real choice rather than an absence", () => {
    expect(nestedSkinVars("default")).toEqual(SKIN_DEFAULTS);
  });
});

describe("skinVars", () => {
  // Unchanged on purpose: themeCss keys the page-level skin rule on this
  // record being EMPTY, so an unthemed page emits no style element at all.
  it("still returns nothing for the default skin", () => {
    expect(skinVars("default")).toEqual({});
  });
});

// **No unit test models what `--skin-border-style` resolves to, on purpose.**
// An earlier version of this file did — a hand-written var()-substitution
// model — and every test built on it passed under a real bug: `.border-dashed`
// declares `border-style: dashed` as a LITERAL and wins the property outright
// by Tailwind's own utility sort order, so the cascade never reaches
// substitution at all for such an element. A model of variable substitution
// has no way to represent a second declaration winning the cascade first, so
// it could not have caught that, in either direction — see
// `tests/e2e/border-style-cascade.spec.ts` for the real proof, against the
// compiled app CSS in a real browser, and the token's own declaration in
// `globals.css` for the full reasoning.
