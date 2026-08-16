"use client";

import { useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  GRADIENT_KINDS,
  MAX_STOPS,
  MIN_STOPS,
  RADIAL_EXTENTS,
  RADIAL_SHAPES,
  REPEAT_RANGE,
  addStop,
  gradientCss,
  removeStop,
  setStop,
  type Gradient,
  type GradientKind,
  type RadialExtent,
  type RadialShape,
} from "@/shared/domain/gradient";
import { cn } from "@/shared/infrastructure/cn";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings {@link GradientPicker} renders.
 *
 * The kinds, the radial shapes and the extents arrive as records keyed by the
 * value they name, so a value added to one of those lists is a compile error
 * here rather than a control rendering a blank choice at somebody.
 *
 * `kind` names the GROUP now rather than the field. The three kinds are three
 * buttons rather than a `select`, so there is no one control left for it to
 * label — it is the group's accessible name, and what a reader hears before
 * the three names inside it.
 */
export interface GradientPickerLabels {
  /** Names the whole control. */
  title: string;
  /** Names the bar the stops sit on. */
  bar: string;
  /** The colour of the selected stop. */
  colour: string;
  /** Where the selected stop sits. */
  position: string;
  /** Which way the gradient runs. */
  angle: string;
  /** Adds a stop. */
  add: string;
  /** Removes the selected stop. */
  remove: string;
  /** Names the group of buttons choosing the kind. */
  kind: string;
  /** A name per kind. */
  kinds: Record<GradientKind, string>;
  /** Whether the colours repeat. */
  repeat: string;
  /** How much of the gradient one repetition covers. */
  every: string;
  /** A radial gradient's shape. */
  shape: string;
  /** A name per radial shape. */
  shapes: Record<RadialShape, string>;
  /** How far a radial gradient reaches. */
  extent: string;
  /** A name per extent. */
  extents: Record<RadialExtent, string>;
  /** Where a radial or conic gradient is centred, across. */
  centreX: string;
  /** Where it is centred, down. */
  centreY: string;
  /** Names the tile showing the result. */
  preview: string;
}

/** What {@link GradientPicker} needs. */
export interface GradientPickerProps {
  /** The gradient as it stands. */
  value: Gradient;
  /** Called on every change, including mid-drag. */
  onChange: (gradient: Gradient) => void;
  /** Already-translated strings. */
  labels: GradientPickerLabels;
}

/**
 * Where along the bar a pointer is, as a percentage.
 *
 * @param bar - the bar element.
 * @param clientX - the pointer's page position.
 * @returns a position from 0 to 100.
 */
function positionIn(bar: HTMLElement, clientX: number): number {
  const box = bar.getBoundingClientRect();
  if (box.width === 0) return 0;
  return Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100));
}

