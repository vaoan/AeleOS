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
 * **It sticks at `--bar-top`, not at the top.** The page header is sticky too,
 * so parking both at zero put this one on top of it and hid the wordmark, the
 * language toggle and the account menu for as long as somebody was editing.
 * That token is the header's height, and it becomes zero on a screen short
 * enough that the header gives up its own stickiness — see `globals.css`, where
 * the two halves are declared together.
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
 * Every colour it paints comes from a token — `--accent`, `--bar`, `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
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
    <div className="sticky top-(--bar-top) z-20 -mx-4 mb-6 flex items-center gap-2 border-b border-(--edge)/40 bg-(--bar) px-4 py-3 backdrop-blur-md sm:-mx-6 sm:gap-3 sm:px-6">
      {/* `truncate` rather than wrap. A two-line title doubled the bar's height
          on a phone and pushed Save down with it, so the one control that must
          never move moved every time the name got longer. */}
      <span className="min-w-0 truncate font-display text-base font-bold tracking-tight sm:text-lg">
        {title}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
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
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-(--muted)"
        >
          <X className="size-4" />
          {labels.cancel}
        </Link>
        <button
          type="submit"
          {...tid("editor-save")}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-(--accent) px-4 py-1.5 text-sm font-medium text-(--on-accent) disabled:opacity-60"
        >
          <Check className="size-4" />
          {saving ? labels.saving : labels.save}
        </button>
      </span>
    </div>
  );
}
