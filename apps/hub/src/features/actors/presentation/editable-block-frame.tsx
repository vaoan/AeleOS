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
import type { InsertTarget } from "@/features/actors/domain/palette-targets";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";
import { DropMark } from "@/features/actors/presentation/drop-mark";

/**
 * Editor-only state threaded through the public block recursion.
 *
 * Absence is the public-route contract: no drag nodes, grips, feedback, refs,
 * listeners, or extra wrappers are emitted. The renderer still owns all page
 * markup; this value only asks it to instrument that markup while editing.
 *
 * **Draws exactly ONE landing mark (2026-09-11), not every valid palette
 * target at once.** It used to carry `insertTargets`, every insertion target
 * a palette-origin drag would accept, and light up all of them together —
 * see `apps/hub/src/features/actors/CLAUDE.md`'s "drop-target-legibility"
 * account for why that made a drop illegible the moment more than one target
 * existed. The field is gone; `activeTarget` alone now drives the single
 * `DropMark` this component draws, for a canvas-move drag exactly as before.
 * A later task publishes a palette-origin drag's own winning target through
 * that same field.
 */
export interface EditableBlockInstrumentation {
  /** The selected block, in the renderer's hyphenated path form. */
  readonly selectedPath?: string;
  /** The destination currently advertised by dnd-kit. */
  readonly activeTarget: DropTarget | null;
  /** Accessible name for the selected block's touch and keyboard grip. */
  readonly dragLabel: string;
  /**
   * How tall the block being carried is, in pixels, or `null` when nothing
   * can be measured — every palette drag, since the block does not exist
   * yet. Threaded so the mark is the size of the real landing rather than a
   * fixed guess.
   */
  readonly carriedHeight: number | null;
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
 * **It draws exactly one landing mark (2026-09-11), not every valid palette
 * target at once.** `editor.activeTarget` is the single winner a drag's own
 * collision has already resolved — a canvas-move drag's, today; a
 * palette-origin drag's, once a later task publishes one — so drawing every
 * candidate as well would be a second opinion about the same question, and
 * it is what made the mark unobservable in jsdom (`isOver` is never set
 * there). The mark is a {@link DropMark}, sized from
 * `editor.carriedHeight` when there is a real block to measure.
 *
 * @param props - see {@link EditableBlockFrameProps}.
 * @returns the instrumented renderer node and editor-only feedback.
 */
export function EditableBlockFrame(props: EditableBlockFrameProps): ReactNode {
  const { path: encodedPath, filled, editor, children } = props;
  const path = parseBlockPath(encodedPath) ?? [];
  const id = canvasPlaceId(path);
  const { setNodeRef: setDropRef } = useDroppable({ id });
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
      data-canvas-drop={target === "place" ? "place" : undefined}
      onPointerDown={filled ? beginDesktopDrag : undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : undefined,
      }}
      className={`relative min-w-0 data-[canvas-drop=place]:outline-2 data-[canvas-drop=place]:outline-offset-2 data-[canvas-drop=place]:outline-(--accent) ${emptyPlaceClass}`}
    >
      {children}
      {target ? <DropMark kind={target} height={editor.carriedHeight} /> : null}
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

/**
 * What {@link AppendSlot} needs.
 *
 * **Untouched by the single-mark change on {@link EditableBlockFrame}
 * (2026-09-11)** — this component still lights up every matching
 * `insertTargets` entry at once, through the field below, which is why it
 * takes its own separate prop rather than an
 * {@link EditableBlockInstrumentation}.
 */
export interface AppendSlotProps {
  /**
   * The append target's own renderer path — one past the container's own
   * last child, never the container's own path. Built by the caller from
   * `EditorRenderHook.appendSlot`'s own `containerPath` argument and that
   * container's current child count; this component never computes it and
   * never reads `blocks.tsx`'s tree to find out.
   */
  readonly path: string;
  /**
   * Every insertion target a palette-origin drag currently in progress
   * would accept, or `null` while none is. Unrelated to
   * {@link EditableBlockInstrumentation} — this append slot has no
   * existing block to instrument, so it reads its own membership list
   * directly rather than through that interface.
   */
  readonly insertTargets: readonly InsertTarget[] | null;
}

/**
 * The virtual "append a new row" droppable — the position one past a
 * container's own last child, which the public renderer never draws an
 * element for on its own.
 *
 * **Always mounted, so it is always a registered droppable — and visually
 * nothing at all unless a palette drag currently offers it.**
 * `insertTargetsFor` (`domain/palette-targets.ts`) already computes this
 * position as a valid domain target; what was missing was a rendered
 * element for dnd-kit to measure a rectangle for, which is exactly what
 * left it unreachable by pointer — `detectCollisionAt`'s own loop skips any
 * target whose id has no registered droppable rect. Mounting this only
 * while it is highlighted would reopen that same gap the instant a drag
 * begins: dnd-kit measures whatever is already in the DOM, and an element
 * that appears only after a drag has started has no rectangle for the
 * collision check to find.
 *
 * **The highlight is keyed on `insertTargets` membership and reuses
 * {@link EditableBlockFrame}'s exact "place" class list.** Every matching
 * target lights up at once, never only the one currently under the
 * pointer — this is the one place in the canvas that still lights up every
 * palette target simultaneously rather than drawing a single winning mark;
 * see `apps/hub/src/features/actors/CLAUDE.md`'s "drop-target-legibility"
 * account for why {@link EditableBlockFrame} itself no longer does.
 *
 * @param props - see {@link AppendSlotProps}.
 * @returns an editor-only droppable marker: an empty, zero-height
 * `CHROME_SCOPE` box when nothing highlights it, or a dashed, outlined
 * place when this exact position is one of `insertTargets`.
 */
export function AppendSlot(props: AppendSlotProps): ReactNode {
  const { path: encodedPath, insertTargets } = props;
  const path = parseBlockPath(encodedPath) ?? [];
  const { setNodeRef } = useDroppable({ id: canvasPlaceId(path) });
  const isInsertTarget =
    insertTargets?.some(
      (target) => formatBlockPath(target.path) === encodedPath,
    ) ?? false;
  return (
    <div
      ref={setNodeRef}
      {...tid("canvas-append-slot")}
      data-canvas-path={encodedPath}
      data-canvas-drop={isInsertTarget ? "place" : undefined}
      className={`${CHROME_SCOPE} data-[canvas-drop=place]:min-h-12 data-[canvas-drop=place]:rounded-lg data-[canvas-drop=place]:border data-[canvas-drop=place]:border-dashed data-[canvas-drop=place]:border-(--edge)/40 data-[canvas-drop=place]:outline-2 data-[canvas-drop=place]:outline-offset-2 data-[canvas-drop=place]:outline-(--accent)`}
    />
  );
}
