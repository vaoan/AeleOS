"use client";

import type { ReactNode } from "react";
import type { EditorSelection } from "@/features/actors/domain/editor-selection";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Already-translated strings {@link CanvasInspector} renders.
 *
 * Ordinary language: Add and Options, not container and leaf.
 */
export interface CanvasInspectorLabels {
  /** The tab that offers what can be placed into the selection. */
  add: string;
  /** The tab that edits the selection. */
  options: string;
}

/**
 * Which pane of the inspector is showing.
 */
export type InspectorTab = "add" | "options";

/**
 * What {@link CanvasInspector} needs.
 *
 * It is chrome: hide-controls removes it with every other `CHROME_SCOPE`
 * island. It does not render when nothing is selected.
 */
export interface CanvasInspectorProps {
  /** What is selected. `null` means do not render. */
  selection: EditorSelection;
  /** Which pane is showing. */
  tab: InspectorTab;
  /** Chooses a pane. */
  onTab: (tab: InspectorTab) => void;
  /** Already-translated strings. */
  labels: CanvasInspectorLabels;
  /** The Add pane. */
  add: ReactNode;
  /** The Options pane. */
  options: ReactNode;
}

/**
 * The hideable inspector: Add and Options for the current selection.
 *
 * A left column from `md` up, a bottom sheet on a phone. Empty canvas and
 * Escape close it by clearing selection in the parent — this component does
 * not listen for those itself, so a field inside it can still use Escape.
 *
 * It is a sibling of the canvas, so its clicks never reach the canvas's
 * deselection handler.
 *
 * **Both panes stay mounted.** The inactive pane uses the native `hidden`
 * attribute rather than being removed, so switching tabs preserves the
 * existing `BlockCard` tree and its local state while also removing inactive
 * controls from the accessibility tree. Options becomes laid out again before
 * a grip can be used, which gives dnd-kit current rectangles without exposing
 * two panes at once.
 *
 * On desktop the inspector starts below the toolbar and is wide enough for
 * the existing nested card controls to wrap inside it. Neither property is
 * decorative: sharing the toolbar's top offset covered the Add tab or the
 * writing switch depending on z-order, and a 320px panel left nested controls
 * outside its horizontal viewport.
 *
 * @returns the inspector, or nothing when deselected.
 */
export function CanvasInspector({
  selection,
  tab,
  onTab,
  labels,
  add,
  options,
}: CanvasInspectorProps): ReactNode {
  if (selection === null) return null;

  return (
    <div
      {...tid("canvas-inspector")}
      className={`${CHROME_SCOPE} fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col border-t border-(--edge) bg-(--menu) md:top-[calc(var(--bar-top)+3.5rem)] md:right-auto md:bottom-0 md:left-0 md:max-h-none md:w-[min(36rem,40vw)] md:border-t-0 md:border-r`}
    >
      <div role="tablist" className="flex shrink-0 border-b border-(--edge)/40">
        <button
          type="button"
          role="tab"
          {...tid("inspector-tab-add")}
          aria-selected={tab === "add"}
          onClick={() => onTab("add")}
          className={`flex-1 px-3 py-2 text-sm ${tab === "add" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
        >
          {labels.add}
        </button>
        <button
          type="button"
          role="tab"
          {...tid("inspector-tab-options")}
          aria-selected={tab === "options"}
          onClick={() => onTab("options")}
          className={`flex-1 px-3 py-2 text-sm ${tab === "options" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
        >
          {labels.options}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div hidden={tab !== "add"} className="grid gap-2">
          {add}
        </div>
        <div hidden={tab !== "options"} className="grid gap-2">
          {options}
        </div>
      </div>
    </div>
  );
}
