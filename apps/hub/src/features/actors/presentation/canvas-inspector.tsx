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
 * **Both panes stay mounted.** Switching to Add hides that pane with `hidden`
 * (display: none is fine for buttons). Options — the existing `BlockCard`
 * tree, grips, nested add — never unmounts while the inspector is open, so
 * drag geometry and `add-content` survive the tab change. The Add tab still
 * shows those cards underneath the palette.
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
      className={`${CHROME_SCOPE} fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col border-t border-(--edge) bg-(--menu) md:inset-y-(--bar-top) md:right-auto md:bottom-0 md:left-0 md:max-h-none md:w-80 md:border-t-0 md:border-r`}
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
        <div className={tab === "add" ? "grid gap-2" : "hidden"}>{add}</div>
        <div className={tab === "options" ? "grid gap-2" : undefined}>
          {options}
        </div>
      </div>
    </div>
  );
}
