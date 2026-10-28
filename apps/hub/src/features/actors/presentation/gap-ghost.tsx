import type { ReactNode } from "react";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link GapGhost} needs. */
export interface GapGhostProps {
  /** Whether this slot is the drag's winning gap. */
  readonly open: boolean;
  /** How tall it opens, from `gapHeightFor`. */
  readonly height: number;
  /** What is being carried, in the reader's own language. */
  readonly label: string;
}

/**
 * One slot a drag can open between blocks: nothing until it wins, then a
 * ghost of the carried block that parts its neighbours (2026-10-27).
 *
 * **In flow, on purpose — the reversal of the out-of-flow rule for gaps.**
 * Every mark before this was absolutely positioned so nothing a drag
 * measures could move; the owner asked for the page to genuinely open, as
 * carrd does. The measured-rectangle hazard that rule guarded against is
 * closed in the collision instead: `frozenRect` keeps each droppable's first
 * rectangle for the whole drag, so this slot growing cannot reach the answer
 * that decided to grow it.
 *
 * **Mounted at zero height for the whole drag and animated by height**, so a
 * gap closing and the next one opening run at once and the blocks between
 * them hold still rather than jumping up and sliding back. Plain CSS, never
 * Motion, and none under `prefers-reduced-motion`.
 *
 * @param props - see {@link GapGhostProps}.
 * @returns the slot.
 */
export function GapGhost(props: GapGhostProps): ReactNode {
  const { open, height, label } = props;
  return (
    <div
      aria-hidden
      {...tid(open ? "canvas-gap-ghost" : "canvas-gap-slot")}
      style={{ height: open ? height : 0 }}
      className={`${CHROME_SCOPE} pointer-events-none overflow-hidden transition-[height] duration-150 ease-out motion-reduce:transition-none`}
    >
      <div
        className={`flex h-full items-center justify-center rounded-lg border-2 border-dashed border-(--accent) bg-(--accent)/10 px-3 text-sm text-(--accent) transition-opacity duration-150 motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`}
      >
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}
