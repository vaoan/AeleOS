"use client";

import { useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  MAX_STOPS,
  MIN_STOPS,
  addStop,
  gradientCss,
  removeStop,
  setStop,
  type Gradient,
} from "@/shared/domain/gradient";
import { tid } from "@/shared/infrastructure/test-id";

/** Translated strings {@link GradientPicker} renders. */
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
 * **Selection follows the stop, not its index.** `setStop` returns a sorted
 * list, so dragging a handle past its neighbour changes that handle's index —
 * and a control tracking the selection by index would silently start editing
 * the neighbour halfway through a drag. It is tracked by the stop's identity
 * within the new list instead.
 *
 * Dragging uses pointer capture, so a drag that leaves the bar — which every
 * drag does, because the handles are at the ends — keeps going rather than
 * stopping the moment the pointer crosses the edge.
 *
 * Every change is reported immediately, mid-drag included. That stream IS the
 * feature: a gradient is judged by watching it move, and anything that waited
 * for the drag to finish would put back the round trip this exists to remove.
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
    const moved = setStop(value, index, { at });
    // Follow the stop by identity: sorting may have changed its index.
    const now = moved.stops.findIndex((s) => s === moved.stops[index]);
    setSelected(now === -1 ? index : now);
    onChange(moved);
  };

  return (
    <section className="grid gap-3">
      <span className="text-xs font-medium">{labels.title}</span>

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
        className="relative h-12 w-full cursor-copy rounded-lg border border-[var(--edge)]"
        style={{ background: gradientCss(value) }}
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
                ? "absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-[var(--ink)] shadow"
                : "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-[var(--edge)]"
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
              onChange(setStop(value, selected, { color: event.target.value }))
            }
            {...tid("gradient-colour")}
            className="h-9 w-16 cursor-pointer rounded-lg border border-[var(--edge)]/60 bg-transparent p-1"
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

        <button
          type="button"
          disabled={value.stops.length >= MAX_STOPS}
          onClick={() => onChange(addStop(value, 50))}
          {...tid("gradient-add")}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--edge)] px-2.5 py-1.5 text-xs disabled:opacity-50"
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
          className="flex items-center gap-1.5 rounded-lg border border-[var(--edge)] px-2.5 py-1.5 text-xs disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden />
          {labels.remove}
        </button>
      </div>
    </section>
  );
}
