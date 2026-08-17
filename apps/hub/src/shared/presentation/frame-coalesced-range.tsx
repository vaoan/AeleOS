"use client";

import { useEffect, useRef } from "react";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link FrameCoalescedRange} needs. */
export interface FrameCoalescedRangeProps {
  /** The element's id, so a label can point at it. */
  id: string;
  /** The lowest value the track offers. */
  min: number;
  /** The highest value the track offers. */
  max: number;
  /** How far one press of an arrow key moves it. */
  step: number;
  /** Where the thumb sits when nothing is being dragged. */
  value: number;
  /**
   * Told the newest value, at most once per animation frame.
   *
   * It may be called with a value the caller has already been given, when a
   * drag returns to where it started within one frame.
   */
  onCommit: (value: number) => void;
  /** The name this control answers to in the end-to-end suite. */
  testId: string;
  /** Utility classes for the track. */
  className: string;
}

/**
 * A range input that reports what it is worth at most once per frame.
 *
 * **This exists for a measured fault, and the measurement ruled out the obvious
 * fix first.** Every movement of a theme dial rewrites a custom property at
 * `:root`, and an inherited custom property invalidates the style of every
 * element beneath it — 15.6ms per update on the fursona editor's 4 814 nodes on
 * a desktop, and 178.5ms on a mid-range phone. Delivering the same properties
 * inline instead of through a `<style>` element was measured at 178.54ms against
 * 178.56ms, so how the CSS arrives is not the cost; how often it changes is. A
 * drag delivered eighteen of those in three seconds and the editor answered at
 * under two frames a second.
 *
 * So the input records every movement and commits the newest one on the next
 * animation frame. Movements arriving while a frame is already scheduled
 * overwrite the pending value rather than adding a commit — which is the whole
 * saving, since a blocked main thread delivers input in bursts and every event
 * in the burst was being paid in full.
 *
 * **The element is UNCONTROLLED on purpose, and a controlled one cannot do
 * this.** React restores a controlled input's DOM value to the last value it
 * rendered as soon as the change event finishes, so an input whose state lands
 * a frame later has its thumb dragged back under the finger every time — which
 * is the "the sliders get stuck" report, made worse rather than better by
 * deferring the state. Leaving the element to hold its own value means the
 * browser moves the thumb with no JavaScript involved at all, so it tracks a
 * finger through a frame the main thread never got to.
 *
 * The cost of that choice is that the element no longer follows its prop, so
 * `value` is put back by hand when something OTHER than a drag changes it —
 * Reset, or copying a theme from the profile. It is deliberately not put back
 * while a commit is pending: the element holds a newer value than the prop does
 * at that moment, and writing the prop over it is exactly the snap-back this
 * avoids.
 *
 * @returns the input.
 */
export function FrameCoalescedRange({
  id,
  min,
  max,
  step,
  value,
  onCommit,
  testId,
  className,
}: FrameCoalescedRangeProps) {
  const ref = useRef<HTMLInputElement>(null);
  // The newest value seen, whether or not it has been reported. Never null:
  // it is written before a frame is ever scheduled, so the callback has no
  // absent case to defend against.
  const pending = useRef(value);
  // The scheduled commit, or 0 for none. `requestAnimationFrame` never returns
  // 0, so the handle doubles as the flag without a second ref to keep in step.
  const frame = useRef(0);
  // Read through a ref so the scheduled commit calls the newest one. The frame
  // is scheduled from an event handler that closed over whichever handler was
  // current when it ran, and by the time it fires the panel may have rendered
  // again around a value this component never saw.
  //
  // Written in an effect rather than during render, which `react-hooks/refs`
  // is right to insist on: a render may be thrown away, and a ref written
  // during one that never commits is a value nothing put back.
  const latest = useRef(onCommit);
  useEffect(() => {
    latest.current = onCommit;
  });

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  useEffect(() => {
    const element = ref.current;
    // A pending commit means the element already holds something newer than
    // this prop, so writing the prop over it would pull the thumb backwards.
    if (!element || frame.current) return;
    const next = String(value);
    if (element.value !== next) element.value = next;
  }, [value]);

  return (
    <input
      ref={ref}
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      defaultValue={value}
      onChange={(event) => {
        pending.current = Number.parseFloat(event.target.value);
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          latest.current(pending.current);
        });
      }}
      {...tid(testId)}
      className={className}
    />
  );
}
