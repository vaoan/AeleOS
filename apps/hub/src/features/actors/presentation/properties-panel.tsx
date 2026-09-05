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
 *
 * **`paletteTab` is the one label that is never selection-dependent
 * (2026-09-05).** The Palette region has no selection kind of its own — it is
 * a persistent third tab, always present, so this string is fixed rather than
 * rebuilt per selection the way `primaryTab`/`secondaryTab` are.
 */
export interface PropertiesPanelLabels {
  /** Clears selection and closes the panel from any depth. */
  readonly close: string;
  /** The first tab's name for the current selection kind. */
  readonly primaryTab: string;
  /** The second tab's name for the current selection kind. */
  readonly secondaryTab: string;
  /** The persistent third tab's own name. */
  readonly paletteTab: string;
}

/** Which of the panel's three regions is showing, including "no selection". */
export type PropertiesActiveTab = "primary" | "secondary" | "palette";

/**
 * What {@link PropertiesPanel} needs.
 *
 * It is chrome: hide-controls removes it with every other `CHROME_SCOPE`
 * island. **It renders unconditionally (2026-09-05), and no longer only while
 * something is selected** — see the component's own TSDoc for why.
 * `primary`/`secondary` are built by the caller from the selected block's own
 * kind — a leaf's Content/Appearance, a container's Layout/Appearance, or
 * Page's Page/Theme — and `foot` is Clone and Delete, also built by the
 * caller since only it knows whether either applies to the current
 * selection. `palette` is the persistent third region, built by the caller
 * once and shown whatever is or is not selected.
 */
export interface PropertiesPanelProps {
  /**
   * What is selected. `null` means nothing is — the panel still renders, with
   * only the Palette tab reachable; the primary/secondary tab buttons are
   * present but `hidden`, never removed, since there is no selection kind for
   * either of their labels to name.
   */
  selection: EditorSelection;
  /** Which region is showing. */
  activeTab: PropertiesActiveTab;
  /** Chooses a region. */
  onTab: (tab: PropertiesActiveTab) => void;
  /** Already-translated strings. */
  labels: PropertiesPanelLabels;
  /** Clears the current selection without walking through its parents. */
  onClose: () => void;
  /** The first tab's content for the current selection. */
  primary: ReactNode;
  /** The second tab's content for the current selection. */
  secondary: ReactNode;
  /**
   * The persistent third region's content — real thumbnails a person may add
   * from, whatever is or is not selected. Built once by the caller; this
   * component does not know what it holds.
   */
  palette: ReactNode;
  /** Clone and Delete, or whichever of the two applies. */
  foot: ReactNode;
}

/**
 * The remount key shared by both selection panes.
 *
 * `null` (no selection) gets a fixed key so neither pane replays an entrance
 * merely because the panel itself re-rendered; an actual selection keys on
 * its own kind and, for a block, its path — never on the active tab, which
 * would remount both panes on every tab flip (see this file's own TSDoc).
 *
 * @param selection - the current selection, or `null`.
 * @returns a string identifying the current selection scope.
 */
function scopeKeyFor(selection: EditorSelection): string {
  if (selection === null) return "none";
  const suffix = selection.kind === "block" ? selection.path.join("-") : "";
  return `${selection.kind}:${suffix}`;
}

