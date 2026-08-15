"use client";

import { Check, X } from "lucide-react";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";

/** Translated strings {@link EditorToolbar} renders. */
export interface EditorToolbarLabels {
  /** The save button when idle. */
  save: string;
  /** The save button while a save is in flight. */
  saving: string;
  /** Leaves without saving. */
  cancel: string;
}

/**
 * What {@link EditorToolbar} needs.
 *
 * Cancel takes an HREF rather than a callback, because it is a navigation to
 * one known place and not an action — which is what lets the loading bar see
 * it, and what makes a middle-click open it in a new tab.
 */
export interface EditorToolbarProps {
  /** What is being edited, shown on the left. */
  title: string;
  /** Already-translated strings. */
  labels: EditorToolbarLabels;
  /** True while a save is in flight. */
  saving: boolean;
  /** Where leaving without saving goes. */
  cancelHref: string;
}

/**
 * The editor's sticky bar: what you are editing, and the two ways out.
 *
 * Sticky because the editor is long and Save must not scroll away — that is
 * the studio's arrangement and the reason for it.
 *
 * **Save is a submit button, not a click handler.** The form owns submission,
 * so pressing Enter in a text field saves exactly as pressing Save does, and
 * there is one path to guard rather than two.
 *
 * It is disabled while saving, which prevents a double submit. Without it the
 * second one reaches `create_fursona` and comes back "handle already yours" —
 * a baffling error about a fursona that was just created successfully.
 *
 * **Cancel is a link and Save is a submit, and both of those are what make the
 * loading bar appear.** `RouteProgress` watches clicks that land on an `<a>`
 * and form submissions; a button calling `router.push` is neither, so
 * cancelling used to change the route with nothing on screen saying so.
 *
 * Exposes the `editor-save` and `editor-cancel` test ids, so the signed-in end-to-end suite can
 * submit the form without depending on the button's translated label.
 *
 * @returns the toolbar.
 */
export function EditorToolbar({
  title,
  labels,
  saving,
  cancelHref,
}: EditorToolbarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-6 mb-6 flex items-center gap-3 border-b border-[var(--edge)]/40 bg-[var(--bar)] px-6 py-3 backdrop-blur-md">
      <span className="font-display text-lg font-bold tracking-tight">
        {title}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {/* **A link, not a button that pushes.** Cancel goes to one known
            place, so a link is the right element on its own merits: a middle
            click or a modified click opens it in a new tab, which a button
            silently refuses.
            It is also what restores the loading bar. `RouteProgress` starts on
            a click that lands on an `<a>` and on a form submission — Save is
            covered by the submit, and Cancel was covered by neither, so
            leaving the editor changed the route with nothing on screen. */}
        <Link
          href={cancelHref}
          {...tid("editor-cancel")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[var(--muted)]"
        >
          <X className="size-4" />
          {labels.cancel}
        </Link>
        <button
          type="submit"
          {...tid("editor-save")}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60"
        >
          <Check className="size-4" />
          {saving ? labels.saving : labels.save}
        </button>
      </span>
    </div>
  );
}
