"use client";

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { tid } from "@/shared/infrastructure/test-id";
import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldValues,
  type ArrayPath,
  type FieldArray,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { SECTION_TYPES } from "@/features/actors/domain/section-schema";
import type { SectionType } from "@/features/actors/domain/section-schema";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  SectionItemFields,
  type SectionItemFieldsLabels,
} from "@/features/actors/presentation/section-item-fields";

/** Translated strings {@link SectionCard} renders. */
export interface SectionCardLabels extends SectionItemFieldsLabels {
  /** Field label for the section's name. */
  sectionName: string;
  /** Field label for the layout selector. */
  sectionType: string;
  /** Adds an item to this section. */
  addItem: string;
  /** Removes this whole section. */
  removeSection: string;
  /** Collapses the section's items. */
  collapse: string;
  /** Expands them again. */
  expand: string;
  /** One label per layout. */
  types: Record<SectionType, string>;
}

/**
 * What {@link SectionCard} needs.
 *
 */
export interface SectionCardProps<T extends FieldValues> {
  /** The form's control, for this section's item array. */
  control: Control<T>;
  /** The form's register, so the fields join the surrounding form. */
  register: UseFormRegister<T>;
  /** Where this section lives, as in `sections.0`. */
  path: string;
  /** Its position, for the label a screen reader reads. */
  index: number;
  /** The fursona being edited, absent while creating one. */
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: SectionCardLabels;
  /** Called when this section should go. */
  onRemove: () => void;
}

/** A new item, with only what the schema requires. */
const EMPTY_ITEM = {
  title_en: "",
  title_es: "",
  description_en: "",
  description_es: "",
  sort_order: 0,
};

/**
 * One section: its name, its layout, and the items inside it.
 *
 * Items live in their own `useFieldArray` keyed to this section's path, so
 * removing one removes **that** one. An index captured in a handler goes stale
 * the moment anything above it is removed, which is how a delete button ends up
 * dropping the wrong row — the kind of fault that only shows up with three
 * items and never with one.
 *
 * Its layout decides what its items offer — the icon on `cards`, the image
 * address on `gallery` — and the value is watched rather than read once, so
 * changing the layout changes the fields without a save in between.
 *
 *
 * Collapsing hides the items and keeps the header, so a fursona with several
 * long sections stays navigable. It is local state rather than form state: it
 * is about looking, not about content, and it must not make the form dirty.
 *
 * **It carries test ids**, because the end-to-end suite runs in Spanish and may
 * not assert on translated text — so a control without one cannot be reached by
 * the only tests that drive a real browser. The whole sections editor had none,
 * which is why nothing had ever composed a section by hand: every test that
 * appeared to cover this used a template, and a template inserts its sections
 * as data without touching a single one of these controls.
 *
 * **Its `select` is painted with `--menu`, not left transparent.** A dropdown's
 * list is drawn from the control's own background, so a transparent one has
 * nothing to paint with and the browser paints it on white — near-white text on
 * white in dark mode. `dropdown-legibility.test.ts` guards every select in the
 * app against going back.
 *
 * **That same select is what made this row too wide for a phone.** A `select`
 * is as wide as its longest option whatever surrounds it, so the header row —
 * handle, name, a menu naming eleven layouts, bin — forced the page 150px wider
 * than a 320px screen. The row wraps, the menu takes a line of its own there,
 * and it rejoins the row as soon as there is room. `responsive.spec.ts` fails
 * by exactly that 150px when the row is put back on one line.
 *
 * * The card, its select and its item boxes are `surface`s — the class a skin styles, not Tailwind's `border`.
 *
 * Every colour it paints comes from a token — `--edge`, `--menu`, `--muted`, `--surface` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the section card.
 */
export function SectionCard<T extends FieldValues>({
  control,
  register,
  path,
  index,
  lang,
  labels,
  onRemove,
}: SectionCardProps<T>) {
  const id = useId();
  const [collapsed, setCollapsed] = useState(false);

  const { fields, append, remove } = useFieldArray({
    control,
    name: `${path}.items` as ArrayPath<T>,
  });

  // Watched rather than read from the form's defaults, so switching the layout
  // changes what the items offer at once. Somebody changing it is looking to
  // see what it does; making them save first would answer the question far too
  // late.
  const type = useWatch({ control, name: `${path}.type` as Path<T> });

  return (
    <div className="grid gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-3 sm:p-4">
      {/* Wraps, and the layout select is what wraps. This row is a handle, a
          name, a menu naming eleven layouts and a bin — and a `select` is as
          wide as its longest option, which no amount of space around it
          changes. On a 320px screen the four together forced the page 150px
          wider than the phone, so the menu takes a line of its own below
          (`w-full` is what forces the break) and rejoins the row as soon as
          there is room for it. Measured, not guessed: `responsive.spec.ts`
          fails by exactly that 150px when this row is put back on one line. */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <button
          type="button"
          aria-label={collapsed ? labels.expand : labels.collapse}
          onClick={() => setCollapsed((was) => !was)}
          className="rounded-lg p-1.5 text-(--muted)"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>

        <div className="grid min-w-0 flex-1 gap-1.5">
          <label htmlFor={`${id}-name`} className="text-xs font-medium">
            {labels.sectionName}
          </label>
          <input
            {...tid("section-name")}
            id={`${id}-name`}
            key={`name-${lang}`}
            {...register(`${path}.name_${lang}` as Path<T>)}
            className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <div className="order-last grid w-full min-w-0 gap-1.5 sm:order-0 sm:w-auto">
          <label htmlFor={`${id}-type`} className="text-xs font-medium">
            {labels.sectionType}
          </label>
          <select
            id={`${id}-type`}
            {...register(`${path}.type` as Path<T>)}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            {SECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.types[type]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          aria-label={labels.removeSection}
          onClick={onRemove}
          className="rounded-lg p-1.5 text-(--muted)"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {collapsed ? null : (
        <div className="grid gap-2 pl-2 sm:pl-9">
          {fields.map((field, itemIndex) => (
            <SectionItemFields
              key={field.id}
              control={control}
              register={register}
              type={(type ?? "cards") as SectionType}
              path={`${path}.items.${itemIndex}`}
              lang={lang}
              labels={labels}
              onRemove={() => remove(itemIndex)}
            />
          ))}

          <button
            {...tid("add-item")}
            type="button"
            onClick={() =>
              append({
                ...EMPTY_ITEM,
                sort_order: fields.length + 1,
              } as FieldArray<T, ArrayPath<T>>)
            }
            className="flex items-center gap-1.5 justify-self-start rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm text-(--muted)"
          >
            <Plus className="size-4" />
            {labels.addItem}
          </button>
        </div>
      )}

      <span className="sr-only">{index + 1}</span>
    </div>
  );
}
