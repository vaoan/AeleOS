"use client";

import { useSyncExternalStore } from "react";
import {
  otherTheme,
  setTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from "@/shared/application/theme";
import { tid } from "@/shared/infrastructure/test-id";

/** What the control needs from its caller. */
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
    attributeFilter: ["data-theme"],
  });
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
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
 * Switches between the two themes.
 *
 * The icon shows the destination rather than the current state — a sun means
 * pressing takes you to light — because a control's job is to say what it will
 * do. The accessible name says the same thing in words.
 *
 * The nebula re-tints on its own: it watches the same `data-theme` attribute.
 *
 * @returns the theme control.
 */
export function ThemeToggle({ toDarkLabel, toLightLabel }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = otherTheme(theme);

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? toDarkLabel : toLightLabel}
      {...tid("theme-toggle")}
      className="grid size-[30px] place-items-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-[var(--edge)]/20 hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {next === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
