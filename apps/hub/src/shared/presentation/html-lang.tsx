"use client";

import { useEffect, useLayoutEffect } from "react";
import {
  PAGE_THEME_ATTRIBUTE,
  PAGE_THEME_CHANGE_EVENT,
} from "@/shared/application/page-theme";
import {
  THEME_STORAGE_KEY,
  resolveTheme,
  THEME_CHANGE_EVENT,
} from "@/shared/application/theme";

/** What the syncer needs to know. */
export interface HtmlLangProps {
  /** The locale this page was rendered for. */
  locale: string;
}

/**
 * The visitor's page-theme choice, kept where the document cannot lose it.
 *
 * **`setPageTheme` deliberately persists nothing** — the choice lasts the visit
 * and is not remembered across pages, which is a decision with its own note in
 * the actors guide. That left the attribute on `<html>` as the only copy, and
 * `<html>` is replaced on a language change. This is that one value, held in the
 * module rather than in storage, so it survives the element without becoming
 * something a future visit inherits.
 */
let chosenPageTheme: string | null = null;

/**
 * Runs before paint in the browser and does nothing on the server.
 *
 * `useLayoutEffect` warns when React renders on the server, and this component
 * does render there — it is a client component, not a browser-only one.
 */
const useBeforePaint =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * Puts back the attributes a replaced `<html>` element takes with it.
 *
 * **This exists because the root layout owns `[locale]`.** That is what lets
 * `next/root-params` see the segment, which is what retires next-intl's
 * deprecated `requestLocale` and `setRequestLocale` — but it also means a
 * language change swaps the document element itself. Measured directly: a
 * marker attribute set by hand before the change was gone afterwards, so this is
 * a replacement rather than a re-render, and nothing set imperatively survives.
 *
 * Three attributes are at stake and they are not equal:
 *
 * - `lang` is rendered by the layout, so React puts it back on its own. It is
 *   still set here because a layout is not re-mounted on every navigation and
 *   the document once kept declaring the language it was first served with.
 * - `data-theme` is **recomputed, not remembered**: `resolveTheme` over storage
 *   and the media query is exactly what the pre-paint script computes, so this
 *   cannot drift from it.
 * - `data-page-theme` is the one genuinely held in memory, because nothing
 *   persists it by design.
 *
 * **The guarantee is weaker than the script's and that is worth being honest
 * about.** An inline script in `<head>` cannot be beaten by a paint; a layout
 * effect can only promise to run before React yields to the browser. On a first
 * load the script still does the work — this only covers the navigation that
 * replaces the element, where there is no script to run.
 *
 * Renders nothing. It exists only for the attributes.
 *
 * @returns null.
 */
export function HtmlLang({ locale }: HtmlLangProps) {
  useBeforePaint(() => {
    const root = document.documentElement;
    root.lang = locale;

    // Recomputed from the same inputs the pre-paint script reads, so the two
    // can never disagree about what the visitor asked for.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Storage throws in some privacy modes. The media query still answers.
    }
    root.dataset.theme = resolveTheme(
      stored,
      globalThis.matchMedia("(prefers-color-scheme: dark)").matches,
    );

    if (chosenPageTheme)
      root.setAttribute(PAGE_THEME_ATTRIBUTE, chosenPageTheme);
  }, [locale]);

  // Remember what the visitor picks, so the next replacement can put it back.
  useEffect(() => {
    const remember = () => {
      chosenPageTheme =
        document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE);
    };
    remember();
    globalThis.addEventListener(PAGE_THEME_CHANGE_EVENT, remember);
    globalThis.addEventListener(THEME_CHANGE_EVENT, remember);
    return () => {
      globalThis.removeEventListener(PAGE_THEME_CHANGE_EVENT, remember);
      globalThis.removeEventListener(THEME_CHANGE_EVENT, remember);
    };
  }, []);

  return null;
}
