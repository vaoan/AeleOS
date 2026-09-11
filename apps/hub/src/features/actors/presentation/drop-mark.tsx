import type { ReactNode } from "react";
import type { DropTarget } from "@/features/actors/domain/block-drops";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link DropMark} needs. */
export interface DropMarkProps {
  /** Which landing this marks — a gap above, a gap below, or the place. */
  readonly kind: DropTarget["kind"];
  /**
   * How tall the carried block is, in pixels, or `null` when nothing can be
   * measured — which is every palette drag, since the block being added does
   * not exist yet and has no height to read.
   */
  readonly height: number | null;
}

/** Where each kind sits relative to the block that hosts it. */
const PLACEMENT: Record<DropTarget["kind"], string> = {
  before: "inset-x-0 top-0 -translate-y-1/2",
  after: "inset-x-0 bottom-0 translate-y-1/2",
  place: "inset-0",
};

/** The test id each kind carries. */
const MARK_ID: Record<DropTarget["kind"], string> = {
  before: "canvas-drop-before",
  after: "canvas-drop-after",
  place: "canvas-drop-place",
};

/**
 * The one mark drawn for a landing, for both drag kinds.
 *
 * **It is a ghost of the space the block will occupy, drawn OUT OF FLOW.**
 * Absolutely positioned and `pointer-events-none`, so the canvas never
 * reflows while a drag is in progress — `@dnd-kit` caches every droppable's
 * rectangle when a drag begins, and a page that moves underneath those
 * rectangles makes the collision answer about where things WERE. Letting the
 * gap genuinely open was weighed and refused for exactly that reason; see the
 * design's §4.
 *
 * The cost that buys: the ghost OVERLAPS the neighbour below rather than
 * pushing it. That is a known and accepted trade, and it is the first thing
 * to look at in a screenshot — if it reads as landing ON something rather
 * than BETWEEN, the fallback is the plain bar this replaced.
 *
 * `place` fills its host instead of straddling an edge, because there the
 * landing IS the place — an empty positional slot, or the block a swap will
 * exchange with.
 *
 * @param props - see {@link DropMarkProps}.
 * @returns the mark, positioned against the nearest positioned ancestor.
 */
export function DropMark(props: DropMarkProps): ReactNode {
  const { kind, height } = props;
  return (
    <span
      aria-hidden
      {...tid(MARK_ID[kind])}
      style={height === null ? undefined : { height: `${height}px` }}
      className={`${CHROME_SCOPE} ${PLACEMENT[kind]} pointer-events-none absolute z-20 min-h-12 rounded-lg border-2 border-dashed border-(--accent) bg-(--accent)/15`}
    />
  );
}
