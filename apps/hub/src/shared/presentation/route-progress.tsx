"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/shared/infrastructure/i18n/navigation";

/**
 * How long a navigation may take before it earns a bar.
 *
 * A prefetched route change completes in a frame or two. Showing a bar for that
 * long reads as a glitch rather than as feedback, so nothing appears until a
 * navigation has visibly failed to be instant.
 */
const SHOW_AFTER_MS = 180;

/**
 * When to stop believing a navigation is still happening.
 *
 * Not every submission ends in a route change: a form that comes back with
 * field errors stays exactly where it is. Without this the bar would sit at the
 * top of the page forever, which is worse than never having shown one.
 */
const GIVE_UP_MS = 8000;

/** What {@link RouteProgress} needs. */
export interface RouteProgressProps {
  /** Already-translated name for the bar, read by assistive technology. */
  label: string;
}

/**
 * Whether a click will navigate this tab, and so deserves a bar.
 *
 * Everything rejected here either opens elsewhere, downloads, or stays on the
 * page — and a bar for any of them would be a lie about what is happening.
 *
 * @param event - the observed click.
 * @returns true when this tab is about to navigate.
 */
function navigatesThisTab(event: MouseEvent): boolean {
  // `defaultPrevented` is deliberately NOT consulted, and the reason is easy to
  // get backwards. Next's `<Link>` prevents the default on every internal
  // navigation so it can route on the client — so filtering on it would
  // suppress the bar for precisely the navigations this exists for. The
  // listener is capture-phase anyway, which runs before any handler could have
  // set it.
  //
  // Middle and right clicks open elsewhere or open a menu.
  if (event.button !== 0) return false;
  // Modified clicks open a tab or a window, leaving this page where it is.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return false;

  const anchor = (event.target as Element | null)?.closest?.("a");
  if (!anchor) return false;
  if (anchor.hasAttribute("download")) return false;

  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;

  const href = anchor.getAttribute("href");
  if (!href) return false;

  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // A hash link scrolls; it does not fetch anything.
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  )
    return false;

  return true;
}

/**
 * A loading bar across the top of the window while a navigation is in flight.
 *
 * Mounted once, in the localised layout. It listens on the document rather than
 * being wired into each link, because `useLinkStatus` reports only the link it
 * is rendered inside — which cannot drive one bar for the whole app.
 *
 * Completion is detected from the pathname changing. `useSearchParams` is
 * deliberately not read: doing so in a layout opts the entire tree out of static
 * rendering, and a navigation that changes only the query string is not one
 * this component starts on anyway — those come from the router, not a click.
 *
 * Both listeners are capture-phase, so a handler that calls `stopPropagation`
 * cannot hide a navigation from the bar.
 *
 * Every colour it paints comes from a token — `--accent` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the bar while a navigation is pending, otherwise nothing.
 */
export function RouteProgress({ label }: RouteProgressProps) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [arrivedAt, setArrivedAt] = useState(pathname);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Arriving is the only success signal there is, so a new pathname hides the
  // bar. Adjusted during render rather than in an effect: React documents this
  // as the way to reset state when a value changes, and `set-state-in-effect`
  // rejects the effect version — that version schedules a second render pass,
  // which is exactly long enough to paint a bar for a navigation that landed.
  //
  // Nothing but state is touched here. Cancelling the timers belongs below,
  // because a ref may not be read or written during render either.
  if (pathname !== arrivedAt) {
    setArrivedAt(pathname);
    setPending(false);
  }

  // Cancel an unfired delay once we have arrived, so a navigation that
  // completed cannot raise a bar afterwards. Timers are macrotasks and this
  // runs on commit, so it always wins the race.
  useEffect(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, [arrivedAt]);

  useEffect(() => {
    const start = (): void => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [
        setTimeout(() => setPending(true), SHOW_AFTER_MS),
        setTimeout(() => setPending(false), GIVE_UP_MS),
      ];
    };

    const onClick = (event: MouseEvent): void => {
      if (navigatesThisTab(event)) start();
    };
    // Every submission in this app either redirects or comes back with errors;
    // the give-up timeout covers the second case.
    const onSubmit = (): void => start();

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      for (const t of timers.current) clearTimeout(t);
    };
  }, []);

  if (!pending) return null;

  return (
    <div
      role="progressbar"
      aria-label={label}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent"
    >
      {/* Indeterminate: nothing here knows how far along a navigation is, and a
          bar that pretends to would be inventing the number. `motion-reduce`
          holds it still and lets the colour alone say "working", matching how
          the nebula treats the same preference. */}
      <div className="size-full origin-left animate-[route-progress_1.4s_ease-in-out_infinite] bg-(--accent) motion-reduce:animate-none" />
    </div>
  );
}
