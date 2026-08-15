"use client";

import { useEffect, useId, useState } from "react";
import { ClipboardCopy, Palette, RotateCcw } from "lucide-react";
import {
  CANVASES,
  CURSOR_MAX_PX,
  DEFAULT_THEME,
  isCustomised,
  isThemed,
  withCanvasColour,
  withChosenColour,
  THEME_SEEDS,
  accentPreview,
  themeCss,
  type ActorTheme,
  type CanvasId,
} from "@/features/actors/domain/actor-theme";
import {
  GradientPicker,
  type GradientPickerLabels,
} from "@/features/actors/presentation/gradient-picker";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import { slotsFor } from "@/shared/domain/canvas-slots";
import { CANVAS_RANGE, dialsApply } from "@/shared/domain/canvas-motion";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings {@link ThemeConfigurator} renders.
 *
 * The cursor carries three strings: the field's name, a hint saying it is a link
 * and how small it must be, and a warning for a picture too big for any browser
 * to use. Two hints rather than one because the second replaces the first only
 * when it applies — a permanent warning is one nobody reads.
 *
 * The three dials name what they do rather than what they are — "how busy", "how fast"
 * and "how big" rather than density, speed and scale, which are the code's words.
 *
 * The skin's strings are a field name and one label per style. They are the
 * app's chrome and so belong in the catalogues, unlike a person's own writing —
 * `messages.test.ts` fails the build when a style is named in one language and
 * not the other, which is what stops a raw key being shown at somebody.
 *
 * `canvasColours` names the GROUP rather than any one colour: the editor
 * renders as many pickers as the chosen canvas paints with, so there is nothing
 * fixed left to label individually.
 *
 * The background's strings are **nested** under `gradient`, because the picker
 * has a `title` of its own and a flat bag would silently drop one of them.
 *
 * `background` named the page's own colour, which is the one every derived
 * token is built from. The pair that named a light and a dark rendering is
 * gone: a custom theme has one rendering.
 *
 * `copyFromProfile` names the button that takes the whole look from the
 * person's own profile. It is resolved even where no profile is offered, since
 * the panel decides whether to render the button and the catalogue does not.
 *
 * `usingDefault` marks a colour nobody has chosen. A colour input always
 * carries a value, so without saying so the design's own colour reads as a
 * choice somebody made.
 */
export interface ThemeConfiguratorLabels {
  /** Names the whole panel. */
  title: string;
  /** Says the change is already live and needs no saving. */
  live: string;
  /** The gradient picker's own strings, nested to avoid a title collision. */
  gradient: GradientPickerLabels;
  /** Field label for the accent. */
  accent: string;
  /** Names the group of colours the chosen canvas paints with. */
  canvasColours: string;
  /** Field label for the canvas selector. */
  canvas: string;
  /** Field label for how busy the canvas is. */
  density: string;
  /** Field label for how fast it moves. */
  speed: string;
  /** Field label for how large the things it draws are. */
  scale: string;
  /** Field label for the style selector. */
  skin: string;
  /** One label per skin. */
  skins: Record<SkinId, string>;
  /** One label per canvas. */
  canvases: Record<CanvasId, string>;
  /** Explains that a colour is adjusted so it can be read. */
  adjusted: string;
  /** The button that puts everything back. */
  reset: string;
  /** The button that takes the look from the person's own profile. */
  copyFromProfile: string;
  /** Marks a colour nobody has chosen, so the default does not read as a choice. */
  usingDefault: string;
  /** Field label for a picture to use as the mouse cursor. */
  cursor: string;
  /** Says a cursor is a link, and how small a browser needs it to be. */
  cursorHint: string;
  /** Warns that a picture is too big for any browser to use as a cursor. */
  cursorTooBig: string;
}

/**
 * What {@link ThemeConfigurator} needs.
 *
 * `copyFrom` is optional because the panel appears in two places and only one
 * of them has a profile to copy from — on the profile's own editor the answer
 * would be itself.
 */
export interface ThemeConfiguratorProps {
  /** What is stored now. */
  value: ActorTheme;
  /** Called on every change, including while a colour is being dragged. */
  onChange: (theme: ActorTheme) => void;
  /** Already-translated strings. */
  labels: ThemeConfiguratorLabels;
  /**
   * The person's own profile theme, to offer as a starting point.
   *
   * Omitted where there is nothing to copy FROM — the profile's own editor,
   * where the answer would be itself.
   */
  copyFrom?: ActorTheme;
}

