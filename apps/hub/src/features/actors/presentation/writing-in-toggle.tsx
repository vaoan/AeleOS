"use client";

import type { ReactNode } from "react";

import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What each side calls itself, in each of its two forms.
 *
 * **A record keyed by the language rather than a list**, so a language added
 * to {@link AuthoringLanguage} with no entry here fails to compile — the same
 * `satisfies Record` guarantee the leaf and mode registries rest on. A control
 * silently missing a language is one somebody cannot write in.
 */
const SIDES = {
  en: { code: "EN", endonym: "English" },
  es: { code: "ES", endonym: "Español" },
} as const satisfies Record<
  AuthoringLanguage,
  { code: string; endonym: string }
>;

/**
 * The same table in render order, with the key type put back.
 *
 * `Object.entries` widens a key to `string`; the record above is what makes
 * the narrower type true, so it is restored here rather than re-derived from a
 * second hand-written list that could disagree with it.
 */
const SIDE_ENTRIES = Object.entries(SIDES) as [
  AuthoringLanguage,
  (typeof SIDES)[AuthoringLanguage],
][];

/** Already-translated strings {@link WritingInToggle} needs. */
export interface WritingInToggleLabels {
  /** Names the control — "Writing in". */
  writingIn: string;
  /** Says what it does and does not reach. */
  writingInHint: string;
}

/** What {@link WritingInToggle} draws. */
export interface WritingInToggleProps {
  /** Which side is active. */
  lang: AuthoringLanguage;
  /** Switches to a named side. */
  onSelect: (lang: AuthoringLanguage) => void;
  /** Already-translated strings. */
  labels: WritingInToggleLabels;
}

/**
 * The segmented switch choosing which language a page is being WRITTEN in.
 *
 * It was a strip of its own above the sections until 2026-08-28 — a card
 * carrying this switch, its name and its hint — and it is a control in the
 * editor's toolbar now. What that costs and what it buys is written up in
 * `EditorToolbar`'s own TSDoc, because the cost is entirely a property of that
 * row.
 *
 * **Both sides are shown and each names itself**, which is the one thing about
 * the old strip that had to survive the move. A single button that flips can
 * only mean "the other one", and a reader then has to work out whether the
 * word on it is the state they are in or the state they would get — the same
 * ambiguity `useLanguageToggle` gives two setters for. `select` is the verb
 * here, never `toggle`.
 *
 * **The endonyms are deliberately not translated.** A language is called the
 * same thing whatever interface you are reading, and "Spanish"/"Español"
 * changing under somebody is how a language picker becomes unreadable to the
 * person who most needs it.
 *
 * **Below `md` each side shrinks to its two-letter code, and that is a
 * measurement rather than a preference.** The toolbar row at 320px in Spanish
 * had literally zero slack — 273.9px of controls and a title truncated to
 * 6.1px against a 288px content box — so the endonyms could not be afforded
 * there at any price. The codes are still each side naming ITSELF, which is
 * the property that had to survive; what is given up is only how fully it says
 * so. Swapped by `display`, so exactly one reaches the accessible name at a
 * time and a screen reader never announces "EN English".
 *
 * **`md` and not `sm`, and the one-step stagger is the whole of why it fits.**
 * The bar goes to a single row at `sm`, and the same breakpoint is where Hide
 * controls and Cancel get their words back — so putting the endonyms there
 * too made three things arrive at once. Measured: the row wanted 673px against
 * a 640px viewport, overflowing in a band from exactly 640 to about 672 and
 * nowhere else, which is why a spot check at 320 and at a desktop width sees
 * nothing wrong. The endonyms cost 94px; deferring them one step leaves the
 * single row 61px of slack where it first appears and 95px where they arrive.
 *
 * **The active side is FILLED, and that is what tells this control apart from
 * the app's own language button.** The header sits directly above this bar and
 * carries a plain `EN` — the INTERFACE language, a different question with a
 * confusingly similar answer. Two things separate them: this one is a pair
 * with one side filled in `--accent`, where that one is a single unfilled
 * code; and this one carries the hint as its `title`, so anybody who wonders
 * which is which can find out without leaving the bar. The group's
 * `aria-label` does the same job for a screen reader, which would otherwise
 * meet two adjacent language controls with nothing to tell them apart.
 *
 * @returns the switch.
 */
export function WritingInToggle({
  lang,
  onSelect,
  labels,
}: WritingInToggleProps): ReactNode {
  return (
    <span
      role="group"
      aria-label={labels.writingIn}
      title={labels.writingInHint}
      {...tid("writing-in")}
      className="flex shrink-0 rounded-lg surface border-(--edge) p-0.5"
    >
      {SIDE_ENTRIES.map(([value, { code, endonym }]) => (
        // **`type="button"`, and that is not a formality here either.** This
        // control lives inside the editor's `<form>`, where every button
        // submits by default — so an unspecified type would SAVE the page on
        // the way to switching language.
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          aria-pressed={lang === value}
          {...tid(`writing-in-${value}`)}
          className={
            lang === value
              ? "rounded-md bg-(--accent) px-2 py-1 text-xs font-medium text-(--on-accent) md:px-3 md:text-sm"
              : "rounded-md px-2 py-1 text-xs font-medium text-(--muted) md:px-3 md:text-sm"
          }
        >
          <span className="md:hidden">{code}</span>
          <span className="max-md:hidden">{endonym}</span>
        </button>
      ))}
    </span>
  );
}
