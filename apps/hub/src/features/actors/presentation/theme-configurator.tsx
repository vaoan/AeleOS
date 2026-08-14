"use client";

import { useId, useState } from "react";
import { Palette, RotateCcw } from "lucide-react";
import {
  CANVASES,
  DEFAULT_THEME,
  THEME_SCOPE,
  isThemed,
  withChosenColour,
  THEME_SEEDS,
  accentPreview,
  themeCss,
  type ActorTheme,
  type CanvasId,
} from "@/features/actors/domain/actor-theme";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings {@link ThemeConfigurator} renders.
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
  /** Field label for the accent. */
  accent: string;
  /** Field label for one cloud. */
  backdropA: string;
  /** Field label for the other cloud. */
  backdropB: string;
  /** Field label for the canvas selector. */
  canvas: string;
  /** One label per canvas. */
  canvases: Record<CanvasId, string>;
  /** Names the two swatches that show what a visitor sees. */
  onLight: string;
  /** Names the two swatches that show what a visitor sees. */
  onDark: string;
  /** Explains that a colour is adjusted so it can be read. */
  adjusted: string;
  /** The button that puts everything back. */
  reset: string;
  /** Marks a colour nobody has chosen, so the default does not read as a choice. */
  usingDefault: string;
}

/** What {@link ThemeConfigurator} needs. */
export interface ThemeConfiguratorProps {
  /** What is stored now. */
  value: ActorTheme;
  /** Called on every change, including while a colour is being dragged. */
  onChange: (theme: ActorTheme) => void;
  /** Already-translated strings. */
  labels: ThemeConfiguratorLabels;
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
 * **The pickers are unconstrained on purpose.** A curated palette is not
 * personalisation, and the legibility problem it would solve is solved better
 * elsewhere: `legibleAccent` keeps the hue and chroma somebody picked and moves
 * the lightness until a visitor can read the page. So any colour at all is
 * allowed here, including the ones that cannot be rendered as picked.
 *
 * That adjustment is disclosed by showing **both renderings side by side**,
 * labelled for the two schemes. It is not a warning: a warning about a colour
 * can be dismissed and then the page ships unreadable, and it would have to
 * explain in words what two swatches show at a glance. Somebody who picks pale
 * yellow and sees the darker light-mode swatch understands immediately, without
 * being told they did something wrong.
 *
 * **Picking any colour makes all three explicit** — see `withChosenColour`.
 * Half a theme follows the reader's scheme and half does not, so what an author
 * saw while editing depended on the mode they happened to be in.
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
}: ThemeConfiguratorProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const preview = accentPreview(value.accent ?? THEME_SEEDS.accent);
  const themed = isThemed(value);

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

  const colourField = (
    key: "accent" | "backdropA" | "backdropB",
    label: string,
  ) => (
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
        className="h-9 w-full cursor-pointer rounded-lg border border-[var(--edge)]/60 bg-transparent p-1"
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
          <style>{themeCss(value, THEME_SCOPE)}</style>

          <div className="grid gap-3 sm:grid-cols-3">
            {colourField("accent", labels.accent)}
            {colourField("backdropA", labels.backdropA)}
            {colourField("backdropB", labels.backdropB)}
          </div>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium">{labels.adjusted}</span>
            <div className="flex flex-wrap gap-4">
              {swatch(preview.light, labels.onLight)}
              {swatch(preview.dark, labels.onDark)}
            </div>
          </div>

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
              className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
            >
              {CANVASES.map((canvas) => (
                <option key={canvas} value={canvas}>
                  {labels.canvases[canvas]}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!themed}
            onClick={() => onChange(DEFAULT_THEME)}
            {...tid("theme-reset")}
            className="flex w-fit items-center gap-2 rounded-lg border border-[var(--edge)] px-3 py-1.5 text-sm"
          >
            <RotateCcw className="size-4" />
            {labels.reset}
          </button>
        </div>
      ) : null}
    </section>
  );
}
