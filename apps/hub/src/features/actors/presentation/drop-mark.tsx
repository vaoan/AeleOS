import type { ReactNode } from "react";
import type { DropTarget } from "@/features/actors/domain/block-drops";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What {@link DropMark} needs: only which landing it marks.
 *
 * It used to take a `height` as well, the carried block's measured pixels,
 * read for a `place` mark. That field is gone (2026-09-16) — see the
 * component's own header for why no mark sizes itself any more.
 */
export interface DropMarkProps {
  /** Which landing this marks — a gap above, a gap below, or the place. */
  readonly kind: DropTarget["kind"];
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
 * **`place` is its host's box and nothing else (2026-09-16) — the same
 * decision, applied to the one kind the bar reversal left alone.** The
 * reversal kept `place` sized from the carried block's measured height,
 * arguing that there the landing IS the place, so filling that box was
 * always right. The argument was right and the code did not do it: `inset-0`
 * pins the mark to the host, but an inline `height` overrides `bottom-0`,
 * so the mark was the CARRIED block's silhouette laid over the host — an
 * empty place is 48px tall and a swap target is whatever height it is, and
 * a taller carried block spilled past either onto the neighbour below.
 * That is the identical "lands ON the neighbour" read the bar fixed for
 * gaps. So the mark now carries no size of its own: no inline height, no
 * `min-h-*` floor, only `inset-0`. The host is the box — the dashed empty
 * place (`min-h-12` on its own frame), the block a swap exchanges with, or
 * an `AppendSlot`'s own reserved height — and the mark fills exactly that.
 * Nothing about the carried block reaches this component any more, which
 * is why the `height` prop, `carriedHeight` on both host interfaces and
 * `block-editor.tsx`'s `carriedHeightRef` all went in the same change: the
 * bar reversal had already noted they "very nearly did not" survive it.
 *
 * @param props - see {@link DropMarkProps}.
 * @returns the mark, positioned against the nearest positioned ancestor.
 */
export function DropMark(props: DropMarkProps): ReactNode {
  const { kind } = props;
  if (kind === "before" || kind === "after") {
    return (
      <span
        aria-hidden
        {...tid(MARK_ID[kind])}
        className={`${CHROME_SCOPE} inset-x-0 ${GAP_EDGE[kind]} pointer-events-none absolute z-20 h-1.5 rounded-full bg-(--accent)`}
      />
    );
  }
  return (
    <span
      aria-hidden
      {...tid(MARK_ID[kind])}
      className={`${CHROME_SCOPE} pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-dashed border-(--accent) bg-(--accent)/15`}
    />
  );
}
