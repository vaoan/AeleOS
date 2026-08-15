"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { parseAsString, useQueryStates } from "nuqs";
import { cn } from "@/shared/infrastructure/cn";
import {
  VISIBILITIES,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";

/**
 * How long typing settles before the URL is written.
 *
 * The same 300ms Libra's studio uses, so the two apps feel alike. Writing on
 * every keystroke would put one history entry per character in the URL and
 * re-render the list on each one.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The filter parameters, as they appear in the URL.
 *
 * Exported so the list reads the same definition rather than a second copy of
 * these names — a disagreement between the two would mean the bar writes a
 * filter the list never applies.
 */
export const fursonaSearchParams = {
  q: parseAsString.withDefault(""),
  visibility: parseAsString.withDefault(""),
};

/** Translated strings {@link FursonaFiltersBar} renders. */
export interface FursonaFiltersBarLabels {
  /** Names the search box. */
  search: string;
  /** The pill that clears the visibility filter. */
  all: string;
  /** One label per visibility value. */
  visibility: Record<Visibility, string>;
}

/** What {@link FursonaFiltersBar} needs. */
export interface FursonaFiltersBarProps {
  /** Already-translated strings. */
  labels: FursonaFiltersBarLabels;
}

/**
 * Search and visibility filters, with their state in the URL.
 *
 * The URL rather than component state, so a filtered list can be shared, kept
 * across a reload, and stepped back out of.
 *
 * The two write differently on purpose. Search **replaces**, because a back
 * button that walks back through every prefix of what somebody typed is a trap
 * rather than history. A visibility pill **pushes**, because choosing one is a
 * deliberate step somebody may well want to undo.
 *
 * An unselected chip carries a FULL-STRENGTH edge, not the 60% hairline it used
 * to. Beside the search field next to it, a 60% border reads as decoration
 * rather than as a control somebody may press.
 *
 * The search field and the filter chips are `surface`s, so they take a skin's edge like every other control.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge`, `--muted`, `--on-accent` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the filter bar.
 */
export function FursonaFiltersBar({ labels }: FursonaFiltersBarProps) {
  const [filters, setFilters] = useQueryStates(fursonaSearchParams);
  const [typed, setTyped] = useState(filters.q);

  // Debounced, and null rather than "" when cleared: an empty parameter left in
  // the URL is noise that survives every later navigation.
  useEffect(() => {
    if (typed === filters.q) return;
    const timer = setTimeout(() => {
      setFilters({ q: typed || null }, { history: "replace" });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, filters.q, setFilters]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--muted)" />
        <input
          type="search"
          aria-label={labels.search}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="rounded-lg surface border-(--edge) bg-(--surface) py-2 pr-3 pl-9 text-sm"
        />
      </span>

      {[
        { value: "", label: labels.all },
        ...VISIBILITIES.map((v) => ({
          value: v,
          label: labels.visibility[v],
        })),
      ].map(({ value, label }) => {
        const active = filters.visibility === value;
        return (
          <button
            key={value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() =>
              setFilters({ visibility: value || null }, { history: "push" })
            }
            className={cn(
              "rounded-full surface px-3.5 py-1.5 text-sm transition-colors",
              active
                ? "border-(--accent) bg-(--accent) text-(--on-accent)"
                : // Full-strength edge, not a 60% hairline. An unselected control
                  // still has to look like a control — at 60% these read as
                  // decoration next to the search field beside them.
                  "border-(--edge) text-(--ink-2) hover:bg-(--edge)/15",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
