import {
  blockAt,
  insertAt,
  newContainer,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import { fitsAt } from "@/features/actors/domain/block-drops";
import {
  BLOCK_LIMITS,
  countBlocks,
  isContainer,
  type Block,
} from "@/features/actors/domain/block-schema";

/**
 * Why a palette drop was refused.
 *
 * Mirrors `domain/block-drops.ts`'s `DropRefusal` shape, and
 * `domain/block-clone.ts`'s `CloneRefusal` beside it: `too deep` is
 * {@link fitsAt}'s own refusal, `too many` is one of the two caps
 * {@link BLOCK_LIMITS} names, chosen by where the block would land.
 */
export type InsertRefusal = "too deep" | "too many";

/**
 * What inserting a freshly-built palette block answers: the new page and
 * where it landed, or why it did not.
 *
 * Matches every other domain edit's shape here — a refusal rather than a
 * thrown error, because a refused drop is an ordinary outcome the person is
 * owed a sentence about, not a fault in the caller.
 */
export type InsertResult =
  | { readonly ok: true; readonly blocks: Block[]; readonly path: BlockPath }
  | { readonly ok: false; readonly reason: InsertRefusal };

/**
 * Inserts a freshly-built block — a leaf or a container a palette drag just
 * created — at `path`, and answers the new page.
 *
 * **A leaf landing at a top-level index is wrapped in a new one-place
 * `stack` first**, mirroring `wrapLeafOnPage`'s own wrap
 * (`domain/block-edits.ts`) but at an arbitrary splice index rather than
 * always appended — depth 0 holds containers only, so a bare leaf spliced
 * directly into the page's own array would be a tree `validate_block`
 * refuses. `cloneAt` (`domain/block-clone.ts`) never has to do this: its
 * source is always whatever already exists at the page root, which is
 * always a container. A palette drop has no such guarantee, since the
 * dragged item names only a kind or a mode, never a block that is already
 * sitting somewhere on the page.
 *
 * **`fitsAt` is asked with `path` directly, unlike `cloneAt`'s
 * `fitsAt(held, destination)`** — a palette drop's target path IS the
 * destination, with no separate "where the source currently sits" to
 * translate from.
 *
 * **This refuses independently of whatever computed `path`.** A target
 * `insertTargetsFor` (`domain/palette-targets.ts`) offered a moment earlier
 * can go stale if the page changed in between — this asks the depth cap and
 * the block-count caps itself rather than trusting the caller to have asked
 * them first.
 *
 * @param blocks - the whole page.
 * @param path - where to insert, in `insertAt`'s own splice-index shape: the
 * last segment is the index to insert before, in the parent named by every
 * segment before it, or in the page's own top-level array at length 1.
 * @param block - the freshly built leaf or container to insert.
 * @returns the new page and the path it landed at, or why it did not land.
 */
export function insertBlockAt(
  blocks: readonly Block[],
  path: BlockPath,
  block: Block,
): InsertResult {
  const parentPath = path.slice(0, -1);
  const toInsert: Block =
    parentPath.length === 0 && !isContainer(block)
      ? { ...newContainer("stack", 1), children: [block] }
      : block;

  if (!fitsAt(toInsert, path)) return { ok: false, reason: "too deep" };

  const addedBlocks =
    1 + (isContainer(toInsert) ? countBlocks(toInsert.children) : 0);
  if (parentPath.length === 0) {
    if (countBlocks(blocks) + addedBlocks > BLOCK_LIMITS.blocks) {
      return { ok: false, reason: "too many" };
    }
  } else {
    const parent = blockAt(blocks, parentPath);
    if (
      parent &&
      isContainer(parent) &&
      parent.children.length >= BLOCK_LIMITS.children
    ) {
      return { ok: false, reason: "too many" };
    }
  }

  return { ok: true, blocks: insertAt(blocks, path, toInsert), path };
}
