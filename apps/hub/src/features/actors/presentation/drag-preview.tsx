import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link DragPreview} needs. */
export interface DragPreviewProps {
  /** What is being carried, in the reader's own language. */
  readonly label: string;
}

/**
 * The thing that follows the cursor during a drag.
 *
 * **Opaque by requirement rather than by taste.** It floats over a page whose
 * colours the author picked and may pick freely, so no contrast can be
 * promised against whatever is behind it; `--menu` is the one token declared
 * opaque in both modes.
 *
 * **No Motion here, ever.** `@dnd-kit` writes this element's `transform` to
 * follow the pointer, and a second system writing the same property is the
 * cascade fight the feature note forbids.
 *
 * @param props - see {@link DragPreviewProps}.
 * @returns the floating preview.
 */
export function DragPreview(props: DragPreviewProps): ReactNode {
  return (
    <div
      {...tid("drag-preview")}
      className={`${CHROME_SCOPE} pointer-events-none flex w-max max-w-64 items-center gap-2 rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-2 text-sm text-(--ink) shadow-lg`}
    >
      <GripVertical className="size-4 shrink-0 text-(--muted)" />
      <span className="truncate">{props.label}</span>
    </div>
  );
}
