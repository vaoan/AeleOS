"use client";

import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
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
  type UseFormSetValue,
} from "react-hook-form";
import { SECTION_TYPES } from "@/features/actors/domain/section-schema";
import type {
  FursonaSection,
  SectionType,
} from "@/features/actors/domain/section-schema";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  SectionItemFields,
  type SectionItemFieldsLabels,
} from "@/features/actors/presentation/section-item-fields";
import {
  SectionStylePopup,
  type SectionStylePopupLabels,
} from "@/features/actors/presentation/section-style-popup";
import { sectionStyle } from "@/features/actors/presentation/public-sections";

/**
 * Translated strings {@link SectionCard} renders.
 *
 * `dragSection` names the drag handle that now lives in this component's own
 * header row, beside the collapse chevron — `SectionEditor` used to wrap a
 * handle of its own around the card and owned this string; it hands the label
 * bag through unchanged, so nothing downstream of {@link SectionEditorLabels}
 * had to move.
 *
 * `style` carries the paintbrush popup's own strings, nested rather than
 * spread flat in — the popup has a `title` of its own, and a flat bag would
 * have it silently collide with this level's.
 */
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
  /** Names a section's drag handle. */
  dragSection: string;
  /** One label per layout. */
  types: Record<SectionType, string>;
  /** The paintbrush popup's own strings, nested to avoid a `title` collision. */
  style: SectionStylePopupLabels;
}

/**
 * What {@link SectionCard} needs.
 *
 * `dragHandleProps` is new: the card now renders its own drag handle in its
 * header row, so it needs the drag library's props for that button rather
 * than `SectionEditor` wrapping the card in a handle of its own.
 *
 * `setValue` is new too: adding an item renumbers every item's `sort_order`
 * to its position, and that write has to land through the form's own setter
 * rather than through `useFieldArray`'s `append` alone — see this
 * component's own TSDoc.
 */
export interface SectionCardProps<T extends FieldValues> {
  /** The form's control, for this section's item array. */
  control: Control<T>;
  /** The form's register, so the fields join the surrounding form. */
  register: UseFormRegister<T>;
  /**
   * The form's own setter, used to renumber an item's `sort_order` after an
   * add — see this component's own TSDoc for why appending alone is not
   * enough once an earlier item has been removed.
   */
  setValue: UseFormSetValue<T>;
  /** Where this section lives, as in `sections.0`. */
  path: string;
  /** Its position, for the label a screen reader reads. */
  index: number;
  /** The fursona being edited, absent while creating one. */
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: SectionCardLabels;
  /**
   * The drag library's own props for this section's handle, spread onto the
   * button that moves into the header row here — `SectionEditor` no longer
   * wraps the card in a handle of its own. `null` while dragging is disabled,
   * matching what `@hello-pangea/dnd` hands a `Draggable`'s render prop.
   */
  dragHandleProps: DraggableProvidedDragHandleProps | null;
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
 * **Items are not draggable — there is no handle and no `Draggable` among
 * them, only add and remove.** So `onDragEnd`'s fault in `SectionEditor` (a
 * reorder that never reached `sort_order`) has no counterpart here: there is
 * no drag to lose. Adding one still renumbers every item's `sort_order` to
 * its position, for the same reason `SectionEditor` does it on a section add
 * — appending after an earlier item was removed can otherwise compute a
 * `sort_order` at or below a surviving item's, and the public page sorts
 * items by that field exactly as it sorts sections.
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
 * drag handle, chevron, name, a menu naming every layout, bin — together
 * forced the page 150px wider than a 320px screen. The row wraps, the menu
 * takes a line of its own there, and it rejoins the row as soon as there is
 * room. `responsive.spec.ts` fails by exactly that 150px when the row is put
 * back on one line. **The drag handle moved in from `SectionEditor` and the
 * wrap has to keep holding with it here** — `SectionEditor` no longer renders
 * one of its own, and this is the only header row left.
 *
 * **It carries its own skin and background picture, previewed live.** The
 * paintbrush button in the header opens `SectionStylePopup`, and the whole
 * card — this component's own root element — wears the chosen style at once,
 * through `sectionStyle`, imported straight from `public-sections.tsx` rather
 * than a second copy of it: that is the SAME function the public page renders
 * with, not merely the same tokens it reads from, so what somebody judges
 * here is what a stranger will be shown — the same reasoning that has the
 * theme configurator share `themeCss`. Nothing is written until the ordinary
 * save: what has to be instant is SEEING the change, not storing it.
 *
 * **The popup is handed the same watched `type` `SectionItemFields` already
 * gets**, so it can hide its card-size field on every layout but `cards` —
 * the identical "a field a layout never renders must not be offered" rule
 * that already governs `LINKED`/`ICONED`/`PICTURED` there.
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
  setValue,
  path,
  index,
  lang,
  labels,
  dragHandleProps,
  onRemove,
}: SectionCardProps<T>) {
  const id = useId();
  const [collapsed, setCollapsed] = useState(false);

  const { fields, append, remove } = useFieldArray({
    control,
    name: `${path}.items` as ArrayPath<T>,
  });

  /**
   * Rewrites every item's `sort_order` to its position among the first
   * `count` items, one-based to match {@link EMPTY_ITEM}'s own scheme —
   * called after an add, since `fields.length + 1` alone can land at or
   * below a surviving item's `sort_order` once an earlier item has been
   * removed. See this component's own TSDoc.
   *
   * @param count - how many items to renumber, starting from the first.
   */
  const renumberItems = (count: number): void => {
    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      setValue(
        `${path}.items.${itemIndex}.sort_order` as Path<T>,
        (itemIndex + 1) as unknown as never,
      );
    }
  };

  // Watched rather than read from the form's defaults, so switching the layout
  // changes what the items offer at once. Somebody changing it is looking to
  // see what it does; making them save first would answer the question far too
  // late.
  const type = useWatch({ control, name: `${path}.type` as Path<T> });

  // Watched separately from `SectionStylePopup`'s own controller on the same
  // field: this is a read-only need — painting the card's own root with the
  // chosen skin — and `useWatch` re-renders on every change the popup makes,
  // including the ones fired while somebody is still choosing.
  const style = useWatch({ control, name: `${path}.style` as Path<T> });

  return (
    <div
      {...tid("section-card")}
      style={sectionStyle(style as FursonaSection["style"])}
      className="grid gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-3 sm:p-4"
    >
      {/* Wraps, and the layout select is what wraps. This row is a drag
          handle, a chevron, a name, a menu naming every layout, a paintbrush
          that opens the style popup, and a bin — and a `select` is as wide as
          its longest option, which no amount of space around it changes. On a
          320px screen they together forced the page 150px wider than the
          phone, so the menu takes a line of its own below (`w-full` is what
          forces the break) and rejoins the row as soon as there is room for
          it. Measured, not guessed: `responsive.spec.ts` fails by exactly
          that 150px when this row is put back on one line. */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <button
          type="button"
          aria-label={labels.dragSection}
          {...tid("drag-section")}
          {...(dragHandleProps ?? {})}
          className="cursor-grab rounded-lg p-1.5 text-(--muted)"
        >
          <GripVertical className="size-4" />
        </button>

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

        <SectionStylePopup
          control={control}
          path={path}
          type={(type ?? "cards") as SectionType}
          labels={labels.style}
        />

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
            onClick={() => {
              append({
                ...EMPTY_ITEM,
                sort_order: fields.length + 1,
              } as FieldArray<T, ArrayPath<T>>);
              renumberItems(fields.length + 1);
            }}
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
