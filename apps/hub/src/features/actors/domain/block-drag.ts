import type { BlockPath } from "@/features/actors/domain/block-edits";
import { isContainer, type Block } from "@/features/actors/domain/block-schema";

/**
 * What every drag id starts with.
 *
 * A prefix rather than a bare path, because a drag library's id space is
 * global and a bare `"0.1"` would collide with anything else that decided a
 * number was a good id. It is also what lets {@link placePath} refuse an id
 * that belongs to something else rather than parsing it into a plausible,
 * wrong place.
 */
const PLACE_PREFIX = "place:";

/**
 * What one segment of a path may be: digits, and nothing else.
 *
 * So a sign, whitespace and an empty segment all refuse. **Not a decimal
 * point** — a `.` is the separator, so `place:1.5` is the path `[1, 5]` rather
 * than a fractional index, and there is no reading under which it is
 * ambiguous. That claim was written here as a guard once and was simply not
 * one; `block-drag.test.ts` keeps the case that corrected it.
 */
const INDEX = /^\d+$/;

/**
 * The drag id naming a place.
 *
 * **One id for both halves.** The place is a drop target and whatever sits in
 * it is the thing dragged, so a single id names them both and `active.id` and
 * `over.id` are read back with the same function. A block carries no identity
 * but where it sits — the reasoning `PublicBlocks` and `seatsOf` already
 * state — so there is no generated key to use instead.
 *
 * @param path - the place.
 * @returns its drag id.
 */
export function placeId(path: BlockPath): string {
  return PLACE_PREFIX + path.join(".");
}

/**
 * The place a drag id names, or nothing when it names none.
 *
 * **It refuses rather than repairs**, for the reason `placeAt` in
 * `block-moves.ts` refuses a path: an id that is nearly a path is an id from
 * somewhere else, and turning it into a place would move a block to a
 * position nobody pointed at. Every segment must be digits alone, so `-1`,
 * `+1`, a letter, an empty segment and a trailing dot all answer nothing.
 *
 * **`place:1.5` is the path `[1, 5]` and not a refusal**, which reads as a
 * gap and is not one: `.` is the separator, so there is no fractional index
 * for this to be lenient about. An earlier draft of this comment claimed
 * otherwise, and the case that corrected it is kept in `block-drag.test.ts`
 * rather than deleted.
 *
 * @param id - the drag id.
 * @returns the place, or nothing.
 */
export function placePath(id: string): BlockPath | undefined {
  if (!id.startsWith(PLACE_PREFIX)) return undefined;
  const parts = id.slice(PLACE_PREFIX.length).split(".");
  if (!parts.every((part) => INDEX.test(part))) return undefined;
  return parts.map(Number);
}

/**
 * How a place reads to a person, one-based.
 *
 * Announced rather than shown, so it is deliberately not a translated
 * sentence: `1.2.3` is the third place of the second place of the first
 * section, and the digits say that in every language this app speaks. The
 * words around it come from the catalogue; the position does not, because a
 * position is a number.
 *
 * @param path - the place.
 * @returns its one-based designation.
 */
export function placeName(path: BlockPath): string {
  return path.map((index) => index + 1).join(".");
}

/**
 * A rectangle a drag library measured, in the space it reports pointers in.
 *
 * **That space is the VIEWPORT, not the document**, and this said otherwise
 * for a phase. dnd-kit measures every drop target with
 * `getBoundingClientRect` and reports `pointerCoordinates` in client
 * coordinates, so both sides of {@link contains} are viewport-relative and it
 * is correct precisely because it mirrors the library's own
 * `isPointWithinRect`. The distinction is not academic: it is what
 * `block-drag.spec.ts` reasons about when it chooses a
 * viewport tall enough that nothing scrolls, and a drag on a page longer than
 * the viewport — where dnd-kit's own auto-scroll moves the document under
 * rectangles measured before it — is still covered by nothing.
 */
interface PlaceRect {
  /** Distance from the top of the viewport. */
  readonly top: number;
  /** Distance from the left of the viewport. */
  readonly left: number;
  /** How wide it is. */
  readonly width: number;
  /** How tall it is. */
  readonly height: number;
}

/** A place a drop could land on, as the drag library reports it. */
export interface PlaceCandidate {
  /** Its drag id, handed straight back to the library. */
  readonly id: string;
  /** Where it sits in the page. */
  readonly path: BlockPath;
  /** Where it sits on screen. */
  readonly rect: PlaceRect;
}

/**
 * Whether a top-level entry is a target for the thing being dragged.
 *
 * **The one ruling this module exists to make.** `moveBlock` exchanges two
 * places, and two paths of length one are the case it shifts instead — so a
 * NESTED block resolved onto a section's own path would swap with the whole
 * section, putting the section in the place the block left and the block at
 * the top of the page. That is a legal move and it is not the one anybody
 * dragging a piece of content between two sections meant.
 *
 * So the top level is a plane of its own: an entry there may be dropped onto
 * another entry (a shift) or into any place (an exchange), and something from
 * inside a section may only be dropped into a place. A nested block hovering a
 * section's own chrome therefore resolves to nothing at all, which is the
 * deliberate answer rather than a gap — nothing lights up, and the drop
 * changes nothing.
 *
 * @param from - where the drag started.
 * @param to - the place being considered.
 * @returns true when that place is a target for this drag.
 */
