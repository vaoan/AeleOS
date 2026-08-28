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

/** The narrowest the panel may be dragged or arrowed to, in pixels. */
const MIN_WIDTH_PX = 320;

/** How far one Left/Right arrow press moves the grip, in pixels. */
const RESIZE_STEP_PX = 24;

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
 */
export interface PageSourceDockProps {
  /** Whether the panel is showing. */
  open: boolean;
  /**
   * The panel asked to close, by Escape or by its own close button.
   *
   * **This component never returns focus anywhere.** It is a `show()` dialog,
   * not a `showModal()` one, so nothing here traps focus in the first place —
   * the opener is the one holding the reference to whatever should get focus
   * back, and it is the opener's job to restore it once `open` becomes false.
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
 * different control.
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.show();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Position named once, exactly as `places` does it in `block-card.tsx` and
  // for the same reason: a parsed problem has no identity but where it lands
  // in this render's own array — problems are re-derived from the box on
  // every parse — and `react/no-array-index-key` reads the map callback's own
  // index parameter, not a value derived from it further down.
  const problemRows = source.problems.map((problem, at) => ({
    text: problemText(problem),
    key: `problem-${at}`,
  }));

  const resize = (next: number) => setWidth(Math.max(MIN_WIDTH_PX, next));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
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
        "fixed top-(--bar-top) right-0 bottom-0 z-40 m-0 flex max-h-none flex-col",
        "border-l border-(--edge) bg-(--menu) p-0 text-(--ink)",
        "max-w-[min(48rem,80vw)] min-w-[20rem]",
        "max-md:inset-x-0 max-md:w-full",
      )}
      style={{ "--dock-width": `${width}px` } as CSSProperties}
    >
      <div
        style={{ width: "var(--dock-width)" }}
        className="relative flex h-full max-md:w-full"
      >
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a `role="separator"` splitter/grip is the WAI-ARIA APG's own window-splitter pattern: a keyboard-and-pointer-operable widget with no interactive HTML element to carry it. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={labels.resize}
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

              {source.stale && (
                <div
                  aria-live="polite"
                  {...tid("page-source-problems")}
                  className="grid gap-1 rounded-md border border-(--edge) bg-(--surface) px-2 py-1.5 text-xs"
                >
                  <p className="font-medium">{labels.stale}</p>
                  {problemRows.map((row) => (
                    <p key={row.key}>{row.text}</p>
                  ))}
                </div>
              )}

              <details className="rounded-md border border-(--edge)">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium">
                  <span>{labels.referenceTitle}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void copy();
                    }}
                    aria-label={copied ? labels.copied : labels.copyReference}
                    {...tid("page-source-copy")}
                    className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-(--muted) hover:text-(--ink)"
                  >
                    <Copy aria-hidden className="size-3.5" />
                    {copied ? labels.copied : labels.copyReference}
                  </button>
                </summary>
                <pre className="overflow-x-auto px-2 pb-2 font-mono text-xs whitespace-pre-wrap">
                  {reference}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
