"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import type { EditorSelection } from "@/features/actors/domain/editor-selection";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Already-translated strings {@link CanvasInspector} renders.
 *
 * Ordinary language: Items and Options, not container and leaf.
 */
export interface CanvasInspectorLabels {
  /** The tab listing the current scope's immediate children. */
  items: string;
  /** The tab that edits the selection. */
  options: string;
  /** Selects the immediate parent, or closes the Page inspector. */
  back: string;
}

/**
 * Which pane of the inspector is showing.
 *
 * Items means only the selected page or container's immediate children;
 * leaves expose Options directly and never render an Items tab.
 */
export type InspectorTab = "items" | "options";

/**
 * What {@link CanvasInspector} needs.
 *
 * It is chrome: hide-controls removes it with every other `CHROME_SCOPE`
 * island. It does not render when nothing is selected. Breadcrumbs and Back
 * are supplied by the selection owner so this component never interprets a
 * block path itself.
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
  /** Breadcrumb buttons from Page through the current target. */
  breadcrumbs: ReactNode;
  /** Selects the current target's parent. */
  onBack: () => void;
  /** Whether the current target can contain children. */
  hasItems: boolean;
  /** The immediate-child pane. */
  items: ReactNode;
  /** The Options pane. */
  options: ReactNode;
}

/**
 * The hideable inspector: navigation and the panes its selection can use.
 *
 * A left column from `md` up, a bottom sheet on a phone. Empty canvas and
 * Escape close it by clearing selection in the parent — this component does
 * not listen for those itself, so a field inside it can still use Escape.
 *
 * It is a sibling of the canvas, so its clicks never reach the canvas's
 * deselection handler.
 *
 * **Container panes stay mounted.** The inactive pane uses the native
 * `hidden` attribute, preserving local state while removing inactive controls
 * from layout and accessibility. A leaf has no Items tab or misleading
 * tablist; its Options render directly.
 *
 * On desktop the inspector starts below the toolbar and is wide enough for
 * the existing nested card controls to wrap inside it. Neither property is
 * decorative: sharing the toolbar's top offset covered the Items tab or the
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
  breadcrumbs,
  onBack,
  hasItems,
  items,
  options,
}: CanvasInspectorProps): ReactNode {
  if (selection === null) return null;

  return (
    <div
      {...tid("canvas-inspector")}
      className={`${CHROME_SCOPE} fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col border-t border-(--edge) bg-(--menu) md:top-[calc(var(--bar-top)+3.5rem)] md:right-auto md:bottom-0 md:left-0 md:max-h-none md:w-[min(36rem,40vw)] md:border-t-0 md:border-r`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-(--edge)/40 p-2">
        <button
          type="button"
          {...tid("inspector-back")}
          aria-label={labels.back}
          onClick={onBack}
          className="rounded-lg surface border-(--edge)/60 px-2 py-1 text-sm"
        >
          <ChevronLeft className="size-4" />
        </button>
        <nav aria-label={labels.back} className="flex min-w-0 flex-wrap gap-1">
          {breadcrumbs}
        </nav>
      </div>
      {hasItems ? (
        <div
          role="tablist"
          className="flex shrink-0 border-b border-(--edge)/40"
        >
          <button
            type="button"
            role="tab"
            {...tid("inspector-tab-items")}
            aria-selected={tab === "items"}
            onClick={() => onTab("items")}
            className={`flex-1 px-3 py-2 text-sm ${tab === "items" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
          >
            {labels.items}
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
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {hasItems ? (
          <div hidden={tab !== "items"} className="grid gap-2">
            {items}
          </div>
        ) : null}
        <div hidden={hasItems && tab !== "options"} className="grid gap-2">
          {options}
        </div>
      </div>
    </div>
  );
}
