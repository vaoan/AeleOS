"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";
import {
  PAGE_THEME_ATTRIBUTE,
  PAGE_THEME_CHANGE_EVENT,
  setPageTheme,
} from "@/shared/application/page-theme";
import { THEME_CHANGE_EVENT } from "@/shared/application/theme";
import { tid } from "@/shared/infrastructure/test-id";

/** Translated strings {@link PageThemeSwitch} renders. *
 * One label, because there is one button. The light and dark labels went with
 * the options that became the toggle beside it.
 */
export interface PageThemeSwitchLabels {
  /**
   * Names the control: wear the colours this page's owner chose.
   *
   * One label, because there is one button. The light and dark labels went
   * with the options that became the toggle beside it.
   */
  author: string;
}

/** What {@link PageThemeSwitch} needs. */
export interface PageThemeSwitchProps {
  /** Already-translated strings. */
  labels: PageThemeSwitchLabels;
}

/**
 * Which of the three is showing, read off the document.
 *
 * A string rather than an object because `useSyncExternalStore` compares
 * snapshots by identity: returning a fresh object every call would re-render
 * forever.
 *
 * @returns `"author"`, `"light"` or `"dark"`.
 */
function getSnapshot(): string {
  const root = document.documentElement;
  if (root.getAttribute(PAGE_THEME_ATTRIBUTE) !== "default") return "author";
  return root.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Assumed while rendering on the server.
 *
 * The author's, matching the pre-paint script's own default and what a visitor
 * with no JavaScript gets.
 *
 * @returns `"author"`.
 */
function getServerSnapshot(): string {
  return "author";
}

/**
 * Subscribes to every source that can change which theme is showing.
 *
 * @param onChange - called when any of them changes.
 * @returns the unsubscribe function.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", PAGE_THEME_ATTRIBUTE],
  });
  globalThis.addEventListener(PAGE_THEME_CHANGE_EVENT, onChange);
  globalThis.addEventListener(THEME_CHANGE_EVENT, onChange);
  globalThis.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    globalThis.removeEventListener(PAGE_THEME_CHANGE_EVENT, onChange);
    globalThis.removeEventListener(THEME_CHANGE_EVENT, onChange);
    globalThis.removeEventListener("storage", onChange);
  };
}

/**
 * Lets a visitor choose between this page's own theme and the app's two.
 *
 * **The author's theme is what a visitor arrives to, and this is the way out.**
 * Both halves of that matter: a page nobody can leave the theme of is a page
 * somebody can be locked out of reading, and it is the existence of this
 * control that lets an author's colours be as unreadable as they like without
 * that being anybody else's problem.
 *
 * **A toggle rather than three options, because the third question moved.**
 * This was a group of three — the author's theme, light, and dark — which made
 * sense while it sat inside the page and was the only way to reach any of
 * them. It lives in the BAR now, beside the light/dark toggle, and two
 * controls both offering light and dark is one control too many.
 *
 * So this one answers only "am I wearing this author's colours", and the
 * toggle beside it answers "and which default otherwise". Those are genuinely
 * two questions — a visitor holds both answers at once, which is why
 * `data-page-theme` was never folded into `data-theme` — and each control now
 * asks exactly one of them.
 *
 * **Pressing the light/dark toggle takes this off.** That behaviour used to
 * live here, in the two options that wrote both attributes; it moved with the
 * question. Without it, pressing sun-or-moon while an author's theme is on
 * would change nothing a visitor can see, which is the accepts-a-press-and-
 * does-nothing failure this repository keeps catching.
 *
 * **It renders only where there is a theme to leave.** The caller decides; a
 * control offering to remove colours a page never had is a control that does
 * nothing, which is the shape of thing this repository has already got wrong
 * more than once.
 *
 * Its group is a `surface`, so the way out of a theme is drawn in that theme.
 *
 * Every colour it paints comes from a token — `--accent`, `--bar`, `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the switch.
 */
export function PageThemeSwitch({ labels }: PageThemeSwitchProps) {
  const showing = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const wearing = showing === "author";

  return (
    <button
      type="button"
      onClick={() => setPageTheme(wearing ? "default" : "author")}
      aria-pressed={wearing}
      aria-label={labels.author}
      title={labels.author}
      {...tid("page-theme-switch")}
      className={
        wearing
          ? "rounded-lg surface border-(--edge) bg-(--accent) p-1.5 text-(--on-accent)"
          : "rounded-lg surface border-(--edge)/0 p-1.5 text-(--muted)"
      }
    >
      <Palette className="size-4" aria-hidden />
    </button>
  );
}
