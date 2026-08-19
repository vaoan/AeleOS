import { describe, expect, it } from "vitest";

import { CHROME_DEFAULTS } from "@/features/actors/domain/chromes";
import {
  chromeStyle,
  fillPercent,
  needsSprites,
} from "@/features/actors/presentation/chrome-style";

describe("chromeStyle", () => {
  it("gives a chrome every property, not only its overrides", () => {
    // A page may hold two players. A token set carrying only its differences is
    // correct at one scope and falls through to the ENCLOSING chrome at two —
    // silently, so the second player wears half of the first.
    const style = chromeStyle("player", "vlc") as Record<string, string>;
    // Collected rather than asserted one at a time, so a failure NAMES the
    // missing properties instead of stopping at the first.
    const missing = Object.keys(CHROME_DEFAULTS).filter(
      (name) => style[name] === undefined,
    );
    expect(missing).toEqual([]);
    expect(style["--chrome-accent"]).toBe("#ff8800");
  });

  it("draws an unknown chrome as its kind's first rather than as nothing", () => {
    const style = chromeStyle("jukebox", "not-a-chrome") as Record<
      string,
      string
    >;
    expect(style["--chrome-shell"]).toBeDefined();
  });
});

describe("needsSprites", () => {
  it("is true for the one chrome that reads a sprite sheet", () => {
    expect(needsSprites("jukebox", "winamp")).toBe(true);
  });

  it("is false for every token chrome", () => {
    // The renderer branches on this to decide what to LOAD. A false positive
    // pulls the archive reader and the atlas into a page that draws neither.
    expect(needsSprites("player", "wmp9")).toBe(false);
    expect(needsSprites("jukebox", "foobar")).toBe(false);
    expect(needsSprites("jukebox", "sonique")).toBe(false);
  });

  it("is false when a fallback is drawn instead", () => {
    // `winamp` asked for by a PLAYER falls back to a player chrome, which has
    // no sprites — so asking the chrome rather than the stored name is what
    // keeps the two answers in step.
    expect(needsSprites("player", "winamp")).toBe(false);
    expect(needsSprites("player", undefined)).toBe(false);
  });
});

describe("fillPercent", () => {
  it("maps a fraction to a percentage", () => {
    expect(fillPercent(0)).toBe("0.000%");
    expect(fillPercent(1)).toBe("100.000%");
    expect(fillPercent(0.25)).toBe("25.000%");
  });

  it("clamps outside the track", () => {
    expect(fillPercent(-2)).toBe("0.000%");
    expect(fillPercent(4)).toBe("100.000%");
  });

  it("answers the start for NaN", () => {
    // `elapsed / duration` is NaN before a track reports its length, and `NaN%`
    // is rejected by CSSOM outright — which leaves the fill at whatever it last
    // was, so a new track appears to begin part-played.
    expect(fillPercent(Number.NaN)).toBe("0%");
  });
});
