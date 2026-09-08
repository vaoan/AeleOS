import {
  blockAt,
  insertAt,
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
 * Why a clone did not happen.
 *
 * `too deep` is {@link fitsAt}'s own refusal, carried over from
 * `domain/block-drops.ts` rather than re-derived: a clone lands at the same
 * depth its source occupies, so this can only fire when the source itself
 * was placed there by something other than an ordinary edit (a hand-built
 * fixture, or a page written by a build with a different cap). `too many` is
 * {@link BLOCK_LIMITS.children} for a clone landing inside a container, or
 * {@link BLOCK_LIMITS.blocks} for one landing at the page root — the two caps
 * a real subtree can actually cross.
 */
export type CloneRefusal = "too deep" | "too many";

/**
 * What a clone answers: the new page and where the copy landed, or why there
 * is none.
 *
 * Matches every other domain edit's shape here — {@link CloneRefusal} rather
 * than a thrown error, because a refused clone is an ordinary outcome the
 * person is owed a sentence about, not a fault in the caller.
 */
export type CloneResult =
  | { readonly ok: true; readonly blocks: Block[]; readonly path: BlockPath }
  | { readonly ok: false; readonly reason: CloneRefusal };

/**
 * Duplicates the block at `path` and inserts the copy immediately after it,
 * in the same parent.
 *
 * **The copy lands at the identical depth its source occupies**, because
 * "immediately after, same parent" is a sibling insert and siblings share a
 * path length — `fitsAt` is asked about that same length rather than a
 * deeper one. On any page an ordinary edit could have produced, the source
 * already fits there, so `fitsAt` on the clone can only refuse a subtree that
 * was placed past the cap by something other than this editor (a hand-built
 * fixture, or a page a newer deployment wrote against a raised cap) —
 * `insertAt` still guards the write, this only guards against building
 * something `validate_block` would refuse before the person ever reaches the
 * save.
 *
 * **`too many` is one of two different caps, chosen by where the clone
 * lands.** A clone landing inside a container adds one entry to that
 * container's own `children`, capped at {@link BLOCK_LIMITS.children} — the
 * same number `appendPlace` already refuses past. A clone landing at the page
 * root has no such per-container cap; what it can cross instead is the
 * whole-page {@link BLOCK_LIMITS.blocks} count, which a subtree with
 * descendants of its own can reach in one clone even nowhere near the page's
 * own top-level length.
 *
 * A missing block at `path` is not a refusal — there is nothing to clone —
 * and this answers the page unchanged, by identity, matching every other
 * domain edit's no-op convention.
 *
 * @param blocks - the whole page.
 * @param path - the block to duplicate.
 * @returns the new page and the copy's path, or why nothing was cloned.
 */
export function cloneAt(
  blocks: readonly Block[],
  path: BlockPath,
): CloneResult {
  const held = blockAt(blocks, path);
  if (!held) return { ok: true, blocks: blocks as Block[], path };

  const parentPath = path.slice(0, -1);
  const destination = [...parentPath, path.at(-1)! + 1];

  if (!fitsAt(held, destination)) return { ok: false, reason: "too deep" };

  const addedBlocks = 1 + (isContainer(held) ? countBlocks(held.children) : 0);
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

  return {
    ok: true,
    blocks: insertAt(blocks, destination, held),
    path: destination,
  };
}
