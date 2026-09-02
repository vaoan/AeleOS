"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { Block } from "@/features/actors/domain/block-schema";
import {
  mayNest,
  newContainer,
  newLeaf,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import { BlockSlot } from "@/features/actors/presentation/block-slot";
import { tid } from "@/shared/infrastructure/test-id";

/** What the shallow recursive-inspector list needs. */
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
  /** Existing words for empty-place actions. */
  labels: {
    readonly addContent: string;
    readonly addNested: string;
    readonly nestingAtLimit: string;
    readonly removePlace: string;
  };
  /** Scope-specific additions shown after the immediate rows. */
  footer?: ReactNode;
}

/**
 * One scope's immediate children, never their descendants.
 *
 * Occupied positions are independently focusable rows and grips. Empty
 * positions remain in the list and retain the existing content/layout
 * actions, so an authored gap is editable rather than collapsed.
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
                      <button
                        type="button"
                        {...tid("inspector-item-open")}
                        onClick={() => props.onEnter(path)}
                        className="min-w-0 flex-1 text-left text-sm"
                      >
                        <span className="mr-2 text-(--muted)">
                          {position + 1}
                        </span>
                        {props.itemLabel(child)}
                      </button>
                      {handle}
                    </div>
                  ) : (
                    <div
                      {...tid("inspector-empty-place")}
                      className="flex flex-wrap items-center gap-1.5 rounded-lg surface border-dashed border-(--edge)/60 bg-(--surface) p-2"
                    >
                      {props.atBlockLimit ? null : (
                        <button
                          type="button"
                          {...tid("add-content")}
                          onClick={() => props.onAdd(path, newLeaf("text"))}
                          className="rounded-lg surface border-(--edge)/60 px-2 py-1 text-sm"
                        >
                          {props.labels.addContent}
                        </button>
                      )}
                      {props.atBlockLimit || !mayNest(path) ? null : (
                        <button
                          type="button"
                          {...tid("add-nested")}
                          onClick={() =>
                            props.onAdd(path, newContainer("grid", 2))
                          }
                          className="rounded-lg surface border-(--edge)/60 px-2 py-1 text-sm"
                        >
                          {props.labels.addNested}
                        </button>
                      )}
                      {mayNest(path) ? null : (
                        <span className="text-xs text-(--muted)">
                          {props.labels.nestingAtLimit}
                        </span>
                      )}
                      <button
                        type="button"
                        {...tid("remove-place")}
                        aria-label={props.labels.removePlace}
                        onClick={() => props.onRemovePlace(path)}
                        className="rounded-lg p-1 text-(--muted)"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
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
