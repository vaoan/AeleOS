"use client";

import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { Plus, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { tid } from "@/shared/infrastructure/test-id";
import {
  useFieldArray,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldValues,
  type Path,
  type UseFormRegister,
  type UseFormSetValue,
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
  SECTION_PRESETS,
  presetSection,
} from "@/features/actors/presentation/section-presets";
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
 *
 * `addSectionFor` is the one string the brand preset control needs from this
 * bag — see its own field doc for why a brand's own name is never one of
 * these fields.
 *
 * `dragSection` used to be declared here, for a handle this component drew
 * itself. It moved to {@link SectionCardLabels} along with the handle it
 * names — the extension still carries it through, so nothing that already
 * read `labels.dragSection` had to change.
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
  /**
   * Opens the brand preset list — "Add a section for…" or similar.
   *
   * Names the group, not any one brand: a brand's own name is never
   * translated, so this is the only string {@link SectionEditor} needs from
   * the catalogue for the whole preset control.
   */
  addSectionFor: string;
}

/**
 * What {@link SectionEditor} needs.
 *
 * `setValue` is new: a drag or an add renumbers every section's
 * `sort_order` to its position, and that write has to land through the
 * form's own setter rather than through `useFieldArray`'s `move` or
 * `append` alone — see {@link SectionEditor}'s own TSDoc.
 *
 * Carries no `fursona` prop. A doc line for one survived here after images
 * became links rather than uploads — nothing in this interface ever read it.
 */