/**
 * Builds a background out of as many colours as somebody wants.
 *
 * Modelled on the gradient editors people already know: a bar showing the
 * result, a handle per stop sitting where that stop is, and clicking the bar
 * adds one. **A fursona can have more colours than any fixed set of pickers
 * would allow**, so the number of stops is the person's to decide up to
 * `MAX_STOPS`.
 *
 * **Everything a kind does not read leaves ONE box, and that box is last.**
 * This is the arrangement rule, and it exists because the control used to
 * rearrange itself under somebody's hands. The kind-specific fields were
 * scattered across four wrapping rows in the order they happened to be
 * written — the repetition length ABOVE the bar, the angle between the
 * position slider and the Remove button, the shape and the centre below — so
 * ticking Repeat pushed the bar and everything under it down a row, and
 * choosing Radial made the angle vanish from one row while four controls
 * appeared in another. Nothing was broken, which is why nothing caught it.
 * With every optional control in a box at the end, that box is the only thing
 * that ever resizes and nothing above it can move. `gradient-picker.test.tsx`
 * asserts containment AND position, because "the shape control is on the page"
 * passes with it back where it was.
 *
 * **The kind is three buttons rather than a `select`.** There are exactly
 * three, they decide what every control below them even is, and a dropdown
 * showed one answer while hiding two. Each carries a glyph painted with that
 * kind of gradient built from the person's OWN stops, so the choice is between
 * three pictures instead of three words — "conic" names nothing to somebody who
 * has not met one.
 *
 * **The result is first and largest; the stop bar is neither.** The bar is a
 * deliberately FAKE left-to-right ramp — see below — and it was the biggest
 * thing here, while the real gradient was a tile at the end of a wrapping row,
 * landing somewhere different for every kind. The tile is now a wide one at
 * the top, big enough that the four extent keywords are actually
 * distinguishable, and it is the one element that repaints when the kind
 * changes because it is the thing being built.
 *
 * **The stop bar stays a left-to-right ramp for every kind.** The handles sit
 * at their stops' positions, so painting it with the radial or the conic form
 * would put every handle somewhere other than the colour it carries and the
 * control would visibly disagree with itself. What a stop means does not change
 * with the kind — 0 is the start of the run and 100 the end, along an axis,
 * outward from a centre, or around it.
 *
 * **Every slider carries its value.** A track position means nothing on its
 * own, and the canvas dials on the panel around this one have read themselves
 * out since they shipped. Without it "how far round is the angle" was
 * answerable only by dragging it to an end and back.
 *
 * **Selection follows the stop, and `setStop` is what says where it went.**
 * That function sorts, so dragging a handle past its neighbour changes the
 * handle's index; it returns the new one because nothing out here can recover
 * it. An earlier version looked the stop up by identity in the new list, which
 * was a no-op — it found whatever was already at that index — so a drag past a
 * neighbour silently began editing the neighbour, and the next colour change
 * landed on the wrong stop.
 *
 * A handle is selected by CLICK as well as by pointer-down. Pointer-down alone
 * starts a drag but leaves the handle unselectable by anybody using a keyboard,
 * which is exactly the population that cannot drag it either.
 *
 * Dragging uses pointer capture, so a drag that leaves the bar — which every
 * drag does, because the handles are at the ends — keeps going rather than
 * stopping the moment the pointer crosses the edge.
 *
 * Every change is reported immediately, mid-drag included. That stream IS the
 * feature: a gradient is judged by watching it move, and anything that waited
 * for the drag to finish would put back the round trip this exists to remove.
 *
 * **Every control is a native one.** The angle is a range and the centre is two
 * of them, rather than the dial and the drag pad their geometry argues for,
 * because native means the keyboard, screen-reader and touch behaviour is not
 * something this file can get subtly wrong.
 *
 * Its bar, tile, swatches and buttons are `surface`s, so the control that edits a theme is itself wearing one.
 *
 * Every colour it paints comes from a token — `--edge`, `--ink`, `--accent`, `--on-accent`, `--menu`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * **A control appears only for the kinds that have the thing it sets.** A radial
 * gradient has no direction, a linear one has no centre, and the length of a
 * repetition means nothing while repetition is off. Rendering them anyway is the
 * fault this feature keeps producing in new clothes: a control that accepts what
 * somebody does with it, stores it, and changes nothing they can see.
 *
 * @returns the picker.
 */
