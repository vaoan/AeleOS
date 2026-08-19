"use client";

import { useEffect, useRef, useState } from "react";
import type { ResolvedEmbed } from "@/features/actors/domain/embeds";
import { EMBED_FIT, HEIGHT_REQUEST } from "@/shared/domain/embed-fit";

/**
 * How tall a frame is while it is being asked for its own height.
 *
 * One pixel rather than zero, because a frame with no height at all is one a
 * browser may treat as not worth loading. Nothing is painted at this size —
 * the ask happens before the provider's document has drawn anything — and the
 * BOX around it keeps the frame's resting height throughout, so nothing on the
 * page moves while the answer is outstanding.
 */
const MEASURING_HEIGHT = 1;

/** How long to wait between asks, in milliseconds. */
const ASK_INTERVAL = 400;

/**
 * How many times to ask before giving up and showing the frame at its resting
 * height.
 *
 * **The give-up is what makes a broken embed degrade instead of vanish.** A
 * Mastodon instance that is down, or that answers a federated post's `/embed`
 * with a 404 carrying `X-Frame-Options: DENY`, never replies to anything — and
 * without this the frame would stay one pixel tall forever. Twelve asks at
 * 400ms is a little under five seconds, against the ~20ms a live instance
 * takes to answer.
 */
const MAX_ASKS = 12;

/** What {@link EmbedFrame} needs. */
export interface EmbedFrameProps {
  /** The resolution to frame — its `src`, its origin and its measured height. */
  embed: ResolvedEmbed;
  /** The frame's accessible name, which falls back to the provider's own id. */
  title: string;
  /** The box's classes: its width cap, its resting height and its surface. */
  className: string;
}

/**
 * One third-party player or post, framed at the height it actually paints.
 *
 * **`resolveEmbed` decides the address, never the author, and never a
 * message.** What it returns is built from a fixed template on an allowlisted
 * host, so the value stored on the block cannot reach the frame — see that
 * function's TSDoc for the whole argument. A height arriving from the frame is
 * applied to the box's `height` and to nothing else; this component must never
 * grow a branch that puts either a stored value or a received one into `src`.
 *
 * **The only client component in the block tree, and it is a leaf.** Every
 * renderer around it is a server component and stays one — the container-query
 * work depends on that — so the boundary is drawn at the single element that
 * genuinely needs a `message` listener. Nothing above it hydrates.
 *
 * **What the server renders is what works without JavaScript.** The box gets
 * `embed.height` when the provider was measured, and otherwise the resting
 * height its shape's class carries; the frame fills it. Script only ever
 * REFINES that, so a reader with no JavaScript, or one looking before the
 * message lands, sees a sensible frame rather than a collapsed one. That is
 * also why `measuring` starts false and is turned on in an effect: starting it
 * true would put the collapsed frame in the server's HTML, which is the one
 * state that must never be what a page falls back to.
 *
 * **Two providers' worth of mechanism, and the difference is who speaks
 * first.** X/Twitter, Instagram and Telegram post their height unprompted and
 * post a fresh one whenever the frame's width changes, so the listener is the
 * whole implementation. Mastodon answers only when asked, and answers
 * `max(content, frame height)` — so the ask is made from a collapsed frame
 * ({@link MEASURING_HEIGHT}) and made again after a width change, since it
 * volunteers nothing.
 *
 * **The height lands on the FRAME and the box takes `auto`, which is not a
 * detail.** Everything here is `border-box` and the box carries the border, so
 * a height put on the box is the border's to spend first — the frame inside
 * then gets two pixels less than the number that was measured for it.
 * Measured in the real app rather than reasoned about: Spotify picks its card
 * from the viewport height it is handed and snaps DOWN at every boundary, so a
 * 152px box handed it 150 and it drew the **80px** card, and a 352px box
 * handed it 350 and it drew the 152px one. Tidal, TikTok and Telegram were
 * each cropped by exactly two pixels by the same arithmetic. Sizing the frame
 * and letting the box follow holds for any border width a skin declares, where
 * adding two pixels back would only have held for the one this was measured
 * at.
 *
 * **A message is checked on BOTH its origin and its source, and one without
 * the other is not a check.** Any frame on the page can send a message
 * claiming any shape, so `event.origin` against the provider's own origin
 * establishes who wrote it and `event.source === contentWindow` establishes
 * that it is about THIS frame — without the second, one embedded tweet's
 * height would resize every other frame on the page.
 *
 * The frame is sandboxed, lazy, and **asks for no autoplay permission**. A
 * profile that starts making noise at whoever opened it is the thing people
 * remember most fondly and least accurately about the pages this borrows from.
 *
 * **A frame with no accessible name falls back to the provider's own id.** An
 * `<iframe>` with an empty `title` is axe's `frame-title`, at WCAG level A,
 * and `title_en` is required by the schema — but this file never trusts a
 * caller's validation over its own rendering, and the provider is a true thing
 * to say about the frame rather than words invented for somebody's page.
 *
 * **Its props are taken as one named object rather than destructured in the
 * signature**, and that is a configuration fact rather than a preference:
 * `jsdoc` wants a `@param` for every destructured member and `tsdoc` refuses
 * the dotted identifier that would name one. Two tools fighting is a
 * configuration bug — see `NameableActor` in `domain/actor-content.ts`, which
 * met the identical pair.
 *
 * @param props - {@link EmbedFrameProps}.
 * @returns the framed player.
 */
