"use client";

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
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

/** What {@link SectionCard} needs. */
export interface SectionCardProps<T extends FieldValues> {
  /** The form's control, for this section's item array. */
  control: Control<T>;
  /** The form's register, so the fields join the surrounding form. */
  register: UseFormRegister<T>;
  /** Where this section lives, as in `sections.0`. */
  path: string;
  /** Its position, for the label a screen reader reads. */
  index: number;
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
 * Collapsing hides the items and keeps the header, so a fursona with several
 * long sections stays navigable. It is local state rather than form state: it
 * is about looking, not about content, and it must not make the form dirty.
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
    <div className="grid gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
      <div className="flex items-end gap-3">
        <button
          type="button"
          aria-label={collapsed ? labels.expand : labels.collapse}
          onClick={() => setCollapsed((was) => !was)}
          className="rounded-lg p-1.5 text-[var(--muted)]"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>

        <div className="grid flex-1 gap-1.5">
          <label htmlFor={`${id}-name`} className="text-xs font-medium">
            {labels.sectionName}
          </label>
          <input
            id={`${id}-name`}
            key={`name-${lang}`}
            {...register(`${path}.name_${lang}` as Path<T>)}
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={`${id}-type`} className="text-xs font-medium">
            {labels.sectionType}
          </label>
          <select
            id={`${id}-type`}
            {...register(`${path}.type` as Path<T>)}
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
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
          className="rounded-lg p-1.5 text-[var(--muted)]"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {collapsed ? null : (
        <div className="grid gap-2 pl-9">
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
            type="button"
            onClick={() =>
              append({
                ...EMPTY_ITEM,
                sort_order: fields.length + 1,
              } as FieldArray<T, ArrayPath<T>>)
            }
            className="flex items-center gap-1.5 justify-self-start rounded-lg border border-[var(--edge)]/60 px-3 py-1.5 text-sm text-[var(--muted)]"
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
