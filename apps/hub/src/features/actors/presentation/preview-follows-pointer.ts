import type { Modifier } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";

/**
 * How far below and to the right of the pointer the preview's top-left corner
 * sits, in CSS pixels — close enough to read as "carried", far enough that
 * the pill never covers the mark drawn under the cursor.
 */
export const PREVIEW_GAP = 12;

/**
 * A `DragOverlay` modifier that keeps the floating preview beside the
 * pointer, whatever the size of the thing that was lifted.
 *
 * **dnd-kit positions the overlay at the ACTIVE NODE's own rectangle plus the
 * drag delta, and that is wrong for a wide block lifted by a grip at its
 * edge.** A canvas move's active node is the whole `EditableBlockFrame` — a
 * 720px-wide frame whose grip sits at its top-right — so without this the
 * pill was drawn at the frame's top-LEFT plus the delta: 700px from the
 * cursor, and off screen the moment the drag went left (found 2026-09-17 by
 * the picture proof for the midline fix; the pill was simply absent from
 * the frame). A palette thumbnail is small, which is why the same placement
 * looked right for a palette drag and the fault hid behind it.
 *
 * The shift is the pointer's lift position relative to the active node's
 * rectangle, plus {@link PREVIEW_GAP} on both axes: the preview's top-left
 * then starts a gap below-right of where the pointer went down and moves
 * with the delta from there. The transform is returned untouched — by
 * identity — when there is no pointer to follow: a keyboard lift has no
 * coordinates, and dnd-kit calls modifiers before the active node has been
 * measured.
 *
 * @param args - dnd-kit's modifier input: the activator event, the active
 * node's rectangle and the transform so far.
 * @returns the transform shifted to the pointer, or the same transform when
 * nothing can be followed.
 */
export const previewFollowsPointer: Modifier = (args) => {
  const { activatorEvent, activeNodeRect, transform } = args;
  if (!activatorEvent || !activeNodeRect) return transform;
  const pointer = getEventCoordinates(activatorEvent);
  if (!pointer) return transform;
  return {
    ...transform,
    x: transform.x + (pointer.x - activeNodeRect.left) + PREVIEW_GAP,
    y: transform.y + (pointer.y - activeNodeRect.top) + PREVIEW_GAP,
  };
};
