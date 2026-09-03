"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { mayNest, type BlockPath } from "@/features/actors/domain/block-edits";
import type { Block, LeafKind } from "@/features/actors/domain/block-schema";
import { BlockSlot } from "@/features/actors/presentation/block-slot";
import { m } from "@/features/actors/presentation/editor-motion";
import {
  AddBlockPicker,
  type AddBlockPickerProps,
} from "@/features/actors/presentation/add-block-picker";
import type { PageContext } from "@/features/actors/presentation/blocks";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What the shallow recursive-inspector list needs.
 *
 * **`kinds`/`page`/`locale`/`pickerLabels` feed every empty place's own
 * `AddBlockPicker` (2026-09-02)**, replacing the flat `addContent`/
 * `addNested`/`nestingAtLimit` strings this component used to read directly
 * — `labels` now names only `removePlace`, the one action left that is not
 * the picker's.
 */
export interface InspectorItemsProps {
  /** Immediate positions in the selected scope, empty positions included. */
  items: readonly (Block | null)[];
  /** The selected container's path, or empty for Page. */
  parentPath: BlockPath;
  /** Accessible name for the list. */
  listLabel: string;
  /** Accessible name for an occupied row's grip. */
  dragLabel: string;
  /** Names one occupied child in ordinary language. */
  itemLabel: (block: Block) => string;
  /** Enters an occupied child. */
  onEnter: (path: BlockPath) => void;
  /** Fills one exact empty position and selects what was added. */
  onAdd: (path: BlockPath, block: Block) => void;
  /** Removes one empty positional place. */
  onRemovePlace: (path: BlockPath) => void;
  /** Whether another block may be added. */
  atBlockLimit: boolean;
  /** Which leaf kinds this scope may hold, already narrowed by the caller. */
  kinds: readonly LeafKind[];
  /** Threaded to every empty place's Add picker, for its previews. */
  page: PageContext;
  /** Which language the pickers' previews read. */
  locale: string;
  /** The Add picker's own label bag, shared by every empty place here. */
  pickerLabels: AddBlockPickerProps["labels"];
  /** Existing words for the one action left on an empty place. */
  labels: {
    readonly removePlace: string;
  };
  /** Scope-specific additions shown after the immediate rows. */
  footer?: ReactNode;
}

/**
 * One scope's immediate children, never their descendants.
 *
 * Occupied positions are independently focusable rows and grips. **An empty
 * position offers the same Add picker every other scope does, targeted at
 * that exact place** — one control at every scope that can hold a block,
 * rather than the flat `add-content`/`add-nested` pair this replaced. An
 * authored gap stays in the list and stays editable; collapsing it would
 * make a space count meaningless the moment a section were partly filled.
 *
 * **Every row's own content is `m.div` now, opacity-only (2026-09-02).**
 * An occupied row's label wrapper stays a SIBLING of the drag handle rather
 * than its ancestor — `BlockSlot`'s own outer element is the actual
 * `@dnd-kit` node and already writes its own `transform`; an empty place's
 * whole content is `m.div` too, since it carries no handle at all. See
 * `editor-motion.tsx` for the import boundary this answers to.
 *
 * @param props - see {@link InspectorItemsProps}.
 * @returns a labelled shallow list and its scope additions.
 */
export function InspectorItems(props: InspectorItemsProps): ReactNode {
  return (
    <>
      <div role="list" aria-label={props.listLabel} className="grid gap-2">
        {props.items.map((child, position) => {
          const path = [...props.parentPath, position];
          const pathKey = path.join(".");
          return (
            <div
              key={`inspector-item-${pathKey}`}
              role="listitem"
              {...tid("inspector-item-row")}
            >
              <BlockSlot
                path={path}
                filled={Boolean(child)}
                label={props.dragLabel}
              >
                {(handle) =>
                  child ? (
                    <div className="flex items-center gap-2 rounded-lg surface border-(--edge)/60 bg-(--surface) p-2">
                      {/* **The entrance lives on this label wrapper, never
                          on `BlockSlot` or the grip.** `BlockSlot`'s own
                          outer element is what dnd-kit measures and moves —
                          it already writes its own `transform` — and this
                          `m.div` is a SIBLING of `{handle}`, not an
                          ancestor of it, so nothing here shares a stacking
                          or transform concern with the drag. */}
                      <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="min-w-0 flex-1"
                      >
                        <button
                          type="button"
                          {...tid("inspector-item-open")}
                          onClick={() => props.onEnter(path)}
                          className="w-full text-left text-sm"
                        >
                          <span className="mr-2 text-(--muted)">
                            {position + 1}
                          </span>
                          {props.itemLabel(child)}
                        </button>
                      </m.div>
                      {handle}
                    </div>
                  ) : (
                    <m.div
                      {...tid("inspector-empty-place")}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      className="flex flex-wrap items-center gap-1.5 rounded-lg surface border-dashed border-(--edge)/60 bg-(--surface) p-2"
                    >
                      <AddBlockPicker
                        targetPath={path}
                        kinds={props.kinds}
                        mayAddLayout={mayNest(path)}
                        atBlockLimit={props.atBlockLimit}
                        labels={props.pickerLabels}
                        page={props.page}
                        locale={props.locale}
                        onAdd={(block) => props.onAdd(path, block)}
                      />
                      <button
                        type="button"
                        {...tid("remove-place")}
                        aria-label={props.labels.removePlace}
                        onClick={() => props.onRemovePlace(path)}
                        className="rounded-lg p-1 text-(--muted)"
                      >
                        <X className="size-4" />
                      </button>
                    </m.div>
                  )
                }
              </BlockSlot>
            </div>
          );
        })}
      </div>
      {props.footer}
    </>
  );
}
