import {
  blockAt,
  mayNest,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import { isContainer, type Block } from "@/features/actors/domain/block-schema";
import type { EditorSelection } from "@/features/actors/domain/editor-selection";

/**
 * The one Add target a given selection implies.
 *
 * **A container's own path is where content is appended INSIDE it. A leaf's
 * parent path is where content is appended AFTER it**, in the sense of
 * "added following it" rather than "spliced at a computed index" — a leaf
 * sits in one positional place, and "after" has no positional meaning for a
 * grid, masonry, carousel, tabs, or accordion parent, where a place is a
 * fixed slot rather than a point in a sequence. For the linear modes
 * (`stack`/`list`/`timeline`) and for the page's own top level, appending to
 * the parent already lands the new block at the end of that same sequence,
 * which is what "after" means in ordinary usage for those modes too — so
 * this one rule serves every mode without a second code path for the linear
 * case.
 */
export interface AddTarget {
  /**
   * Where a chosen block should be added — the container itself, or the page
   * root. Never a leaf's own path; a leaf holds no children.
   */
  readonly targetPath: BlockPath;
  /**
   * Whether a layout option should be offered at this target.
   *
   * `mayNest` is asked of the position a new CHILD of `targetPath` would
   * occupy — one segment longer — never of `targetPath` itself: `targetPath`
   * names where the new block is appended, and the depth cap is about the
   * new block's own depth, one level past its parent.
   */
  readonly mayAddLayout: boolean;
}

/**
 * Resolves the global Add control's target from the current selection.
 *
 * Nothing selected and Page selected both target the page root — the same
 * answer, because the toolbar's Add is only ever asked about ONE target and a
 * deselected canvas has no other candidate to offer. Selecting a container
 * targets that container itself, so a choice is appended inside it; selecting
 * a leaf targets that leaf's own parent, so a choice is appended after it (see
 * this module's own `AddTarget` TSDoc for why "after" and "inside the parent"
 * are the same operation here).
 *
 * @param blocks - the whole page, read to tell a container selection from a
 * leaf one.
 * @param selection - what is currently selected, or nothing.
 * @returns where a chosen block is added, and whether nesting is still
 * possible there.
 */
export function addTargetFor(
  blocks: readonly Block[],
  selection: EditorSelection,
): AddTarget {
  if (!selection || selection.kind === "page") {
    return { targetPath: [], mayAddLayout: mayNest([0]) };
  }
  const target = blockAt(blocks, selection.path);
  const targetPath =
    target && isContainer(target)
      ? selection.path
      : selection.path.slice(0, -1);
  return { targetPath, mayAddLayout: mayNest([...targetPath, 0]) };
}
