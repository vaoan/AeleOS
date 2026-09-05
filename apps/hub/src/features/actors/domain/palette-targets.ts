import { mayNest, type BlockPath } from "@/features/actors/domain/block-edits";
import {
  isContainer,
  type Block,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";

/**
 * What is being dragged from a palette tab: a leaf of a given kind, or a
 * container laid out in a given mode.
 *
 * Deliberately not an already-built {@link Block} — a drag names only the
 * KIND or MODE a caller would hand to `newLeaf`/`newContainer` (both in
 * `domain/block-edits.ts`) once a target is chosen, because every valid
 * target is a fact about the PAGE and must not depend on what content the
 * dragged block would end up carrying.
 */
export type PaletteItem =
  | { readonly kind: "leaf"; readonly leafKind: LeafKind }
  | { readonly kind: "container"; readonly mode: ContainerMode };

/**
 * One place a palette item may be dropped.
 *
 * `path` carries `insertAt`'s own contract (`domain/block-edits.ts`): the
 * LAST segment is the splice index to insert before, in the parent named by
 * every segment before it — or, at length 1, in the page's own top-level
 * array. A caller drops a chosen block by calling `insertAt` directly with
 * `target.path`; this module only answers WHERE, never how.
 */
export interface InsertTarget {
  readonly path: BlockPath;
}

/**
 * Every place a dragged palette item may legally land, computed as one
 * depth-first walk of the page.
 *
 * **Every top-level splice index is offered, whatever `item` is** — `0` to
 * the page's own length, inclusive, since a leaf lands wrapped in a new
 * one-place `stack` on insertion (`wrapLeafOnPage`) and a container is
 * always legal at depth 0 (a path of length 1 always clears
 * {@link mayNest}).
 *
 * **Inside an existing container, every splice index is offered for a LEAF
 * unconditionally** — `0` to that container's own `children.length`,
 * inclusive — **and for a CONTAINER only when {@link mayNest} admits one
 * level deeper than the container's own path**, asked of the position a new
 * CHILD of it would occupy rather than of the container's own path. That
 * mirrors `domain/add-target.ts`'s own convention: the depth cap is a fact
 * about the new block's own depth, one level past whatever it is being
 * added inside, never about the depth of the container already there.
 * Getting this backwards — asking `mayNest` of the container's own path —
 * answers `true` one level too late, admitting a fourth level of nesting the
 * cap exists to refuse.
 *
 * **The walk descends into every container's children regardless of whether
 * that container itself may hold a nested CONTAINER.** The depth cap only
 * ever gates whether a container fits at a given path, never whether a leaf
 * does, so a container sitting at the cap may still have leaves added
 * beside — or inside an even-deeper container that already exists there
 * from before the cap was reached. Stopping the walk at a refused container
 * would silently withhold every valid leaf target beneath it as well.
 *
 * Every target answered is a real splice index into a real array at the
 * moment of the call. Nothing here mutates `blocks` or holds a reference to
 * it past the call.
 *
 * @param blocks - the whole page, read only.
 * @param item - what is being dragged from the palette.
 * @returns every valid {@link InsertTarget}, in the order a depth-first walk
 * visits them: the page's own splice indices first, then each top-level
 * section's own places — and its descendants' — left to right.
 */
export function insertTargetsFor(
  blocks: readonly Block[],
  item: PaletteItem,
): InsertTarget[] {
  const targets: InsertTarget[] = [];
  for (let index = 0; index <= blocks.length; index += 1) {
    targets.push({ path: [index] });
  }
  const walk = (children: readonly (Block | null)[], path: BlockPath): void => {
    for (const [childIndex, child] of children.entries()) {
      if (!child || !isContainer(child)) continue;
      const containerPath = [...path, childIndex];
      if (item.kind === "leaf" || mayNest([...containerPath, 0])) {
        for (let index = 0; index <= child.children.length; index += 1) {
          targets.push({ path: [...containerPath, index] });
        }
      }
      walk(child.children, containerPath);
    }
  };
  walk(blocks, []);
  return targets;
}

/**
 * {@link insertTargetsFor}'s own output, stated under a name that says it
 * is already in drawing order rather than requiring a caller to re-derive
 * that fact.
 *
 * This is a thin, documented alias rather than a second traversal:
 * {@link insertTargetsFor}'s walk is depth-first over `blocks`/`children` in
 * array order, which already IS drawing order — the same guarantee
 * `placeOrder` (`domain/block-drag.ts`) states for its own walk. Calling
 * {@link insertTargetsFor} a second time under a second name would invite a
 * future reader to wonder whether the two could ever disagree; this makes
 * plain that they cannot, because they are the same call.
 *
 * @param blocks - the whole page, read only.
 * @param item - what is being dragged from the palette.
 * @returns every valid {@link InsertTarget}, in the order a depth-first walk
 * visits them — see {@link insertTargetsFor}.
 */
export function orderedInsertTargets(
  blocks: readonly Block[],
  item: PaletteItem,
): InsertTarget[] {
  return insertTargetsFor(blocks, item);
}

/**
 * Whether two block paths name the exact same position.
 *
 * @param a - one path.
 * @param b - the other path.
 * @returns true when every element of `a` equals the element of `b` at the
 * same index, and the two are the same length.
 */
function samePath(a: BlockPath, b: BlockPath): boolean {
  return (
    a.length === b.length && a.every((segment, index) => segment === b[index])
  );
}

/**
 * The target one step along from where a keyboard drag is now, stepping
 * linearly through `order` by array position.
 *
 * **It stops at the ends rather than wrapping**, mirroring `stepPlace`
 * (`domain/block-drag.ts`): a person who presses the arrow key once too
 * many should not be sent back to the far end, which reads as the drag
 * having jumped somewhere on its own.
 *
 * **An absent `current` steps to the first entry going forward, or the
 * last going backward** — so the very first arrow press, before anything
 * is highlighted, always lands somewhere in `order` rather than nowhere.
 *
 * Targets are compared by exact `path` equality (every element equal, the
 * same length) rather than by the prefix-containment `stepPlace` uses
 * through `within`. That comparison exists there to resolve an ambiguity
 * that cannot arise here: every target in `order` is one of the exact
 * positions {@link insertTargetsFor} computed, never a sub-path of one.
 *
 * @param order - the targets, from {@link orderedInsertTargets}.
 * @param current - the target the drag is on now, or nothing if none is
 * highlighted yet.
 * @param forward - whether the step is towards the end of `order`.
 * @returns the next target, or nothing when there is none.
 */
export function stepInsertTarget(
  order: readonly InsertTarget[],
  current: InsertTarget | undefined,
  forward: boolean,
): InsertTarget | undefined {
  if (!current) return forward ? order[0] : order.at(-1);
  const at = order.findIndex((target) => samePath(target.path, current.path));
  return order[at + (forward ? 1 : -1)];
}

/**
 * Steps to the first target belonging to the next (or previous) TOP-LEVEL
 * section, skipping every target nested inside the current one — the
 * palette's "Tab skips a whole section" gesture.
 *
 * Given the current target's own top-level index (`current.path[0]`), this
 * finds the first entry in `order` whose own top-level index is strictly
 * greater (`forward`) or strictly less (`!forward`) than that. Because
 * {@link insertTargetsFor}'s own splice loop emits one entry per top-level
 * index, in ascending order, before its recursive walk ever runs, that
 * match is always a bucket's own top-level splice — never a target nested
 * inside it, whichever direction is stepped.
 *
 * **An absent `current` steps to the first entry going forward, or the
 * last going backward**, matching {@link stepInsertTarget}.
 *
 * **Backward is not forward's mirror across three or more top-level
 * sections.** `order.find` always scans from the start of the array
 * regardless of direction, so forward correctly lands on the very next
 * section (the smallest top-level index exceeding `current`'s can only
 * belong to `current + 1`) — but backward lands on the SMALLEST top-level
 * index less than `current`'s, which is section 0 whenever `current`'s own
 * index is 2 or greater, not the immediately preceding section. Tab and
 * Shift+Tab are therefore not exact inverses on a page of three or more
 * sections. No caller exists yet; whoever wires the keyboard gesture this
 * function is for should decide whether that asymmetry is acceptable or
 * needs a corrected backward search before shipping it.
 *
 * @param order - the targets, from {@link orderedInsertTargets}.
 * @param current - the target the drag is on now, or nothing if none is
 * highlighted yet.
 * @param forward - whether the step is towards the end of `order`.
 * @returns the first target of the next section going forward; the
 * smallest-top-level-index target before `current` going backward, which is
 * only always the previous section when there are at most two sections.
 */
export function stepInsertSection(
  order: readonly InsertTarget[],
  current: InsertTarget | undefined,
  forward: boolean,
): InsertTarget | undefined {
  if (!current) return forward ? order[0] : order.at(-1);
  const index = current.path[0];
  return order.find((target) =>
    forward ? target.path[0] > index : target.path[0] < index,
  );
}
