"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
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
 * `DropMark` this component draws — a canvas-move drag's own resolved
 * landing, or a palette-origin drag's winning target, translated through
 * `insertMarkFor` (`domain/palette-targets.ts`) and published through the
 * same field by `block-editor.tsx`'s `onDragOver` (2026-09-11).
 *
 * **Also carries `returningPath` (2026-09-11, drop-target-legibility task
 * 6), the OTHER end of a swap.** Dropping onto an occupied `place` exchanges
 * two blocks, so `activeTarget` alone only ever names where the carried
 * block is landing — this names where the block it displaces goes back to,
 * `null` for a move onto an empty place or for any palette drag, which
 * displaces nothing.
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
  /**
   * The renderer path of the place the displaced block goes back to, or
   * `null` unless the live drag is a swap (2026-09-11).
   *
   * Dropping onto an OCCUPIED place exchanges the two blocks — the one
   * already there returns to wherever the carried one came from. This names
   * that return leg, so a swap draws two marks: {@link activeTarget}'s own
   * `place` landing in the accent colour, and this path in a second, muted
   * mark — the other end of the SAME exchange, never a second candidate.
   * `null` for every other drag: a move onto an empty place displaces
   * nothing, and a palette insert has no source to return anything to.
   */
  readonly returningPath: string | null;
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
 * collision has already resolved — a canvas-move drag's or a palette-origin
 * drag's alike, both published by `block-editor.tsx`'s `onDragOver` — so
 * drawing every candidate as well would be a second opinion about the same
 * question, and it is what made the mark unobservable in jsdom (`isOver` is
 * never set there). The mark is a {@link DropMark}, sized from
 * `editor.carriedHeight` when there is a real block to measure.
 *
 * **A swap draws a SECOND mark, the other end of the same exchange
 * (2026-09-11).** `editor.returningPath` names the place the displaced block
 * goes back to; when this frame's own `encodedPath` matches it, a dotted,
 * muted mark is drawn beside — never instead of — the landing mark, so the
 * two ends of a swap are told apart at a glance: the accent `DropMark` is
 * where the carried block is going, the muted dotted one is where the
 * displaced block is coming back to. `block-editor.tsx`'s `onDragOver`
 * writes it only when the winning target is an OCCUPIED `place`; an empty
 * place displaces nothing and a palette insert has no source to return.
 *
 * **It writes no `data-canvas-drop` attribute any more (2026-09-11).** That
 * attribute used to duplicate what the mark's own `canvas-drop-*` test id
 * already says, and it drove a second, independent CSS highlight — an
 * accent outline ring, predating {@link DropMark} — that had become a
 * decoration doubled on top of the mark's own fill for the identical
 * landing. Every mark is located by its test id now; nothing reads the
 * attribute.
 *
 * **The source dims in place and no longer carries `useDraggable`'s own
 * `transform` (final review, 2026-09-11).** `<DragOverlay>` (see
 * `block-editor.tsx`) already floats a `DragPreview` under the cursor,
 * and `@dnd-kit` does not null out the active draggable's own `transform`
 * just because an overlay exists — so applying both moved the source
 * itself along with the overlay, which also dragged `returningPath`'s own
 * mark along with it, since it is drawn INSIDE this same frame. Reading
 * `isDragging` for opacity alone, and never `transform`, is the fix for
 * both at once: the source stays at its place, dimmed, while the overlay
 * alone follows the pointer. No jsdom case caught either fault, because
 * none renders with an active drag — `transform` is `null` and
 * `isDragging` is `false` in every case this file's own tests build.
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
      onPointerDown={filled ? beginDesktopDrag : undefined}
      style={{
        opacity: isDragging ? 0.5 : undefined,
      }}
      className={`relative min-w-0 ${emptyPlaceClass}`}
    >
      {children}
      {target ? <DropMark kind={target} height={editor.carriedHeight} /> : null}
      {editor.returningPath === encodedPath ? (
        <span
          aria-hidden
          {...tid("canvas-drop-returning")}
          className={`${CHROME_SCOPE} pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-dotted border-(--muted)`}
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

/**
 * What {@link AppendSlot} needs.
 *
 * **Draws exactly ONE landing mark, matching {@link EditableBlockFrame}
 * (2026-09-11), not every valid palette target at once.** It used to carry
 * `insertTargets` for that purpose too — every insertion target a
 * palette-origin drag would accept, lit up as a full highlight on every
 * one of them at once — see `apps/hub/src/features/actors/CLAUDE.md`'s
 * "drop-target-legibility" account for why that made a drop illegible the
 * moment more than one target existed. `activeTarget` and `carriedHeight`
 * took over drawing; `insertTargets` came BACK the same day, MEASURED
 * rather than restored on suspicion, for a second purpose that has nothing
 * to do with drawing — see this interface's own field doc and
 * {@link AppendSlot}'s.
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
   * The destination currently advertised by dnd-kit, for a canvas-move
   * drag or a palette-origin one alike — the same value
   * {@link EditableBlockFrame} reads through
   * {@link EditableBlockInstrumentation.activeTarget}.
   *
   * A mark is drawn here only when this target's own path is exactly this
   * slot's own path, which happens in exactly one case:
   * `insertMarkFor` (`domain/palette-targets.ts`) answers `place` at the
   * append position itself only for a container with NO existing
   * children — every other append target it names resolves to `after` the
   * container's own last child, which is a DIFFERENT element's path, drawn
   * by that child's own {@link EditableBlockFrame} instead.
   */
  readonly activeTarget: DropTarget | null;
  /**
   * How tall the carried block is, in pixels, or `null` when nothing can be
   * measured — every palette drag, since the block does not exist yet.
   * Forwarded straight to {@link DropMark}.
   */
  readonly carriedHeight: number | null;
  /**
   * Every insertion target a palette-origin drag currently in progress
   * would accept, or `null` while none is — the same value
   * `insertTargetsFor` (`domain/palette-targets.ts`) answers, read fresh
   * off `insertTargetsRef` by every caller.
   *
   * **This draws nothing. It only decides whether this position needs a
   * real, hittable rectangle for the DURATION of the drag** — a different
   * question from "is this the winner," which `activeTarget` alone
   * answers. Conflating the two was a real regression: see
   * {@link AppendSlot}'s own TSDoc for the measurement that found it.
   */
  readonly insertTargets: readonly InsertTarget[] | null;
}

/**
 * The virtual "append a new row" droppable — the position one past a
 * container's own last child, which the public renderer never draws an
 * element for on its own.
 *
 * **Always mounted, so it is always a registered droppable — and visually
 * nothing at all unless it is the winning landing.**
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
 * **It reserves real height for the WHOLE drag whenever `insertTargets`
 * names this position, whether or not it is the current winner — closing a
 * real regression the single-mark change caused, found by MEASURING a real
 * browser rather than by reasoning about the CSS (2026-09-11).** Removing
 * this component's own membership check removed the only thing that had
 * ever given it real height: a {@link DropMark} is absolutely positioned
 * and out of flow BY DESIGN, so it contributes nothing to its own parent's
 * box. `getBoundingClientRect()` on a running page confirmed the wrapper
 * measured `0px` tall whether marked or not, drag or no drag — a droppable
 * dnd-kit cannot measure a real rectangle for cannot be landed on by a real
 * pointer, which is worse than the light-everything fault this whole
 * feature exists to fix. Reservation and drawing are two separate
 * questions now: `insertTargets` membership — computed once at
 * `onDragStart` and constant for the whole drag — reserves `min-h-12` on
 * every valid landing regardless of which one is currently under the
 * pointer, and `activeTarget` alone still decides which ONE of those gets
 * an actual {@link DropMark}. This is not the light-everything fault
 * returning: nothing is drawn and nothing is outlined, and the reservation
 * never changes as the winner changes mid-drag — it is fixed the instant
 * the drag begins, which is exactly when `@dnd-kit` caches every
 * droppable's rectangle, so nothing moves underneath an already-cached
 * rect the way the winner-driven reflow this design forbids would.
 *
 * @param props - see {@link AppendSlotProps}.
 * @returns an editor-only droppable marker: an empty box when nothing
 * marks or reserves it, a reserved-but-unmarked box when `insertTargets`
 * names it and `activeTarget` does not, or one carrying a {@link DropMark}
 * when `activeTarget` names this exact position.
 */
export function AppendSlot(props: AppendSlotProps): ReactNode {
  const {
    path: encodedPath,
    activeTarget,
    carriedHeight,
    insertTargets,
  } = props;
  const path = parseBlockPath(encodedPath) ?? [];
  const { setNodeRef } = useDroppable({ id: canvasPlaceId(path) });
  const target =
    activeTarget && formatBlockPath(activeTarget.path) === encodedPath
      ? activeTarget.kind
      : undefined;
  const reserved =
    insertTargets?.some(
      (candidate) => formatBlockPath(candidate.path) === encodedPath,
    ) ?? false;
  return (
    <div
      ref={setNodeRef}
      {...tid("canvas-append-slot")}
      data-canvas-path={encodedPath}
      className={`relative ${CHROME_SCOPE} ${reserved ? "min-h-12" : ""}`}
    >
      {target ? <DropMark kind={target} height={carriedHeight} /> : null}
    </div>
  );
}