export function GradientPicker({
  value,
  onChange,
  labels,
}: GradientPickerProps) {
  const id = useId();
  const barRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const stop = value.stops[Math.min(selected, value.stops.length - 1)];

  /**
   * Moves a stop and keeps the selection on it.
   *
   * @param index - the stop being dragged.
   * @param at - where it moved to.
   * @returns nothing.
   */
  const move = (index: number, at: number) => {
    // `setStop` reports where the stop landed, because it did the sorting and
    // nothing out here can recover it. This used to look it up by identity in
    // the new list, which was a no-op — it found the element already at that
    // index — so dragging a handle past its neighbour silently began editing
    // the neighbour, the exact fault the comment claimed to prevent.
    const moved = setStop(value, index, { at });
    setSelected(moved.index);
    onChange(moved.gradient);
  };

  /**
   * One labelled slider, reading its own value out beside its name.
   *
   * Five of them differ only in what they set, and every one used to be a
   * fixed `w-28` in a wrapping row — so they landed somewhere different at
   * every panel width. Written once, they fill their grid cell instead.
   *
   * @param key - names the control, and is its test id after `gradient-`.
   * @param label - what it is called.
   * @param readout - its value, with the unit, as one string.
   * @param low - the smallest it goes.
   * @param high - the largest.
   * @param current - where it is.
   * @param onSlide - given the new value.
   * @returns the field.
   */
  const slider = (
    key: string,
    label: string,
    readout: string,
    low: number,
    high: number,
    current: number,
    onSlide: (next: number) => void,
  ) => (
    <div className="grid gap-1.5">
      <label
        htmlFor={`${id}-${key}`}
        className="flex items-center justify-between gap-2 text-xs font-medium"
      >
        {label}
        {/* Built as one string rather than a number beside a literal — the
            lint rule reads a bare literal in JSX as untranslated copy, and it
            is right that it would be. */}
        <span className="font-mono text-xs text-(--muted) tabular-nums">
          {readout}
        </span>
      </label>
      <input
        id={`${id}-${key}`}
        type="range"
        min={low}
        max={high}
        value={current}
        onChange={(event) => onSlide(Number(event.target.value))}
        {...tid(`gradient-${key}`)}
        className="h-2 w-full accent-(--accent)"
      />
    </div>
  );

  /**
   * One labelled dropdown, for the two fields that are a choice from a list.
   *
   * @param key - names the control, and is its test id after `gradient-`.
   * @param label - what it is called.
   * @param options - the values, in the order they are offered.
   * @param names - what each value is called. Keyed by the value, so one added
   *   to the list without a translation is a compile error rather than a blank
   *   option on somebody's screen.
   * @param current - which is chosen.
   * @param onPick - given the new value.
   * @returns the field.
   */
  const choice = <T extends string>(
    key: string,
    label: string,
    options: readonly T[],
    names: Record<T, string>,
    current: T,
    onPick: (next: T) => void,
  ) => (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-${key}`} className="text-xs font-medium">
        {label}
      </label>
      <select
        id={`${id}-${key}`}
        value={current}
        onChange={(event) => onPick(event.target.value as T)}
        {...tid(`gradient-${key}`)}
        // Painted with `--menu`, never left transparent: a dropdown's list is
        // drawn from the control's own background, so a transparent one has
        // nothing to paint with and the browser paints it on white.
        className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {names[option]}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <section className="grid gap-3">
      {/* **The kind sits with the title, because it governs everything under
          it.** Three buttons rather than a `select`: there are exactly three,
          and a dropdown showed one answer while hiding the other two behind a
          click. Each glyph is that kind of gradient built from the person's own
          stops — the real CSS, so it cannot misdescribe what choosing it does. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">{labels.title}</span>
        <div
          role="group"
          aria-label={labels.kind}
          className="flex gap-1 rounded-lg surface border-(--edge)/60 p-1"
        >
          {GRADIENT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={value.kind === kind}
              onClick={() => onChange({ ...value, kind })}
              {...tid(`gradient-kind-${kind}`)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                value.kind === kind
                  ? "bg-(--accent) text-(--on-accent)"
                  : "text-(--muted)",
              )}
            >
              <span
                aria-hidden
                style={{
                  background: gradientCss({ ...value, kind, repeating: false }),
                }}
                className="size-3.5 rounded-xs surface border-(--edge)/60"
              />
              {labels.kinds[kind]}
            </button>
          ))}
        </div>
      </div>

      {/* **The result, first and large.** It was a 96px tile at the end of a
          wrapping row, so it moved with every kind — while the biggest element
          here was the stop bar, which is a deliberately fake ramp. At this size
          the four extent keywords are actually distinguishable from each
          other, which is the whole reason they are offered. */}
      <div
        role="img"
        aria-label={labels.preview}
        {...tid("gradient-preview")}
        style={{ background: gradientCss(value) }}
        className="h-28 w-full rounded-xl surface border-(--edge) sm:h-40"
      />

      {/* Clicking anywhere adds a stop there, taking the colour the gradient
          already shows at that point — so the bar does not visibly change until
          the new stop is moved or recoloured. */}
      <div
        ref={barRef}
        role="group"
        aria-label={labels.bar}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const at = positionIn(event.currentTarget, event.clientX);
          const added = addStop(value, at);
          setSelected(added.stops.findIndex((s) => s.at === Math.round(at)));
          onChange(added);
        }}
        {...tid("gradient-bar")}
        className="relative h-12 w-full cursor-copy rounded-lg surface border-(--edge)"
        // **The bar is always a left-to-right ramp, whatever kind is chosen.**
        // A handle sits at its stop's position, so painting the bar with a
        // radial or a conic gradient would put the handles somewhere other
        // than the colour they carry — the control would disagree with itself.
        // What the stops mean is unchanged by the kind: 0 is the start of the
        // run and 100 is the end, along an axis, outward from a centre, or
        // around it. The result is the tile above.
        style={{
          background: gradientCss({
            ...value,
            kind: "linear",
            repeating: false,
            angle: 90,
          }),
        }}
      >
        {value.stops.map((each, index) => (
          <button
            // Keyed by what the stop IS, not where it sits in the array. The
            // list is re-sorted on every drag, so an index key would make React
            // reuse the wrong handle the moment two stops swapped places.
            key={`${each.at}-${each.color}`}
            type="button"
            aria-label={`${labels.colour} ${index + 1}`}
            aria-pressed={index === selected}
            // Selection on CLICK as well as on pointer-down. Pointer-down
            // alone starts a drag but leaves a handle unselectable by anybody
            // reaching it with a keyboard, which is the whole population that
            // cannot drag it in the first place.
            onClick={() => setSelected(index)}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              setSelected(index);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              if (barRef.current) {
                move(index, positionIn(barRef.current, event.clientX));
              }
            }}
            {...tid(`gradient-stop-${index}`)}
            style={{ left: `${each.at}%`, background: each.color }}
            className={
              index === selected
                ? "absolute top-1/2 size-5 -translate-1/2 cursor-grab rounded-full border-2 border-(--ink) shadow-sm"
                : "absolute top-1/2 size-4 -translate-1/2 cursor-grab rounded-full surface border-(--edge)"
            }
          />
        ))}
      </div>

      {/* **The selected stop, and only the selected stop.** This row used to
          carry the angle as well — a property of the whole gradient sitting
          between the stop's position and the button that deletes the stop. It
          is a fixed grid rather than a wrapping row, so the colour, the
          position and the two buttons hold their places at every width.

          **Two columns, the same two the box below it uses.** A single
          `[auto_1fr_auto]` row let the position slider take every pixel the
          panel had — nine hundred of them on a wide screen, to set a number
          between 0 and 100 — while the swatch sat marooned at the far left.
          Sharing the rhythm caps the throw at something a hand can cross and
          makes the whole control read as one grid rather than four rows that
          each found their own widths. */}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-colour`} className="text-xs font-medium">
              {labels.colour}
            </label>
            <input
              id={`${id}-colour`}
              type="color"
              value={stop?.color ?? "#000000"}
              onChange={(event) =>
                onChange(
                  setStop(value, selected, { color: event.target.value })
                    .gradient,
                )
              }
              {...tid("gradient-colour")}
              className="h-9 w-full cursor-pointer rounded-lg surface border-(--edge)/60 bg-(--menu) p-1 sm:w-16"
            />
          </div>

          {slider(
            "position",
            labels.position,
            `${stop?.at ?? 0}%`,
            0,
            100,
            stop?.at ?? 0,
            (at) => move(selected, at),
          )}
        </div>

        {/* Actions at the end of the row, where an action belongs. */}
        <div className="flex gap-2 sm:justify-end">
          <button
            type="button"
            disabled={value.stops.length >= MAX_STOPS}
            onClick={() => onChange(addStop(value, 50))}
            {...tid("gradient-add")}
            className="flex items-center gap-1.5 rounded-lg surface border-(--edge) px-2.5 py-1.5 text-xs disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden />
            {labels.add}
          </button>

          <button
            type="button"
            disabled={value.stops.length <= MIN_STOPS}
            onClick={() => {
              onChange(removeStop(value, selected));
              setSelected(0);
            }}
            {...tid("gradient-remove")}
            className="flex items-center gap-1.5 rounded-lg surface border-(--edge) px-2.5 py-1.5 text-xs disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {labels.remove}
          </button>
        </div>
      </div>

      {/* **Everything only some kinds read, in one box, LAST.** This is the
          arrangement rule and it must not be relaxed: these controls appear and
          disappear as the kind changes, so anywhere but the end means the
          result, the stops and the stop's own controls jump about whenever
          somebody switches. The box is the only thing that resizes.

          It is never empty — repetition belongs to all three kinds — so it does
          not itself flicker in and out. */}
      <div
        className="grid gap-3 rounded-xl surface border-(--edge)/60 p-3 sm:grid-cols-2"
        {...tid("gradient-shape-options")}
      >
        {/* A radial gradient runs outward from a point and has no direction,
            so it does not get a direction control. A conic gradient does —
            the angle is where its turn begins. */}
        {value.kind !== "radial" &&
          slider(
            "angle",
            labels.angle,
            `${value.angle}°`,
            0,
            359,
            value.angle,
            (angle) => onChange({ ...value, angle }),
          )}

        {value.kind === "radial" && (
          <>
            {choice(
              "shape",
              labels.shape,
              RADIAL_SHAPES,
              labels.shapes,
              value.shape,
              (shape) => onChange({ ...value, shape }),
            )}
            {choice(
              "extent",
              labels.extent,
              RADIAL_EXTENTS,
              labels.extents,
              value.extent,
              (extent) => onChange({ ...value, extent }),
            )}
          </>
        )}

        {/* A centre belongs to the two kinds that HAVE one. A linear gradient
            has a direction instead, and offering it a centre would be two
            sliders that move and change nothing. */}
        {value.kind !== "linear" && (
          <>
            {slider("x", labels.centreX, `${value.x}%`, 0, 100, value.x, (x) =>
              onChange({ ...value, x }),
            )}
            {slider("y", labels.centreY, `${value.y}%`, 0, 100, value.y, (y) =>
              onChange({ ...value, y }),
            )}
          </>
        )}

        <label className="flex items-center gap-2 self-end py-1.5 text-xs font-medium">
          <input
            type="checkbox"
            checked={value.repeating}
            onChange={(event) =>
              onChange({ ...value, repeating: event.target.checked })
            }
            {...tid("gradient-repeating")}
            className="accent-(--accent)"
          />
          {labels.repeat}
        </label>

        {/* The length control appears only while repetition is on. Shown
            alongside a switch that is off, it is a slider that moves and
            changes nothing — the fault this whole feature keeps producing. */}
        {value.repeating &&
          slider(
            "every",
            labels.every,
            `${value.every}%`,
            REPEAT_RANGE.min,
            REPEAT_RANGE.max,
            value.every,
            (every) => onChange({ ...value, every }),
          )}
      </div>
    </section>
  );
}
