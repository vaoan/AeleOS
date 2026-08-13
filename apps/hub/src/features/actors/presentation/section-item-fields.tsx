"use client";

import { Trash2 } from "lucide-react";
import { useId } from "react";
import type { UseFormRegister, FieldValues, Path } from "react-hook-form";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";

/** Translated strings {@link SectionItemFields} renders. */
export interface SectionItemFieldsLabels {
  /** Field label for the item's title. */
  itemTitle: string;
  /** Field label for the item's description. */
  itemDescription: string;
  /** Names the remove control for a screen reader. */
  removeItem: string;
}

/** What {@link SectionItemFields} needs. */
export interface SectionItemFieldsProps<T extends FieldValues> {
  /** The form's register, so the fields join the surrounding form. */
  register: UseFormRegister<T>;
  /** Where this item lives, as in `sections.0.items.2`. */
  path: string;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: SectionItemFieldsLabels;
  /** Called when this item should go. */
  onRemove: () => void;
}

/**
 * One item's title and description, in whichever language is being written.
 *
 * The two languages share one pair of inputs and swap which fields they are
 * bound to, rather than showing four inputs at once — a section of eight text
 * fields would otherwise put sixteen on the screen.
 *
 * **An unwritten Spanish value renders as an empty field and nothing else.** No
 * warning, no placeholder nagging about it, no badge. The Spanish is the
 * author's to write when they choose, and `0013` accepts its absence.
 *
 * @returns the item's fields.
 */
export function SectionItemFields<T extends FieldValues>({
  register,
  path,
  lang,
  labels,
  onRemove,
}: SectionItemFieldsProps<T>) {
  // Ids rather than wrapping labels: a wrapping label takes its whole text
  // content as the field's accessible name, which is how the fursona editor's
  // handle ended up announcing its hint as part of its name.
  const id = useId();

  return (
    <div className="grid gap-2 rounded-lg border border-[var(--edge)]/40 p-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-title`} className="text-xs font-medium">
          {labels.itemTitle}
        </label>
        <input
          id={`${id}-title`}
          // Keyed by language so React swaps the input rather than reusing one
          // bound to the other field, which would carry the previous value
          // across a toggle.
          key={`title-${lang}`}
          {...register(`${path}.title_${lang}` as Path<T>)}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-description`} className="text-xs font-medium">
          {labels.itemDescription}
        </label>
        <textarea
          id={`${id}-description`}
          key={`description-${lang}`}
          rows={3}
          {...register(`${path}.description_${lang}` as Path<T>)}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <button
        type="button"
        aria-label={labels.removeItem}
        onClick={onRemove}
        className="justify-self-end rounded-lg p-1.5 text-[var(--muted)]"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