export function EmbedFrame(props: EmbedFrameProps) {
  const { embed, title, className } = props;
  const ref = useRef<HTMLIFrameElement>(null);
  const [reported, setReported] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);

  const fit = EMBED_FIT.get(embed.provider);

  useEffect(() => {
    const frame = ref.current;
    if (!fit || !frame) return;

    let answered = false;
    let asked = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onMessage = (event: MessageEvent) => {
      // Both checks, every time. See this component's own TSDoc for why
      // either one alone is not a check at all.
      if (event.origin !== embed.origin) return;
      if (event.source !== frame.contentWindow) return;
      const height = fit.height(event.data);
      if (height === null) return;
      answered = true;
      clearTimeout(timer);
      setReported(height);
      setMeasuring(false);
    };
    window.addEventListener("message", onMessage);

    const stopListening = () => {
      window.removeEventListener("message", onMessage);
    };
    // A provider that volunteers its height needs nothing else: it posts on
    // load and posts again after every width change, entirely on its own.
    if (!fit.ask) return stopListening;

    let loaded = false;
    let lastWidth = -1;

    const ask = () => {
      if (answered) return;
      if (asked >= MAX_ASKS) {
        // Nothing answered. Put the frame back to its resting height rather
        // than leaving it collapsed: a post that cannot be measured is still a
        // post somebody should be able to read, and an instance serving a
        // federated post's `/embed` as a framed-denied 404 answers nothing at
        // all, forever.
        setMeasuring(false);
        return;
      }
      asked += 1;
      // Addressed to the provider's exact origin rather than to `*`, so the
      // request is dropped by the browser if the frame ever ends up somewhere
      // other than where it was allowed to load from.
      frame.contentWindow?.postMessage(HEIGHT_REQUEST, embed.origin);
      timer = setTimeout(ask, ASK_INTERVAL);
    };

    // Collapse first, then ask — an instance answers `max(content, frame)`,
    // so this is the difference between learning a post's height and being
    // told back the height we chose.
    const start = () => {
      answered = false;
      asked = 0;
      clearTimeout(timer);
      setMeasuring(true);
      if (loaded) ask();
    };

    // Asking before the frame has a document of its own is a message sent to
    // `about:blank`, which the browser drops for not matching the target
    // origin — so the first ask waits for `load`, and a later one (after a
    // width change) goes out immediately because by then it has one.
    const onLoad = () => {
      loaded = true;
      ask();
    };
    frame.addEventListener("load", onLoad);

    // A width change is the only thing that makes a reported height stale for
    // a provider that volunteers nothing. Only the WIDTH is compared: the
    // height changes every time this component answers its own question, and
    // reacting to that would be a loop.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      if (width === lastWidth) return;
      lastWidth = width;
      start();
    });
    observer.observe(frame);
    start();

    return () => {
      stopListening();
      frame.removeEventListener("load", onLoad);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [fit, embed.origin]);

  // A reported height wins over the measured constant, and the constant wins
  // over the shape's own class. Null is "this provider fills whatever it is
  // given", where the class is the whole answer.
  const known = reported ?? embed.height;
  // `auto` lets the box take the frame's own height plus its border; a number
  // holds the box still while the frame inside is collapsed for a measuring
  // pass; `undefined` leaves the shape's class in charge.
  const sized = known === null ? undefined : "auto";
  const boxHeight = measuring ? (reported ?? undefined) : sized;

  return (
    <div
      className={className}
      // **The height goes on the FRAME and the box sizes itself to it.** The
      // box carries the border, and every element here is `border-box` — so a
      // height put on the box is the border's to spend first, and the frame
      // inside gets two pixels less than the number. Measured in the real app:
      // Spotify picks its card from the viewport height it is handed and snaps
      // DOWN at every boundary, so a 152px box gave it 150 and it drew the
      // 80px card; a 352px box gave it 350 and it drew the 152px one. Tidal,
      // TikTok and Telegram were each cropped by exactly two pixels for the
      // same reason. `auto` here is what hands the number to the frame
      // instead, and it holds for any border width a skin declares rather than
      // for the 1px this happened to be measured at.
      //
      // While MEASURING there is no such number to give — that is the point of
      // the pass — so the box holds the last one it had, or the class's own
      // height on the first pass, and the page does not move.
      style={{ height: boxHeight }}
    >
      <iframe
        ref={ref}
        src={embed.src}
        title={title || embed.provider}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        // No `autoplay`. Everything else is what a player legitimately needs.
        allow="clipboard-write; encrypted-media; picture-in-picture; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        className="block w-full rounded-[inherit]"
        style={{ height: measuring ? MEASURING_HEIGHT : (known ?? "100%") }}
      />
    </div>
  );
}
