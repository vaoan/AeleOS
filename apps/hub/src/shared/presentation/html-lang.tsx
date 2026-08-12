"use client";

import { useEffect } from "react";

/** What the syncer needs to know. */
export interface HtmlLangProps {
  /** The locale this page was rendered for. */
  locale: string;
}

/**
 * Keeps `<html lang>` in step with the locale on a client navigation.
 *
 * The attribute is set on the server by the root layout, which sits *above*
 * the `[locale]` segment — so Next does not re-render it when the language
 * control navigates between locales. The URL and the copy became English while
 * the document still declared Spanish, which is the same wrong-language bug the
 * hardcoded `lang="es"` used to cause, arriving by a different route.
 *
 * Renders nothing. It exists only for the attribute.
 *
 * @returns null.
 */
export function HtmlLang({ locale }: HtmlLangProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