/**
 * The hideable Properties panel: a persistent Palette tab plus, whenever
 * something is selected, exactly two more tabs for it — and Clone/Delete at
 * its foot.
 *
 * **It renders unconditionally now, and that is a change from how this
 * worked until 2026-09-05.** It used to return `null` outright with nothing
 * selected, so the whole panel disappeared the moment selection was cleared.
 * The Palette tab is meant to be reachable at ANY time — a person adds
 * content to an empty canvas the same way they add it beside something they
 * already picked — so the panel now always shows that one region, and the
 * two selection-dependent tab BUTTONS are `hidden` rather than removed
 * whenever `selection` is `null`: a caller does not need to special-case
 * "which tabs exist" per selection state, only which region is ACTIVE. Their
 * PANES stay in the same "hidden, never omitted" shape they always had —
 * see the note on both `m.div` panes below — so a caller with nothing
 * selected can keep handing this component `null` content for them with no
 * special case of its own.
 *
 * **There is no Items tab and no tree navigation here (2026-09-04).** Click-
 * to-select on the live canvas is what replaced Items, Options, breadcrumbs
 * and Back — see `block-editor.tsx`'s `onCanvasClick`. This component is
 * `CanvasInspector` renamed, with every piece of that navigation removed
 * rather than reworked: the tablist always renders exactly two SELECTION
 * tabs, never a variable number, because the spec's per-kind pairing means
 * every selection kind gets two — the Palette tab is a third, fixed one
 * beside them. Neither of the two selection panes renders a `@dnd-kit`
 * draggable — there is no sibling-grip mechanism left to protect a slide
 * from — so both may fade and slide identically; the old Items/Options split
 * kept one opacity-only for exactly that reason and no longer needs to.
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
 * **All three panes stay mounted while inactive, using the native `hidden`
 * attribute**, so a tab flip does not remount the one you just left and
 * discard whatever local state it held — the same fix `CanvasInspector`
 * carried for Items/Options, kept here since a container's own style popup
 * (now the inline Appearance tab) can still hold local state of its own.
 *
 * **The root is `m.div`, OPACITY-ONLY**, because it is an ancestor of
 * whatever `primary`/`secondary`/`palette` render, and a future selection
 * kind — or a future Palette drag source — could still mount a `@dnd-kit`
 * node inside one of them — the standing rule in `editor-motion.tsx` is that
 * Motion never becomes such an ancestor, and this root has no way to know in
 * advance whether a caller will honour that. The two selection panes are
 * keyed on the SELECTED PATH ONLY, never the tab, for the reason
 * `CanvasInspector`'s own note recorded: a key computed from the active tab
 * remounts BOTH panes on every tab flip, because both panes would compute
 * the identical string from it. The Palette pane carries no such key — its
 * content does not depend on selection, so it never needs to replay an
 * entrance on a selection change.
 *
 * @returns the panel.
 */
export function PropertiesPanel({
  selection,
  activeTab,
  onTab,
  labels,
  onClose,
  primary,
  secondary,
  palette,
  foot,
}: PropertiesPanelProps): ReactNode {
  const scopeKey = scopeKeyFor(selection);

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
          hidden={selection === null}
          {...tid("panel-tab-primary")}
          aria-selected={activeTab === "primary"}
          onClick={() => onTab("primary")}
          className={`flex-1 px-3 py-2 text-sm ${activeTab === "primary" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
        >
          {labels.primaryTab}
        </button>
        <button
          type="button"
          role="tab"
          hidden={selection === null}
          {...tid("panel-tab-secondary")}
          aria-selected={activeTab === "secondary"}
          onClick={() => onTab("secondary")}
          className={`flex-1 px-3 py-2 text-sm ${activeTab === "secondary" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
        >
          {labels.secondaryTab}
        </button>
        <button
          type="button"
          role="tab"
          {...tid("panel-tab-palette")}
          aria-selected={activeTab === "palette"}
          onClick={() => onTab("palette")}
          className={`flex-1 px-3 py-2 text-sm ${activeTab === "palette" ? "font-medium text-(--accent)" : "text-(--muted)"}`}
        >
          {labels.paletteTab}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div hidden={activeTab !== "primary"} className="grid gap-2">
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
        <div hidden={activeTab !== "secondary"} className="grid gap-2">
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
        <div
          hidden={activeTab !== "palette"}
          {...tid("panel-palette")}
          className="grid gap-2"
        >
          {palette}
        </div>
      </div>
      <div className="shrink-0 border-t border-(--edge)/40 p-2">{foot}</div>
    </m.div>
  );
}
