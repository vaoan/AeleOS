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
 *
 * `clearsPageTheme` is what decides whether pressing also takes an author's
 * theme off, and it follows the presence of a way back rather than a guess
 * about where the control is.
 */
export interface ThemeToggleProps {
  /** Accessible name when the control will switch to dark. */
  toDarkLabel: string;
  /** Accessible name when the control will switch to light. */
  toLightLabel: string;
  /**
   * Whether pressing this also takes an author's theme off the page.
   *
   * **True only where there is a way back.** `PageShell` passes the page-theme
   * switch on a public page and nothing on a signed-in one, so that presence is
   * what this follows — see its own note.
   */
  clearsPageTheme?: boolean;
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
 * **It clears an author's theme as well as setting the default, but only where
 * something offers it back.** On a public page the page-theme switch sits
 * beside this control, so clearing is both safe and necessary — without it,
 * pressing on a themed page would change nothing a visitor can see. In the
 * signed-in bar there is no such switch, and since 2026-08-27 the editor themes
 * its own document with the draft: clearing there would discard the page
 * somebody is building with no way to restore it. A caller says which case it
 * is through `clearsPageTheme`, and `PageShell` derives that from whether it is
 * rendering the switch at all. The press still changes what somebody sees
 * either way, because every control is a `CHROME_SCOPE` island that follows the
 * light/dark choice.
 *
 * @returns the theme control.
 */
export function ThemeToggle({
  toDarkLabel,
  toLightLabel,
  clearsPageTheme = false,
}: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = otherTheme(theme);
  const { Icon, label } = nextTheme(next, toDarkLabel, toLightLabel);

  return (
    <button
      type="button"
      // **It takes an author's theme off as well as setting the default, but
      // only where there is a way back.** On a public page, pressing this
      // without clearing would change nothing a visitor can see — the
      // accepts-a-press-and-does-nothing failure this repository keeps
      // catching — and the page-theme switch beside it offers the author's
      // colours again.
      //
      // **In the EDITOR it must not clear, and that is new.** This used to say
      // `setPageTheme` was a no-op on a page with no theme of its own, so it
      // cost the signed-in pages nothing. That stopped being true on
      // 2026-08-27: the editor themes its own document with the draft, so
      // clearing would throw away the page its author is building — with no
      // page-theme switch in the signed-in bar to bring it back. Pressing this
      // there still changes what somebody sees, because every control is a
      // `CHROME_SCOPE` island that follows the light/dark choice.
      onClick={() => {
        if (clearsPageTheme) setPageTheme("default");
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
