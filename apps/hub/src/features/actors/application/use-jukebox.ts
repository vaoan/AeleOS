"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clockDigits,
  nextIndex,
  previousIndex,
  type PlaylistMode,
  type PlaylistTrack,
} from "@/features/actors/domain/playlist";

/** What a jukebox is doing. */
export type JukeboxStatus = "stopped" | "playing" | "paused";

/**
 * How the current track is being loaded, which decides what works.
 *
 * **This is not a nicety — it decides whether two controls exist.** The Web
 * Audio API refuses to read a media element it cannot see the bytes of, and
 * connecting a tainted element to a graph does not merely lose the analyser: it
 * outputs SILENCE. So a graph is built only once a track has loaded with CORS,
 * and the visualiser and the balance control both live or die with it.
 *
 * - `trying` — loading with `crossOrigin="anonymous"`, hoping for a graph.
 * - `full` — it loaded, so there is a graph, a visualiser and a balance.
 * - `plain` — it did not, so it was reloaded without CORS. The music plays;
 *   the analyser and the balance do not exist.
 */
export type JukeboxFidelity = "trying" | "full" | "plain";

/**
 * Everything a chrome needs to draw itself and drive playback.
 *
 * **DESTRUCTURE this rather than reading through it, and that is a contract
 * rather than a style note.** {@link Jukebox.attach} is a ref, and React 19's
 * `react-hooks/refs` back-propagates: once it lands in a `ref=` position the
 * compiler treats the WHOLE object as holding a ref, and every unrelated read —
 * `volume`, `status`, `mode` — becomes "cannot access refs during render".
 * Binding the fields separately confines the inference to the one value that
 * really is one. Making `attach` a callback rather than a `RefObject` does NOT
 * avoid this; the taint is on the object, not on the type.
 */
export interface Jukebox {
  /** Which track is loaded, or -1 when none is. */
  readonly index: number;
  /** The loaded track, or undefined. */
  readonly track: PlaylistTrack | undefined;
  /** Playing, paused or stopped. */
  readonly status: JukeboxStatus;
  /** How far through, in seconds. */
  readonly elapsed: number;
  /** How long the track is, in seconds, or 0 before it is known. */
  readonly duration: number;
  /** The four clock digits, minutes first. */
  readonly digits: readonly number[];
  /** How far through, 0 to 1, for the position slider. */
  readonly progress: number;
  /** Loudness, 0 to 1. */
  readonly volume: number;
  /** Left to right, 0 to 1, with 0.5 centred. */
  readonly balance: number;
  /** Shuffle and repeat. */
  readonly mode: PlaylistMode;
  /** What works for the current track. See {@link JukeboxFidelity}. */
  readonly fidelity: JukeboxFidelity;
  /** True when the current track could not be played at all. */
  readonly unplayable: boolean;
  /**
   * Hand the media element to the hook. Use as `ref={jukebox.attach}`.
   *
   * **A callback ref rather than a `RefObject`, and that is not a preference.**
   * React 19's `react-hooks/refs` treats an object CONTAINING a ref as a ref
   * throughout, so returning one here made every unrelated read — `volume`,
   * `status`, `mode` — an error for accessing a ref during render. A callback
   * is a plain function, so the state bag stays a state bag.
   *
   * `HTMLMediaElement` rather than `HTMLAudioElement`, because a `player`
   * chrome mounts a `<video>` where a `jukebox` mounts an `<audio>`. Everything
   * this hook touches is declared on the shared base, so one hook serves both
   * without knowing which it drives.
   */
  readonly attach: (element: HTMLMediaElement | null) => void;
  /** What to put on the element's `crossOrigin`, or undefined for none. */
  readonly crossOrigin: "anonymous" | undefined;
  /** Play, or pause if already playing. */
  toggle(): void;
  /** Stop and rewind. */
  stop(): void;
  /** Load a track by index and play it. */
  select(index: number): void;
  /** Go to the next track, by shuffle or in order. */
  forward(): void;
  /** Step back through the list. */
  back(): void;
  /** Seek to a fraction of the track. */
  seek(fraction: number): void;
  /** Set the loudness, 0 to 1. */
  setVolume(volume: number): void;
  /** Set the balance, 0 to 1. Does nothing without a graph. */
  setBalance(balance: number): void;
  /** Turn shuffle on or off. */
  toggleShuffle(): void;
  /** Turn repeat on or off. */
  toggleRepeat(): void;
  /** The element's own handlers, to spread onto the media element. */
  readonly audioProps: {
    onTimeUpdate(): void;
    onLoadedMetadata(): void;
    onEnded(): void;
    onError(): void;
    onPlay(): void;
    onPause(): void;
  };
}