function samePlane(from: BlockPath, to: BlockPath): boolean {
  return to.length > 1 || from.length === 1;
}

/**
 * Whether a point falls inside a rectangle.
 *
 * @param rect - the rectangle.
 * @param x - the point's distance from the left.
 * @param y - the point's distance from the top.
 * @returns true when the point is within it.
 */
function contains(rect: PlaceRect, x: number, y: number): boolean {
  return (
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height
  );
}

/**
 * The place under the pointer, out of everything the library is measuring.
 *
 * **The DEEPEST containing place wins, and that is the whole of the nesting
 * problem.** Places nest — a section's rectangle encloses its places, and each
 * of those encloses whatever is inside it — so every enclosing place contains
 * the pointer too. A collision function that ranks by distance to a
 * rectangle's centre resolves a hovered container to a leaf inside it, which
 * is the failure the spike hit on its first run and which fails silently:
 * the drop lands one level in, and nothing says so.
 *
 * Ranking by path length instead is what makes it depth-independent. It is not
 * a two-level special case that a third level breaks; it is the observation
 * that "innermost" and "longest path" are the same fact, at any depth.
 *
 * **Nothing is excluded for being impossible.** A container dragged over one
 * of its own descendants is a candidate, because it genuinely is under the
 * pointer and `moveBlock` refuses it with a sentence somebody can read — which
 * is more use than a target that quietly declines to light up. The one thing
 * excluded is the other plane; see {@link samePlane}.
 *
 * @param candidates - every place the library is measuring.
 * @param x - the pointer's distance from the left.
 * @param y - the pointer's distance from the top.
 * @param from - where the drag started.
 * @returns the place under the pointer, or nothing.
 */
export function placeUnderPointer(
  candidates: readonly PlaceCandidate[],
  x: number,
  y: number,
  from: BlockPath,
): PlaceCandidate | undefined {
  let best: PlaceCandidate | undefined;
  for (const candidate of candidates) {
    if (!samePlane(from, candidate.path)) continue;
    if (!contains(candidate.rect, x, y)) continue;
    if (!best || candidate.path.length > best.path.length) best = candidate;
  }
  return best;
}

/**
 * Whether a place sits inside another, or is it.
 *
 * @param outer - the place that may enclose.
 * @param inner - the place that may be enclosed.
 * @returns true when `inner` is `outer` or somewhere beneath it.
 */
function within(outer: BlockPath, inner: BlockPath): boolean {
  return (
    outer.length <= inner.length &&
    outer.every((index, step) => index === inner[step])
  );
}

/**
 * Every place a keyboard drag may step to, in the order they are drawn.
 *
 * **A keyboard drag walks a list; a mouse drag reads geometry.** They differ
 * on purpose, and the difference is what each one can do: a pointer cannot
 * avoid the places inside the block it is carrying — they are under it — while
 * a list can simply not offer them, so arrowing out of a section never lands
 * inside the very thing being moved. That also keeps an ordinary section
 * reorder working the way somebody expects: the step after section one is
 * section two, not section one's first place.
 *
 * Order is a depth-first walk, which is the order the editor draws them in, so
 * "next" on the screen and "next" in this list are the same thing.
 *
 * @param blocks - the whole page.
 * @param from - where the drag started; its own subtree is left out.
 * @returns the places, in drawing order.
 */
export function placeOrder(
  blocks: readonly Block[],
  from: BlockPath,
): BlockPath[] {
  const places: BlockPath[] = [];
  /**
   * Adds one place and, when it holds a container, everything inside it.
   *
   * @param block - what is in the place, which may be nothing.
   * @param path - the place itself.
   */
  const walk = (block: Block | null, path: BlockPath): void => {
    const skip = within(from, path) && path.length > from.length;
    if (!skip && samePlane(from, path)) places.push(path);
    if (skip || !block || !isContainer(block)) return;
    for (const [index, child] of block.children.entries()) {
      walk(child, [...path, index]);
    }
  };
  for (const [index, block] of blocks.entries()) walk(block, [index]);
  return places;
}

/**
 * The place one step along from where a keyboard drag is now.
 *
 * **It stops at the ends rather than wrapping.** A list that wraps sends a
 * person who pressed the down arrow once too often back to the top of the
 * page, which reads as the drag having jumped somewhere on its own.
 *
 * @param order - the places, from {@link placeOrder}.
 * @param current - where the drag is now.
 * @param forward - whether the step is towards the end.
 * @returns the next place, or nothing when there is none.
 */
export function stepPlace(
  order: readonly BlockPath[],
  current: BlockPath,
  forward: boolean,
): BlockPath | undefined {
  const at = order.findIndex(
    (path) => path.length === current.length && within(path, current),
  );
  if (at === -1) return order[0];
  return order[at + (forward ? 1 : -1)];
}
