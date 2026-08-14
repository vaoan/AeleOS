"use client";

import { useSyncExternalStore } from "react";
import { Moon, Palette, Sun } from "lucide-react";
import {
  PAGE_THEME_ATTRIBUTE,
  PAGE_THEME_CHANGE_EVENT,
  setPageTheme,
} from "@/shared/application/page-theme";
import { setTheme, THEME_CHANGE_EVENT } from "@/shared/application/theme";
import { tid } from "@/shared/infrastructure/test-id";

/** Translated strings {@link PageThemeSwitch} renders. */
export interface PageThemeSwitchLabels {
  /** Names the group of three. */
  title: string;
  /** Wear the colours this page's owner chose. */
  author: string;
  /** The app's own light theme. */
  light: string;
  /** The app's own dark theme. */
  dark: string;
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
  window.addEventListener(PAGE_THEME_CHANGE_EVENT, onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(PAGE_THEME_CHANGE_EVENT, onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
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
 * Three options rather than a toggle, because there genuinely are three: the
 * author's, and each of the app's own. A two-state control would have to guess
 * which default somebody wanted, and would lose that guess every time they
 * switched back.
 *
 * Choosing a default does two things at once — takes the author's theme off and
 * names which default replaces it — which is why the app's light/dark
 * preference is written as well. A visitor who picks light here has picked
 * light everywhere, which is what they meant.
 *
 * **It renders only where there is a theme to leave.** The caller decides; a
 * control offering to remove colours a page never had is a control that does
 * nothing, which is the shape of thing this repository has already got wrong
 * more than once.
 *
 * @returns the switch.
 */
export function PageThemeSwitch({ labels }: PageThemeSwitchProps) {
  const showing = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const options = [
    {
      value: "author",
      label: labels.author,
      icon: Palette,
      choose: () => setPageTheme("author"),
    },
    {
      value: "light",
      label: labels.light,
      icon: Sun,
      choose: () => {
        setPageTheme("default");
        setTheme("light");
      },
    },
    {
      value: "dark",
      label: labels.dark,
      icon: Moon,
      choose: () => {
        setPageTheme("default");
        setTheme("dark");
      },
    },
  ] as const;

  return (
    <div
      role="group"
      aria-label={labels.title}
      {...tid("page-theme-switch")}
      className="flex rounded-lg border border-[var(--edge)] bg-[var(--bar)] p-0.5"
    >
      {options.map(({ value, label, icon: Icon, choose }) => (
        <button
          key={value}
          type="button"
          onClick={choose}
          aria-pressed={showing === value}
          title={label}
          {...tid(`page-theme-${value}`)}
          className={
            showing === value
              ? "flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]"
              : "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--muted)]"
          }
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
