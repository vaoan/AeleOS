import type { ReactNode } from "react";
import type { DropTarget } from "@/features/actors/domain/block-drops";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What {@link DropMark} needs.
 *
 * Since 2026-09-13 `height` is read only for a `place` mark; a `before` or
 * `after` gap mark is a fixed-thickness bar and ignores it — see the field.
 */
export interface DropMarkProps {
  /** Which landing this marks — a gap above, a gap below, or the place. */
  readonly kind: DropTarget["kind"];
  /**
   * How tall the carried block is, in pixels, or `null` when nothing can be
   * measured — every palette drag, since the block being added does not
   * exist yet and has no height to read.
   *
   * **Read only for `place` (2026-09-13).** `before`/`after` mark a GAP
   * between two blocks and are drawn as a fixed-thickness insertion bar now
   * — see this component's own header for why — so a carried height has
   * nothing to size on that mark any more. `place` is unchanged: the
   * landing genuinely IS the place, so its mark still fills that box
   * exactly as it always has, and still reads this field to do it.
   */
  readonly height: number | null;
}

/** The test id each kind carries. */
const MARK_ID: Record<DropTarget["kind"], string> = {
  before: "canvas-drop-before",
  after: "canvas-drop-after",
  place: "canvas-drop-place",
};

/** Which edge of the host a gap mark sits against, and how it centres on it. */
const GAP_EDGE: Record<"before" | "after", string> = {
  before: "top-0 -translate-y-1/2",
  after: "bottom-0 translate-y-1/2",
};

/**
 * The one mark drawn for a landing, for both drag kinds.
 *
 * **`before`/`after` are an insertion BAR now, not a ghost of the carried
 * block (2026-09-13) — a reversal of the design this replaced.** A gap
 * between two blocks used to be drawn as a dashed box sized to what was
 * being carried, overlaid on the boundary. Measured in a real browser and
 * confirmed by photograph: an overlay takes up no space, so it does not
 * part its neighbours — it sits OVER whichever block is nearest the
 * boundary and reads as "this lands ON that block" rather than "this lands
 * BETWEEN the two". That was the known, accepted cost of the ghost-slot
 * design (`docs/superpowers/specs/2026-09-07-drop-target-legibility-design.md`
 * §4); the owner has since seen it happen and chosen the alternative
 * recorded there instead. A bar has no interior to read as landing on
 * anything — it is a thin, unmissable line straddling the boundary, the
 * Figma/Notion idiom for the same gesture.
 *
 * It is still drawn OUT OF FLOW, for the same reason the ghost was: `span`,
 * absolutely positioned and `pointer-events-none`, so the canvas never
 * reflows while a drag is in progress — `@dnd-kit` caches every droppable's
 * rectangle when a drag begins, and a page that moves underneath those
 * rectangles makes the collision answer about where things WERE. Only the
 * WINNING target is ever marked; drawing a bar has no bearing on that rule.
 *
 * **`place` is untouched by this reversal.** It still fills its host rather
 * than straddling an edge, because there the landing IS the place — an
 * empty positional slot, or the block a swap will exchange with — and it
 * still reads {@link DropMarkProps.height}: a real `carriedHeight` says what
 * the block will occupy, so a canvas-move drag of something shorter than
 * 48px draws a `place` mark that size rather than one floored up past it.
 * The `min-h-12` floor applies only when `height` is `null`, which is every
 * palette drag — the block being added does not exist yet and has no height
 * to measure.
 *
 * @param props - see {@link DropMarkProps}.
 * @returns the mark, positioned against the nearest positioned ancestor.
 */
export function DropMark(props: DropMarkProps): ReactNode {
  const { kind, height } = props;
  if (kind === "before" || kind === "after") {
    return (
      <span
        aria-hidden
        {...tid(MARK_ID[kind])}
        className={`${CHROME_SCOPE} inset-x-0 ${GAP_EDGE[kind]} pointer-events-none absolute z-20 h-1.5 rounded-full bg-(--accent)`}
      />
    );
  }
  const heightClass = height === null ? "min-h-12" : "";
  return (
    <span
      aria-hidden
      {...tid(MARK_ID[kind])}
      style={height === null ? undefined : { height: `${height}px` }}
      className={`${CHROME_SCOPE} pointer-events-none absolute inset-0 z-20 ${heightClass} rounded-lg border-2 border-dashed border-(--accent) bg-(--accent)/15`}
    />
  );
}
