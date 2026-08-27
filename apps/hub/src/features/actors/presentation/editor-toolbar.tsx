"use client";

import { Check, Eye, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";
import { CHROME_SCOPE } from "@/shared/domain/chrome";

/**
 * Translated strings {@link EditorToolbar} renders.
 *
 * `hideControls` and `showControls` are two strings for one idea because the
 * control that steps the workbench aside is not the control that brings it
 * back: they are rendered in different places, and only one exists at a time.
 *
 * There is no string here for the page-theme switch. That control arrives as a
 * ready-made node, so its words belong to whoever built it — see
 * {@link EditorToolbarProps.pageThemeSwitch}.
 */
export interface EditorToolbarLabels {
  /** The save button when idle. */
  save: string;
  /** The save button while a save is in flight. */
  saving: string;
  /** Leaves without saving. */
  cancel: string;
  /** Steps the workbench out of the way to show the page. */
  hideControls: string;
  /** Brings the workbench back. */
  showControls: string;
}

/**
 * What {@link EditorToolbar} needs.
 *
 * Cancel takes an HREF rather than a callback, because it is a navigation to
 * one known place and not an action — which is what lets the loading bar see
 * it, and what makes a middle-click open it in a new tab.
 *
 * `onHideControls` is a callback and not a link for the mirror reason: it
 * changes how this page is being LOOKED at and goes nowhere, so there is no
 * address for it to have.
 *
 * `pageThemeSwitch` is a NODE where those two are a callback and a string,
 * and the difference is deliberate: whether there is a look to leave is a
 * domain question, and this bar owns no domain concept. `PageShell` takes the
 * visitor's copy of the same control the same way.
 */
export interface EditorToolbarProps {
  /** What is being edited, shown on the left. */
  title: string;
  /** Already-translated strings. */
  labels: EditorToolbarLabels;
  /** Steps the workbench out of the way. */
  onHideControls: () => void;
  /**
   * The control that takes the page's own look off, or null when there is none
   * to take off.
   *
   * **A node rather than a flag, so this bar never learns what a theme is** —
   * the same arrangement `PageShell` uses for the visitor's copy of the same
   * switch. Passing it at all is the statement that there is a look to leave;
   * a switch offering to remove colours the page never had is a control that
   * accepts a press and changes nothing.
   */
  pageThemeSwitch?: ReactNode;
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
 * **Its ground is `--menu`, which is OPAQUE, and that is load-bearing.** It
 * wore `--bar` while the app owned the document; the editor themes its document
 * with the page being built now, so a 35%-alpha bar sits on a colour the author
 * chose and `--muted` text on it can be anything at all. `--menu` is the one
 * token declared opaque in both modes, and `dropdown-legibility.test.ts` is
 * what keeps it that way.
 *
 * Every other colour it paints comes from an AeleOS token — `--accent`,
 * `--edge`, `--muted` — and never from a literal. Author themes are scoped to
 * preview hosts, so those tokens stay the workbench's even while the page
 * underneath is being restyled.
 *
 * **It carries the control that steps the workbench aside.** Hiding is a CSS
 * rule over `CHROME_SCOPE`, so this button only arms it; what the editor is
 * left showing is the page itself. `type="button"` is load-bearing — every
 * button inside a `<form>` submits by default, so an unspecified type would
 * save the page on the way to looking at it.
 *
 * **It spans the page and its ROW is columned, not the other way round**, and
 * it must be a DIRECT child of whatever box spans the whole editor. A
 * `position: sticky` element sticks only within its parent's box: this used to
 * sit inside the editor's control column, and when that column stopped wrapping
 * the section previews it came to end just after the language strip — Save
 * scrolled 511px off the top of a page thousands of pixels long, with nothing
 * in any computed style to say so. `CHROME_SCOPE` is on this element rather than
 * on a wrapper for the same reason: a wrapper the height of one bar pins it for
 * the height of one bar. `editor-bars-stay-pinned.spec.ts` is the guard.
 *
 * **It renders `pageThemeSwitch` without knowing what one is.** The node is
 * built by the editor, which owns the domain question of whether there is a
 * look to leave; this bar decides only where in the row it sits — beside Hide
 * controls, because both answer "let me see this differently".
 *
 * @returns the toolbar.
 */
export function EditorToolbar({
  title,
  labels,
  saving,
  cancelHref,
  onHideControls,
  pageThemeSwitch,
}: EditorToolbarProps) {
  return (
    // **The bar spans the page and its ROW is columned, not the other way
    // round.** A `position: sticky` element sticks only within its parent's
    // box, so this has to be a child of something that spans the whole editor —
    // and the editor's control column stops before the section previews, which
    // own the page's full width. It used to be inside that column with negative
    // margins, and on 2026-08-27 that column got shorter: Save scrolled 511px
    // off the top of a page thousands of pixels long.
    //
    // `editor-bars-stay-pinned.spec.ts` is the guard, and it has to scroll a
    // real page — a bar that has come unstuck reports `position: sticky` and
    // its right offset in every computed style.
    // **It carries `CHROME_SCOPE` itself rather than being wrapped in it**, and
    // that is the sticky rule again: a wrapper would be this bar's parent, and
    // a `position: sticky` element sticks only within its parent's box — a
    // wrapper the height of one bar pins it for the height of one bar. Its
    // parent has to be the element spanning the whole editor, so the class has
    // to be on the bar.
    <div
      className={`${CHROME_SCOPE} sticky top-(--bar-top) z-20 mb-6 border-b border-(--edge)/40 bg-(--menu) backdrop-blur-md`}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
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
          {/* **`type="button"`, and that is not a formality.** Every button
            inside a `<form>` submits by default, so an unspecified type here
            would SAVE the page on the way to looking at it. */}
          {pageThemeSwitch}
          <button
            type="button"
            onClick={onHideControls}
            {...tid("hide-controls")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-(--muted)"
          >
            <Eye className="size-4" />
            <span className="sr-only sm:not-sr-only">
              {labels.hideControls}
            </span>
          </button>
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
    </div>
  );
}
