"use client";

import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { useJukebox } from "@/features/actors/application/use-jukebox";
import { useSkin } from "@/features/actors/application/use-skin";
import {
  MAIN_HEIGHT,
  MAIN_WIDTH,
  mainBox,
} from "@/features/actors/domain/skin-layout";
import { clockDigits, marqueeLine } from "@/features/actors/domain/playlist";
import {
  chromeStyle,
  fillPercent,
} from "@/features/actors/presentation/chrome-style";
import {
  controlStyle,
  sliderStyle,
  spriteStyle,
  thumbOffset,
} from "@/features/actors/presentation/skin-css";
import type { PlayerChromeProps } from "@/features/actors/presentation/player-chrome";

/**
 * What a Winamp window needs beyond the other chromes.
 *
 * `kind` and `chrome` are fixed — this renderer exists for exactly one chrome —
 * so the shared props are narrowed rather than restated.
 */
export interface WinampChromeProps extends Omit<
  PlayerChromeProps,
  "kind" | "chrome"
> {
  /** The `.wsz` address, or undefined to draw the built-in look. */
  readonly skinUrl: string | undefined;
}

/**
 * The sheets available before any skin loads.
 *
 * **Empty, and that is the design rather than a gap.** Shipping our own
 * `main.bmp` would mean committing binary artwork, drawing a 5x6 bitmap font by
 * hand, and keeping a second visual language in the repository for ever. What
 * happens instead is that a control whose sprite is missing draws itself from
 * the chrome's TOKENS — the same controls every other chrome uses, in the
 * classic layout's own boxes. So the unskinned window is AeleOS's own look, a
 * museum skin makes it authentic, and there is one rendering path either way.
 *
 * A skin supplying only some sheets is the ordinary case and gets the same
 * treatment per control — which is exactly what `useSkin`'s merge is for.
 */
const NO_SHEETS: ReadonlyMap<string, string> = new Map();

/**
 * One control of the classic window: its sprite, or a token-drawn stand-in.
 *
 * **The fallback is not an error path.** `controlStyle` answers the BOX even
 * when the skin has no picture for it, so a control keeps its position and only
 * loses its face — which is what lets a partial skin draw the rest of the
 * window rather than piling everything into the top-left corner.
 */
function AmpControl(props: {
  readonly control: string;
  readonly sprite: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly sheets: ReadonlyMap<string, string>;
  readonly children: ReactNode;
}): ReactNode {
  const { control, sprite, label, onClick, pressed, sheets, children } = props;
  const style = controlStyle(control, sprite, sheets);
  const painted = style?.backgroundImage !== undefined;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      style={style}
      data-painted={painted ? "sprite" : "tokens"}
      className={
        painted
          ? "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--chrome-accent)"
          : "grid place-items-center border border-(--chrome-button-edge) bg-(--chrome-button) text-(--chrome-ink) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--chrome-accent) aria-pressed:text-(--chrome-accent)"
      }
    >
      {painted ? <span className="sr-only">{label}</span> : children}
    </button>
  );
}

/**
 * Winamp's main window, drawn from a real `.wsz` skin.
 *
 * **The one chrome that is not a token set**, which is why it has a renderer of
 * its own and sits behind its own dynamic import: it carries the archive
 * reader, the sprite atlas and the sprite CSS, and a page whose player is a
 * token chrome must not pay for any of it.
 *
 * **Fixed at 275x116 and scaled, never reflowed.** Winamp itself only ever
 * offered 1x and 2x, and pixel art cannot reflow — so the size comes from a
 * CONTAINER query on the place the block sits in, per this feature's rule that
 * content adapts to its parent rather than to the window. A viewport breakpoint
 * here would be the wrong question rather than a weaker one: a block in one
 * place of a three-space section is about a third of the page wide.
 *
 *
 * **The readout names what WILL play when nothing has been selected.** Before a
 * track is chosen there is none, and falling through to the empty label over a
 * playlist holding songs contradicts the list under it — which is what the
 * showcase page showed before this was fixed.
 *
 * @param props - the playlist, the skin, and every word it says.
 * @returns the window.
 */
