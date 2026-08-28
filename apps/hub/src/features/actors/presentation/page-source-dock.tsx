"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Copy, PanelRightClose, X } from "lucide-react";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";
import { cn } from "@/shared/infrastructure/cn";
import type { PageSourceState } from "@/features/actors/application/use-page-source";
import type { DocumentProblem } from "@/features/actors/domain/page-document";

/** The panel's width before anybody resizes it, in pixels. */
const DEFAULT_WIDTH_PX = 420;

/** The narrowest the panel may be dragged or arrowed to, in pixels — `20rem`. */
const MIN_WIDTH_PX = 320;

/**
 * The widest the panel may be dragged or arrowed to, in pixels — `48rem`,
 * the same figure the CSS `max-w-[min(48rem,80vw)]` class clamps to. Assumes
 * a `16px` root font size, which this app never overrides.
 */
const MAX_WIDTH_REM_PX = 768;

/** How far one Left/Right arrow press moves the grip, in pixels. */
const RESIZE_STEP_PX = 24;

/** How long the copy control reads "Copied" before reverting, in milliseconds. */
const COPIED_RESET_MS = 2000;

/**
 * A block path as the strip shows it.
 *
 * Spelled the way the document is written rather than the way the tree is
 * walked — `blocks[0].children[1]` — so somebody can find the block by reading
 * along their own JSON.
 *
 * @param path - the path, outermost index first.
 * @param field - the refused field, appended when there is one.
 * @returns the address as text.
 */
export function sourceAddress(path: readonly number[], field?: string): string {
  const body = path
    .map((index, at) => (at === 0 ? `blocks[${index}]` : `children[${index}]`))
    .join(".");
  return field ? `${body}.${field}` : body;
}

/**
 * One {@link DocumentProblem} as a sentence for the strip.
 *
 * **No prose is invented here beyond what the problem itself carries.** A
 * `syntax` or `envelope` failure has only a message, so the message is the
 * whole of it; `unsafe-key` is pathless BY DESIGN — see its own TSDoc in
 * `page-document.ts` — so this renders the key alone rather than fabricating
 * an address for a document that never produced a tree to point into.
 *
 * @param problem - the problem to describe.
 * @returns the text this problem contributes to the strip.
 */
function problemText(problem: DocumentProblem): string {
  switch (problem.at) {
    case "syntax":
    case "envelope": {
      return problem.message;
    }
    case "block": {
      return sourceAddress(problem.path, problem.field);
    }
    case "refused-kind": {
      return `${sourceAddress(problem.path)}: ${problem.kind}`;
    }
    case "unsafe-key": {
      return problem.key;
    }
  }
}

/** Translated strings {@link PageSourceDock} renders. */
export interface PageSourceDockLabels {
  /** The panel's own heading. */
  title: string;
  /** Closes the panel. */
  close: string;
  /** Steps the body out of the way, keeping the header. */
  collapse: string;
  /** Brings the body back. */
  expand: string;
  /** Copies the reference document below the textarea. */
  copyReference: string;
  /** What the copy control reads once the copy has landed. */
  copied: string;
  /** The heading over the reference document. */
  referenceTitle: string;
  /** Throws the box away and re-reads the page. */
  resync: string;
  /** Shown while the page has moved under text that is being edited. */
  drifted: string;
  /** Shown while the box does not describe the page that is showing. */
  stale: string;
  /** The textarea's accessible name. */
  sourceLabel: string;
  /** The resize grip's accessible name. */
  resize: string;
}

/**
 * What {@link PageSourceDock} needs.
 *
 * `source` is the whole binding — see {@link PageSourceState}'s own TSDoc for
 * the contract this component must honour: `onChange`, `onFocusChange` and
 * `resync` must reach the textarea and the resync button directly, never
 * through an effect's or a memo's dependency array, because their identity
 * changes with the theme and keying anything off them would restart the
 * binding's debounce on an unrelated theme change.
 *
 * `onClose`'s own doc corrects a whole-branch review finding: focus recovery
 * on close is the native `<dialog>`'s own job, not this component's or its
 * caller's — see that field's TSDoc for the mechanism.
 */
