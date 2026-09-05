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