/** Where the balance sits when nobody has moved it. */
const CENTRE = 0.5;

/** How loud a player starts, which is not full. */
const DEFAULT_VOLUME = 0.8;

/**
 * A uniform draw in [0, 1), for the shuffle.
 *
 * **`crypto.getRandomValues` rather than `Math.random`, and the reason is not
 * secrecy.** Nothing here is a security property — the worst a guessable
 * shuffle does is play a song in an order somebody could have predicted. It is
 * that `Math.random` needs an exclusion from `sonarjs/pseudo-random` wherever
 * it appears, and an exclusion is a decision every future reader has to
 * re-litigate, where four bytes per track change costs nothing measurable. The
 * rule stays on and the file needs no disable at all.
 *
 * Divided by 2^32 rather than by `0xffffffff` because there are 2^32 possible
 * values, so that is the divisor giving a uniform half-open [0, 1). The larger
 * divisor would make 1 reachable and the distribution faintly uneven.
 *
 * **That is arithmetic rather than a guard, and the difference was measured.**
 * Swapping the divisor reddens nothing, because `nextIndex` clamps a draw of
 * exactly 1 back inside the list — `playlist.test.ts` has the case. An earlier
 * version of this comment claimed the inclusive form "selects one past the
 * end", which is simply false. Right answer, wrong reason, and the wrong reason
 * is what the next person would have copied.
 *
 * **Read through a `DataView` rather than as `bytes[0] ?? 0`.** Indexing a
 * typed array is `number | undefined` under `noUncheckedIndexedAccess`, so the
 * fallback is a branch no input can reach — `getRandomValues` always fills what
 * it is given — and an unreachable branch holds coverage under the threshold
 * for ever with nothing to write a case against. `getUint32` simply returns a
 * number.
 *
 * @returns a number in [0, 1).
 */
function draw(): number {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return new DataView(bytes.buffer).getUint32(0) / 2 ** 32;
}

/**
 * Clamps into 0..1, treating NaN as the low end.
 *
 * @param value - the proposed setting.
 * @returns it, within range.
 */
