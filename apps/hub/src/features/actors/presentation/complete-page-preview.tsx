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
 * The breathing room left under a pinned frame, in CSS pixels.
 *
 * Small on purpose: every pixel spent here shrinks the preview, because the
 * frame is scaled to fit what is left. It exists so a pinned preview does not
 * sit flush against the bottom of the window, which reads as cut off.
 */
const PIN_GAP = 16;

/**
 * Translated strings the complete page preview renders.
 *
 * It carries a name per DEVICE and a size hint per device, because the preview
 * is shown at a named viewport rather than at whatever width the editor has.
 * The hint is a RECORD rather than one string with placeholders: the catalogue
 * message is ICU, and next-intl refuses to render one whose values are
 * missing.
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
  /**
   * Says which viewport is being shown, one per device.
   *
   * Resolved per device rather than as one string with placeholders, because
   * the catalogue message carries ICU `{width}`/`{height}` and next-intl
   * throws at render when a `t()` does not supply them.
   */
  sizeHint: Record<PreviewDeviceId, string>;
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
 * **Below `sm` the label naming that size is announced but not shown, and the
 * distinction is the point.** The control row wrapped to three lines on a 320px
 * phone and took 170px of a 568px screen, where the pressed device button
 * already names the viewport. So the label is `sr-only` rather than `hidden`:
 * `display: none` would take the "this is not your own measure" guarantee from
 * exactly the people who cannot see that pressed button either. A caller may
 * assume the label is always in the accessibility tree while the disclosure is
 * open, and never that it occupies the row.
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
 * **It PINS, and the page's scroll scrubs it — one scrollbar, not two.** The
 * frame is a real device window, so a page taller than the device genuinely
 * overflows it, and that used to mean a second scroll region nested inside the
 * editor's. Growing the frame to its content's height would remove it and give
 * back everything this route was built for, because a 390×4000 window is not
 * one any visitor has. So the frame is held in place inside a spacer as tall
 * as the scaled distance its content can travel, and progress through the
 * spacer is written to the framed document as scroll. A caller may assume the
 * whole page is reachable: the spacer carries slack for the window below the
 * pinned frame, without which the last stretch cannot be scrolled to.
 *
 * A wheel over the frame is handed back to this page by `PreviewDocument`, so
 * the gesture and the driver never disagree.
 *
 * **The frame is scaled to fit the screen's HEIGHT as well as its width**, and
 * only because it pins: a sticky box taller than the window pins with its
 * lower half unreachable. That costs magnification a box scrolling inside
 * itself did not pay.
 *
 * **It is centred in a wrapper the size it actually appears.** A transform does
 * not change layout, so a scaled frame still reserves its unscaled width — and
 * a 390-wide phone left hard against the edge of a 1160-wide surround is the
 * opposite of the edges disappearing.
 *
 * **What it costs, measured rather than waved away.** Opening it boots a route
 * in a second document: 798 ms to first paint unthrottled and 7569 ms at a 6x
 * CPU throttle, on a six-section page — paid once per opening, not per edit,
 * and the disclosure starts closed. Every keystroke then crosses the boundary:
 * 1.000 posts per keystroke, because the animation frame BOUNDS a burst and
 * does not reduce typing. See the note beside that effect.
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
  const [headroom, setHeadroom] = useState(0);
  const [innerMax, setInnerMax] = useState(0);
  const contentId = useId();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const surroundRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const chosen =
    PREVIEW_DEVICES.find((entry) => entry.id === device) ?? PREVIEW_DEVICES[0]!;
  const scale = previewScale(chosen.width, available, chosen.height, headroom);

  /** The frame's height once scaled, which is the height it actually occupies. */
  const shown = chosen.height * scale;

  /**
   * How far the page must scroll to scrub the framed document end to end.
   *
   * Zero until measured, and zero for a page that fits its device — both mean
   * "there is nothing to scrub", and the spacer below then collapses to the
   * frame's own height.
   */
  const travel = innerMax * scale;

  /**
   * The extra spacer height that makes the END of the preview reachable.
   *
   * **Without it the last stretch of somebody's page cannot be looked at**,
   * and the arithmetic is not obvious enough to leave implicit. A pinned frame
   * finishes scrubbing when the spacer's bottom rises to meet the frame's
   * bottom — but the page stops scrolling when the DOCUMENT's bottom meets the
   * window's, and the frame's bottom sits `viewport - pin - shown` above that.
   * When the preview is the last thing on the page, as it is, those two
   * differ by exactly that much and the scrub is cut short.
   *
   * Measured before it was fixed: asked for 8632px of scroll, the page landed
   * at its own maximum of 7532, and 62% of the preview was all anybody could
   * reach. The driver clamps progress at one, so this is slack rather than
   * distance — it holds the frame pinned on the last screenful instead of
   * stretching the mapping.
   */
  const slack = Math.max(0, headroom + PIN_GAP - shown);

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

  // **The room down the screen is measured from where the frame PINS**, not
  // from the window's top, because everything above that offset is bar. The
  // offset is read back off the element rather than restated here: it is
  // `--bar-top-3` in `globals.css`, composed from the three bars it has to
  // clear, and a copy of that arithmetic in TypeScript is a second source of
  // truth that would drift the first time a bar changed height.
  useLayoutEffect(() => {
    const surround = surroundRef.current;
    if (!surround) return;
    const measure = () => {
      setAvailable(surround.clientWidth);
      const pinned = Number.parseFloat(getComputedStyle(surround).top);
      setHeadroom(
        Math.max(
          0,
          globalThis.innerHeight -
            (Number.isFinite(pinned) ? pinned : 0) -
            PIN_GAP,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surround);
    globalThis.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", measure);
    };
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

  // **One post per animation frame, which BOUNDS a burst and does not reduce
  // typing.** Measured rather than assumed, and the measurement corrected this
  // comment: at a 6x CPU throttle, 52 keystrokes at 12ms apart produced 52
  // posts — 1.000 per keystroke. CPU throttling slows JavaScript and not the
  // frame cadence, so a person typing faster than 16ms per key is the only case
  // this collapses, and people do not type that fast.
  //
  // What it does buy is a ceiling: nothing can post more than once a frame
  // however many changes arrive, which is the guarantee a programmatic burst
  // needs. If the per-keystroke cost ever matters, the change is a debounce
  // with a stated latency, not a smaller frame — and that is a decision about
  // how stale an author will tolerate their preview being, so it belongs in a
  // design rather than in a constant here.
  useEffect(() => {
    if (!open || !ready) return;
    const frame = requestAnimationFrame(send);
    return () => cancelAnimationFrame(frame);
  }, [open, ready, send]);

  /**
   * Watches how tall the framed page is, and takes its scroll away from it.
   *
   * The framed document refuses its own scroll — see `PreviewDocument`, which
   * owns that half — so what is measured here is only how far this component
   * has to drive it.
   */
  useEffect(() => {
    if (!open || !ready) return;
    const root = frameRef.current?.contentDocument?.documentElement;
    if (!root) return;
    const measure = () =>
      setInnerMax(Math.max(0, root.scrollHeight - chosen.height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (root.ownerDocument.body) observer.observe(root.ownerDocument.body);
    return () => observer.disconnect();
  }, [open, ready, chosen, blocks, theme]);

  /**
   * Scrubs the framed page as the editor scrolls past its pinned frame.
   *
   * **This is what buys one scrollbar without giving back the device
   * viewport.** The frame stays a real 390- or 768- or 1280-wide window, which
   * is the whole reason the preview is a separate document: a page's
   * background is `background-attachment: fixed`, so which slice sits behind a
   * section is decided by where that section is IN A WINDOW. Growing the frame
   * to its content's height would remove the inner scrollbar too, and would
   * re-open exactly that fault — a 390×4000 window is not one any visitor has.
   *
   * So the window stays, and the page's own scroll drives it: the spacer is as
   * tall as the frame plus the scaled distance the content can travel, the
   * frame pins for exactly that distance, and progress through the spacer maps
   * to progress through the document. One scaled page pixel of scrolling moves
   * the preview one apparent pixel, so it reads as one surface moving rather
   * than as a scrubber.
   *
   * Coalesced to one write per frame for the same reason the draft post is,
   * and it reads the pinned offset off the element for the same reason the
   * measurement above does.
   */
  useEffect(() => {
    if (!open) return;
    let queued = false;
    const drive = () => {
      queued = false;
      const scroller = scrollerRef.current;
      const surround = surroundRef.current;
      const window_ = frameRef.current?.contentWindow;
      if (!scroller || !surround || !window_) return;
      // `travel`, not the spacer's height: the spacer also carries `slack`,
      // and dividing by that would stretch the mapping so the preview never
      // quite reached its end.
      if (travel <= 0 || innerMax <= 0) return;
      const pinned = Number.parseFloat(getComputedStyle(surround).top);
      const passed =
        (Number.isFinite(pinned) ? pinned : 0) -
        scroller.getBoundingClientRect().top;
      const progress = Math.min(1, Math.max(0, passed / travel));
      window_.scrollTo(0, progress * innerMax);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(drive);
    };
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    globalThis.addEventListener("resize", onScroll, { passive: true });
    drive();
    return () => {
      globalThis.removeEventListener("scroll", onScroll);
      globalThis.removeEventListener("resize", onScroll);
    };
  }, [open, innerMax, travel]);

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
                  // **Visually hidden on a narrow screen, never removed.** The
                  // control row wraps to three lines on a 320px phone and takes
                  // 170px of a 568px screen; this is the line worth reclaiming,
                  // because the SELECTED DEVICE BUTTON already says which
                  // viewport is being shown and the numbers are the detail.
                  //
                  // `sr-only` rather than `hidden`, deliberately: the reason
                  // this label exists is that a narrowed page must never be
                  // mistaken for the author's own measure, and dropping it out
                  // of the accessibility tree would take that guarantee from
                  // exactly the people who cannot see the pressed button
                  // either. A viewport breakpoint is the right question here,
                  // unlike inside a block — this row sits in the page's own
                  // column, which IS sized by the window.
                  className="sr-only text-xs text-(--muted) sm:not-sr-only"
                >
                  {labels.sizeHint[device]}
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
        // **The spacer is the scroll distance, and the frame pins inside it.**
        // Its height is the frame's plus however far the framed page can
        // travel, so scrolling the editor through it scrubs the preview from
        // top to bottom and then releases — one scrollbar, the page's own.
        <div
          ref={scrollerRef}
          {...tid("preview-scroller")}
          style={{ height: shown + travel + slack }}
        >
          {/* **The surround paints NOTHING, and that is the correction.** It
              wore the author's own `--field` so the frame's edges would
              disappear into it — and achieved the opposite, because the
              frame's copy of that field is anchored to the FRAME's viewport
              while the surround's was stretched across the surround's box, so
              the two never lined up with each other, and neither lined up with
              the editor page's own atmosphere behind them. Transparent, the
              letterbox beside a phone-shaped frame is simply the editor,
              which is what it is.

              Its height is the scaled frame's, because a transform does not
              affect layout and the box would otherwise reserve the unscaled
              height. */}
          <div
            ref={surroundRef}
            id={contentId}
            {...tid("preview-surround")}
            className="sticky top-(--bar-top-3) flex w-full min-w-0 justify-center overflow-hidden"
            style={{ height: shown }}
          >
            {/* **The scaled box, so the frame CENTRES at any scale.** A
              transform does not change layout, so an iframe scaled from its
              top-left corner still reserves its unscaled width — which left a
              390-wide phone hard against the left edge of a 1160-wide
              surround, the opposite of edges disappearing. This wrapper is the
              size the frame actually appears, and it is what gets centred. */}
            <div
              className="relative shrink-0"
              style={{
                width: chosen.width * scale,
                height: chosen.height * scale,
              }}
            >
              <iframe
                ref={frameRef}
                src={`/${lang}/me/preview`}
                title={labels.title}
                width={chosen.width}
                height={chosen.height}
                {...tid("complete-page-preview-frame")}
                className="absolute top-0 left-0 block border-0"
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