export function WinampChrome(props: WinampChromeProps): ReactNode {
  const { tracks, title, labels, skinUrl } = props;
  const { sheets } = useSkin(skinUrl, NO_SHEETS);
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
    status,
    stop,
    toggle,
    toggleRepeat,
    toggleShuffle,
    track,
    unplayable,
    elapsed,
    volume,
    setVolume,
  } = useJukebox(tracks);

  const playing = status === "playing";
  // **The readout names what WILL play, not nothing.** Before anything is
  // selected `track` is undefined, and falling through to "no songs yet" over a
  // playlist holding two of them is a readout that contradicts the list right
  // under it — seen on the showcase page before this line existed.
  const showing = track ?? tracks[0];
  const showingAt = track ? index + 1 : 1;
  const line = unplayable ? labels.unplayable : marqueeLine(showing, showingAt);
  const digits = clockDigits(elapsed);
  const window_ = spriteStyle("MAIN_WINDOW_BACKGROUND", sheets);
  const trough = mainBox("position");
  const clock = mainBox("time");
  const marquee = mainBox("marquee");
  const volumeBox = mainBox("volume");

  return (
    <figure
      style={chromeStyle("jukebox", "winamp")}
      className="@container w-full font-(family-name:--chrome-font)"
      data-chrome="winamp"
    >
      <figcaption className="sr-only">{title}</figcaption>
      <audio
        ref={attach}
        src={track?.url}
        crossOrigin={crossOrigin}
        autoPlay={playing}
        {...audioProps}
      />

      <div
        // The scale steps are Winamp's own. Between 275 and 549 the window sits
        // at 1x with room to spare, which is what Winamp did rather than
        // stretching.
        className="origin-top-left scale-75 @[275px]:scale-100 @[550px]:scale-200"
        style={
          {
            width: `${MAIN_WIDTH}px`,
            height: `${MAIN_HEIGHT}px`,
            ...window_,
            backgroundColor: window_ ? undefined : "var(--chrome-shell)",
            position: "relative",
          } as CSSProperties
        }
      >
        {marquee && (
          <p
            aria-live="polite"
            className="absolute truncate text-[6px] leading-none text-(--chrome-ink)"
            style={{
              left: `${marquee.left}px`,
              top: `${marquee.top}px`,
              width: `${marquee.width}px`,
            }}
          >
            {line || labels.empty}
          </p>
        )}

        {clock && (
          <p
            className="absolute text-[11px] leading-none text-(--chrome-ink) tabular-nums"
            style={{ left: `${clock.left}px`, top: `${clock.top}px` }}
          >
            {`${digits[0]}${digits[1]}:${digits[2]}${digits[3]}`}
          </p>
        )}

        {trough && (
          <label
            className="absolute"
            style={{
              left: `${trough.left}px`,
              top: `${trough.top}px`,
              width: `${trough.width}px`,
              height: `${trough.height}px`,
            }}
          >
            <span className="sr-only">{labels.seek}</span>
            <span
              aria-hidden
              style={
                spriteStyle("MAIN_POSITION_SLIDER_BACKGROUND", sheets) ?? {
                  background: "var(--chrome-edge)",
                  display: "block",
                  height: "100%",
                }
              }
            />
            <span
              aria-hidden
              className="absolute top-0 bg-(--chrome-accent)"
              style={{
                left: `${thumbOffset(progress, trough.width, 29)}px`,
                width: "29px",
                height: `${trough.height}px`,
                ...spriteStyle("MAIN_POSITION_SLIDER_THUMB", sheets),
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
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        )}

        <AmpControl
          control="previous"
          sprite="MAIN_PREVIOUS_BUTTON"
          label={labels.previous}
          onClick={back}
          sheets={sheets}
        >
          <SkipBack size={10} aria-hidden />
        </AmpControl>
        <AmpControl
          control="play"
          sprite={playing ? "MAIN_PAUSE_BUTTON" : "MAIN_PLAY_BUTTON"}
          label={playing ? labels.pause : labels.play}
          onClick={toggle}
          sheets={sheets}
        >
          {playing ? (
            <Pause size={10} aria-hidden />
          ) : (
            <Play size={10} aria-hidden />
          )}
        </AmpControl>
        <AmpControl
          control="stop"
          sprite="MAIN_STOP_BUTTON"
          label={labels.stop}
          onClick={stop}
          sheets={sheets}
        >
          <Square size={10} aria-hidden />
        </AmpControl>
        <AmpControl
          control="next"
          sprite="MAIN_NEXT_BUTTON"
          label={labels.next}
          onClick={forward}
          sheets={sheets}
        >
          <SkipForward size={10} aria-hidden />
        </AmpControl>
        <AmpControl
          control="shuffle"
          sprite={
            mode.shuffle
              ? "MAIN_SHUFFLE_BUTTON_SELECTED"
              : "MAIN_SHUFFLE_BUTTON"
          }
          label={labels.shuffle}
          pressed={mode.shuffle}
          onClick={toggleShuffle}
          sheets={sheets}
        >
          <Shuffle size={10} aria-hidden />
        </AmpControl>
        <AmpControl
          control="repeat"
          sprite={
            mode.repeat ? "MAIN_REPEAT_BUTTON_SELECTED" : "MAIN_REPEAT_BUTTON"
          }
          label={labels.repeat}
          pressed={mode.repeat}
          onClick={toggleRepeat}
          sheets={sheets}
        >
          <Repeat size={10} aria-hidden />
        </AmpControl>

        {volumeBox && (
          <label
            className="absolute"
            style={{
              left: `${volumeBox.left}px`,
              top: `${volumeBox.top}px`,
              width: `${volumeBox.width}px`,
              height: `${volumeBox.height}px`,
            }}
          >
            <span className="sr-only">{labels.volume}</span>
            <span
              aria-hidden
              className="block size-full"
              style={
                sliderStyle("MAIN_VOLUME_BACKGROUND", sheets, volume) ?? {
                  background: `linear-gradient(90deg,var(--chrome-accent) ${fillPercent(volume)},var(--chrome-edge) 0)`,
                }
              }
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label={labels.volume}
              onChange={(event) => setVolume(event.target.valueAsNumber)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        )}
      </div>
    </figure>
  );
}
