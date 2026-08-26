"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import {
  lenientBlockSchema,
  type Block,
} from "@/features/actors/domain/block-schema";
import {
  PREVIEW_DEVICES,
  nearestDevice,
  previewScale,
  type PreviewDeviceId,
} from "@/features/actors/domain/preview-devices";
import type { PageContext } from "@/features/actors/presentation/blocks";
import {
  PREVIEW_DRAFT,
  isPreviewReady,
} from "@/features/actors/presentation/preview-message";
import { cn } from "@/shared/infrastructure/cn";
import { tid } from "@/shared/infrastructure/test-id";
import { WidePageColumn } from "@/shared/presentation/page-shell";

/**
 * Translated strings the complete page preview renders.
 *
 * It carries a name per DEVICE and a size hint now, because the preview is
 * shown at a named viewport rather than at whatever width the editor has.
 * `pages/labels.ts` builds the device record by mapping `PREVIEW_DEVICES`, so
 * a size added without a catalogue entry fails the build rather than rendering
 * its own id at somebody.
 */
export interface CompletePagePreviewLabels {
  /** Names the preview region. */
  title: string;
  /** Opens the complete page. */
  expand: string;
  /** Closes the complete page. */
  collapse: string;
  /** One name per entry in `PREVIEW_DEVICES`. */
  devices: Record<PreviewDeviceId, string>;
  /** Says which viewport is being shown. Carries `{width}` and `{height}`. */
  sizeHint: string;
}

/**
 * What {@link CompletePagePreview} needs to render the current draft.
 *
 * Unchanged in shape by the move to an iframe, which is the point: the same
 * four values that used to be handed to `PublicBlocks` inline are now the
 * payload that crosses to the preview document. See `PreviewDraft`.
 */
export interface CompletePagePreviewProps {
  /** The live block tree held by the form. */
  blocks: Block[];
  /** The live, unsaved page theme. */
  theme: ActorTheme;
  /** The authoring language used by the real renderer. */
  lang: AuthoringLanguage;
  /** Live actor facts and page-level rendering context. */
  page: PageContext;
  /** Already-translated disclosure and device labels. */
  labels: CompletePagePreviewLabels;
}

/**
 * Shows the complete live page as its own document, at a named device size.
 *
 * **It is an iframe of a real route, and that is the only way a preview can be
 * right about what sits BEHIND a page.** An inline preview shares the editor's
 * window, so `background-attachment: fixed`, `cover` and the outermost
 * container query all resolve against a box the workbench is in. Measured on a
 * real production page, that put up to 72.6% of a section's pixels somewhere
 * else while every box matched to the sub-pixel — and the controlling
 * measurement is that scrolling ONE document by 120px moved the same section's
 * backdrop by 71.2%. The two documents were never disagreeing; an inline
 * preview simply sits at a different scroll offset. See
 * `docs/superpowers/specs/2026-08-26-preview-route-design.md`.
 *
 * **The size is NAMED rather than fitted, and that is honesty rather than a
 * feature.** A framed preview is exactly as faithful as its viewport matches a
 * real one, so it is always at SOME size; filling the editor's width would
 * invent a viewport height no visitor has.
 *
 * **The draft crosses by `postMessage`, and nothing is sent before the document
 * announces itself.** Posting on the frame's `load` would rest on a premise
 * about what has already run — see `PreviewDocument`, which owns the other half
 * of that handshake.
 *
 * The frame is NOT remounted when the size changes: re-creating it would drop
 * the draft and restart the handshake, so an author flipping between sizes
 * would watch their page blank and rebuild each time.
 *
 * Its caller keeps it outside the drag context, so preview geometry cannot
 * become a drop target or alter collision measurement — and a separate document
 * is further isolated rather than less.
 *
 * @returns a read-only disclosure containing the current public page.
 */