/**
 * Lets somebody choose how their own page looks, and shows it immediately.
 *
 * **Every change is live, and that is the requirement rather than a nicety.** A
 * colour is a decision about how it sits next to everything else, so a panel
 * that needed saving before it could be judged would be unusable: somebody
 * would save, look, dislike it, and go round again for every adjustment. The
 * values are custom properties already, so a live preview is `themeCss` on a
 * scoped element — the SAME function the public page uses, which is what stops
 * the preview and the real thing drifting apart.
 *
 * **A cursor picture is measured, not merely accepted.** Browsers ignore one
 * larger than 128×128 in silence, so an unmeasured field would let somebody
 * paste a picture, see nothing change, and have nothing to read about why.
 *
 * **Its `select` is painted with `--menu`, not left transparent.** A dropdown's
 * list is drawn from the control's own background, so a transparent one has
 * nothing to paint with and the browser paints it on white — near-white text on
 * white in dark mode. `dropdown-legibility.test.ts` guards every select in the
 * app against going back.
 *
 * **A skin is chosen separately from the colours, and changes no colour.** It
 * decides form — corners, border weight, shadow, gloss, the body's face — so
 * every pairing of a style and a palette is somebody's page. Tying the two
 * together would have collapsed nine styles into nine colour schemes.
 *
 * **One dial per row.** Three abreast left each about a third of the panel,
 * where the label, the multiplier and the track all competed and the track —
 * the part somebody actually drags — came off worst. Two extra rows of height
 * is the cheaper cost.
 *
 * **The three dials appear only where there is something to turn up.** `none`
 * draws nothing, so a density slider beside it would accept a drag and change
 * nothing at all. Busy and fast are separate because they are separate
 * complaints — a starfield can be crowded and still, and a single box can
 * hurtle.
 *
 * **The canvas gets one picker per part it actually paints with** — see
 * `CANVAS_SLOTS`. Two fixed cloud pickers gave every canvas the same pair and
 * left the ones with more parts unable to say so; and a canvas claiming more
 * colours than it uses would hand somebody controls that change nothing.
 *
 * **The background is a gradient picker rather than a colour input**, because a
 * fursona can carry more colours than any fixed set of fields would allow. A
 * flat background is simply a gradient with one stop, so nothing is lost for
 * somebody who wants one colour.
 *
 * **The pickers are unconstrained, and nothing corrects what they produce.** A
 * page may be as garish or as unreadable as its owner likes. That is a product
 * decision rather than an oversight, and it rests on the visitor being able to
 * switch to the default light or dark theme — the escape hatch is what makes
 * the freedom safe, not a correction applied behind somebody's back.
 *
 * What the author does NOT pick — the text, the borders — is still chosen to be
 * as readable as their background allows.
 *
 *
 * **Picking any colour makes all three explicit** — see `withChosenColour`.
 * Half a theme follows the reader's scheme and half does not, so what an author
 * saw while editing depended on the mode they happened to be in.
 *
 * **Copying from the profile is one press, and it copies the WHOLE theme.** A
 * theme belongs to one actor by design, so a person who spends an evening on
 * their profile finds every character wearing the default — and a gradient
 * placed stop by stop is not something anybody rebuilds from memory. The button
 * appears only where there is something to copy; a profile nobody has themed
 * would copy the default onto the default.
 *
 * Reset is a first-class control rather than "pick the old colour again",
 * because the resting state is **no override at all** — a page that follows the
 * design — and no colour a picker can produce expresses that.
 *
 * @returns the panel.
 */
