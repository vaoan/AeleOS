"use client";

import { Braces, Check, Eye, MousePointerClick, X } from "lucide-react";
import { useId, type ReactNode } from "react";
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
 *
 * `openSource` is the toolbar's own control — a flat entry alongside
 * `hideControls`, not nested. The panel it opens has its own, separate label
 * bag, `PageSourceDockLabels`, because that panel has words `openSource`
 * never needs to know about.
 *
 * `interactWithPage` names the switch; `interactWithPageHintOff`/`On` are its
 * accessible description, which states the CONSEQUENCE of the current state
 * rather than merely restating it — "page links and controls are locked" says
 * more than "off" does. Both exist because the same control's description
 * changes with its own pressed state, which is what
 * {@link EditorToolbarProps.interactEnabled} selects between.
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
  /** Opens the panel showing the page as JSON. */
  openSource: string;
  /** Names the switch: pressed or unpressed, page links and controls work. */
  interactWithPage: string;
  /** The switch's accessible description while it is unpressed. */
  interactWithPageHintOff: string;
  /** The switch's accessible description while it is pressed. */
  interactWithPageHintOn: string;
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
 * address for it to have. `onOpenSource` is the same shape for the same
 * reason — see its own TSDoc.
 *
 * `pageThemeSwitch` is a NODE where those two are a callback and a string,
 * and the difference is deliberate: whether there is a look to leave is a
 * domain question, and this bar owns no domain concept. `PageShell` takes the
 * visitor's copy of the same control the same way.
 *
 * `writingIn` is the same shape for the same reason, and it joined on
 * 2026-08-28 when the editor's language strip became a control in this bar.
 * It differs from `pageThemeSwitch` in one way: it is NOT optional. Every page
 * is being written in some language, where not every page has a look to leave.
 *
 * **`interactEnabled`/`onInteractEnabledChange` are a boolean and a callback
 * (2026-09-02), unlike those two nodes** — see the prop's own TSDoc for why
 * this bar owns that one concept where it owns no other.
 */
