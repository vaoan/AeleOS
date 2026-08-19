"use client";

import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { Plus, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import {
  BLOCK_LIMITS,
  countBlocks,
  isContainer,
  type Block,
} from "@/features/actors/domain/block-schema";
import {
  moveSection,
  newContainer,
  setAt,
  SPACE_CHOICES,
} from "@/features/actors/domain/block-edits";
import type { BlockProblem } from "@/features/actors/domain/block-problems";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  BlockCard,
  type BlockCardLabels,
} from "@/features/actors/presentation/block-card";
import { LeafEditor } from "@/features/actors/presentation/leaf-editor";
import {
  SECTION_PRESETS,
  presetBlock,
} from "@/features/actors/presentation/section-presets";
import {
  TemplatePicker,
  type TemplatePickerLabels,
} from "@/features/actors/presentation/template-picker";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings {@link BlockEditor} renders.
 *
 * Extends the card's and the template picker's, because this level owns one
 * label bag and hands slices of it down — which is also why the picker's two
 * confirmation words are named for what they confirm rather than `confirm` and
 * `cancel`: the toolbar's `cancel` already means "stop editing", and in one bag
 * they would be the same key with two meanings.
 */
export interface BlockEditorLabels
  extends BlockCardLabels, TemplatePickerLabels {
  /** Heading above the sections. */
  sectionsTitle: string;
  /** Shown when there are no sections at all. */
  empty: string;
  /** Adds a section. */
  addSection: string;
  /** Field label for the new section's shape. */
  newSectionSpaces: string;
  /** Explains why the add controls are gone. */
  atLimit: string;
  /**
   * Opens the brand preset list — "Add a section for…" or similar.
   *
   * Names the group, not any one brand: a brand's own name is never
   * translated, so this is the only string {@link BlockEditor} needs from the
   * catalogue for the whole preset control.
   */
  addSectionFor: string;
}

/**
 * What {@link BlockEditor} needs.
 *
 * `problems` is threaded from the form rather than recomputed here, so one
 * walk of react-hook-form's error tree answers it for every card — and so the
 * banner and the marks beneath it can never disagree about which blocks are
 * wrong.
 */
export interface BlockEditorProps<T extends FieldValues> {
  /** The form's control, for the one field holding the whole page. */
  control: Control<T>;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: BlockEditorLabels;
  /** This deployment's own hostname, threaded to every preview for Twitch. */
  parentHost: string;
  /**
   * What the save schema refused, and where.
   *
   * Threaded rather than recomputed, so one walk of react-hook-form's error
   * tree answers it for every card — and so the banner and the marks below it
   * can never disagree about which blocks are wrong.
   */
  problems: readonly BlockProblem[];
}

/** The shape a new section starts at, before anybody changes it. */
const NEW_SPACES = 2;

/**
 * The page: sections, what is in each of their places, and what is in those.
 *
 * **The whole tree is ONE form field, held by one `useController`.** That is
 * forced rather than preferred: a place may hold nothing, and `useFieldArray`
 * keys every entry by an id it puts ON the entry — so it cannot represent a
 * `null`, which is the one thing this model turns on. Every edit is therefore
 * a pure function over the tree in `domain/block-edits.ts`, applied through
 * `apply` and handed back to the form whole; and because those functions are
 * domain code they are covered to 100%, where a `useFieldArray` call inside a
 * presentation component is measured by nothing.
 *
 * **A block is addressed by its position and never by a captured index.** Each
 * card rebuilds its children's paths from where it is rendering, on every
 * render, so a path cannot go stale the way an index captured in a handler
 * does — the fault the flat editor documented at length and which produced a
 * delete landing on the wrong row.
 *
 * **Dragging reorders SECTIONS and nothing else.** Moving a block between
 * places is phase 4, on `@dnd-kit`: `@hello-pangea/dnd` cannot express a
 * nested drag at all, by its own README, which rules out both dragging between
 * a parent and a child list and grid layouts. Until then a place is filled and
 * emptied explicitly, which is enough to build a page with — dragging is how
 * one gets rearranged pleasantly, not how one gets built.
 *
 * **The `draggableId` is the position rather than a generated key**, because
 * there is no generated key to use: a block carries no identity but where it
 * sits, exactly as `PublicBlocks` and `seatsOf` already say. The library maps
 * id to index on every render, so a reorder re-registers rather than moving an
 * id with an item.
 *
 * **Its `Draggable` carries `disableInteractiveElementBlocking`.** The handle
 * is a real `<button>`, and `@hello-pangea/dnd` refuses to start a drag — by
 * mouse or keyboard — whose source event targets a tag it treats as
 * interactive, unless told otherwise: without this, lifting a section does
 * nothing at all, silently, for every input method. Found by
 * `tests/e2e/section-drag-reorder.spec.ts`, the first test anywhere in this
 * project to actually drive a drag rather than mock the library away.
 *
 * **The add controls are withdrawn at the block cap, with a sentence saying
 * why.** A button that silently does nothing reads as broken, and the cap is
 * not a fault on the person's part — it is a number `blocksSchema` and
 * `validate_block` both enforce, mirrored here only so nobody discovers it
 * after a save. It is counted the way the schema counts it, empty places
 * excluded, rather than approximated by the length of the outermost array.
 *
 * **A template fills the whole page rather than adding to it**, which is why
 * the picker asks first when there is anything to lose. Templates are still
 * written in the flat vocabulary and are converted by `sectionsToBlocks` — the
 * same conversion that opens every page already stored — so a template and a
 * stored page arrive in the editor as the same shape.
 *
 * **The brand presets append and never ask first.** Appending is not
 * destructive, unlike a template's replace, and adding a confirmation would
 * make the two controls look interchangeable when they are not.
 *
 * **What the save refused travels down with everything else.** A refused page
 * used to produce one banner line and nothing else, over a page where nothing
 * was marked; `problems` is what lets the block that is actually wrong say so.
 * It is a prop rather than something each card works out, because the banner
 * and the marks have to be two views of one answer.
 *
 * **It carries test ids**, because the end-to-end suite runs in Spanish and
 * may not assert on translated text — so a control without one cannot be
 * reached by the only tests that drive a real browser.
 *
 * Its select is painted with `--menu`, not left transparent: a dropdown's list
 * is drawn from the control's own background, and a transparent one is painted
 * on white. `dropdown-legibility.test.ts` guards every select in the app.
 *
 * @returns the page editor.
 */
