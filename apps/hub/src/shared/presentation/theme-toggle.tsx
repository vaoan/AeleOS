"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import {
  otherTheme,
  setTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from "@/shared/application/theme";
import {
  PAGE_THEME_ATTRIBUTE,
  PAGE_THEME_CHANGE_EVENT,
} from "@/shared/application/page-theme";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What the control needs from its caller.
 *
 * Three labels, not two, because the control has three things to say: switch to
 * dark, switch to light, and "these colours are somebody's own". The third is
 * not a direction, which is why it needed a name of its own rather than one of
 * the other two doing double duty.
 */
export interface ThemeToggleProps {
  /** Accessible name when the control will switch to dark. */
  toDarkLabel: string;
  /** Accessible name when the control will switch to light. */
  toLightLabel: string;
  /**
   * Accessible name while the page is wearing its author's theme.
   *
   * Neither light nor dark is in force then, so the sun and the moon would both
   * be describing a state the page is not in.
   */
  authorLabel: string;
  /**
   * Whether the page is wearing somebody's own theme.
   *
   * Handed down rather than sniffed: a theme arrives as a `<style>` the page
   * emits, and the attribute this used to read is set on EVERY page — so
   * reading it alone put a question mark on the signed-in pages, where light
   * and dark are exactly what is in force.
   */
  themed?: boolean;
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
    // Both attributes: the reader's light/dark choice, and whether the page is
    // wearing its author's theme at all. The icon depends on the second as much
    // as on the first.
    attributeFilter: ["data-theme", PAGE_THEME_ATTRIBUTE],
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
 * Whether the page is wearing its author's theme rather than a default.
 *
 * **This is what the sun and the moon cannot say.** On a themed page neither
 * light nor dark is in force — the colours are the author's — so an icon
 * promising to "switch to dark" is describing a state the page is not in and a
 * destination it will not reach until the visitor leaves the theme first.
 *
 * Read from the attribute rather than from a store, because the pre-paint
 * script sets it before any bundle loads and matching on its ABSENCE is how a
 * visitor with no JavaScript still gets the author's theme.
 *
 * @returns true while the author's theme is in force.
 */
function wearingAuthorTheme(): boolean {
  return (
    document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE) !== "default"
  );
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
 * A question mark, shown while the page is wearing its author's theme.
 *
 * @returns the icon.
 */
function UnknownIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.4-3 4.2" />
      <path d="M12 18h.01" />
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
 * @returns the theme control.
 */
export function ThemeToggle({
  toDarkLabel,
  toLightLabel,
  authorLabel,
  themed = false,
}: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = otherTheme(theme);
  // **A question mark while the page is the author's**, because neither the
  // sun nor the moon is true then: the colours belong to whoever built the
  // page, and pressing takes the reader to a default they cannot currently
  // see. Subscribed above, so it changes the instant the visitor switches.
  const stillTheirs = useSyncExternalStore(
    subscribe,
    wearingAuthorTheme,
    // Rendered on the server as the author's, matching the pre-paint script,
    // which sets the attribute to "author" for every page.
    () => true,
  );
  // **Both halves.** The page has to HAVE a theme, and the visitor has to not
  // have taken it off. Either alone is wrong: the attribute is set on every
  // page, so it alone put a question mark on the signed-in ones.
  const authored = themed && stillTheirs;

  // The label and the glyph are one decision made twice, and they were two
  // nested ternaries that had to agree. Deciding once means they cannot drift
  // into a moon that says "switch to light".
  const { Icon, label } = authored
    ? { Icon: UnknownIcon, label: authorLabel }
    : nextTheme(next, toDarkLabel, toLightLabel);

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      {...tid("theme-toggle")}
      className="grid size-[30px] place-items-center rounded-full text-(--ink-2) transition-colors hover:bg-(--edge)/20 hover:text-(--ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      <Icon />
    </button>
  );
}
