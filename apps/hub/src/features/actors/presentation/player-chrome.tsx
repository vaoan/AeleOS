"use client";

import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import type { ReactNode } from "react";

import { useJukebox } from "@/features/actors/application/use-jukebox";
import type { ChromeKind } from "@/features/actors/domain/chromes";
import {
  marqueeLine,
  type PlaylistTrack,
} from "@/features/actors/domain/playlist";
import {
  chromeStyle,
  fillPercent,
} from "@/features/actors/presentation/chrome-style";

/**
 * Every word this chrome says, resolved on the server.
 *
 * **Passed rather than looked up**, on the same reasoning `dragAnnouncements`
 * carries: these are resolved where the request's locale lives and handed to a
 * client component as data, because a translation function cannot make that
 * crossing.
 */
export interface PlayerLabels {
  /** The play button, while stopped or paused. */
  readonly play: string;
  /** The play button, while playing. */
  readonly pause: string;
  /** The stop button. */
  readonly stop: string;
  /** The previous-track button. */
  readonly previous: string;
  /** The next-track button. */
  readonly next: string;
  /** The shuffle toggle. */
  readonly shuffle: string;
  /** The repeat toggle. */
  readonly repeat: string;
  /** The volume slider. */
  readonly volume: string;
  /** The seek slider. */
  readonly seek: string;
  /** The track list. */
  readonly playlist: string;
  /** Shown when the current track will not play at all. */
  readonly unplayable: string;
  /** Shown when a playlist has nothing in it. */
  readonly empty: string;
}

/** What a retro chrome needs to draw itself. */
export interface PlayerChromeProps {
  /** Which roster the chrome comes from, and whether there is a video pane. */
  readonly kind: ChromeKind;
  /** The chrome name stored on the leaf's `icon`. */
  readonly chrome: string | undefined;
  /** The playlist, in order. */
  readonly tracks: readonly PlaylistTrack[];
  /** What the person called this player, shown in its title bar. */
  readonly title: string;
  /** Every word it says. */
  readonly labels: PlayerLabels;
}

/** One transport button, wearing the chrome's own button tokens. */
function ChromeButton(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const { label, onClick, pressed, children } = props;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-(--chrome-button-radius) border border-(--chrome-button-edge) bg-(--chrome-button) text-(--chrome-ink) transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--chrome-accent) aria-pressed:text-(--chrome-accent)"
    >
      {children}
    </button>
  );
}

/**
 * A retro media player, drawn entirely from its chrome's tokens.
 *
 * **One component for every token chrome, and that is the design rather than a
 * simplification.** Every player of that era draws the same things and differs
 * only in ornament, so ten chromes are ten rows of a table instead of ten
 * components — which is what makes the roster affordable and the public page
 * cheap. Winamp is the exception and has its own renderer, because it is a
 * sprite engine rather than a token set.
 *
 * **The video pane is present for a `player` and absent for a `jukebox`**, and
 * that is not cosmetic: it is the only place a YouTube embed may legally be
 * shown, since YouTube's terms forbid hiding the player.
 *
 * @param props - the chrome, the playlist and its words.
 * @returns the player.
 */
