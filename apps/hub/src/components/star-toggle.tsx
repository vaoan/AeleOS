"use client";

import { tid } from "@/lib/test-id";

/** What the star needs to render and report. */
export interface StarToggleProps {
  /** Whether the nebula is currently on. */
  pressed: boolean;
  /** Called when the star is activated. */
  onToggle: () => void;
  /**
   * The accessible name. Supplied by the caller rather than hardcoded, because
   * it is user-facing copy and has to come from the message catalogue.
   */
  label: string;
}

/**
 * The star beside the wordmark, which switches the nebula.
 *
 * It dims, shrinks and loses its glow when off, so it reads as the light source
 * going out rather than as a control changing state. The star lighting the dust
 * is the real relationship, which is why this carries no visible label — and
 * why it needs an accessible one.
 *
 * The 11px dot sits inside a 30px button: the dot alone is below the 24x24
 * minimum target size, and growing the dot would make it compete with the
 * wordmark. Do not move the hit area onto the dot.
 *
 * Renders a real `<button type="button">` so it is keyboard reachable and does
 * not submit a surrounding form.
 *
 * Carries the `nebula-toggle` test id. Test ids are the only selector the
 * end-to-end suite is allowed to use — role and text queries break when a
 * string is translated — so renaming one breaks tests rather than styling.
 */
export function StarToggle({ pressed, onToggle, label }: StarToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onToggle}
      {...tid("nebula-toggle")}
      className="grid size-[30px] place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span
        className={`size-[11px] rounded-full transition-all duration-300 ${
          pressed
            ? "bg-star shadow-[0_0_16px_4px_var(--star-glow)]"
            : "scale-75 bg-[var(--muted)]"
        }`}
      />
    </button>
  );
}