export interface PageSourceDockProps {
  /** Whether the panel is showing. */
  open: boolean;
  /**
   * The panel asked to close, by Escape or by its own close button.
   *
   * **Neither this component nor its caller returns focus anywhere, and none
   * has to.** The native `<dialog>` element's own closing steps do it: an
   * `HTMLDialogElement` records whatever had focus immediately before it was
   * shown and restores focus there once it closes, whether that close comes
   * from `dialog.close()` or — as here — from this component calling `close()`
   * inside the `useEffect` on `open`. `tests/e2e/page-source-dock.spec.ts`
   * proves it: focus lands back on the control that opened the dock with no
   * focus-restoring code anywhere in this codebase.
   */
  onClose: () => void;
  /** The live binding between the box and the page — see {@link PageSourceState}. */
  source: PageSourceState;
  /** The reference document, as plain text, for the copy control. */
  reference: string;
  /** Already-translated strings. */
  labels: PageSourceDockLabels;
}

/**
 * A NON-MODAL dock showing the page as JSON, bound live to it in both
 * directions.
 *
 * **`show()`, never `showModal()`, and that is the one design idea the whole
 * component rests on.** The editor's document IS the page — the author's own
 * theme paints it — so a modal backdrop would put the very thing this panel
 * is meant to be watched against underneath the panel itself. `open` drives an
 * effect that calls the imperative `show()`/`close()` methods; the native
 * `open` attribute is never set from JSX, because that would open the dialog
 * the browser's own way rather than this component's.
 *
 * **jsdom 26 implements none of `HTMLDialogElement`'s `show`, `showModal` or
 * `close`** — confirmed against the installed version, not assumed — so every
 * test that renders this component open has to stub those three on
 * `HTMLDialogElement.prototype` first, or the effect throws. That is a test
 * concern, not a reason to guard the calls here: guarding them would hide the
 * exact mistake — calling `showModal()` — that this component exists to
 * refuse.
 *
 * **The ground is `bg-(--menu)`, and never a translucent token.** What sits
 * behind this panel is a colour the page's own author chose, and they may
 * choose any colour at all — a translucent panel has no guaranteed contrast
 * against a page somebody else designed. `--menu` is the one token declared
 * opaque in both modes.
 *
 * **It wears `CHROME_SCOPE`.** The class re-declares AeleOS's own tokens on
 * this island, so the author's palette never reaches the panel's own controls,
 * and it is what lets the editor's existing hide-controls rule remove this
 * panel by CLASS — nobody wiring that rule has to know this component exists.
 *
 * **Tab is not handled at all, and the absence is the feature.** Trapping Tab
 * inside a textarea — swallowing it to insert a literal tab character — is a
 * real accessibility failure: it strands a keyboard user who was trying to
 * leave the field. Escape is the one key this component intercepts, and only
 * to close itself.
 *
 * **The resize grip is reachable by keyboard.** It is a
 * `role="separator" aria-orientation="vertical"` with `tabIndex={0}`, handling
 * a pointer drag and the Left/Right arrows alike — a control that only a mouse
 * could operate would be exactly the fault Tab-trapping is above, in a
 * different control. `resize()` clamps at both `MIN_WIDTH_PX` and
 * `MAX_WIDTH_REM_PX`, mirroring the CSS bound (20rem to `min(48rem, 80vw)`) so
 * an arrow key cannot walk the `width` state past what the panel can ever
 * actually render.
 *
 * **It also carries `aria-valuenow`/`aria-valuemin`/`aria-valuemax` — found
 * missing by the first real axe scan of this panel OPEN, task 8's
 * `a11y.spec.ts` case, and required rather than decorative.** A FOCUSABLE
 * `role="separator"` is the WAI-ARIA APG's window-splitter pattern, which the
 * spec treats as a value widget rather than a static divider — axe's
 * `aria-required-attr` is what caught the absence. `aria-valuemax` mirrors the
 * fixed `MAX_WIDTH_REM_PX` bound rather than the dynamic `min(768, 80vw)`
 * ceiling `resize()` also clamps to, close enough for an announced range and
 * reachable with no `window` access during a server render.
 *
 * **The reference panel's copy button is a SIBLING of `<details>` ITSELF,
 * never a descendant of it at all — the same scan's second finding, and a
 * round-1 review caught the first fix wrong.** `<summary>` is itself an
 * implicit interactive control (it toggles the `<details>`), so nesting a
 * `<button>` inside it is `nested-interactive` — that diagnosis was right,
 * but moving the button to sit beside `<summary>` while STILL inside
 * `<details>` traded it for a worse fault: a closed `<details>` renders none
 * of its non-`<summary>` children, so the button was invisible and out of
 * the tab order in the panel's default, collapsed state. Confirmed
 * empirically against this repo's own Chromium — a sibling `absolute` button
 * inside a closed `<details>` reports `visible: false`, `true` only once the
 * summary is clicked — and invisible to the axe case that found the
 * original fault, since that case opens the dock but never expands the
 * reference. The button is a sibling of `<details>` now, inside a shared
 * `relative` wrapper, positioned over the summary row in both states.
 *
 * **And its idle face is the icon ALONE, because it was covering the summary
 * it is positioned over — the third round on this one control, and the first
 * that was geometry rather than markup.** `pr-24` on the summary is the
 * reserve, 96px; the button rendering `copyReference` as visible text
 * measured 227px at 1440, 1100 and 320 alike, since its width comes from a
 * translated string and not from the space set aside for it. So it sat on the
 * CENTRE of a full-width row styled `cursor-pointer`, and pressing the middle
 * of a disclosure that invites a press copied instead of expanding — at 320,
 * over a 293px row. `aria-label` and `title` carry the name now and the
 * visible label returns only for `copied`, which fits the reserve. Every unit
 * case survived the change and had to: they address this button by ACCESSIBLE
 * NAME, which `aria-label` supplies whether or not text renders, so no unit
 * suite can see how wide it is. `page-source-dock.spec.ts` checks
 * `elementFromPoint` at the summary's own centre at both widths instead.
 *
 * **The width is consumed through the `w-(--dock-width)` CLASS, never an
 * inline `style`.** An inline `width` beats every class regardless of a media
 * query's specificity, which would silently defeat `max-md:w-full` — the
 * exact fault a first review round found shipped on the neighbouring element.
 * `w-(--dock-width)` is a real member of the same `w-*` utility family as
 * `max-md:w-full`, so the two genuinely compete on ordinary cascade order
 * (confirmed by compiling this component's class list through the installed
 * Tailwind). Sheet mode additionally relaxes the min/max-width clamp itself —
 * `max-md:max-w-none` and `max-md:min-w-0` — because the always-on max-width
 * bound clamps the USED width regardless of what `width` says, and 80% of the
 * viewport is frequently narrower than the viewport itself (300px at 375px
 * wide).
 *
 * **The stale strip is mounted unconditionally; only its content is gated on
 * `source.stale`.** A region that enters the DOM already carrying its text is
 * commonly missed by assistive technology entirely, because `aria-live`
 * announces a CHANGE inside an existing region rather than the region's own
 * arrival.
 *
 * **`hidden open:flex`, never a bare `flex` — found the first time this
 * component was ever mounted in a real browser, in task 7 (2026-08-28), and
 * jsdom could not have caught it.** A closed native `<dialog>` paints nothing
 * because the UA stylesheet carries `dialog:not([open]) { display: none }` —
 * and that is a USER-AGENT-origin rule, which loses to ANY author-origin
 * declaration of the same property regardless of specificity or layers. A
 * bare, unconditional `flex` utility is exactly such a declaration, so the
 * dock rendered — visible, at its full open size — on every page, before
 * `open` was ever true, the entire time this component existed unmounted.
 * `hidden open:flex` keeps `display` conditional on the `[open]` attribute
 * `dialog.show()`/`dialog.close()` write, so the UA rule is the one deciding
 * "closed" and the author rule only ever adds "open, and it's a flex column."
 * jsdom 26 implements neither the dialog UA stylesheet nor real layout, so no
 * unit test here could see this — confirmed by mounting the real component
 * against the real dev server, not assumed.
 *
 * **`left-auto` is not decoration; without it `right-0` does nothing.** The
 * same UA stylesheet also sets `left: 0` unconditionally on every `<dialog>`,
 * and this component's author styles never named `left` at all — so with
 * `left: 0` (UA), `right: 0` (author), an explicit `width`, and `margin: 0`
 * (`m-0`) all in force at once, the box is over-constrained on the horizontal
 * axis. Per the CSS 2 spec's resolution rule for that case, the browser
 * drops `right` (in LTR) and solves from `left` instead — so the panel
 * rendered pinned to the LEFT edge, 420px wide, with `right: 0px` sitting
 * uselessly in its own computed style. `left-auto` removes `left` from the
 * over-constrained set, which is what lets `right: 0` actually decide where
 * the box sits.
 *
 * **`h-auto` overrides a THIRD UA default, `height: fit-content`, which is
 * not the same value as `auto`.** With `top` and `bottom` both specified and
 * `height: auto`, a fixed-position box stretches to fill between them —
 * that is the mechanism `bottom-0` is relying on to reach the foot of the
 * viewport. `fit-content` is a different value, sizing the box to its own
 * content instead, and nothing in this component's author styles had ever
 * set `height` at all — so the UA default was the only declaration for that
 * property and simply applied. Confirmed in the browser: 291px of content
 * height with `h-auto` absent, 944px (the full `viewport − top − bottom`)
 * with it present.
 *
 * **`bottom` is conditional on `collapsed`, and a whole-branch review found
 * the earlier version wrong.** `collapsed` used to gate only the body
 * (`{!collapsed && …}`); `bottom-0` stayed in force regardless, and
 * `bottom-0` is exactly the half of the mechanism above that stretches the
 * box to the foot of the viewport. So collapsing left a full-height, fully
 * OPAQUE (`bg-(--menu)`) panel with nothing painted below its header, still
 * covering whatever page was behind it — the whole screen, at 320px. The
 * spec this component implements says outright that collapsing on a narrow
 * viewport has to be "the only way to see whether what was typed did
 * anything", which a panel still covering the page cannot be. `collapsed`
 * now switches `bottom-0` for `bottom-auto`: with `bottom` no longer
 * specified and `height: auto`, the CSS 2 auto-height resolution for an
 * absolutely/fixed-positioned box falls through to sizing the box by its own
 * content — the header alone, since the body is the only thing
 * `{!collapsed && …}` was ever removing. `tests/e2e/page-source-dock.spec.ts`
 * measures both readings, at a wide viewport and at 320, and that a point the
 * expanded dock covers is visible through the collapsed one.
 *
 * @returns the `<dialog>` element. It renders unconditionally, whatever
 *   `open` says — a closed native dialog already paints nothing on its own,
 *   and the element has to stay mounted so the effect above always has a
 *   node to call `show()`/`close()` on the next time `open` changes.
 */