export function PlayerChrome(props: PlayerChromeProps): ReactNode {
  const { kind, chrome, tracks, title, labels } = props;
  // **Destructured rather than read through the object, and that is forced.**
  // React 19's `react-hooks/refs` sees `attach` land in a `ref=` position and
  // then treats the WHOLE bag as a ref, so every unrelated read — `volume`,
  // `status`, `mode` — becomes "cannot access refs during render". Binding the
  // fields separately keeps the inference to the one value that is a ref.
  const {
    attach,
    crossOrigin,
    forward,
    back,
    index,
    mode,
    audioProps,
    progress,
    seek,
    select,
    setVolume,
    status,
    stop,
    toggle,
    toggleRepeat,
    toggleShuffle,
    track,
    unplayable,
    volume,
  } = useJukebox(tracks);
  const playing = status === "playing";
  const line = marqueeLine(track, index + 1);
  // Position named once, the way the renderer and the leaf editor already do
  // it: a track has no identity but where it sits — the same song may appear
  // twice in one playlist — and `react/no-array-index-key` reads the map
  // callback's index parameter.
  const entries = tracks.map((one, at) => ({ key: `track-${at}`, one, at }));

  return (
    <figure
      style={chromeStyle(kind, chrome)}
      className="@container grid gap-0 overflow-hidden rounded-(--chrome-radius) border border-(--chrome-edge) bg-(--chrome-shell) font-(family-name:--chrome-font) shadow-(--chrome-shadow)"
      data-chrome={chrome ?? "default"}
    >
      <figcaption className="truncate bg-(--chrome-face) px-3 py-1.5 text-xs font-semibold text-(--chrome-ink)">
        {title}
      </figcaption>

      {kind === "player" && (
        <div className="relative aspect-video w-full bg-(--chrome-pane)">
          <video
            ref={attach}
            src={track?.url}
            crossOrigin={crossOrigin}
            autoPlay={playing}
            className="absolute inset-0 size-full"
            {...audioProps}
          />
        </div>
      )}

      {kind === "jukebox" && (
        <audio
          ref={attach}
          src={track?.url}
          crossOrigin={crossOrigin}
          autoPlay={playing}
          {...audioProps}
        />
      )}

      <div className="grid gap-2 bg-(--chrome-face) p-3">
        <p
          className="truncate text-xs text-(--chrome-ink-dim)"
          aria-live="polite"
        >
          {unplayable ? labels.unplayable : line || labels.empty}
        </p>

        <label className="grid gap-1">
          <span className="sr-only">{labels.seek}</span>
          <span
            aria-hidden
            className="block h-1 rounded-full bg-(--chrome-edge)"
            style={{
              backgroundImage: `linear-gradient(90deg,var(--chrome-accent) ${fillPercent(progress)},transparent 0)`,
            }}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            aria-label={labels.seek}
            onChange={(event) => seek(event.target.valueAsNumber)}
            className="h-1 w-full cursor-pointer opacity-0"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          <ChromeButton label={labels.previous} onClick={back}>
            <SkipBack size={14} aria-hidden />
          </ChromeButton>
          <ChromeButton
            label={playing ? labels.pause : labels.play}
            onClick={toggle}
          >
            {playing ? (
              <Pause size={14} aria-hidden />
            ) : (
              <Play size={14} aria-hidden />
            )}
          </ChromeButton>
          <ChromeButton label={labels.stop} onClick={stop}>
            <Square size={14} aria-hidden />
          </ChromeButton>
          <ChromeButton label={labels.next} onClick={forward}>
            <SkipForward size={14} aria-hidden />
          </ChromeButton>
          <ChromeButton
            label={labels.shuffle}
            pressed={mode.shuffle}
            onClick={toggleShuffle}
          >
            <Shuffle size={14} aria-hidden />
          </ChromeButton>
          <ChromeButton
            label={labels.repeat}
            pressed={mode.repeat}
            onClick={toggleRepeat}
          >
            <Repeat size={14} aria-hidden />
          </ChromeButton>

          <label className="ml-auto flex items-center gap-1.5">
            <Volume2
              size={14}
              aria-hidden
              className="text-(--chrome-ink-dim)"
            />
            <span className="sr-only">{labels.volume}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label={labels.volume}
              onChange={(event) => setVolume(event.target.valueAsNumber)}
              className="w-20 cursor-pointer accent-(--chrome-accent)"
            />
          </label>
        </div>
      </div>

      {tracks.length > 0 && (
        <ol aria-label={labels.playlist} className="max-h-40 overflow-y-auto">
          {entries.map(({ key, one, at }) => (
            <li key={key}>
              <button
                type="button"
                aria-current={at === index ? "true" : undefined}
                onClick={() => select(at)}
                className="block w-full truncate px-3 py-1 text-left text-xs text-(--chrome-ink-dim) hover:bg-(--chrome-button) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--chrome-accent) aria-[current]:text-(--chrome-accent)"
              >
                {marqueeLine(one, at + 1)}
              </button>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
