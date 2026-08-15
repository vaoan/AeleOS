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
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings {@link GradientPicker} renders.
 *
 * The kinds, the radial shapes and the extents arrive as records keyed by the
 * value they name, so a value added to one of those lists is a compile error
 * here rather than a control rendering a blank option at somebody.
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
  /** Which shape the gradient runs in. */
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
 * Its bar, swatches and buttons are `surface`s, so the control that edits a theme is itself wearing one.
 *
 * Every colour it paints comes from a token — `--edge`, `--ink` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * **All three CSS gradients are here, and the bar is a ramp for all of them.**
 * The handles sit at their stops' positions, so painting the bar with a radial
 * or a conic gradient would put every handle somewhere other than the colour it
 * carries and the control would visibly disagree with itself. What a stop means
 * does not change with the kind — 0 is the start of the run and 100 the end,
 * along an axis, outward from a centre, or around it — so the ramp stays a ramp
 * and the RESULT gets its own tile.
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

  return (
    <section className="grid gap-3">
      <span className="text-xs font-medium">{labels.title}</span>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor={`${id}-kind`} className="text-xs font-medium">
            {labels.kind}
          </label>
          <select
            id={`${id}-kind`}
            value={value.kind}
            onChange={(event) =>
              onChange({ ...value, kind: event.target.value as GradientKind })
            }
            {...tid("gradient-kind")}
            className="rounded-lg surface border-(--edge) bg-(--menu) px-2 py-1.5 text-xs"
          >
            {GRADIENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {labels.kinds[kind]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium">
          <input
            type="checkbox"
            checked={value.repeating}
            onChange={(event) =>
              onChange({ ...value, repeating: event.target.checked })
            }
            {...tid("gradient-repeating")}
          />
          {labels.repeat}
        </label>

        {/* The length control appears only while repetition is on. Shown
            alongside a switch that is off, it is a slider that moves and
            changes nothing — the fault this whole feature keeps producing. */}
        {value.repeating && (
          <div className="grid gap-1">
            <label htmlFor={`${id}-every`} className="text-xs font-medium">
              {labels.every}
            </label>
            <input
              id={`${id}-every`}
              type="range"
              min={REPEAT_RANGE.min}
              max={REPEAT_RANGE.max}
              value={value.every}
              onChange={(event) =>
                onChange({ ...value, every: Number(event.target.value) })
              }
              {...tid("gradient-every")}
              className="w-28"
            />
          </div>
        )}
      </div>

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
        // around it. The result gets its own tile below.
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
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
            className="h-9 w-16 cursor-pointer rounded-lg surface border-(--edge)/60 bg-transparent p-1"
          />
        </div>

        <div className="grid gap-1">
          <label htmlFor={`${id}-at`} className="text-xs font-medium">
            {labels.position}
          </label>
          <input
            id={`${id}-at`}
            type="range"
            min={0}
            max={100}
            value={stop?.at ?? 0}
            onChange={(event) => move(selected, Number(event.target.value))}
            {...tid("gradient-position")}
            className="w-28"
          />
        </div>

        {/* A radial gradient runs outward from a point and has no direction,
            so it does not get a direction control. A conic gradient does —
            the angle is where its turn begins. */}
        {value.kind !== "radial" && (
          <div className="grid gap-1">
            <label htmlFor={`${id}-angle`} className="text-xs font-medium">
              {labels.angle}
            </label>
            <input
              id={`${id}-angle`}
              type="range"
              min={0}
              max={359}
              value={value.angle}
              onChange={(event) =>
                onChange({ ...value, angle: Number(event.target.value) })
              }
              {...tid("gradient-angle")}
              className="w-28"
            />
          </div>
        )}

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

      {/* Everything that only some kinds have, plus the tile that shows what
          any of it actually did. A linear gradient shows none of it and keeps
          the tile — which is where repetition becomes visible. */}
      <div className="flex flex-wrap items-end gap-3">
        {value.kind === "radial" && (
          <>
            <div className="grid gap-1">
              <label htmlFor={`${id}-shape`} className="text-xs font-medium">
                {labels.shape}
              </label>
              <select
                id={`${id}-shape`}
                value={value.shape}
                onChange={(event) =>
                  onChange({
                    ...value,
                    shape: event.target.value as RadialShape,
                  })
                }
                {...tid("gradient-shape")}
                className="rounded-lg surface border-(--edge) bg-(--menu) px-2 py-1.5 text-xs"
              >
                {RADIAL_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {labels.shapes[shape]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <label htmlFor={`${id}-extent`} className="text-xs font-medium">
                {labels.extent}
              </label>
              <select
                id={`${id}-extent`}
                value={value.extent}
                onChange={(event) =>
                  onChange({
                    ...value,
                    extent: event.target.value as RadialExtent,
                  })
                }
                {...tid("gradient-extent")}
                className="rounded-lg surface border-(--edge) bg-(--menu) px-2 py-1.5 text-xs"
              >
                {RADIAL_EXTENTS.map((extent) => (
                  <option key={extent} value={extent}>
                    {labels.extents[extent]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* A centre belongs to the two kinds that HAVE one. A linear gradient
            has a direction instead, and offering it a centre would be two
            sliders that move and change nothing. */}
        {value.kind !== "linear" && (
          <>
            <div className="grid gap-1">
              <label htmlFor={`${id}-x`} className="text-xs font-medium">
                {labels.centreX}
              </label>
              <input
                id={`${id}-x`}
                type="range"
                min={0}
                max={100}
                value={value.x}
                onChange={(event) =>
                  onChange({ ...value, x: Number(event.target.value) })
                }
                {...tid("gradient-x")}
                className="w-28"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor={`${id}-y`} className="text-xs font-medium">
                {labels.centreY}
              </label>
              <input
                id={`${id}-y`}
                type="range"
                min={0}
                max={100}
                value={value.y}
                onChange={(event) =>
                  onChange({ ...value, y: Number(event.target.value) })
                }
                {...tid("gradient-y")}
                className="w-28"
              />
            </div>
          </>
        )}

        <div
          role="img"
          aria-label={labels.preview}
          {...tid("gradient-preview")}
          style={{ background: gradientCss(value) }}
          className="h-16 w-24 rounded-lg surface border-(--edge)"
        />
      </div>
    </section>
  );
}
