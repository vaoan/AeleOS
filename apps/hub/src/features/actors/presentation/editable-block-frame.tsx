"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { DropTarget } from "@/features/actors/domain/block-drops";
import {
  formatBlockPath,
  parseBlockPath,
} from "@/features/actors/domain/editor-selection";
import { canvasPlaceId } from "@/features/actors/domain/block-drag";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Editor-only state threaded through the public block recursion.
 *
 * Absence is the public-route contract: no drag nodes, grips, feedback, refs,
 * listeners, or extra wrappers are emitted. The renderer still owns all page
 * markup; this value only asks it to instrument that markup while editing.
 */
export interface EditableBlockInstrumentation {
  /** The selected block, in the renderer's hyphenated path form. */
  readonly selectedPath?: string;
  /** The destination currently advertised by dnd-kit. */
  readonly activeTarget: DropTarget | null;
  /** Accessible name for the selected block's touch and keyboard grip. */
  readonly dragLabel: string;
}

/** What {@link EditableBlockFrame} needs. */
export interface EditableBlockFrameProps {
  /** The renderer path of this block or empty positional place. */
  readonly path: string;
  /** Whether this place contains a block that can be lifted. */
  readonly filled: boolean;
  /** Current editor instrumentation. */
  readonly editor: EditableBlockInstrumentation;
  /** The unmodified public-renderer output. */
  readonly children: ReactNode;
}

/**
 * Adds direct desktop dragging and selected-block grip dragging around one
 * live-renderer node.
 *
 * Mouse presses on the rendered block activate dnd-kit after its configured
 * distance threshold. Touch and keyboard listeners live only on the selected
 * grip, so a finger may still scroll anywhere else on the page. The wrapper
 * is editor-only and is never mounted by a public route.
 *
 * @param props - see {@link EditableBlockFrameProps}.
 * @returns the instrumented renderer node and editor-only feedback.
 */
export function EditableBlockFrame(props: EditableBlockFrameProps): ReactNode {
  const { path: encodedPath, filled, editor, children } = props;
  const path = parseBlockPath(encodedPath) ?? [];
  const id = canvasPlaceId(path);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id, disabled: !filled });
  if (path.length === 0) return children;

  const target =
    editor.activeTarget &&
    formatBlockPath(editor.activeTarget.path) === encodedPath
      ? editor.activeTarget.kind
      : undefined;
  const selected = editor.selectedPath === encodedPath;
  const emptyPlaceClass = filled
    ? ""
    : `${CHROME_SCOPE} min-h-12 rounded-lg border border-dashed border-(--edge)/40`;

  const beginDesktopDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== "mouse") return;
    listeners?.onPointerDown?.(event);
  };

  return (
    <div
      ref={(node) => {
        setDropRef(node);
        setDragRef(node);
      }}
      {...tid("canvas-drag-node")}
      data-canvas-path={encodedPath}
      data-canvas-drop={target === "place" && isOver ? "place" : undefined}
      onPointerDown={filled ? beginDesktopDrag : undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : undefined,
      }}
      className={`relative min-w-0 data-[canvas-drop=place]:outline-2 data-[canvas-drop=place]:outline-offset-2 data-[canvas-drop=place]:outline-(--accent) ${emptyPlaceClass}`}
    >
      {children}
      {target === "before" && isOver ? (
        <span
          aria-hidden
          {...tid("canvas-drop-before")}
          className={`${CHROME_SCOPE} pointer-events-none absolute inset-x-0 top-0 z-20 h-1 -translate-y-1/2 rounded-full bg-(--accent)`}
        />
      ) : null}
      {target === "after" && isOver ? (
        <span
          aria-hidden
          {...tid("canvas-drop-after")}
          className={`${CHROME_SCOPE} pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1 translate-y-1/2 rounded-full bg-(--accent)`}
        />
      ) : null}
      {selected && filled ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={editor.dragLabel}
          {...tid(`canvas-drag-${path.join(".")}`)}
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          className={`${CHROME_SCOPE} absolute top-1 right-1 z-20 cursor-grab touch-none rounded-lg surface border-(--edge)/60 bg-(--menu) p-1.5 text-(--muted)`}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
