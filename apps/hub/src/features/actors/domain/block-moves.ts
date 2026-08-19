import {
  clearAt,
  moveSection,
  setAt,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import {
  MAX_DEPTH,
  isContainer,
  type Block,
} from "@/features/actors/domain/block-schema";

/**
 * Why a move did not happen.
 *
 * **A refusal is not a no-op, and the difference is the whole reason this is a
 * value rather than a returned tree.** A drag that changes nothing has to be
 * explicable to the person who made it — "that would put a section inside
 * itself", "that is one level too deep" — and a function answering the
 * unchanged tree for both would leave the drag layer nothing to say. It is
 * also why neither of these throws: refusing a drop is an ordinary outcome of
 * dragging, not a fault in the caller.
 *
 * `too deep` is the same rule `validate_block` in `0009` enforces on the write
 * and the same one `mayNest` offers the editor before it draws a control. A
 * drop is neither of those moments — the block already exists and is arriving
 * somewhere new — so it is stated here too rather than left to the save.
 */
export type MoveRefusal = "no such place" | "into itself" | "too deep";

/**
 * What a move answers: the new page, or why there is none.
 *
 * **A move that changes nothing still succeeds**, and answers the very array
 * it was given — see {@link moveBlock}. So `ok` separates "this drop is
 * impossible" from "this drop landed where it started", which look identical
 * in the tree and are entirely different to a person.
 */
export type BlockMove =
  | { readonly ok: true; readonly blocks: Block[] }
  | { readonly ok: false; readonly refusal: MoveRefusal };

/**
 * A place a path was walked to, and what it holds.
 *
 * Wrapped rather than answered as `Block | null | undefined`, because the two
 * absences are different answers and collapsing them makes the distinction a
 * `=== undefined` somebody has to remember. A place holding `null` exists: it
 * is a legal target — that is the whole model — and a legal source too, since
 * exchanging with one is how a block is moved rather than swapped.
 */
type Place = { readonly held: Block | null };

/**
 * The place a path names, or nothing when it names none.
 *
 * A path names a place when every index but the last resolves to a container
 * that is really there, and the last is within that container's own places.
 * The empty path, a negative index, an index past the end, a walk through a
 * leaf and a walk through a place holding nothing all answer nothing.
 *
 * **That strictness is what keeps a stale path from growing holes in the
 * tree.** `setAt` writes at whatever index it is handed, and an index past the
 * end of an array extends it with holes — which is not a page any renderer or
 * schema has a shape for. A drag layer holding a path across a re-render is
 * exactly how one arrives.
 *
 * @param blocks - the whole page.
 * @param path - the path to walk.
 * @returns the place, or nothing when the path names none.
 */
function placeAt(blocks: readonly Block[], path: BlockPath): Place | undefined {
  let entries: readonly (Block | null)[] = blocks;
  for (const [step, index] of path.entries()) {
    // `in` rather than a pair of bounds comparisons: it answers false for a
    // negative index, for one past the end and for a hole alike, so the walk
    // has one refusal to test rather than three that mean the same thing.
    if (!(index in entries)) return undefined;
    // Present, and possibly `null` — which is a place holding nothing rather
    // than no place. A non-null assertion would strip that along with the
    // absence the index signature warns about, so this widens instead.
    const held = entries[index] as Block | null;
    if (step === path.length - 1) return { held };
    if (!held || !isContainer(held)) return undefined;
    entries = held.children;
  }
  return undefined;
}

/**
 * How many levels a subtree needs beneath wherever it is put.
 *
 * Counted so the answer adds to a target's own depth and compares against
 * {@link MAX_DEPTH} directly: a leaf needs none, a container needs one for
 * itself, and a container holding a container needs two.
 *
 * **A container counts a level for itself even when every one of its places is
 * empty**, and that is the subtlety the cap turns on rather than a detail of
 * it: the deepest level admits a leaf and refuses a container, so measuring
 * both by the blocks they carry would let an empty container sit one level too
 * far and be refused only once somebody put something in it.
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
 * Whether what a place holds may be put in the place a path names.
 *
 * Depth is the path's length less one, so the deepest block the subtree
 * carries lands at that depth plus its {@link reach}.
 *
 * **Nothing always fits.** An empty place carries no depth of its own, so an
 * exchange with one is bounded by the occupied side alone.
 *
 * @param held - what is being put there, which may be nothing.
 * @param path - where it is going.
 * @returns true when every block in it stays within the cap.
 */
function fitsAt(held: Block | null, path: BlockPath): boolean {
  return held === null || path.length - 1 + reach(held) <= MAX_DEPTH;
}

/**
 * The page with one place made to hold something, or nothing.
 *
 * **Putting nothing in a SECTION's place removes the section**, because the
 * page's own list holds no empty entries — there is nothing above a section to
 * keep room in. That is `clearAt`'s ruling, deferred to rather than restated.
 *
 * @param blocks - the whole page.
 * @param path - the place to write.
 * @param held - what it holds afterwards.
 * @returns the new page.
 */
function writePlace(
  blocks: readonly Block[],
  path: BlockPath,
  held: Block | null,
): Block[] {
  return held === null ? clearAt(blocks, path) : setAt(blocks, path, held);
}

/**
 * Whether writing this into that place shortens the page's own list.
 *
 * The one write here that changes a list's LENGTH, and therefore the one that
 * has to happen last: emptying a section's place removes the section, and
 * every section after it moves up. Doing that first would leave the other half
 * of an exchange writing to an index that had since moved.
 *
 * @param path - the place being written.
 * @param held - what it holds afterwards.
 * @returns true when the write removes a section.
 */
function removesSection(path: BlockPath, held: Block | null): boolean {
  return held === null && path.length === 1;
}

/**
 * Whether a path runs through another, every index of the shorter matching.
 *
 * @param prefix - the path that may be the outer one.
 * @param path - the path that may run through it.
 * @returns true when `path` starts with `prefix`.
 */
function runsThrough(prefix: BlockPath, path: BlockPath): boolean {
  return prefix.every((index, step) => index === path[step]);
}

/**
 * Whether two paths name the same place.
 *
 * @param one - a path.
 * @param other - the other.
 * @returns true when they are the same place.
 */
function samePlace(one: BlockPath, other: BlockPath): boolean {
  return one.length === other.length && runsThrough(one, other);
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
 * The page with one place's contents exchanged with another's.
 *
 * **This is the whole of what a drag means in a model of places**, and the
 * three rules it reads as are one operation rather than three:
 *
 *  * **Onto an empty place it is a move** — the source place is left empty and
 *    keeps its width. Positions are the model, so a section must not close up
 *    around what left it.
 *  * **Onto an occupied place it is a swap** — exactly two things change and
 *    nothing else moves. Insert-and-shift is deliberately refused inside a
 *    section: it would close the empty places somebody left on purpose, and
 *    could push a block across a row boundary into a shape they did not
 *    choose. The ruling, with its reasoning, is in
 *    `2026-08-18-dragging-design.md` §1.
 *  * **Between two sections it is an ordinary list reorder** — a shift, because
 *    the page's own list holds no empty entries to disturb. `moveSection` is
 *    what does it.
 *
 * A section arriving in a place, and a block leaving one for the top level,
 * are the same exchange: the page's list cannot hold an empty entry, so a
 * section whose place is taken by nothing is removed and the sections after it
 * move up. **A leaf can therefore reach depth 0**, which is not a hole in the
 * model — the schema admits a leaf at the top and `block-editor.tsx` already
 * draws one, on the reasoning that content it could not show would be content
 * nobody can read or remove while every save kept writing it back.
 *
 * **A place onto itself succeeds and answers the very array it was given**, so
 * a caller may compare by identity and skip the write. It is the commonest
 * outcome of dragging — a lift dropped where it started — and it is a success
 * rather than a refusal, because nothing about it needs explaining to anybody.
 *
 * @param blocks - the whole page.
 * @param from - the place the block is leaving.
 * @param to - the place it is arriving at.
 * @returns the new page, or why there is none.
 */
export function moveBlock(
  blocks: readonly Block[],
  from: BlockPath,
  to: BlockPath,
): BlockMove {
  const source = placeAt(blocks, from);
  const target = placeAt(blocks, to);
  if (!source || !target) return { ok: false, refusal: "no such place" };
  if (samePlace(from, to)) return { ok: true, blocks: blocks as Block[] };
  // **Both directions, and the second is the one that is easy to miss.** An
  // exchange moves the target as well, so dropping a block onto its own
  // ancestor would put that ancestor in a place inside itself just as surely
  // as the other way round. The model's own reason is simpler than the storage
  // one: a place inside the moved block travels WITH it, so once the move is
  // done there is no such place to have arrived at.
  if (isInside(from, to) || isInside(to, from)) {
    return { ok: false, refusal: "into itself" };
  }
  if (from.length === 1 && to.length === 1) {
    return { ok: true, blocks: moveSection(blocks, from[0]!, to[0]!) };
  }
  if (!fitsAt(source.held, to) || !fitsAt(target.held, from)) {
    return { ok: false, refusal: "too deep" };
  }
  // The removing write goes last — see {@link removesSection}. At most one of
  // the two can remove, because a section's place never holds nothing.
  return {
    ok: true,
    blocks: removesSection(to, source.held)
      ? writePlace(writePlace(blocks, from, target.held), to, source.held)
      : writePlace(writePlace(blocks, to, source.held), from, target.held),
  };
}
