import {
  blockAt,
  clearAt,
  insertAt,
  removeAt,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import { areSiblingPaths } from "@/features/actors/domain/editor-selection";
import {
  moveBlock,
  type MoveRefusal,
} from "@/features/actors/domain/block-moves";
import {
  BLOCK_LIMITS,
  MAX_DEPTH,
  isContainer,
  type Block,
  type ContainerMode,
} from "@/features/actors/domain/block-schema";

/**
 * Arrangements whose children are a sequence, not a set of kept places.
 *
 * **Carrd inserts before or after in a sequence.** `stack`, `list` and
 * `timeline` are that sequence: dropping between two siblings shifts the rest.
 * The page's own list is the same rule and is not a mode. Positional modes
 * (`grid` and the rest) keep {@link moveBlock}'s empty-move / occupied-swap.
 *
 * A `Set` rather than a list of comparisons so a mode added here is one
 * membership test, and an unknown stored mode is positional — the safer
 * default, because shifting a grid's empty places is the fault
 * `2026-08-18-dragging-design.md` exists to forbid.
 */
export const LINEAR_MODES: ReadonlySet<string> = new Set<ContainerMode>([
  "stack",
  "list",
  "timeline",
]);

/**
 * Where a dragged block is aiming.
 *
 * `before` / `after` name an existing sibling (the insertion bar). `place`
 * names a positional slot and is {@link moveBlock} unchanged.
 */
export type DropTarget =
  | { readonly kind: "before"; readonly path: BlockPath }
  | { readonly kind: "after"; readonly path: BlockPath }
  | { readonly kind: "place"; readonly path: BlockPath };

/**
 * Why a drop did not happen.
 *
 * `too many` is the children cap {@link BLOCK_LIMITS.children} — a linear
 * insert that would grow a list past what the database accepts. The other
 * three are {@link MoveRefusal}.
 */
export type DropRefusal = MoveRefusal | "too many";

/**
 * What a drop answers: the new page and where the moved block now sits, or
 * why there is none.
 *
 * **The destination path is part of the success**, because a linear insert
 * changes the moved block's index and the editor must keep it selected. A
 * caller that guessed `to` would re-select a neighbour.
 */
export type BlockDrop =
  | { readonly ok: true; readonly blocks: Block[]; readonly path: BlockPath }
  | { readonly ok: false; readonly refusal: DropRefusal };

/**
 * Whether this parent lays a sequence that shifts on insert.
 *
 * The empty path is the page. A missing parent is not linear.
 *
 * @param blocks - the whole page.
 * @param parentPath - the container, or empty for the page.
 * @returns true when before/after insertion applies there.
 */
export function isLinearScope(
  blocks: readonly Block[],
  parentPath: BlockPath,
): boolean {
  if (parentPath.length === 0) return true;
  const parent = blockAt(blocks, parentPath);
  return Boolean(
    parent && isContainer(parent) && LINEAR_MODES.has(parent.mode),
  );
}

/**
 * The drop a sibling hover should mean.
 *
 * **Linear lists convert an `over` index into a before/after bar** so dragging
 * down onto a later sibling inserts after it (a shift), and dragging up
 * inserts before it. Positional siblings stay a {@link DropTarget} `place`,
 * which is still a swap or a move-into-empty.
 *
 * Cross-parent paths answer null — the caller already has
 * {@link areSiblingPaths} at the sensor, and this repeats that so a stale
 * `over` cannot become a linear insert into another container.
 *
 * @param blocks - the whole page.
 * @param from - the lifted sibling.
 * @param to - the sibling under the pointer.
 * @returns the target, or nothing when the paths are not siblings.
 */
export function dropTargetForSibling(
  blocks: readonly Block[],
  from: BlockPath,
  to: BlockPath,
): DropTarget | null {
  if (!areSiblingPaths(from, to)) return null;
  const parent = from.slice(0, -1);
  if (!isLinearScope(blocks, parent)) return { kind: "place", path: to };
  const fromIndex = from.at(-1)!;
  const toIndex = to.at(-1)!;
  if (fromIndex < toIndex) return { kind: "after", path: to };
  return { kind: "before", path: to };
}

/**
 * Applies {@link applyDrop} to a sibling hover, or answers null when the
 * paths are not siblings.
 *
 * The inspector and (later) the canvas both resolve an `over` id to a sibling
 * path; this is the one conversion so those two cannot disagree about what a
 * hover on a later stack item means.
 *
 * @param blocks - the whole page.
 * @param from - the lifted sibling.
 * @param to - the sibling under the pointer.
 * @returns the drop, or nothing when the paths cross parents.
 */
export function applySiblingDrop(
  blocks: readonly Block[],
  from: BlockPath,
  to: BlockPath,
): BlockDrop | null {
  const target = dropTargetForSibling(blocks, from, to);
  return target ? applyDrop(blocks, from, target) : null;
}

/**
 * How many levels a subtree needs beneath wherever it is put.
 *
 * Same rule as `reach` in `block-moves.ts`: a container counts itself even
 * when every place is empty, so the deepest level still refuses a container.
 *
 * @param block - the subtree.
 * @returns the levels it needs.
 */
function reach(block: Block): number {
  if (!isContainer(block)) return 0;
  return (
    1 +
    Math.max(0, ...block.children.map((child) => (child ? reach(child) : 0)))
  );
}

/**
 * Whether the subtree fits at this destination path.
 *
 * @param held - what is being put there.
 * @param path - where it would sit.
 * @returns true when every block in it stays within {@link MAX_DEPTH}.
 */
function fitsAt(held: Block, path: BlockPath): boolean {
  return path.length - 1 + reach(held) <= MAX_DEPTH;
}

/**
 * Whether `path` starts with `prefix`.
 *
 * @param prefix - the outer path.
 * @param path - the path that may run through it.
 * @returns true when every index of `prefix` matches.
 */
function runsThrough(prefix: BlockPath, path: BlockPath): boolean {
  return prefix.every((index, step) => index === path[step]);
}

/**
 * Whether one place is inside another.
 *
 * @param outer - the place that may enclose.
 * @param inner - the place that may be enclosed.
 * @returns true when `inner` sits somewhere beneath `outer`.
 */
function isInside(outer: BlockPath, inner: BlockPath): boolean {
  return outer.length < inner.length && runsThrough(outer, inner);
}

/**
 * Whether a path names a place that currently exists, empty or not.
 *
 * Distinct from {@link blockAt} answering null, which is both "empty" and
 * "missing". A stale drag produces missing.
 *
 * @param blocks - the whole page.
 * @param path - the place.
 * @returns true when the index is in that list.
 */
function placeExists(blocks: readonly Block[], path: BlockPath): boolean {
  if (path.length === 0) return false;
  const [head, ...rest] = path;
  if (head! < 0) return false;
  if (rest.length === 0) return head in blocks;
  const parent = blockAt(blocks, path.slice(0, -1));
  if (!parent || !isContainer(parent)) return false;
  return path.at(-1)! in parent.children;
}

/**
 * The number of entries in a linear (or page) list.
 *
 * @param blocks - the whole page.
 * @param parentPath - the container, or empty for the page.
 * @returns the length, or nothing when the parent is missing.
 */
function listLength(
  blocks: readonly Block[],
  parentPath: BlockPath,
): number | undefined {
  if (parentPath.length === 0) return blocks.length;
  const parent = blockAt(blocks, parentPath);
  if (!parent || !isContainer(parent)) return undefined;
  return parent.children.length;
}

/**
 * The page with a dragged block landed, or why not.
 *
 * **`place` is {@link moveBlock}.** Linear `before` / `after` splice the
 * source out of a sequence and in at the insertion index. Leaving a
 * positional parent still uses {@link clearAt} so the hole keeps its width.
 *
 * A drop onto the bar of the block itself (before it, or after it) succeeds
 * and answers the given array by identity.
 *
 * @param blocks - the whole page.
 * @param from - the place the block is leaving.
 * @param target - the insertion bar or positional place.
 * @returns the new page and the moved block's path, or a refusal.
 */
export function applyDrop(
  blocks: readonly Block[],
  from: BlockPath,
  target: DropTarget,
): BlockDrop {
  if (target.kind === "place") {
    const moved = moveBlock(blocks, from, target.path);
    if (!moved.ok) return moved;
    return { ok: true, blocks: moved.blocks, path: target.path };
  }
  return applyLinearDrop(blocks, from, target);
}

/**
 * Applies the shifting half of {@link applyDrop}.
 *
 * Kept apart from positional exchange so the two models cannot accidentally
 * share source-removal or destination-index adjustments.
 *
 * @param blocks - the whole page.
 * @param from - the place the block is leaving.
 * @param target - the insertion bar.
 * @returns the shifted page and destination, or a refusal.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- linear movement necessarily validates source, destination, ancestry, depth, capacity, same-parent indexing, and cross-parent index repair in one ordered transaction
function applyLinearDrop(
  blocks: readonly Block[],
  from: BlockPath,
  target: Exclude<DropTarget, { readonly kind: "place" }>,
): BlockDrop {
  if (!placeExists(blocks, from) || !placeExists(blocks, target.path)) {
    return { ok: false, refusal: "no such place" };
  }

  const held = blockAt(blocks, from);
  if (!held) return { ok: false, refusal: "no such place" };

  const destParent = target.path.slice(0, -1);
  const destIndex = target.path.at(-1)!;
  const fromIndex = from.at(-1)!;
  if (!isLinearScope(blocks, destParent)) {
    return { ok: false, refusal: "no such place" };
  }

  const insert = target.kind === "before" ? destIndex : destIndex + 1;
  const destPath = [...destParent, insert];

  if (isInside(from, target.path) || isInside(from, destPath)) {
    return { ok: false, refusal: "into itself" };
  }
  if (!fitsAt(held, destPath)) return { ok: false, refusal: "too deep" };

  const fromParent = from.slice(0, -1);
  const sameParent =
    fromParent.length === destParent.length &&
    runsThrough(fromParent, destParent);

  if (sameParent && (fromIndex === insert || fromIndex + 1 === insert)) {
    return { ok: true, blocks: blocks as Block[], path: from };
  }

  const destLength = listLength(blocks, destParent);
  if (destLength === undefined) return { ok: false, refusal: "no such place" };

  if (
    !sameParent &&
    destParent.length > 0 &&
    destLength + 1 > BLOCK_LIMITS.children
  ) {
    return { ok: false, refusal: "too many" };
  }

  if (sameParent) {
    const removed = removeAt(blocks, from);
    const nextIndex = fromIndex < insert ? insert - 1 : insert;
    return {
      ok: true,
      blocks: insertAt(removed, [...fromParent, nextIndex], held),
      path: [...fromParent, nextIndex],
    };
  }

  const taken =
    fromParent.length === 0 || isLinearScope(blocks, fromParent)
      ? removeAt(blocks, from)
      : clearAt(blocks, from);

  let parent = destParent;
  let nextIndex = insert;
  if (from.length === 1 && parent.length > 0 && fromIndex < parent[0]!) {
    parent = [parent[0]! - 1, ...parent.slice(1)];
  } else if (from.length === 1 && parent.length === 0 && fromIndex < insert) {
    nextIndex = insert - 1;
  }

  const nextLength = listLength(taken, parent);
  if (nextLength === undefined) return { ok: false, refusal: "no such place" };
  if (parent.length > 0 && nextLength >= BLOCK_LIMITS.children) {
    return { ok: false, refusal: "too many" };
  }

  return {
    ok: true,
    blocks: insertAt(taken, [...parent, nextIndex], held),
    path: [...parent, nextIndex],
  };
}
