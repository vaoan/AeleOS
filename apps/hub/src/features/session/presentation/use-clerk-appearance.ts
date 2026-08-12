"use client";

import { useSyncExternalStore } from "react";
import {
  clerkAppearanceFor,
  type ClerkTheme,
} from "@/features/session/infrastructure/clerk-appearance";

/**
 * Subscribes to changes of the document's theme attribute.
 *
 * @param onChange - called whenever `data-theme` changes.
 * @returns the unsubscribe function.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

/**
 * The theme currently on the document.
 *
 * @returns "dark" or "light".
 */
function getSnapshot(): ClerkTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * The theme assumed while rendering on the server.
 *
 * @returns "light", matching the theme script's own fallback.
 */
function getServerSnapshot(): ClerkTheme {
  return "light";
}

/**
 * Clerk's appearance for whichever theme is currently applied.
 *
 * Clerk needs literal colours rather than `var()` references, so its palette
 * cannot simply follow the cascade — it has to be re-selected in JavaScript
 * when the theme changes. Watching `data-theme` is what makes the sign-in card
 * flip with the rest of the page instead of staying in one mode.
 *
 * @returns the appearance object to hand to a Clerk component.
 */
export function useClerkAppearance() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return clerkAppearanceFor(theme);
}
