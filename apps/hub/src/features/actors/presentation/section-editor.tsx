"use client";

import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { GripVertical, Plus } from "lucide-react";
import { useId, useState } from "react";
import { tid } from "@/shared/infrastructure/test-id";
import {
  useFieldArray,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldValues,
  type UseFormRegister,
} from "react-hook-form";
import {
  SECTION_LIMITS,
  SECTION_TYPES,
  type SectionType,
} from "@/features/actors/domain/section-schema";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  SectionCard,
  type SectionCardLabels,
} from "@/features/actors/presentation/section-card";
import {
  TemplatePicker,
  type TemplatePickerLabels,
} from "@/features/actors/presentation/template-picker";

/**
 * Translated strings {@link SectionEditor} renders.
 *
 * Extends the card's and the template picker's, because this level owns one
 * label bag and hands slices of it down — which is also why the picker's two
 * confirmation words are named for what they confirm rather than `confirm` and
 * `cancel`: the toolbar's `cancel` already means "stop editing", and in one bag
 * they would be the same key with two meanings.
 */
export interface SectionEditorLabels
  extends SectionCardLabels, TemplatePickerLabels {
  /** Heading above the sections. */
  sectionsTitle: string;
  /** Shown when there are no sections at all. */
  empty: string;
  /** Adds a section. */
  addSection: string;
  /** Field label for the new section's layout. */
  newSectionType: string;
  /** Explains why the add control is gone. */
  atLimit: string;
  /** Names a section's drag handle. */
  dragSection: string;
}

/**
 * What {@link SectionEditor} needs.
 *
 */
export interface SectionEditorProps<T extends FieldValues> {
  /** The form's control, for the sections array. */
  control: Control<T>;
  /** The form's register, so every field joins the surrounding form. */
  register: UseFormRegister<T>;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** The fursona being edited, absent while creating one. */
  /** Already-translated strings. */
  labels: SectionEditorLabels;
}

/**
 * A new section of the chosen layout, with only what the schema requires.
 *
 * @param type - the layout to create.
 * @param sortOrder - where it goes.
 * @returns the section.
 */
const emptySection = (type: SectionType, sortOrder: number) => ({
  name_en: "",
  name_es: "",
  type,
  sort_order: sortOrder,
  items: [],
});

/**
 * The sections a fursona is made of: add, reorder, remove.
 *
 * **The add control is withdrawn at the limit, with a sentence saying why.** A
 * button that silently does nothing reads as broken, and the limit is not a
 * fault on the person's part — it is a number `0009` enforces, mirrored here
 * only so nobody discovers it after a save.
 *
 *
 * A template fills the whole array rather than adding to it, which is why the
 * picker asks first when there is anything to lose.
 *
 * Dragging reorders sections; each card carries its own item list. Reordering
 * writes `sort_order` on drop rather than relying on array position, because
 * position is not what the database stores.
 *
 * **It carries test ids**, because the end-to-end suite runs in Spanish and may
 * not assert on translated text — so a control without one cannot be reached by
 * the only tests that drive a real browser. The whole sections editor had none,
 * which is why nothing had ever composed a section by hand: every test that
 * appeared to cover this used a template, and a template inserts its sections
 * as data without touching a single one of these controls.
 *
 * @returns the sections editor.
 */
export function SectionEditor<T extends FieldValues>({
  control,
  register,
  lang,
  labels,
}: SectionEditorProps<T>) {
  const id = useId();
  const [newType, setNewType] = useState<SectionType>("cards");

  const { fields, append, remove, move, replace } = useFieldArray({
    control,
    name: "sections" as ArrayPath<T>,
  });

  const atLimit = fields.length >= SECTION_LIMITS.sections;

  /**
   * Moves a section to where it was dropped.
   *
   * @param result - where the drag started and ended.
   */
  const onDragEnd = (result: DropResult): void => {
    const to = result.destination?.index;
    if (to === undefined || to === result.source.index) return;
    move(result.source.index, to);
  };

  return (
    <section className="mt-8 grid gap-4">
      <h2 className="font-display text-lg font-bold tracking-tight">
        {labels.sectionsTitle}
      </h2>

      {/* `replace` rather than `append`: a template is a starting point, and
          merging one onto what somebody already wrote produces a page nobody
          asked for. The picker owns the confirmation that makes that safe. */}
      <TemplatePicker
        hasSections={fields.length > 0}
        labels={labels}
        onApply={(sections) =>
          replace(sections as unknown as FieldArray<T, ArrayPath<T>>[])
        }
      />

      {fields.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{labels.empty}</p>
      ) : null}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="sections">
          {(dropProvided) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className="grid gap-3"
            >
              {fields.map((field, index) => (
                <Draggable key={field.id} draggableId={field.id} index={index}>
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className="flex items-start gap-2"
                    >
                      <button
                        type="button"
                        aria-label={labels.dragSection}
                        {...dragProvided.dragHandleProps}
                        className="mt-4 cursor-grab text-[var(--muted)]"
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <div className="flex-1">
                        <SectionCard
                          control={control}
                          register={register}
                          path={`sections.${index}`}
                          index={index}
                          lang={lang}
                          labels={labels}
                          onRemove={() => remove(index)}
                        />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {atLimit ? (
        <p className="text-sm text-[var(--muted)]">{labels.atLimit}</p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-new-type`} className="text-xs font-medium">
              {labels.newSectionType}
            </label>
            <select
              id={`${id}-new-type`}
              {...tid("new-section-type")}
              value={newType}
              onChange={(event) =>
                setNewType(event.target.value as SectionType)
              }
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
            {...tid("add-section")}
            onClick={() =>
              append(
                emptySection(newType, fields.length + 1) as FieldArray<
                  T,
                  ArrayPath<T>
                >,
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-[var(--edge)]/60 px-3 py-1.5 text-sm"
          >
            <Plus className="size-4" />
            {labels.addSection}
          </button>
        </div>
      )}
    </section>
  );
}
