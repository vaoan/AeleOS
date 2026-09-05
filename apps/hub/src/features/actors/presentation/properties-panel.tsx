"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { EditorSelection } from "@/features/actors/domain/editor-selection";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";
import { m } from "@/features/actors/presentation/editor-motion";

/**
 * Already-translated strings {@link PropertiesPanel} renders.
 *
 * **Ordinary language, per selection kind, supplied by the caller.**
 * `primaryTab`/`secondaryTab` are never fixed strings on this component: a
 * leaf's pair is Content/Appearance, a container's is Layout/Appearance, and
 * Page's is Page/Theme — see the design spec's Interaction section. Close is
 * this panel's own way out, at any depth, and it is the only navigation
 * control this component still owns.
 */
export interface PropertiesPanelLabels {
  /** Clears selection and closes the panel from any depth. */
  readonly close: string;
  /** The first tab's name for the current selection kind. */
  readonly primaryTab: string;
  /** The second tab's name for the current selection kind. */
  readonly secondaryTab: string;
}

/** Which of the panel's two tabs is showing. */
export type PropertiesTab = "primary" | "secondary";

/**
 * What {@link PropertiesPanel} needs.
 *
 * It is chrome: hide-controls removes it with every other `CHROME_SCOPE`
 * island. It does not render when nothing is selected. `primary`/`secondary`
 * are built by the caller from the selected block's own kind — a leaf's
 * Content/Appearance, a container's Layout/Appearance, or Page's Page/Theme
 * — and `foot` is Clone and Delete, also built by the caller since only it
 * knows whether either applies to the current selection.
 */
export interface PropertiesPanelProps {
  /** What is selected. `null` means do not render. */
  selection: EditorSelection;
  /** Which tab is showing. */
  tab: PropertiesTab;
  /** Chooses a tab. */
  onTab: (tab: PropertiesTab) => void;
  /** Already-translated strings. */
  labels: PropertiesPanelLabels;
  /** Clears the current selection without walking through its parents. */
  onClose: () => void;
  /** The first tab's content for the current selection. */
  primary: ReactNode;
  /** The second tab's content for the current selection. */
  secondary: ReactNode;
  /** Clone and Delete, or whichever of the two applies. */
  foot: ReactNode;
}

/**
 * The hideable Properties panel: exactly two tabs for whatever is selected,
 * and Clone/Delete at its foot.
 *
 * **There is no Items tab and no tree navigation here (2026-09-04).** Click-
 * to-select on the live canvas is what replaced Items, Options, breadcrumbs
 * and Back — see `block-editor.tsx`'s `onCanvasClick`. This component is
 * `CanvasInspector` renamed, with every piece of that navigation removed
 * rather than reworked: the tablist always renders exactly two tabs, never a
 * variable number, because the spec's per-kind pairing means every selection
 * kind gets two. Neither pane renders a `@dnd-kit` draggable — there is no
 * sibling-grip mechanism left to protect a slide from — so both may fade and
 * slide identically; the old Items/Options split kept one opacity-only for
 * exactly that reason and no longer needs to.
 *
 * A right column from `md` up, a bottom sheet on a phone — the spec's own
 * "selected Properties panel on the right." Empty canvas, Escape and the
 * header's Close control close it by clearing selection in the parent; this
 * component does not listen for those itself, so a field inside it can still
 * use Escape. Close is not Back — there is no Back any more — and it does
 * not walk parents, because there is nowhere left to walk to.
 *
 * It is a sibling of the canvas, so its clicks never reach the canvas's
 * deselection handler.
 *
 * **Both panes stay mounted while inactive, using the native `hidden`
 * attribute**, so a tab flip does not remount the one you just left and
 * discard whatever local state it held — the same fix `CanvasInspector`
 * carried for Items/Options, kept here since a container's own style popup
 * (now the inline Appearance tab) can still hold local state of its own.
 *
 * **The root is `m.div`, OPACITY-ONLY**, because it is an ancestor of
 * whatever `primary`/`secondary` render, and a future selection kind could
 * still mount a `@dnd-kit` node inside one of them — the standing rule in
 * `editor-motion.tsx` is that Motion never becomes such an ancestor, and this
 * root has no way to know in advance whether a caller will honour that.
 * Both inner panes are keyed on the SELECTED PATH ONLY, never the tab, for
 * the reason `CanvasInspector`'s own note recorded: a key computed from `tab`
 * remounts BOTH panes on every tab flip, because both panes would compute the
 * identical string from it.
 *
 * @returns the panel, or nothing when deselected.
 */
export function PropertiesPanel({
  selection,
  tab,
  onTab,
  labels,
  onClose,
  primary,
  secondary,
  foot,
}: PropertiesPanelProps): ReactNode {
  if (selection === null) return null;

  const scopeKey = `${selection.kind}:${
    selection.kind === "block" ? selection.path.join("-") : ""
  }`;

  return (
    <m.div
      {...tid("properties-panel")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.21, ease: "easeOut" }}
      className={`${CHROME_SCOPE} fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col border-t border-(--edge) bg-(--menu) md:top-[calc(var(--bar-top)+3.5rem)] md:right-0 md:bottom-0 md:left-auto md:max-h-none md:w-[min(36rem,40vw)] md:border-t-0 md:border-l`}
    >
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-(--edge)/40 p-2">
        <button
          type="button"
          {...tid("panel-close")}
          aria-label={labels.close}
          onClick={onClose}
          className="rounded-lg surface border-(--edge)/60 px-2 py-1 text-sm"
        >
          <X className="size-4" />
        </button>
      </div>
      <div role="tablist" className="flex shrink-0 border-b border-(--edge)/40">
        <button
          type="button"
          role="tab"
          {...tid("panel-tab-primary")}
          aria-selected={tab === "primary"}
          onClick={() => onTab("primary")}
          className={`flex-1 px-3 py-2 text-sm ${tab === "primary" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
        >
          {labels.primaryTab}
        </button>
        <button
          type="button"
          role="tab"
          {...tid("panel-tab-secondary")}
          aria-selected={tab === "secondary"}
          onClick={() => onTab("secondary")}
          className={`flex-1 px-3 py-2 text-sm ${tab === "secondary" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
        >
          {labels.secondaryTab}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div hidden={tab !== "primary"} className="grid gap-2">
          <m.div
            key={scopeKey}
            {...tid("panel-pane-entrance")}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="grid gap-2"
          >
            {primary}
          </m.div>
        </div>
        <div hidden={tab !== "secondary"} className="grid gap-2">
          <m.div
            key={scopeKey}
            {...tid("panel-pane-entrance")}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="grid gap-2"
          >
            {secondary}
          </m.div>
        </div>
      </div>
      <div className="shrink-0 border-t border-(--edge)/40 p-2">{foot}</div>
    </m.div>
  );
}