export function BlockEditor<T extends FieldValues>({
  control,
  lang,
  labels,
  parentHost,
  problems,
}: BlockEditorProps<T>) {
  const id = useId();
  const [spaces, setSpaces] = useState(NEW_SPACES);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const field = useController({ control, name: "sections" as Path<T> });
  const blocks = (field.field.value ?? []) as Block[];

  /**
   * Hands the form a whole new page.
   *
   * Every control below writes through this, so the form holds one value and
   * the edits themselves stay pure functions somebody can test without a DOM.
   *
   * @param edit - what to make of the page.
   */
  const apply = (edit: (current: Block[]) => Block[]): void => {
    field.field.onChange(edit(blocks));
  };

  const atBlockLimit = countBlocks(blocks) >= BLOCK_LIMITS.blocks;
  // Position named once, exactly as `PublicBlocks` does it and for the same
  // reason: a block has no identity but where it sits, and
  // `react/no-array-index-key` reads the map callback's index parameter. It is
  // also the drag library's own id, which is why it is a string.
  const seats = blocks.map((block, position) => ({
    block,
    id: `section-${position}`,
    position,
  }));

  /**
   * Moves a section to where it was dropped.
   *
   * A block carries no `sort_order` — the array IS the order, at every depth —
   * so there is nothing to renumber afterwards and nothing a save can send
   * stale. The flat editor needed a write per section here, and a drag that
   * skipped it was silently undone by the next reload.
   *
   * @param result - where the drag started and ended.
   */
  const onDragEnd = (result: DropResult): void => {
    const to = result.destination?.index;
    if (to === undefined || to === result.source.index) return;
    apply((current) => moveSection(current, result.source.index, to));
  };

  return (
    <section className="mt-8 grid gap-4">
      <h2 className="font-display text-lg font-bold tracking-tight">
        {labels.sectionsTitle}
      </h2>

      {/* Replaces rather than appends: a template is a starting point, and
          merging one onto what somebody already wrote produces a page nobody
          asked for. The picker owns the confirmation that makes that safe. */}
      <TemplatePicker
        hasSections={blocks.length > 0}
        labels={labels}
        onApply={(sections) => apply(() => sectionsToBlocks(sections))}
      />

      {blocks.length === 0 ? (
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
              {seats.map((seat) => (
                <Draggable
                  key={seat.id}
                  draggableId={seat.id}
                  index={seat.position}
                  // The handle is a real `<button>`, and `@hello-pangea/dnd`
                  // refuses to start ANY drag — mouse or keyboard — whose
                  // source event targets a tag it treats as interactive
                  // unless told otherwise. Without this, lifting silently
                  // does nothing: no error, no announcement, the grip simply
                  // inert.
                  disableInteractiveElementBlocking
                >
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                    >
                      {isContainer(seat.block) ? (
                        <BlockCard
                          block={seat.block}
                          path={[seat.position]}
                          apply={apply}
                          lang={lang}
                          labels={labels}
                          parentHost={parentHost}
                          atBlockLimit={atBlockLimit}
                          problems={problems}
                          dragHandleProps={dragProvided.dragHandleProps}
                        />
                      ) : (
                        // **A page may hold a leaf at the top level**, and one
                        // this editor could not show would be content nobody
                        // can read or remove while every save kept writing it
                        // back. Nothing here builds one — the add control makes
                        // sections — but the schema admits one and a page
                        // written by anything else may carry one.
                        <LeafEditor
                          leaf={seat.block}
                          path={[seat.position]}
                          apply={apply}
                          lang={lang}
                          labels={labels}
                          problems={problems}
                        />
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {atBlockLimit ? (
        <p className="text-sm text-(--muted)">{labels.atLimit}</p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <div className="grid gap-1.5">
              <label
                htmlFor={`${id}-new-spaces`}
                className="text-xs font-medium"
              >
                {labels.newSectionSpaces}
              </label>
              <select
                id={`${id}-new-spaces`}
                {...tid("new-section-spaces")}
                value={String(spaces)}
                onChange={(event) => setSpaces(Number(event.target.value))}
                className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
              >
                {SPACE_CHOICES.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              {...tid("add-section")}
              onClick={() =>
                apply((current) =>
                  setAt(
                    current,
                    [current.length],
                    newContainer("grid", spaces),
                  ),
                )
              }
              className="flex items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
            >
              <Plus className="size-4" />
              {labels.addSection}
            </button>
          </div>

          {/* Brand presets append at once — there is nothing to lose by adding
              a box, unlike the template picker's replace. */}
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
                      apply((current) =>
                        setAt(current, [current.length], presetBlock(preset)),
                      );
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
