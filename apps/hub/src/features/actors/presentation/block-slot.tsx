"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { BlockPath } from "@/features/actors/domain/block-edits";
import { placeId } from "@/features/actors/domain/block-drag";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link BlockSlot} needs. */
export interface BlockSlotProps {
  /** Where the place sits, which is the whole of its identity. */
  path: BlockPath;
  /** Whether anything is in it to pick up. */
  filled: boolean;
  /** Names the grip for somebody who cannot see it. */
  label: string;
  /**
   * What goes in the place, given the grip to render.
   *
   * A render prop rather than a `handle` prop on every card, because the grip
   * belongs in each card's own header beside its other controls, and the four
   * things that make it work belong in one file — see {@link BlockSlot}.
   */
  children: (handle: ReactNode) => ReactNode;
}

/**
 * One place: the thing that may be dropped on, and the grip that lifts what is
 * in it.
 *
 * **Both halves are here, and that is the point of the component.** A place is
 * a drop target and whatever sits in it is what gets dragged, so one id names
 * both — `placeId(path)` — and `active.id` and `over.id` are read back with
 * one function. A block carries no identity but where it sits, exactly as
 * `PublicBlocks` and `seatsOf` already say, so there is no generated key to
 * use instead.
 *
 * **The drag wiring is spread in one place, deliberately.**
 * `setNodeRef` on the element the library measures and moves, `listeners` and
 * `attributes` on the grip, and `setActivatorNodeRef` so focus returns to the
 * grip after a keyboard drop. The grip also stops its click so a completed or
 * cancelled gesture cannot bubble into an inspector row and enter it.
 * Dropping `listeners` or the node ref kills the
 * drag by mouse AND keyboard with no error at all; dropping `attributes`
 * kills only the keyboard. Every card in the editor gets its grip from here,
 * so there is one component to get right and one component to test — see
 * `block-slot.test.tsx`, which drives the real hook rather than a mock,
 * because a mock supplies what the hook would have and so cannot observe
 * whether anything passed it on.
 *
 * **An empty place is a target and not a source.** It registers a draggable
 * all the same, disabled, so the hook order does not depend on what somebody
 * has put on their page.
 *
 * The wrapper is a grid item where the block used to be one, so nothing about
 * the layout moves; `min-w-0` is what keeps a wide leaf from pushing its track
 * open, which the tracks' own `minmax(0, 1fr)` does everywhere except a mode
 * laying `auto` tracks.
 *
 * @returns the place.
 */
export function BlockSlot({ path, filled, label, children }: BlockSlotProps) {
  const id = placeId(path);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id, disabled: !filled });

  const handle = filled ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={label}
      {...tid(`drag-${path.join(".")}`)}
      {...attributes}
      {...listeners}
      onClick={(event) => event.stopPropagation()}
      className="cursor-grab touch-none rounded-lg p-1.5 text-(--muted)"
    >
      <GripVertical className="size-4" />
    </button>
  ) : null;

  return (
    <div
      ref={(node) => {
        setDropRef(node);
        setDragRef(node);
      }}
      {...tid(`place-${path.join(".")}`)}
      data-over={isOver ? "" : undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : undefined,
      }}
      className="relative min-w-0 rounded-xl data-over:outline-2 data-over:outline-offset-2 data-over:outline-(--accent)"
    >
      {children(handle)}
    </div>
  );
}