export function PageSourceDock({
  open,
  onClose,
  source,
  reference,
  labels,
}: PageSourceDockProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH_PX);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.show();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Clears a pending "copied" reset on unmount, so a timer outliving the
  // component never calls `setState` on it.
  useEffect(
    () => () => {
      if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // Position named once, exactly as `places` does it in `block-card.tsx` and
  // for the same reason: a parsed problem has no identity but where it lands
  // in this render's own array — problems are re-derived from the box on
  // every parse — and `react/no-array-index-key` reads the map callback's own
  // index parameter, not a value derived from it further down.
  const problemRows = source.problems.map((problem, at) => ({
    text: problemText(problem),
    key: `problem-${at}`,
  }));

  const resize = (next: number) => {
    // Mirrors the CSS clamp (`min-w-[20rem] max-w-[min(48rem,80vw)]`) in JS,
    // so a keyboard arrow past either bound cannot push `width` beyond what
    // the panel can ever actually render — the CSS clamp alone still holds,
    // but a `width` state wandering arbitrarily far past it is a control
    // reporting a size to itself that the page never shows.
    const ceiling = Math.min(MAX_WIDTH_REM_PX, window.innerWidth * 0.8);
    setWidth(Math.min(ceiling, Math.max(MIN_WIDTH_PX, next)));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      // Reverts the label on its own, so a second copy has feedback too —
      // without this the control read "Copied" permanently after the first
      // success. Any timer already pending is cleared first, so a rapid
      // second press restarts the window rather than firing early.
      if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Left alone on rejection rather than claiming success — a caller
      // whose clipboard write failed must not be told it worked.
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- `<dialog>` is the one element Escape is legitimately read from: a non-modal dialog gets no native Escape handling at all (that is `showModal()`'s job, which this component refuses), so this component provides it itself.
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      {...tid("page-source-dock")}
      className={cn(
        CHROME_SCOPE,
        // **`hidden open:flex`, never a bare `flex`.** The native UA
        // stylesheet's `dialog:not([open]) { display: none }` is what
        // actually keeps a closed dialog off the page — and it is
        // AUTHOR-origin-beats-user-agent-origin that decides this, not
        // specificity, so ANY unconditional `display` utility on this
        // element beats it regardless of layers. A bare `flex` here did
        // exactly that: the dock rendered, visible, before `open` was ever
        // true — confirmed on a real page, not assumed, since jsdom
        // implements neither the dialog UA stylesheet nor real layout.
        "fixed top-(--bar-top) right-0 left-auto z-40 m-0 hidden h-auto max-h-none flex-col open:flex",
        // **Collapsed drops `bottom-0` in favour of `bottom-auto`, which is
        // what shrinks the panel to its header** — see the mechanism this
        // component's own TSDoc explains above `@returns`. Kept out of the
        // shared string above so the wide-open case keeps its unconditional
        // `bottom-0` rather than fighting a second declaration of the same
        // property.
        collapsed ? "bottom-auto" : "bottom-0",
        "border-l border-(--edge) bg-(--menu) p-0 text-(--ink)",
        "w-(--dock-width) max-w-[min(48rem,80vw)] min-w-[20rem]",
        // Sheet mode overrides all three: `width` back to the media-scoped
        // `max-md:w-full` is not enough on its own, because the always-on
        // `max-w-[min(48rem,80vw)]` (frequently narrower than the viewport —
        // 80vw is 300px at 375px wide) and `min-w-[20rem]` still clamp the
        // USED width regardless of what the `width` property says. Measured
        // by compiling this exact class list through the installed
        // Tailwind: all four `max-md:` rules land in one later `@media`
        // block, after the three unprefixed ones, so they win the cascade at
        // a narrow viewport on ordinary specificity-tie source order.
        "max-md:inset-x-0 max-md:w-full max-md:max-w-none max-md:min-w-0",
      )}
      style={{ "--dock-width": `${width}px` } as CSSProperties}
    >
      <div className="relative flex size-full">
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a `role="separator"` splitter/grip is the WAI-ARIA APG's own window-splitter pattern: a keyboard-and-pointer-operable widget with no interactive HTML element to carry it. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={labels.resize}
          // **Required, not decorative.** A `role="separator"` that is
          // focusable (`tabIndex={0}`) is the WAI-ARIA APG's window-splitter
          // pattern, which the ARIA spec treats as a value widget rather than
          // a static divider — axe's `aria-required-attr` is what caught
          // their absence, the first time anything ever scanned this control
          // for accessibility at all. `aria-valuemax` mirrors the fixed
          // `MAX_WIDTH_REM_PX` bound rather than the dynamic `80vw` ceiling
          // `resize()` also clamps to: an approximation close enough for a
          // range announcement, computed with no risk of reading `window`
          // during a server render.
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTH_PX}
          aria-valuemax={MAX_WIDTH_REM_PX}
          tabIndex={0}
          {...tid("page-source-resize")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            resize(window.innerWidth - event.clientX);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              resize(width + RESIZE_STEP_PX);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              resize(width - RESIZE_STEP_PX);
            }
          }}
          className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none max-md:hidden"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-(--edge)/40 px-3 py-2">
            <h2 id={titleId} className="text-sm font-medium">
              {labels.title}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCollapsed((was) => !was)}
                aria-label={collapsed ? labels.expand : labels.collapse}
                {...tid("page-source-collapse")}
                className="rounded-md p-1.5 text-(--muted) hover:text-(--ink)"
              >
                <PanelRightClose
                  aria-hidden
                  className={cn("size-4", collapsed && "rotate-180")}
                />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={labels.close}
                {...tid("page-source-close")}
                className="rounded-md p-1.5 text-(--muted) hover:text-(--ink)"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>

          {!collapsed && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              {source.drifted && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-(--edge) bg-(--surface) px-2 py-1.5 text-xs">
                  <span>{labels.drifted}</span>
                  <button
                    type="button"
                    onClick={source.resync}
                    {...tid("page-source-resync")}
                    className="shrink-0 rounded-md bg-(--accent) px-2 py-1 text-(--on-accent)"
                  >
                    {labels.resync}
                  </button>
                </div>
              )}

              <textarea
                value={source.text}
                onChange={(event) => source.onChange(event.target.value)}
                onFocus={() => source.onFocusChange(true)}
                onBlur={() => source.onFocusChange(false)}
                aria-label={labels.sourceLabel}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                {...tid("page-source-textarea")}
                className="min-h-40 flex-1 resize-none rounded-md border border-(--edge) bg-(--surface) p-2 font-mono text-xs"
              />

              {/* **Mounted unconditionally, and only the children are
                  gated.** Assistive technology announces a CHANGE inside an
                  already-existing `aria-live` region; a region that enters
                  the DOM already carrying its text is commonly missed
                  entirely, because there was never a change to notice. So
                  this element persists across every render — `stale` true or
                  false — and it is the CONTENT beneath it that comes and
                  goes. */}
              <div
                aria-live="polite"
                {...tid("page-source-problems")}
                className={
                  source.stale
                    ? "grid gap-1 rounded-md border border-(--edge) bg-(--surface) px-2 py-1.5 text-xs"
                    : undefined
                }
              >
                {source.stale && (
                  <>
                    <p className="font-medium">{labels.stale}</p>
                    {problemRows.map((row) => (
                      <p key={row.key}>{row.text}</p>
                    ))}
                  </>
                )}
              </div>

              {/* **The copy button is a SIBLING of `<details>` ITSELF,
                  never a descendant of it at all — a round-1 review caught
                  the first fix wrong.** That version moved the button out of
                  `<summary>`, correctly avoiding `nested-interactive`, but
                  left it INSIDE `<details>` as a sibling of `<summary>` —
                  and a closed `<details>` renders none of its non-`<summary>`
                  children. Confirmed empirically against this repo's own
                  Chromium: a sibling `absolute` button inside a closed
                  `<details>` reports `visible: false`, and only becomes
                  `true` once the summary is clicked. So the control was
                  invisible and out of the tab order in its DEFAULT state,
                  with `pr-24` on the summary reserving space for a button
                  that was not there — and nothing caught it, because the
                  a11y case opens the dock but never expands the reference,
                  so axe scanned neither the original nor this fault. The
                  button is a sibling of `<details>` now, inside a `relative`
                  wrapper that also carries the border — so it renders in
                  BOTH states, positioned over the summary row exactly as
                  before, but never inside anything that collapses. */}
              <div className="relative rounded-md border border-(--edge)">
                <details>
                  <summary className="flex cursor-pointer items-center gap-2 py-1.5 pr-24 pl-2 text-xs font-medium">
                    {labels.referenceTitle}
                  </summary>
                  <pre className="overflow-x-auto px-2 pb-2 font-mono text-xs whitespace-pre-wrap">
                    {reference}
                  </pre>
                </details>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void copy();
                  }}
                  aria-label={copied ? labels.copied : labels.copyReference}
                  title={copied ? labels.copied : labels.copyReference}
                  {...tid("page-source-copy")}
                  className="absolute top-1 right-1.5 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-(--muted) hover:text-(--ink)"
                >
                  <Copy aria-hidden className="size-3.5" />
                  {/* **The idle control is the icon ALONE, and the width is
                      the whole reason.** Rendering `copyReference` here made
                      the button 227px wide against the 96px `pr-24` above
                      reserves for it — measured at 1440, 1100 and 320 — so an
                      absolutely-positioned button covered the CENTRE of the
                      `<summary>` it sits over, at every width. Pressing the
                      middle of a disclosure row that says "click me to
                      expand" copied instead, and at 320 the button covered
                      227px of a 293px row. Playwright found it by refusing to
                      click the summary; a person would have found it by
                      tapping one. The label comes back for `copied`, which is
                      ~75px and fits the reserve, because a confirmation
                      nobody can see is not a confirmation — the idle name is
                      carried by `aria-label` and `title` instead. */}
                  {copied ? labels.copied : null}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
