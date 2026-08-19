import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useJukebox } from "@/features/actors/application/use-jukebox";
import type { PlaylistTrack } from "@/features/actors/domain/playlist";

const tracks: PlaylistTrack[] = [
  { url: "https://a.test/1.mp3", title: "One" },
  { url: "https://a.test/2.mp3", title: "Two" },
  { url: "https://a.test/3.mp3", title: "Three" },
];

/**
 * Mounts the hook with a real `<audio>` attached.
 *
 * jsdom gives an audio element that never loads anything, which is exactly
 * right here: every transition this hook makes is driven by an event handler
 * the chrome wires up, so the tests fire those handlers rather than waiting on
 * a network jsdom does not have.
 */
function mount(list: readonly PlaylistTrack[] = tracks) {
  const hook = renderHook(() => useJukebox(list));
  const audio = document.createElement("audio");
  act(() => {
    hook.result.current.attach(audio);
  });
  return { ...hook, audio };
}

/** Pretends the element learned how long the track is. */
function reportDuration(audio: HTMLAudioElement, seconds: number): void {
  Object.defineProperty(audio, "duration", {
    value: seconds,
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useJukebox", () => {
  it("starts stopped with nothing loaded", () => {
    const { result } = mount();
    expect(result.current.index).toBe(-1);
    expect(result.current.status).toBe("stopped");
    expect(result.current.track).toBeUndefined();
    expect(result.current.digits).toEqual([0, 0, 0, 0]);
  });

  it("starts the first track when play is pressed from rest", () => {
    const { result } = mount();
    act(() => result.current.toggle());
    expect(result.current.index).toBe(0);
    expect(result.current.status).toBe("playing");
    expect(result.current.track?.title).toBe("One");
  });

  it("does nothing at all when the playlist is empty", () => {
    const { result } = mount([]);
    act(() => result.current.toggle());
    expect(result.current.index).toBe(-1);
    expect(result.current.status).toBe("stopped");
  });

  it("pauses and resumes", () => {
    const { result } = mount();
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.status).toBe("paused");
    act(() => result.current.toggle());
    expect(result.current.status).toBe("playing");
  });

  it("stops and rewinds", () => {
    const { result, audio } = mount();
    act(() => result.current.select(1));
    act(() => result.current.stop());
    expect(result.current.status).toBe("stopped");
    expect(result.current.elapsed).toBe(0);
    expect(audio.currentTime).toBe(0);
  });

  it("steps forward and back", () => {
    const { result } = mount();
    act(() => result.current.select(0));
    act(() => result.current.forward());
    expect(result.current.index).toBe(1);
    act(() => result.current.back());
    expect(result.current.index).toBe(0);
  });

  it("stops at the end rather than wrapping", () => {
    const { result } = mount();
    act(() => result.current.select(2));
    act(() => result.current.forward());
    expect(result.current.status).toBe("stopped");
    expect(result.current.index).toBe(2);
  });

  it("wraps at the end once repeat is on", () => {
    const { result } = mount();
    act(() => result.current.toggleRepeat());
    act(() => result.current.select(2));
    act(() => result.current.forward());
    expect(result.current.index).toBe(0);
  });

  it("stays put at the start when repeat is off", () => {
    const { result } = mount();
    act(() => result.current.select(0));
    act(() => result.current.back());
    expect(result.current.index).toBe(0);
  });

  it("advances when a track ends", () => {
    const { result } = mount();
    act(() => result.current.select(0));
    act(() => result.current.audioProps.onEnded());
    expect(result.current.index).toBe(1);
  });

  it("carries shuffle and repeat", () => {
    const { result } = mount();
    expect(result.current.mode).toEqual({ shuffle: false, repeat: false });
    act(() => result.current.toggleShuffle());
    expect(result.current.mode).toEqual({ shuffle: true, repeat: false });
    act(() => result.current.toggleRepeat());
    expect(result.current.mode).toEqual({ shuffle: true, repeat: true });
    act(() => result.current.toggleShuffle());
    expect(result.current.mode).toEqual({ shuffle: false, repeat: true });
  });

  describe("the shuffle draw", () => {
    /** Makes every draw land on one exact value in [0, 1). */
    function drawAlways(fraction: number): void {
      vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
        new DataView((array as Uint8Array).buffer).setUint32(
          0,
          Math.min(0xff_ff_ff_ff, Math.floor(fraction * 2 ** 32)),
        );
        return array;
      });
    }

    it("maps the low end of the draw to the track just after this one", () => {
      // Deterministic on purpose. An earlier version of this case only asserted
      // "a valid track that is not the current one", and a `draw()` hard-wired
      // to 1 passed it — three tracks alternating 2,1,2,1 are all valid and
      // never repeat, so the fixture could not tell a broken draw from a real
      // one. Rule 27. Controlling the draw is what discriminates.
      drawAlways(0);
      const { result } = mount();
      act(() => result.current.toggleShuffle());
      act(() => result.current.select(0));
      act(() => result.current.forward());
      expect(result.current.index).toBe(1);
    });

    it("maps the high end of the draw to the far end of the list", () => {
      drawAlways(0.999_999);
      const { result } = mount();
      act(() => result.current.toggleShuffle());
      act(() => result.current.select(0));
      act(() => result.current.forward());
      expect(result.current.index).toBe(2);
    });

    it("reaches every track over a run, with the real draw", () => {
      // The un-stubbed sanity check beside the two above: a draw stuck at any
      // one value cannot visit all three.
      const { result } = mount();
      act(() => result.current.toggleShuffle());
      act(() => result.current.select(0));
      const seen = new Set<number>([0]);
      for (let step = 0; step < 60; step++) {
        act(() => result.current.forward());
        expect(result.current.track).toBeDefined();
        seen.add(result.current.index);
      }
      expect([...seen].sort()).toEqual([0, 1, 2]);
    });
  });

  describe("the CORS retry", () => {
    it("asks for CORS on a fresh track", () => {
      const { result } = mount();
      act(() => result.current.select(0));
      expect(result.current.crossOrigin).toBe("anonymous");
      expect(result.current.fidelity).toBe("trying");
    });

    it("keeps the graph when the track loads", () => {
      const { result, audio } = mount();
      act(() => result.current.select(0));
      reportDuration(audio, 200);
      act(() => result.current.audioProps.onLoadedMetadata());
      expect(result.current.fidelity).toBe("full");
      expect(result.current.crossOrigin).toBe("anonymous");
    });

    it("drops CORS and stays playable when the first attempt fails", () => {
      // THE case the whole feature rests on: a host with no
      // Access-Control-Allow-Origin serves the same file perfectly without the
      // attribute. Losing the analyser is the price; losing the music is not.
      const { result } = mount();
      act(() => result.current.select(0));
      act(() => result.current.audioProps.onError());
      expect(result.current.fidelity).toBe("plain");
      expect(result.current.crossOrigin).toBeUndefined();
      expect(result.current.unplayable).toBe(false);
      expect(result.current.status).toBe("playing");
    });

    it("gives up only when the plain attempt fails too", () => {
      const { result } = mount();
      act(() => result.current.select(0));
      act(() => result.current.audioProps.onError());
      act(() => result.current.audioProps.onError());
      expect(result.current.unplayable).toBe(true);
      expect(result.current.status).toBe("stopped");
    });

    it("hopes again for the next track", () => {
      // CORS is per RESOURCE. One host refusing says nothing about the next
      // track's host, and a player that gave up globally would lose the
      // analyser for the whole playlist over one bad link.
      const { result } = mount();
      act(() => result.current.select(0));
      act(() => result.current.audioProps.onError());
      expect(result.current.fidelity).toBe("plain");
      act(() => result.current.forward());
      expect(result.current.fidelity).toBe("trying");
      expect(result.current.crossOrigin).toBe("anonymous");
      expect(result.current.unplayable).toBe(false);
    });
  });

  describe("time", () => {
    it("reports how far through it is", () => {
      const { result, audio } = mount();
      act(() => result.current.select(0));
      reportDuration(audio, 200);
      act(() => result.current.audioProps.onLoadedMetadata());
      audio.currentTime = 65;
      act(() => result.current.audioProps.onTimeUpdate());
      expect(result.current.elapsed).toBe(65);
      expect(result.current.digits).toEqual([0, 1, 0, 5]);
      expect(result.current.progress).toBeCloseTo(0.325);
    });

    it("treats an endless stream as an unknown length", () => {
      // A live stream reports Infinity. Carrying it would make the position
      // slider meaningless rather than merely idle.
      const { result, audio } = mount();
      act(() => result.current.select(0));
      reportDuration(audio, Number.POSITIVE_INFINITY);
      act(() => result.current.audioProps.onLoadedMetadata());
      expect(result.current.duration).toBe(0);
      expect(result.current.progress).toBe(0);
    });

    it("seeks to a fraction of the track", () => {
      const { result, audio } = mount();
      act(() => result.current.select(0));
      reportDuration(audio, 200);
      act(() => result.current.audioProps.onLoadedMetadata());
      act(() => result.current.seek(0.25));
      expect(audio.currentTime).toBe(50);
      expect(result.current.elapsed).toBe(50);
    });

    it("refuses to seek before the length is known", () => {
      // Otherwise the seek lands at 0 and the track restarts, which reads as a
      // scrub bar that rewinds.
      const { result, audio } = mount();
      act(() => result.current.select(0));
      audio.currentTime = 30;
      act(() => result.current.seek(0.5));
      expect(audio.currentTime).toBe(30);
    });

    it("clamps a seek outside the track", () => {
      const { result, audio } = mount();
      act(() => result.current.select(0));
      reportDuration(audio, 200);
      act(() => result.current.audioProps.onLoadedMetadata());
      act(() => result.current.seek(9));
      expect(audio.currentTime).toBe(200);
      act(() => result.current.seek(-9));
      expect(audio.currentTime).toBe(0);
    });
  });

  describe("volume and balance", () => {
    it("puts the volume on the element", () => {
      const { result, audio } = mount();
      act(() => result.current.setVolume(0.25));
      expect(result.current.volume).toBe(0.25);
      expect(audio.volume).toBe(0.25);
    });

    it("clamps both, NaN included", () => {
      const { result } = mount();
      act(() => result.current.setVolume(4));
      expect(result.current.volume).toBe(1);
      act(() => result.current.setVolume(-4));
      expect(result.current.volume).toBe(0);
      act(() => result.current.setVolume(Number.NaN));
      expect(result.current.volume).toBe(0);
      act(() => result.current.setBalance(4));
      expect(result.current.balance).toBe(1);
      act(() => result.current.setBalance(Number.NaN));
      expect(result.current.balance).toBe(0);
    });

    it("starts centred and not at full volume", () => {
      const { result } = mount();
      expect(result.current.balance).toBe(0.5);
      expect(result.current.volume).toBeLessThan(1);
    });
  });

  describe("the element's own events", () => {
    it("follows a play the element started itself", () => {
      const { result } = mount();
      act(() => result.current.audioProps.onPlay());
      expect(result.current.status).toBe("playing");
    });

    it("follows a pause", () => {
      const { result } = mount();
      act(() => result.current.select(0));
      act(() => result.current.audioProps.onPause());
      expect(result.current.status).toBe("paused");
    });

    it("does not turn a stop into a pause", () => {
      // Pausing is what an element does on its way to stopped, so a naive
      // handler turns every stop into a pause and the stop button appears not
      // to work.
      const { result } = mount();
      act(() => result.current.select(0));
      act(() => result.current.stop());
      act(() => result.current.audioProps.onPause());
      expect(result.current.status).toBe("stopped");
    });

    it("survives having no element at all", () => {
      // The chrome renders before the ref is attached, and a stray event in
      // that window must not throw on somebody's public page.
      const { result } = renderHook(() => useJukebox(tracks));
      expect(() => {
        act(() => {
          result.current.audioProps.onTimeUpdate();
          result.current.audioProps.onLoadedMetadata();
          result.current.stop();
          result.current.seek(0.5);
        });
      }).not.toThrow();
    });
  });
});
