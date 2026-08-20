"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import {
  otherTheme,
  setTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from "@/shared/application/theme";
import {
  PAGE_THEME_CHANGE_EVENT,
  setPageTheme,
} from "@/shared/application/page-theme";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What the control needs from its caller.
 *
 * **Two labels, and it used to be three.** The third said "these colours are
 * somebody's own" and went with the question mark: a themed page now has a
 * palette toggle of its own beside this one, so this control is only ever
 * naming a direction again.
 */
export interface ThemeToggleProps {
  /** Accessible name when the control will switch to dark. */
  toDarkLabel: string;
  /** Accessible name when the control will switch to light. */
  toLightLabel: string;
}

/**
 * Subscribes to theme changes from anywhere on the page.
 *
 * @param onChange - called when the theme changes.
 * @returns the unsubscribe function.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    // **Only `data-theme` now.** The icon named the author's theme while the
    // question mark existed; it names a direction again, and a direction
    // depends on nothing else. The `PAGE_THEME_CHANGE_EVENT` listener below
    // stays, because taking an author's theme off changes which default is in
    // force and the sun or moon must follow.
    attributeFilter: ["data-theme"],
  });
  globalThis.addEventListener(THEME_CHANGE_EVENT, onChange);
  globalThis.addEventListener(PAGE_THEME_CHANGE_EVENT, onChange);
  globalThis.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    globalThis.removeEventListener(PAGE_THEME_CHANGE_EVENT, onChange);
    globalThis.removeEventListener(THEME_CHANGE_EVENT, onChange);
    globalThis.removeEventListener("storage", onChange);
  };
}

/**
 * The theme currently on the document.
 *
 * @returns the applied theme.
 */
function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * The theme assumed while rendering on the server.
 *
 * @returns "light", matching the pre-paint script's own fallback.
 */
function getServerSnapshot(): Theme {
  return "light";
}

/**
 * A sun, shown when pressing would switch to light.
 *
 * @returns the icon.
 */
function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/**
 * A moon, shown when pressing would switch to dark.
 *
 * @returns the icon.
 */
function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8" />
    </svg>
  );
}

/**
 * What the button says and shows when it is offering one of the two defaults.
 *
 * The pair is returned together because they are one decision: a moon that
 * says "switch to light" is a state this shape cannot express, and it was two
 * nested ternaries that had to be kept in agreement by hand.
 *
 * @param next - the theme pressing would move to.
 * @param toDarkLabel - what to say when that is dark.
 * @param toLightLabel - what to say when that is light.
 * @returns the icon component and the label that belongs with it.
 */
function nextTheme(
  next: Theme,
  toDarkLabel: string,
  toLightLabel: string,
): { Icon: () => ReactElement; label: string } {
  return next === "dark"
    ? { Icon: MoonIcon, label: toDarkLabel }
    : { Icon: SunIcon, label: toLightLabel };
}

/**
 * Switches between the two themes.
 *
 * The icon shows the destination rather than the current state — a sun means
 * pressing takes you to light — because a control's job is to say what it will
 * do. The accessible name says the same thing in words.
 *
 * **Except while the page is wearing its author's theme, where it is a question
 * mark.** Neither light nor dark is in force then: the colours are somebody's
 * own, and a sun or a moon would be describing a state the page is not in.
 *
 * The nebula re-tints on its own: it watches the same `data-theme` attribute.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge`, `--ink` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Its icon and its accessible name are decided together in `nextTheme`, so a moon labelled "switch to light" is a state this shape cannot express.
 *
 *
 * **It clears an author's theme as well as setting the default**, which is
 * what the page theme switch's own light and dark options used to do. Without
 * it, pressing this on a themed page would change nothing a visitor can see.
 *
 * @returns the theme control.
 */
export function ThemeToggle({ toDarkLabel, toLightLabel }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = otherTheme(theme);
  const { Icon, label } = nextTheme(next, toDarkLabel, toLightLabel);

  return (
    <button
      type="button"
      // **It takes an author's theme off as well as setting the default.**
      // Otherwise, pressing this on a themed page would change nothing a
      // visitor can see — the accepts-a-press-and-does-nothing failure this
      // repository keeps catching. The behaviour is not new: it is what the
      // page theme switch's own light and dark options did before those two
      // questions were split across two controls.
      //
      // `setPageTheme` is a no-op on a page with no theme of its own, so this
      // costs the signed-in pages nothing.
      onClick={() => {
        setPageTheme("default");
        setTheme(next);
      }}
      aria-label={label}
      {...tid("theme-toggle")}
      className="grid size-[30px] place-items-center rounded-full text-(--ink-2) transition-colors hover:bg-(--edge)/20 hover:text-(--ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      <Icon />
    </button>
  );
}