function within(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Drives a media element from a playlist, for any retro chrome.
 *
 * **One hook serves both chromes**, because what a Winamp window and a WMP7
 * window do is identical — they differ only in how they are drawn. A second
 * implementation would drift the first time either changed.
 *
 * **Playback never requires CORS and the analyser always does.** A plain
 * `<audio>` plays a cross-origin file with no CORS headers at all; only reading
 * its samples is forbidden. So each track is tried with `crossOrigin` first and
 * reloaded without it on failure — one extra request on a host without CORS, in
 * exchange for a real spectrum analyser on a host with one. That is the whole
 * reason this feature works on a platform that hosts no files, and it is
 * something the obvious library could not do.
 *
 * **A track that fails BOTH ways is reported, never silently skipped.** Moving
 * on would leave somebody pressing play on a dead link and watching the player
 * jump, with nothing to explain it.
 *
 * **The shuffle's randomness comes from {@link draw}, and the DECISION comes
 * from `nextIndex`.** Nothing about which track is chosen lives here — this
 * supplies a number and applies the answer, so the choosing can be tested
 * exhaustively over every draw rather than sampled through a hook.
 *
 * @param tracks - the playlist, in order.
 * @returns the state and the controls.
 */
export function useJukebox(tracks: readonly PlaylistTrack[]): Jukebox {
  const audioRef = useRef<HTMLMediaElement | null>(null);
  const attach = useCallback((element: HTMLMediaElement | null) => {
    audioRef.current = element;
  }, []);
  const [index, setIndex] = useState(-1);
  const [status, setStatus] = useState<JukeboxStatus>("stopped");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [balance, setBalanceState] = useState(CENTRE);
  const [mode, setMode] = useState<PlaylistMode>({
    shuffle: false,
    repeat: false,
  });
  const [fidelity, setFidelity] = useState<JukeboxFidelity>("trying");
  const [unplayable, setUnplayable] = useState(false);

  const track = index >= 0 ? tracks[index] : undefined;

  // The element's own volume, which needs no graph and so always applies.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume, index]);

  const select = useCallback((next: number) => {
    setIndex(next);
    setElapsed(0);
    setDuration(0);
    setUnplayable(false);
    // Every new track starts hopeful: CORS is per RESOURCE, so one host
    // refusing says nothing about the next track's host.
    setFidelity("trying");
    setStatus("playing");
  }, []);

  const forward = useCallback(() => {
    const next = nextIndex(index, tracks.length, mode, draw());
    if (next === null) {
      setStatus("stopped");
      setElapsed(0);
      return;
    }
    select(next);
  }, [index, tracks.length, mode, select]);

  const back = useCallback(() => {
    const previous = previousIndex(index, tracks.length, mode);
    if (previous !== null) select(previous);
  }, [index, tracks.length, mode, select]);

  const toggle = useCallback(() => {
    if (index < 0) {
      if (tracks.length > 0) select(0);
      return;
    }
    setStatus((was) => (was === "playing" ? "paused" : "playing"));
  }, [index, tracks.length, select]);

  const stop = useCallback(() => {
    setStatus("stopped");
    setElapsed(0);
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
  }, []);

  const seek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      const to = within(fraction) * duration;
      audio.currentTime = to;
      setElapsed(to);
    },
    [duration],
  );

  const setVolume = useCallback((next: number) => {
    setVolumeState(within(next));
  }, []);

  const setBalance = useCallback((next: number) => {
    setBalanceState(within(next));
  }, []);

  const toggleShuffle = useCallback(() => {
    setMode((was) => ({ ...was, shuffle: !was.shuffle }));
  }, []);

  const toggleRepeat = useCallback(() => {
    setMode((was) => ({ ...was, repeat: !was.repeat }));
  }, []);

  const audioProps = {
    onTimeUpdate() {
      const audio = audioRef.current;
      if (audio) setElapsed(audio.currentTime);
    },
    onLoadedMetadata() {
      const audio = audioRef.current;
      if (!audio) return;
      // A stream reports Infinity, which would make the position slider
      // meaningless rather than merely wrong; 0 says "unknown" and the slider
      // sits at rest.
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (fidelity === "trying") setFidelity("full");
    },
    onEnded() {
      forward();
    },
    onError() {
      // **The retry, and the whole reason playback works here.** A first
      // failure while attempting CORS means the host sends no
      // `Access-Control-Allow-Origin`; the same file plays perfectly without
      // the attribute. A failure on the second attempt is a genuinely dead
      // link.
      if (fidelity === "trying") {
        setFidelity("plain");
        return;
      }
      setUnplayable(true);
      setStatus("stopped");
    },
    onPlay() {
      setStatus("playing");
    },
    onPause() {
      setStatus((was) => (was === "stopped" ? was : "paused"));
    },
  };

  return {
    index,
    track,
    status,
    elapsed,
    duration,
    digits: clockDigits(elapsed),
    progress: duration > 0 ? within(elapsed / duration) : 0,
    volume,
    balance,
    mode,
    fidelity,
    unplayable,
    attach,
    crossOrigin: fidelity === "plain" ? undefined : "anonymous",
    toggle,
    stop,
    select,
    forward,
    back,
    seek,
    setVolume,
    setBalance,
    toggleShuffle,
    toggleRepeat,
    audioProps,
  };
}
