"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  bodyBackgroundVars,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { PublicBlocks } from "@/features/actors/presentation/blocks";
import {
  PREVIEW_READY,
  readPreviewDraft,
  type PreviewDraft,
} from "@/features/actors/presentation/preview-message";
import { ThemeScope } from "@/features/actors/presentation/theme-scope";
import { PageContent } from "@/shared/presentation/page-content";

/** What {@link PreviewBackdrop} needs to repeat the author's backdrop. */
interface PreviewBackdropProps {
  /** One screenful of the previewed device, in its own pixels. */
  height: number;
  /** The theme whose backdrop is being repeated. */
  theme: ActorTheme;
}

/**
 * One band's worth of the author's backdrop, as CSS.
 *
 * **Built from the same function `themeCss` builds `body`'s from**, so this is
 * one decision applied to a second element rather than a second decision free
 * to drift. Reading the computed style off `body` would also have been one
 * source, and needed an effect and a state to do after paint what this does
 * during render.
 *
 * `background-attachment` is the one thing deliberately not carried over:
 * `fixed` is exactly what banding undoes.
 *
 * @param theme - the theme being previewed.
 * @returns declarations for one band.
 */
function bandPaint(theme: ActorTheme): CSSProperties {
  const layers = bodyBackgroundVars(theme);
  return {
    // With no picture the body carries the field alone, and a gradient at its
    // default size fills whatever box it is given — which is the band.
    backgroundImage: layers["background-image"] ?? "var(--field)",
    backgroundRepeat: layers["background-repeat"] ?? "no-repeat",
    backgroundSize: layers["background-size"] ?? "cover",
    backgroundAttachment: "scroll",
  };
}

/**
 * Draws one backdrop band per screenful, behind everything.
 *
 * **The count is measured, not derived from the draft.** How tall the page ends
 * up is decided by what the blocks render to, which nothing upstream knows —
 * so it is observed with a `ResizeObserver` and the band count follows. A page
 * that grows while somebody types grows its backdrop with it.
 *
 * A negative z-index puts it below the canvas, which is where `body`'s own
 * background sat: field, then canvas, then the page. Copying the order matters
 * as much as copying the paint.
 *
 * @returns the band layer.
 */
function PreviewBackdrop({ height, theme }: PreviewBackdropProps): ReactNode {
  const paint = bandPaint(theme);
  const [bands, setBands] = useState(1);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () =>
      setBands(Math.max(1, Math.ceil(root.scrollHeight / height)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (document.body) observer.observe(document.body);
    return () => observer.disconnect();
  }, [height]);

  return (
    <div
      aria-hidden
      data-testid="preview-backdrop"
      style={{
        position: "absolute",
        // **`inset: 0` and CLIPPED, rather than a height of its own.** Given an
        // explicit `bands * height` it contributed to the document's scrollable
        // overflow, so the page rounded UP to a whole number of screenfuls —
        // the frame is sized from that scroll height, so a nine-section page
        // grew blank space beneath it and stopped growing when a section was
        // added inside the same band. Clipping keeps the bands out of the
        // measurement entirely, and trims the final partial band exactly where
        // the page ends, which is where a visitor's last screenful is cut too.
        inset: 0,
        overflow: "clip",
        zIndex: -20,
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: bands }, (_, band) => (
        <div
          key={band}
          data-testid="preview-backdrop-band"
          style={{
            ...paint,
            position: "absolute",
            insetInline: 0,
            top: band * height,
            height,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Somebody's draft page, rendered as its own document.
 *
 * **This is the whole point of the preview route: a second VIEWPORT.** An
 * inline preview shares the editor's window, so everything anchored to the
 * viewport — `background-attachment: fixed`, `cover`, the outermost container
 * query — resolves against a box the workbench is in. Measured on a real page,
 * that put up to 72.6% of a section's pixels somewhere else while every box
 * matched to the sub-pixel; the controlling measurement is that scrolling ONE
 * document by 120px moved the same section's backdrop by 71.2%. The two
 * documents were never disagreeing. See
 * `docs/superpowers/specs/2026-08-26-preview-route-design.md`.
 *
 * **It holds nothing of its own and reads nothing.** No actor, no auth, no
 * visibility decision — so this is not a second place deciding what may be
 * shown, which `PublicProfile`'s own note forbids, and a stranger who opens
 * the URL gets an empty document. If the channel ever fails, the preview is
 * visibly EMPTY rather than quietly showing content the author would read as
 * their draft.
 *
 * **It announces itself rather than waiting to be found.** The parent sends
 * nothing until this posts `PREVIEW_READY`, because the obvious alternative —
 * the parent posting on the iframe's `load` — rests on a premise about what
 * has already run. `load` says the document loaded, not that this effect has
 * committed. Rule 26 in the root `CLAUDE.md` is that exact shape, and its
 * failure mode is not a flake that gets rarer on a fast machine but a
 * deterministic loss on a heavier page.
 *
 * The announcement is posted AFTER `addEventListener` in the same effect, so
 * there is no window in which the parent can answer a listener that does not
 * exist yet.
 *
 * @returns the draft page, or nothing until one arrives.

 * **It draws the author's backdrop once per screenful, not once per page.**
 * The frame is as tall as this document, so a `background-attachment: fixed`
 * backdrop would stretch one copy over everything; a visitor sees it fill their
 * window and re-anchor as they scroll. A caller may assume the bands tile from
 * the top with no gap and are clipped where the page ends, and that `body`
 * itself paints no backdrop while they are drawn. See {@link PreviewBackdrop}.
 *
 * **It keeps its own scrolling and needs no gesture forwarding.** The frame is
 * given the height of this document's content, so there is nothing here to
 * scroll and a wheel over it chains to the page that frames it on its own. An
 * earlier arrangement pinned the frame at a device height and drove this
 * document's scroll from the parent; forwarding the wheel existed to stop the
 * two disagreeing, and went with it.
 */
export function PreviewDocument(): ReactNode {
  const [draft, setDraft] = useState<PreviewDraft | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Both, and neither alone: an origin check by itself lets any document
      // on this origin drive the preview, and a source check by itself lets
      // any document claim to be the parent. `EmbedFrame` established this.
      if (event.origin !== globalThis.location.origin) return;
      if (event.source !== window.parent) return;
      const next = readPreviewDraft(event.data);
      if (next) setDraft(next);
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { kind: PREVIEW_READY },
      globalThis.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!draft) return null;

  return (
    <ThemeScope theme={draft.theme}>
      {draft.deviceHeight > 0 ? (
        <>
          {/* **`body` must stop painting, and this has to outrank `themeCss`.**
              Its one stretched copy would otherwise show through wherever the
              bands do not reach. `themeCss` emits the body backdrop behind a
              `:root:not([data-page-theme="default"])` gate, which outranks a
              bare `body` selector — so a plain rule here loses in silence, and
              did on its first run. `!important` rather than a matching gate
              copied by hand: the gate is that function's to change, and a copy
              of it here would be a second place to keep in step. */}
          <style>{"body{background-image:none!important}"}</style>
          <PreviewBackdrop height={draft.deviceHeight} theme={draft.theme} />
        </>
      ) : null}
      {/* `full`, so each depth-0 section applies its own measure and bleed
          exactly as it does on a public route. A column here would cap the two
          widest measures and stop a bled section reaching either edge. */}
      <PageContent width="full">
        <PublicBlocks
          blocks={draft.blocks}
          locale={draft.locale}
          page={draft.page}
        />
      </PageContent>
    </ThemeScope>
  );
}
