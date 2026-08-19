import { describe, expect, it } from "vitest";

import {
  CHROME_DEFAULTS,
  CHROMES,
  chromeFor,
  chromesFor,
  chromeTokens,
  type ChromeKind,
} from "@/features/actors/domain/chromes";

const KINDS: readonly ChromeKind[] = ["player", "jukebox"];

/** Every hex colour anywhere in a token value. */
function hexColoursIn(value: string): string[] {
  return value.match(/#[0-9a-z]+/gi) ?? [];
}

describe("the chrome table", () => {
  it("gives every chrome the id it is keyed by", () => {
    for (const [id, chrome] of CHROMES) expect(chrome.id).toBe(id);
  });

  it("populates both kinds", () => {
    // `chromeFor` throws for a kind with no chrome, and `satisfies Chrome[]`
    // cannot express "at least one of each" — so this is where that holds.
    for (const kind of KINDS)
      expect(chromesFor(kind).length).toBeGreaterThan(0);
  });

  it("gives every chrome exactly one kind", () => {
    const counted = KINDS.flatMap((kind) => chromesFor(kind));
    expect(counted).toHaveLength(CHROMES.size);
  });

  it("lists each chrome under the kind it declares", () => {
    // The two rosters are separate arrays, so a chrome can sit in one while
    // declaring the other — and then it appears in the wrong picker, is offered
    // to a leaf that cannot draw it, and `chromeFor` silently rejects the very
    // choice the editor just made. Nothing errors at any point.
    const misfiled = KINDS.flatMap((kind) =>
      chromesFor(kind)
        .filter((one) => one.kind !== kind)
        .map((one) => `${one.id} is listed under ${kind}`),
    );
    expect(misfiled).toEqual([]);
  });

  it("has exactly one sprite chrome, and it is a jukebox", () => {
    // Winamp is the only chrome that is not a token set. Anything else with
    // this flag would silently load the sprite engine for a page that has no
    // use for it, which is the budget this feature is designed around.
    const sprited = [...CHROMES.values()].filter((one) => one.sprites);
    expect(sprited.map((one) => one.id)).toEqual(["winamp"]);
    expect(sprited[0]?.kind).toBe("jukebox");
  });

  describe("tokens", () => {
    it("names every default under one prefix", () => {
      for (const name of Object.keys(CHROME_DEFAULTS)) {
        expect(name.startsWith("--chrome-")).toBe(true);
      }
    });

    it("overrides no property the defaults do not declare", () => {
      // A misspelt property name is invisible: CSS ignores it, the chrome
      // silently keeps the default, and nothing anywhere errors.
      const unknown = [...CHROMES.values()].flatMap((one) =>
        Object.keys(one.tokens)
          .filter((name) => !(name in CHROME_DEFAULTS))
          .map((name) => `${one.id}: ${name}`),
      );
      expect(unknown).toEqual([]);
    });

    it("writes every hex colour as a real one", () => {
      // Catches a typo inside a value, which is the half the check above
      // cannot see: the property is spelt right, so nothing complains, and the
      // browser drops the declaration leaving one colour subtly wrong.
      const wrong = [...CHROMES.values()].flatMap((one) =>
        Object.entries(one.tokens).flatMap(([name, value]) =>
          hexColoursIn(value)
            .filter(
              (hex) =>
                !/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex),
            )
            .map((hex) => `${one.id} ${name}: ${hex}`),
        ),
      );
      expect(wrong).toEqual([]);
    });

    it("leaves no token empty", () => {
      const blank = [...CHROMES.values()].flatMap((one) =>
        Object.entries(one.tokens)
          .filter(([, value]) => value.trim() === "")
          .map(([name]) => `${one.id}: ${name}`),
      );
      expect(blank).toEqual([]);
    });

    it("fills in every default a chrome does not override", () => {
      // A chrome states only its DIFFERENCES, so a partial one nested inside
      // another would otherwise inherit the enclosing chrome rather than the
      // default — the fault `nestedSkinVars` already had to fix for skins.
      const vlc = CHROMES.get("vlc");
      expect(vlc).toBeDefined();
      if (!vlc) return;
      const tokens = chromeTokens(vlc);
      expect(Object.keys(tokens).sort()).toEqual(
        Object.keys(CHROME_DEFAULTS).sort(),
      );
      expect(tokens["--chrome-accent"]).toBe("#ff8800");
      expect(tokens["--chrome-font"]).toBe(CHROME_DEFAULTS["--chrome-font"]);
    });
  });

  describe("chromeFor", () => {
    it("answers the chrome that was asked for", () => {
      expect(chromeFor("player", "wmp9").id).toBe("wmp9");
      expect(chromeFor("jukebox", "winamp").id).toBe("winamp");
    });

    it("falls back for a name this build has never heard of", () => {
      // A newer deployment wrote it. Costing somebody their look is acceptable;
      // drawing nothing at all is not.
      expect(chromeFor("player", "wmp42").kind).toBe("player");
      expect(chromeFor("jukebox", undefined).kind).toBe("jukebox");
    });

    it("refuses a chrome belonging to the other kind", () => {
      // Switching a leaf's kind leaves the old chrome name in `icon`, so this
      // is the ordinary case rather than a hostile one — and drawing a Winamp
      // sprite window as a `player` would ask for a video pane it has not got.
      expect(chromeFor("player", "winamp").kind).toBe("player");
      expect(chromeFor("jukebox", "wmp9").kind).toBe("jukebox");
    });

    it("has no inherited entry to find", () => {
      expect(chromeFor("player", "__proto__").kind).toBe("player");
      expect(chromeFor("player", "constructor").kind).toBe("player");
      expect(CHROMES.get("toString")).toBeUndefined();
    });
  });
});