export function ThemeConfigurator({
  value,
  onChange,
  labels,
  copyFrom,
}: ThemeConfiguratorProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const preview = accentPreview(
    value.accent ?? THEME_SEEDS.accent,
    value.background ?? DEFAULT_GRADIENT,
  );
  const themed = isThemed(value);
  // Reset asks the wider question. Somebody who chose only a skin, a canvas or
  // a cursor still has something to put back, and a disabled button with
  // nothing saying why is the fault this panel keeps being trimmed for.
  const customised = isCustomised(value);
  // **Offered only when there is something to copy.** A profile nobody has
  // themed would copy the default onto the default: a button that accepts a
  // press and changes nothing, with no way for the person to learn it did
  // nothing. Same rule as the visitor's theme switch, which renders only where
  // there is a theme to leave.
  const copyable = copyFrom && isCustomised(copyFrom) ? copyFrom : null;
  const slots = slotsFor(value.canvas);

  // **Measured, because a browser refuses an oversized cursor in silence.** Past
  // 128×128 the declaration is ignored with no error anywhere, so somebody
  // pastes a picture, nothing happens, and there is nothing to read. The image
  // is loaded only to learn its size — cross-origin does not hide dimensions —
  // and the answer becomes a sentence rather than a mystery.
  //
  // The state holds the address that measured too big, and `oversized` is
  // derived from it. A boolean would go stale the moment somebody edited the
  // address: the warning would stay on screen, now describing a picture nobody
  // is using.
  const [tooBig, setTooBig] = useState<string | null>(null);
  useEffect(() => {
    const address = value.cursor;
    if (!address) return;
    const probe = new Image();
    let cancelled = false;
    probe.onload = () => {
      if (cancelled) return;
      const over =
        probe.naturalWidth > CURSOR_MAX_PX ||
        probe.naturalHeight > CURSOR_MAX_PX;
      setTooBig(over ? address : null);
    };
    // A picture that will not load is not reported as too big. That is a
    // different problem, and naming the wrong one is worse than saying nothing.
    probe.onerror = () => {
      if (!cancelled) setTooBig(null);
    };
    probe.src = address;
    return () => {
      cancelled = true;
    };
  }, [value.cursor]);
  const oversized = Boolean(value.cursor && tooBig === value.cursor);

  const swatch = (colour: string, name: string) => (
    <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <span
        aria-hidden
        style={{ background: colour }}
        className="size-4 rounded border border-[var(--edge)]"
      />
      {name}
    </span>
  );

  const colourField = (key: "accent", label: string) => (
    <div className="grid gap-1.5">
      <label
        htmlFor={`${id}-${key}`}
        className="flex items-center justify-between gap-2 text-xs font-medium"
      >
        {label}
        {/* A colour input always carries a value, so without this the design's
            own colour reads as one somebody picked. */}
        {themed ? null : (
          <span className="text-[0.625rem] text-[var(--muted)]">
            {labels.usingDefault}
          </span>
        )}
      </label>
      <input
        id={`${id}-${key}`}
        type="color"
        value={value[key] ?? THEME_SEEDS[key]}
        // `onChange` and not `onBlur`: a colour input fires continuously while
        // somebody drags, and that stream IS the feature. Anything that waited
        // for a commit would put the round trip back that this exists to remove.
        // Picking ANY colour makes all three explicit. Half a theme follows the
        // reader's light or dark scheme and half does not, so what an author saw
        // while editing depended on the mode they were in — see
        // `withChosenColour`.
        onChange={(event) =>
          onChange(withChosenColour(value, key, event.target.value))
        }
        {...tid(`theme-${key}`)}
        className="h-9 w-full cursor-pointer rounded-lg border border-[var(--edge)]/60 bg-[var(--menu)] p-1"
      />
    </div>
  );

  return (
    <section className="grid gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          {...tid("theme-open")}
          className="flex items-center gap-2 font-display text-sm font-bold"
        >
          <Palette className="size-4 text-[var(--accent)]" />
          {labels.title}
        </button>
        <span className="text-xs text-[var(--muted)]">{labels.live}</span>
      </div>

      {open ? (
        <div className="grid gap-4">
          {/* The preview is scoped by the same function the public page uses,
              so what somebody judges here is what a stranger will get. */}
          <style>{themeCss(value)}</style>

          {/* As many colours as somebody wants, which is the point: a fursona
              can carry more than any fixed set of pickers would allow. */}
          <GradientPicker
            value={value.background ?? DEFAULT_GRADIENT}
            onChange={(background) => onChange({ ...value, background })}
            labels={labels.gradient}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            {colourField("accent", labels.accent)}
          </div>

          {/* As many as the chosen canvas actually paints with — see
              CANVAS_SLOTS. Rendering a fixed two gave every canvas the same
              pair and left the ones with more parts unable to say so. */}
          {slots > 0 ? (
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">
                {labels.canvasColours}
              </span>
              <div className="grid gap-3 sm:grid-cols-4">
                {Array.from({ length: slots }, (_, slot) => (
                  <input
                    key={slot}
                    type="color"
                    aria-label={`${labels.canvasColours} ${slot + 1}`}
                    value={
                      value.canvasColours?.[slot] ??
                      THEME_SEEDS.canvasColours[slot] ??
                      "#000000"
                    }
                    onChange={(event) =>
                      onChange(
                        withCanvasColour(value, slot, event.target.value),
                      )
                    }
                    {...tid(`theme-canvas-colour-${slot}`)}
                    className="h-9 w-full cursor-pointer rounded-lg border border-[var(--edge)]/60 bg-transparent p-1"
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium">{labels.adjusted}</span>
            {swatch(preview, labels.accent)}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor={`${id}-cursor`} className="text-xs font-medium">
              {labels.cursor}
            </label>
            <input
              id={`${id}-cursor`}
              type="url"
              inputMode="url"
              value={value.cursor ?? ""}
              onChange={(event) =>
                onChange({ ...value, cursor: event.target.value || null })
              }
              aria-describedby={`${id}-cursor-hint`}
              {...tid("theme-cursor")}
              className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
            />
            <p id={`${id}-cursor-hint`} className="text-xs text-[var(--muted)]">
              {oversized ? labels.cursorTooBig : labels.cursorHint}
            </p>
          </div>

          {/* **Form, not colour** — see `skins.ts`. It sits above the canvas
              because it changes every surface on the page, which is the biggest
              single thing in this panel, and beneath the colours because those
              are what people come here for. */}
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-skin`} className="text-xs font-medium">
              {labels.skin}
            </label>
            <select
              id={`${id}-skin`}
              value={value.skin}
              onChange={(event) =>
                onChange({ ...value, skin: event.target.value as SkinId })
              }
              {...tid("theme-skin")}
              className="rounded-lg border border-[var(--edge)]/60 bg-[var(--menu)] px-3 py-1.5 text-sm"
            >
              {SKINS.map((skin) => (
                <option key={skin} value={skin}>
                  {labels.skins[skin]}
                </option>
              ))}
            </select>
          </div>

          {/* **Only where there is something to turn up.** `none` draws
              nothing, so a density slider for it accepts a drag and changes
              nothing — the fault this panel keeps being trimmed for. */}
          {dialsApply(value.canvas) ? (
            /* **One per row, not three abreast.** Three sliders sharing a
                row left each about a third of the panel: the label, the
                multiplier and the track all competed, and the track — the part
                somebody actually drags — came off worst. Full width costs two
                rows of height on a panel that is already scrolled to. */
            <div className="grid gap-3">
              {(
                [
                  ["density", labels.density],
                  ["speed", labels.speed],
                  ["scale", labels.scale],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="grid gap-1.5">
                  <label
                    htmlFor={`${id}-${key}`}
                    className="flex items-center justify-between gap-2 text-sm font-medium"
                  >
                    {label}
                    {/* The multiplier, so a slider position means something.
                        Built as one string rather than a number beside a
                        literal — the lint rule reads a bare literal in JSX as
                        untranslated copy, and it is right that it would be. */}
                    <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
                      {`${value[key].toFixed(2)}×`}
                    </span>
                  </label>
                  <input
                    id={`${id}-${key}`}
                    type="range"
                    min={CANVAS_RANGE.min}
                    max={CANVAS_RANGE.max}
                    step={0.05}
                    value={value[key]}
                    // Continuous, like the colour inputs: the canvas redraws on
                    // the next frame, so the drag itself IS the preview.
                    onChange={(event) =>
                      onChange({
                        ...value,
                        [key]: Number.parseFloat(event.target.value),
                      })
                    }
                    {...tid(`theme-${key}`)}
                    className="h-2 w-full accent-[var(--accent)]"
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <label htmlFor={`${id}-canvas`} className="text-xs font-medium">
              {labels.canvas}
            </label>
            <select
              id={`${id}-canvas`}
              value={value.canvas}
              onChange={(event) =>
                onChange({ ...value, canvas: event.target.value as CanvasId })
              }
              {...tid("theme-canvas")}
              className="rounded-lg border border-[var(--edge)]/60 bg-[var(--menu)] px-3 py-1.5 text-sm"
            >
              {CANVASES.map((canvas) => (
                <option key={canvas} value={canvas}>
                  {labels.canvases[canvas]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* A whole theme, not a colour of it. Somebody who wants only the
                accent already has the picker; what they cannot rebuild by hand
                is a gradient they placed stop by stop on another page. */}
            {copyable ? (
              <button
                type="button"
                onClick={() => onChange(copyable)}
                {...tid("theme-copy-profile")}
                className="flex w-fit items-center gap-2 rounded-lg border border-[var(--edge)] px-3 py-1.5 text-sm"
              >
                <ClipboardCopy className="size-4" />
                {labels.copyFromProfile}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!customised}
              onClick={() => onChange(DEFAULT_THEME)}
              {...tid("theme-reset")}
              className="flex w-fit items-center gap-2 rounded-lg border border-[var(--edge)] px-3 py-1.5 text-sm"
            >
              <RotateCcw className="size-4" />
              {labels.reset}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