export interface SectionEditorProps<T extends FieldValues> {
  /** The form's control, for the sections array. */
  control: Control<T>;
  /** The form's register, so every field joins the surrounding form. */
  register: UseFormRegister<T>;
  /**
   * The form's own setter, used to rewrite a section's `sort_order` after a
   * drag or an add — see {@link SectionEditor}'s own TSDoc for why this
   * cannot go through `useFieldArray`'s `move` or `append` alone.
   */
  setValue: UseFormSetValue<T>;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
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
 * **The brand presets append; they never ask first.** Choosing "Instagram"
 * from the preset list appends a `posts` section already named Instagram —
 * see `section-presets.ts` for the full list and the rule behind which layout
 * each brand targets. Appending is not destructive, so unlike the template
 * picker there is nothing to confirm — and adding a confirmation here would
 * make the two controls look interchangeable when they are not. The preset
 * list is withdrawn at the same limit as the manual add control, for the same
 * reason: offering a control that silently does nothing at the cap is the
 * fault this project keeps catching.
 *
 * Dragging reorders sections; each card carries its own item list. `move`
 * from `useFieldArray` reorders the client-side array, and `onDragEnd`
 * follows it with a `setValue` per section rewriting `sort_order` to match
 * the new position — one-based, the same scheme {@link emptySection} already
 * used. **This is the field `0009` and the public page's own render actually
 * sort by**, and array position is not: `move` alone shipped once, reordered
 * the screen, and saved every section under its original `sort_order`, so a
 * drag was invisible to a visitor the moment the page reloaded. `setValue`
 * rather than `replace` is deliberate — `replace` regenerates every field's
 * `id`, which would remount every untouched `SectionCard` on a drag anywhere
 * in the list and lose each one's own collapsed state; `setValue` touches
 * only the one field nothing renders.
 *
 * **Adding a section renumbers the whole array the same way**, not only its
 * own `sort_order`. A plain `fields.length + 1` looked sufficient and is not:
 * removing a section from the middle leaves a gap in the survivors'
 * `sort_order` values, which is harmless on its own — the sequence stays
 * monotonic — but a later add computed from the post-removal `fields.length`
 * can land **below** a surviving section's `sort_order`, so the section just
 * appended at the visual end would sort before one already there. Renumbering
 * every section on every add closes that regardless of how many removals
 * came before it, without needing to touch `remove` itself.
 *
 * **Its `Draggable` carries `disableInteractiveElementBlocking`.** The handle
 * is a real `<button>`, and `@hello-pangea/dnd` refuses to start a drag — by
 * mouse or keyboard — whose source event targets a tag it treats as
 * interactive, unless told otherwise: without this, lifting a section did
 * nothing at all, silently, for every input method. Found by
 * `tests/e2e/section-drag-reorder.spec.ts`, the first test anywhere in this
 * project to actually drive a drag rather than mock the library away.
 *
 * **This no longer wraps each row in a handle of its own.** It used to pair a
 * grip button beside `SectionCard`, which is where the empty gutter down the
 * left came from — a control floating beside what it governs rather than on
 * it. `SectionCard` now renders the handle itself, in its own header row
 * beside the collapse chevron, and this component only hands it the drag
 * library's `dragHandleProps` for the row.
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
 * * Its add button and empty state are `surface`s, so an editor with no sections still shows the skin.
 *
 * Every colour it paints comes from a token — `--edge`, `--menu`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the sections editor.
 */
export function SectionEditor<T extends FieldValues>({
  control,
  register,
  setValue,
  lang,
  labels,
}: SectionEditorProps<T>) {
  const id = useId();
  const [newType, setNewType] = useState<SectionType>("cards");
  const [presetsOpen, setPresetsOpen] = useState(false);

  const { fields, append, remove, move, replace } = useFieldArray({
    control,
    name: "sections" as ArrayPath<T>,
  });

  const atLimit = fields.length >= SECTION_LIMITS.sections;

  /**
   * Rewrites every section's `sort_order` to its position among the first
   * `count` sections, one-based to match {@link emptySection}'s own scheme.
   *
   * Reads by index rather than by any array this function is handed: `move`
   * and `append` mutate `useFieldArray`'s underlying form state
   * synchronously, so by the time this runs, position `index` already holds
   * whichever section belongs there — this only has to know how many there
   * are.
   *
   * @param count - how many sections to renumber, starting from the first.
   */
  const renumber = (count: number): void => {
    for (let index = 0; index < count; index += 1) {
      setValue(
        `sections.${index}.sort_order` as Path<T>,
        (index + 1) as unknown as never,
      );
    }
  };

  /**
   * Moves a section to where it was dropped, then renumbers every section so
   * `sort_order` matches the array position — the field the public page
   * actually sorts by.
   *
   * @param result - where the drag started and ended.
   */
  const onDragEnd = (result: DropResult): void => {
    const to = result.destination?.index;
    if (to === undefined || to === result.source.index) return;
    move(result.source.index, to);
    renumber(fields.length);
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
        <p className="text-sm text-(--muted)">{labels.empty}</p>
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
                <Draggable
                  key={field.id}
                  draggableId={field.id}
                  index={index}
                  // The handle is a real `<button>`, and `@hello-pangea/dnd`
                  // refuses to start ANY drag — mouse or keyboard — whose
                  // source event targets a tag it treats as interactive
                  // (`button` among them) unless told otherwise. Without this,
                  // `tryStart` returns null before ever calling
                  // `preventDefault`, so lifting silently does nothing: no
                  // error, no announcement, the grip simply inert. Found by
                  // `section-drag-reorder.spec.ts`, the first test anywhere in
                  // this project to actually drive a drag.
                  disableInteractiveElementBlocking
                >
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                    >
                      <SectionCard
                        control={control}
                        register={register}
                        setValue={setValue}
                        path={`sections.${index}`}
                        index={index}
                        lang={lang}
                        labels={labels}
                        dragHandleProps={dragProvided.dragHandleProps}
                        onRemove={() => remove(index)}
                      />
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
        <p className="text-sm text-(--muted)">{labels.atLimit}</p>
      ) : (
        <>
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
              {...tid("add-section")}
              onClick={() => {
                append(
                  emptySection(newType, fields.length + 1) as FieldArray<
                    T,
                    ArrayPath<T>
                  >,
                );
                renumber(fields.length + 1);
              }}
              className="flex items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
            >
              <Plus className="size-4" />
              {labels.addSection}
            </button>
          </div>

          {/* Brand presets append at once — there is nothing to lose by
              adding a box, unlike the template picker's replace. The list is
              withdrawn at the same limit as the control above, for the same
              reason: a control that silently does nothing at the cap reads as
              broken. */}
          <div className="grid gap-1.5">
            <button
              type="button"
              aria-expanded={presetsOpen}
              {...tid("section-presets")}
              onClick={() => setPresetsOpen((was) => !was)}
              className="flex w-fit items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
            >
              <Sparkles className="size-4" />
              {labels.addSectionFor}
            </button>

            {presetsOpen ? (
              <div className="flex flex-wrap gap-1.5">
                {SECTION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    {...tid(`preset-${preset.id}`)}
                    onClick={() => {
                      append(
                        presetSection(preset, fields.length + 1) as FieldArray<
                          T,
                          ArrayPath<T>
                        >,
                      );
                      renumber(fields.length + 1);
                      setPresetsOpen(false);
                    }}
                    className="rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