export interface EditorToolbarProps {
  /** What is being edited, shown on the left. */
  title: string;
  /** Already-translated strings. */
  labels: EditorToolbarLabels;
  /** Steps the workbench out of the way. */
  onHideControls: () => void;
  /**
   * Opens the page-source dock.
   *
   * A callback rather than a link, for the reason `onHideControls` is one: it
   * changes how this page is being looked at and goes nowhere, so there is no
   * address for it to have.
   */
  onOpenSource: () => void;
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
  /**
   * The switch choosing which language the page is being WRITTEN in.
   *
   * A node for the reason `pageThemeSwitch` is one: which languages a person
   * may author in is a domain question, and this bar owns no domain concept.
   * It is not optional, unlike that one — every page has an authoring
   * language, where not every page has a look to leave.
   */
  writingIn: ReactNode;
  /**
   * Whether the session's own Interact-with-page switch is pressed.
   *
   * A callback and a boolean rather than a node, unlike `pageThemeSwitch`
   * and `writingIn`: this bar owns no page-theme or language concept, but
   * whether the CANVAS is locked is exactly what a bar full of ways to look
   * at the page is for — Preview, beside it, already answers a version of
   * the same question. `FursonaEditor` still owns the session state and the
   * reset-on-Preview-exit rule; this prop only reflects it.
   */
  interactEnabled: boolean;
  /** Presses or releases the Interact-with-page switch. */
  onInteractEnabledChange: (next: boolean) => void;
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
 * **It also carries the control that opens the page-source dock**, beside
 * the page-theme switch — a `Braces`-icon button with no visible text of its
 * own, named for assistive technology by `labels.openSource` alone. It calls
 * `onOpenSource` rather than owning any state of its own, exactly as
 * `onHideControls` does: whether the dock is open is `FursonaEditor`'s
 * concern, not this bar's.
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
 * **It carries the WRITING-LANGUAGE switch too, and that one sits outside the
 * action group (2026-08-28).** It is beside the title, because what you are
 * editing and which language you are writing it in are both context where
 * everything right of the `ml-auto` is an action — and, structurally, because
 * inside the group it would wrap WITH the actions and defeat the row's second
 * line entirely.
 *
 * **The row WRAPS below `sm`, and that is arithmetic rather than taste.**
 * Measured at 320px in Spanish once the switch joined: the controls wanted
 * 345.1px against a 288px content box, with the title already squeezed to
 * 6.1px. Nothing could be shaved to close 57px — the three icon-only buttons
 * and Save's own padding together give back 32 — so the row takes a second
 * line and every control keeps the size it was designed at. It pays for
 * itself: the title read 0px at 320 in both languages before this, so a phone
 * never showed what was being edited, and on its own line it gets 212.8px.
 * `sm:flex-nowrap` keeps every wider screen the single row it already was, and
 * because `flex-wrap` wraps only on overflow the second line appears below
 * about 500px and nowhere else — 95px tall at 400–480, 57px from 500 up.
 *
 * **The switch's own endonyms arrive at `md`, one step later than this row
 * goes single-line, and the stagger is what keeps it fitting.** Putting them
 * at `sm` made three things arrive at one width — the row going to one line,
 * Hide controls and Cancel getting their words back, and the endonyms — and
 * the row then wanted 673px against a 640px viewport. See
 * {@link WritingInToggle} for the band that closes.
 *
 * **Cancel shows its icon alone below `sm`, as Hide controls does.** Measured
 * at 320px once the page-theme switch joined this row: the control group
 * needed 258px in English and 293px in Spanish, against a bar whose title had
 * already truncated to nothing. A row with no slack is one the next control
 * added to it breaks, and it broke under Linux font metrics in CI while one
 * developer machine read zero.
 *
 * **It also carries Interact with page (2026-09-02), beside Preview.** Both
 * change how the live page can be used, which is why they sit together
 * rather than one being folded into the other: Preview implies interaction
 * through hiding controls altogether, while this switch turns it on WITH
 * controls still visible. Its `aria-describedby` names a visually-hidden
 * sentence that swaps between the two hint strings on the switch's own
 * pressed state, stating the consequence rather than merely the state.
 *
 * **Its own label arrives at `md`, not `sm` (corrected the same day it
 * shipped).** The first version put it at `sm`, matching Hide controls and
 * Cancel beside it, and measured its own overflow claim only at 320 —
 * exactly the discontinuity-band miss rule 38 already names. Landscape 667
 * is inside the same `sm` band the writing switch's endonyms already
 * crowd, and `responsive.spec.ts` measured the row 61px past that viewport
 * with this label joining there too. Staggering it to `md` is what gives
 * the row its slack back without shaving anything else in it.
 *
 * **It sticks to `0`, not to `--bar-top` (2026-09-03).** Its scrollport is
 * the editor's own bounded form now rather than the document, and that box
 * already begins below the app header — so the header's height belongs to
 * neither offset twice. See the comment on the bar itself for the band this
 * left when it did.
 *
 * @returns the toolbar.
 */
export function EditorToolbar({
  title,
  labels,
  saving,
  cancelHref,
  onHideControls,
  onOpenSource,
  pageThemeSwitch,
  writingIn,
  interactEnabled,
  onInteractEnabledChange,
}: EditorToolbarProps) {
  const interactHintId = useId();
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
    //
    // **The offset is `0` rather than `--bar-top`, and that changed when the
    // canvas became the scroller (2026-09-03).** A sticky offset is measured
    // from the SCROLLPORT, not from the viewport. While controls show, this
    // bar's nearest scrollport is the editor's own form, which already begins
    // below the header — so `--bar-top` counted the header a second time and
    // parked the bar 56px lower than its own resting place, leaving a band of
    // the author's page between the two bars and pushing the whole canvas
    // down with it. Measured at 1280x900: the header ends at y=56 and the bar
    // began at y=112. `--bar-top` still belongs to the two controls whose
    // offsets ARE measured from the viewport, the inspector and the source
    // dock, both of which are `fixed`.
    <div
      className={`${CHROME_SCOPE} sticky top-0 z-20 mb-6 border-b border-(--edge)/40 bg-(--menu) backdrop-blur-md`}
    >
      {/* **It WRAPS below `sm`, and that is arithmetic rather than taste.**
          Measured at 320px in Spanish with the writing switch added: the
          controls want 345.1px against a 288px content box, and the title had
          already been squeezed to 0. Nothing could be shaved to close 57px —
          the three icon buttons and Save's own padding together give back 32 —
          so the row is allowed a second line instead, and every control keeps
          the size it was designed at.

          It PAYS for itself rather than merely costing height. The title read
          0px at 320 in both languages before this, so a phone never showed
          what was being edited at all; on its own line it has 212.8px and
          shows the whole name. `sm:flex-nowrap` is what keeps every wider
          screen byte-for-byte the single row it already was. */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:flex-nowrap sm:gap-3 sm:px-6">
        {/* `truncate` rather than wrap. A two-line TITLE doubled the bar's
          height on a phone and pushed Save down with it, so the one control
          that must never move moved every time the name got longer — which is
          a different thing from the row's own fixed second line above, whose
          height does not vary with anybody's name. */}
        <span className="min-w-0 truncate font-display text-base font-bold tracking-tight sm:text-lg">
          {title}
        </span>
        {/* **Outside the action group, which is what makes the wrap work.**
            Inside it, the switch would wrap WITH the actions and the second
            line would want 345.1px — the same overflow one line down. Out
            here it stays with the title, which is also where it belongs by
            meaning: what you are editing and which language you are writing
            it in are both context, where everything to the right is an
            action. */}
        {writingIn}
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
            onClick={onOpenSource}
            aria-label={labels.openSource}
            title={labels.openSource}
            {...tid("editor-open-source")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-(--muted)"
          >
            <Braces className="size-4" />
          </button>
          {/* **Interact with page, beside Preview because both change how the
              live page can be used.** A pressed/unpressed switch rather than a
              node like `pageThemeSwitch`: this bar owns no theme or language
              concept, but whether the canvas is locked is exactly what a row
              of ways to look at the page is for. `aria-describedby` points at
              a visually-hidden sentence stating the CONSEQUENCE rather than
              merely the state, which swaps with the pressed state so a screen
              reader hears what changed rather than only that something did.
              Compact below 320: icon alone, so this control adds no overflow
              band there.

              **Its own LABEL arrives at `md`, not `sm` (2026-09-02, corrected
              from a claim measured only at 320).** `sm` is also where
              `writingIn`'s own endonyms and every OTHER label in this row
              (Hide controls, Cancel) already arrive at once — rule 38's own
              band, a discontinuity a check at 320 and at desktop both miss
              entirely. Landscape 667 is inside that band: `responsive.spec.ts`
              measured the row 61px past the viewport there with this label
              joining at `sm`, the exact "adding a control right where several
              others already arrive" shape the rule warns about. Staggering
              this one arrival to `md` is what gives the row its slack back at
              `sm` without shaving anything else. */}
          <button
            type="button"
            aria-pressed={interactEnabled}
            aria-describedby={interactHintId}
            onClick={() => onInteractEnabledChange(!interactEnabled)}
            {...tid("interact-with-page")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-(--muted) aria-pressed:text-(--accent)"
          >
            <MousePointerClick className="size-4" />
            <span className="sr-only md:not-sr-only">
              {labels.interactWithPage}
            </span>
          </button>
          <span id={interactHintId} className="sr-only">
            {interactEnabled
              ? labels.interactWithPageHintOn
              : labels.interactWithPageHintOff}
          </span>
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
            {/* **Collapsed to its icon on a phone, exactly as Hide controls
                beside it already is.** Measured at 320px with the page-theme
                switch present: the control group needed 258px in English and
                293px in Spanish against a 320px bar whose title had already
                been truncated to nothing — no slack at all, which is how CI
                found the editor 12px wider than the phone while this machine
                read zero. A row with no slack is one the next control breaks. */}
            <span className="sr-only sm:not-sr-only">{labels.cancel}</span>
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
