import { blockAt, type BlockPath } from "@/features/actors/domain/block-edits";
import {
  isLinearScope,
  type DropTarget,
} from "@/features/actors/domain/block-drops";
import {
  type Block,
  type ContainerBlock,
} from "@/features/actors/domain/block-schema";

/**
 * Where a drag's gap opens: above one block, or below the last of its list.
 *
 * **One boundary has one slot.** `after` a sibling that has a next sibling is
 * the same gap as `before` that next one, so it is answered as that next
 * sibling's `top`; only the last sibling of a list ever opens at its
 * `bottom`. Two slots opening across one boundary would part the page twice.
 */
export interface GapSlot {
  readonly path: BlockPath;
  readonly edge: "top" | "bottom";
}

/** The smallest gap, so a thin block still parts its neighbours visibly. */
export const GAP_HEIGHT_MIN = 48;

/**
 * The largest gap. A whole section can be a screenful tall, and opening that
 * much would push the place the pointer is aiming at off the screen.
 */
export const GAP_HEIGHT_MAX = 160;

/**
 * The gap a winning drop target opens, or nothing.
 *
 * **Only where an insert shifts the rest (2026-10-27):** the page's own list
 * and the linear modes, by {@link isLinearScope}. A `place` exchanges or
 * fills and shifts nothing, and a `before`/`after` inside a grid — a palette
 * insert pushing places along — would part the page in a direction the grid
 * does not lay out, so both answer nothing and keep their mark alone.
 *
 * **Nothing opens where a lifted block already sits.** For a canvas move,
 * the gap right above the lifted block and the one right below it would
 * drop it where it is; opening either would part the page the moment a
 * block is picked up, for a drop that changes nothing (found by measuring a
 * real lift, 2026-10-27).
 *
 * @param blocks - the whole page, read only.
 * @param target - the drag's winning target, as the editor advertises it.
 * @param from - where a canvas move lifted its block from; absent for a
 * palette drag, which has no source.
 * @returns the slot to open, or `null` for no target, a `place`, a
 * non-linear parent, a parent that does not exist, or a drop beside the
 * lifted block's own place.
 */
export function gapSlotFor(
  blocks: readonly (Block | null)[],
  target: DropTarget | null,
  from?: BlockPath,
): GapSlot | null {
  const slot = slotOf(blocks, target);
  if (!slot || !from || !besideItself(slot, from)) return slot;
  return null;
}

/**
 * The slot a target names, before the lifted block is considered.
 *
 * @param blocks - the whole page.
 * @param target - the winning target.
 * @returns the slot, or `null` where no gap opens.
 */
function slotOf(
  blocks: readonly (Block | null)[],
  target: DropTarget | null,
): GapSlot | null {
  if (!target || target.kind === "place") return null;
  const parent = target.path.slice(0, -1);
  if (!isLinearScope(blocks as Block[], parent)) return null;
  if (target.kind === "before") return { path: target.path, edge: "top" };

  const siblings = siblingsAt(blocks, parent);
  const index = target.path.at(-1)!;
  if (index + 1 < siblings.length) {
    return { path: [...parent, index + 1], edge: "top" };
  }
  return { path: target.path, edge: "bottom" };
}

/**
 * Whether a slot is directly above or below the lifted block.
 *
 * @param slot - the slot a target names.
 * @param from - the lifted block's path.
 * @returns true when dropping there would leave the block where it is.
 */
function besideItself(slot: GapSlot, from: BlockPath): boolean {
  const parent = slot.path.slice(0, -1);
  if (
    parent.length !== from.length - 1 ||
    parent.some((step, depth) => step !== from[depth])
  ) {
    return false;
  }
  const index = slot.path.at(-1)!;
  const own = from.at(-1)!;
  if (slot.edge === "bottom") return index === own;
  return index === own || index === own + 1;
}

/**
 * The list a linear parent holds: the page's own, or a container's children.
 *
 * Only ever called once {@link isLinearScope} has answered true, which it
 * does for the page or for an existing container in a linear mode — so the
 * block at a non-empty `parent` IS a container, and no "not a container"
 * branch exists to take (a defensive one was unreachable, and the coverage
 * gate said so, 2026-10-29).
 *
 * @param blocks - the whole page.
 * @param parent - a parent path {@link isLinearScope} accepted.
 * @returns the siblings.
 */
function siblingsAt(
  blocks: readonly (Block | null)[],
  parent: BlockPath,
): readonly (Block | null)[] {
  if (parent.length === 0) return blocks;
  return (blockAt(blocks as Block[], parent) as ContainerBlock).children;
}

/**
 * How tall a gap opens for a carried block of this measured height.
 *
 * @param measured - the carried element's height in CSS pixels.
 * @returns that height rounded and held within
 * [{@link GAP_HEIGHT_MIN}, {@link GAP_HEIGHT_MAX}]; an unmeasured (`NaN`)
 * height answers the floor.
 */
export function gapHeightFor(measured: number): number {
  if (!Number.isFinite(measured)) return GAP_HEIGHT_MIN;
  return Math.min(
    GAP_HEIGHT_MAX,
    Math.max(GAP_HEIGHT_MIN, Math.round(measured)),
  );
}

/**
 * The rectangle a drag decides against: the first one seen for this id.
 *
 * **Why the first one (2026-10-27).** An opening gap grows the block it sits
 * in, and dnd-kit re-measures a droppable whose box resizes, so the page's
 * own animation would reach the collision and move the target, which moves
 * the gap — the loop that refused this design on 2026-09-07. Keeping the
 * first rectangle per drag makes the target a function of the pointer and
 * the page as it was at the lift, nothing else. The kept object is dnd-kit's
 * own `Rect`, whose getters still follow its scroll container, so a scrolled
 * canvas stays right.
 *
 * @param frozen - this drag's kept rectangles, cleared when a drag begins.
 * @param id - the droppable.
 * @param current - what dnd-kit measures for it now, if anything.
 * @returns the kept rectangle, or `current` (now kept) on first sight, or
 * nothing when there is neither.
 */
export function frozenRect<K, R>(
  frozen: Map<K, R>,
  id: K,
  current: R | undefined,
): R | undefined {
  const kept = frozen.get(id);
  if (kept !== undefined) return kept;
  if (current !== undefined) frozen.set(id, current);
  return current;
}

/**
 * How far past its top and bottom a block in a list answers the pointer, in
 * CSS pixels.
 *
 * Siblings in a list sit apart by the page's own gap, and a pointer in that
 * space is inside no block — only the container around them — so the target
 * jumped to "before the whole container" and back as the pointer crossed
 * each gap. With a bar that was a flicker; with a gap that opens it moved
 * the whole section (measured 2026-10-27). Reaching a little way into the
 * space keeps a pointer between two siblings on the gap between them.
 */
export const GAP_REACH = 12;

/** A rectangle's edges, in viewport coordinates. */
export interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** A pointer position, in viewport coordinates. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Whether a point falls on a rectangle stretched up and down by a reach.
 *
 * @param rect - the rectangle, in viewport coordinates.
 * @param point - the pointer.
 * @param above - how far past the top it reaches.
 * @param below - how far past the bottom it reaches.
 * @returns true when the point is within the stretched rectangle; never
 * stretched sideways.
 */
export function reachesPoint(
  rect: Box,
  point: Point,
  above: number,
  below: number,
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top - above &&
    point.y <= rect.bottom + below
  );
}