export function CompletePagePreview({
  blocks,
  theme,
  lang,
  page,
  labels,
}: CompletePagePreviewProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<PreviewDeviceId>("desktop");
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(0);
  const contentId = useId();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const surroundRef = useRef<HTMLDivElement>(null);

  const chosen =
    PREVIEW_DEVICES.find((entry) => entry.id === device) ?? PREVIEW_DEVICES[0]!;
  const scale = previewScale(chosen.width, available);

  /**
   * Opens or closes the disclosure.
   *
   * **Both pieces of state move HERE rather than into effects**, and that is a
   * correctness point rather than a lint one: setting state synchronously in an
   * effect cascades a second render, and both of these are answers to an
   * EVENT. Opening resolves the default size from the author's own window,
   * which cannot be read during a server render and does not need to be —
   * nothing below is rendered until this has run. Closing tears the frame down,
   * so the next opening must wait for a fresh handshake rather than trusting
   * the last one.
   */
  const toggle = () => {
    if (open) setReady(false);
    else setDevice(nearestDevice(globalThis.innerWidth));
    setOpen((current) => !current);
  };

  useLayoutEffect(() => {
    const surround = surroundRef.current;
    if (!surround) return;
    const measure = () => setAvailable(surround.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surround);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame) return;
      if (event.origin !== globalThis.location.origin) return;
      if (event.source !== frame.contentWindow) return;
      if (isPreviewReady(event.data)) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /**
   * Posts the current draft, dropping anything mid-edit that cannot render.
   *
   * **The lenient parse happens HERE, on the sending side.** What crosses the
   * boundary must already be renderable, so the receiving document needs no
   * second schema — one free to drift from `block-schema` is the duplication
   * this feature has retired before.
   */
  const send = useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    const renderable = blocks.flatMap((block) => {
      const parsed = lenientBlockSchema.safeParse(block);
      return parsed.success ? [parsed.data] : [];
    });
    target.postMessage(
      { kind: PREVIEW_DRAFT, blocks: renderable, theme, page, locale: lang },
      globalThis.location.origin,
    );
  }, [blocks, theme, page, lang]);

  // **One post per animation frame.** Every keystroke in a leaf changes the
  // tree, and each post serialises it across a document boundary; a burst
  // arriving in one task is collapsed into the single state the author ended
  // on, which is the same argument `FrameCoalescedRange` makes for the dials.
  useEffect(() => {
    if (!open || !ready) return;
    const frame = requestAnimationFrame(send);
    return () => cancelAnimationFrame(frame);
  }, [open, ready, send]);

  return (
    <section
      {...tid("complete-page-preview")}
      className="mt-8 grid min-w-0 gap-3 pb-6 sm:pb-10"
    >
      <WidePageColumn className="flex-none py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">{labels.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {open ? (
              <>
                <span
                  {...tid("preview-size-hint")}
                  className="text-xs text-(--muted)"
                >
                  {labels.sizeHint
                    .replace("{width}", String(chosen.width))
                    .replace("{height}", String(chosen.height))}
                </span>
                <div className="flex items-center gap-1">
                  {PREVIEW_DEVICES.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setDevice(entry.id)}
                      aria-pressed={entry.id === device}
                      {...tid(`preview-device-${entry.id}`)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium",
                        entry.id === device
                          ? "bg-(--accent) text-(--on-accent)"
                          : "text-(--muted)",
                      )}
                    >
                      {labels.devices[entry.id]}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <button
              type="button"
              aria-controls={open ? contentId : undefined}
              aria-expanded={open}
              {...tid("complete-page-preview-toggle")}
              onClick={toggle}
              className="rounded-lg surface border-(--edge) px-3 py-2 text-sm font-medium"
            >
              {open ? labels.collapse : labels.expand}
            </button>
          </div>
        </div>
      </WidePageColumn>

      {open ? (
        // The surround wears the author's own field, so the frame's edges
        // disappear and it reads as one surface rather than a window bolted
        // into the workbench. Its height is the scaled frame's, because a
        // transform does not affect layout and the box would otherwise reserve
        // the unscaled height.
        <div
          ref={surroundRef}
          id={contentId}
          {...tid("preview-surround")}
          className="w-full min-w-0 overflow-hidden [background:var(--field)]"
          style={{ height: chosen.height * scale }}
        >
          <iframe
            ref={frameRef}
            src={`/${lang}/me/preview`}
            title={labels.title}
            width={chosen.width}
            height={chosen.height}
            {...tid("complete-page-preview-frame")}
            className="block border-0"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
