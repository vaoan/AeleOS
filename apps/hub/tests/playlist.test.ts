import { describe, expect, it } from "vitest";

import {
  clockDigits,
  marqueeLine,
  nextIndex,
  previousIndex,
} from "@/features/actors/domain/playlist";

const straight = { shuffle: false, repeat: false };
const looping = { shuffle: false, repeat: true };
const shuffled = { shuffle: true, repeat: false };

describe("nextIndex", () => {
  it("steps forward through the list", () => {
    expect(nextIndex(0, 4, straight, 0)).toBe(1);
    expect(nextIndex(2, 4, straight, 0)).toBe(3);
  });

  it("stops at the end when repeat is off", () => {
    // `null` is a real answer: the end of a list is the ordinary way playback
    // finishes, and wrapping regardless is what makes autoplay maddening.
    expect(nextIndex(3, 4, straight, 0)).toBeNull();
  });

  it("wraps to the start when repeat is on", () => {
    expect(nextIndex(3, 4, looping, 0)).toBe(0);
  });

  it("starts at the first track when nothing is playing", () => {
    expect(nextIndex(-1, 4, straight, 0)).toBe(0);
  });

  it("has nowhere to go in an empty playlist", () => {
    expect(nextIndex(-1, 0, looping, 0.5)).toBeNull();
    expect(nextIndex(0, 0, straight, 0.5)).toBeNull();
  });

  it("stops after the only track, and repeats it when asked", () => {
    expect(nextIndex(0, 1, straight, 0.5)).toBeNull();
    expect(nextIndex(0, 1, looping, 0.5)).toBe(0);
    expect(nextIndex(-1, 1, straight, 0.5)).toBe(0);
  });

  describe("shuffle", () => {
    it("never answers the track already playing", () => {
      // Pressing next and hearing the same song is indistinguishable from a
      // button that did nothing. Every draw is checked, not a sample of them.
      for (const length of [2, 3, 5, 9]) {
        for (let current = 0; current < length; current++) {
          for (let step = 0; step < 40; step++) {
            const drawn = nextIndex(current, length, shuffled, step / 40);
            expect(drawn, `${length}/${current}/${step}`).not.toBe(current);
            expect(drawn).toBeGreaterThanOrEqual(0);
            expect(drawn).toBeLessThan(length);
          }
        }
      }
    });

    it("can reach every other track", () => {
      // A mapping that skipped one would be invisible in the case above, which
      // only proves the drawn track is not the current one.
      const reached = new Set<number | null>();
      for (let step = 0; step < 200; step++) {
        reached.add(nextIndex(2, 5, shuffled, step / 200));
      }
      expect([...reached].sort()).toEqual([0, 1, 3, 4]);
    });

    it("draws from the whole list when nothing is playing yet", () => {
      // With no current track every entry is a candidate, including the first —
      // the skip-the-current mapping would otherwise make track 0 unreachable
      // as the opening track of a shuffled playlist.
      const reached = new Set<number | null>();
      for (let step = 0; step < 200; step++) {
        reached.add(nextIndex(-1, 4, shuffled, step / 200));
      }
      expect([...reached].sort()).toEqual([0, 1, 2, 3]);
    });

    it("stays inside the list when the draw is exactly one", () => {
      // `Math.floor(1 * n)` is `n`, one past the end. The clamp is what stops
      // a caller's inclusive random source from selecting nothing.
      expect(nextIndex(0, 4, shuffled, 1)).toBeLessThan(4);
      expect(nextIndex(-1, 4, shuffled, 1)).toBeLessThan(4);
    });
  });
});

describe("previousIndex", () => {
  it("steps back through the list", () => {
    expect(previousIndex(2, 4, straight)).toBe(1);
  });

  it("stays put at the start when repeat is off", () => {
    expect(previousIndex(0, 4, straight)).toBeNull();
  });

  it("wraps to the end when repeat is on", () => {
    expect(previousIndex(0, 4, looping)).toBe(3);
  });

  it("does not shuffle", () => {
    // Shuffle decides what comes NEXT. A random "previous" is a button whose
    // label is a lie, so the draw is not even a parameter here.
    expect(previousIndex(2, 4, { shuffle: true, repeat: false })).toBe(1);
  });

  it("has nowhere to go in an empty playlist", () => {
    expect(previousIndex(0, 0, looping)).toBeNull();
  });
});

describe("clockDigits", () => {
  it("splits a time into four digits, minutes first", () => {
    expect(clockDigits(0)).toEqual([0, 0, 0, 0]);
    expect(clockDigits(61)).toEqual([0, 1, 0, 1]);
    expect(clockDigits(11 * 60 + 5)).toEqual([1, 1, 0, 5]);
    expect(clockDigits(59)).toEqual([0, 0, 5, 9]);
  });

  it("clamps at 99:59 rather than drawing a fifth digit", () => {
    // The display is exactly four digits, so an hour-long set would otherwise
    // paint over the marquee beside it.
    expect(clockDigits(100 * 60)).toEqual([9, 9, 5, 9]);
  });

  it("answers zeroes for NaN, which is what a track reports before it loads", () => {
    // `currentTime` is NaN until metadata arrives. NaN reaching the digit
    // lookup draws NO digits — a clock that vanishes for the first moment of
    // every track.
    expect(clockDigits(Number.NaN)).toEqual([0, 0, 0, 0]);
    expect(clockDigits(Number.POSITIVE_INFINITY)).toEqual([0, 0, 0, 0]);
    expect(clockDigits(-5)).toEqual([0, 0, 0, 0]);
  });

  it("truncates rather than rounds", () => {
    // A clock that rounded would show 0:01 for the first half-second of a
    // track, before a second has passed.
    expect(clockDigits(0.9)).toEqual([0, 0, 0, 0]);
    expect(clockDigits(59.9)).toEqual([0, 0, 5, 9]);
  });
});

describe("marqueeLine", () => {
  it("writes Winamp's own form", () => {
    expect(
      marqueeLine({ url: "https://x/1.mp3", artist: "Luna", title: "Howl" }, 1),
    ).toBe("1. Luna - Howl");
  });

  it("uses whichever half somebody wrote", () => {
    expect(marqueeLine({ url: "https://x/1.mp3", title: "Howl" }, 2)).toBe(
      "2. Howl",
    );
    expect(marqueeLine({ url: "https://x/1.mp3", artist: "Luna" }, 3)).toBe(
      "3. Luna",
    );
  });

  it("falls back to the address rather than to nothing", () => {
    // A blank marquee reads as a player that failed to load, rather than as a
    // file nobody named — and a track still has to be tellable from the one
    // above it.
    expect(marqueeLine({ url: "https://x/1.mp3" }, 4)).toBe(
      "4. https://x/1.mp3",
    );
  });

  it("is empty only when there is no track at all", () => {
    expect(marqueeLine(undefined, 1)).toBe("");
  });
});
