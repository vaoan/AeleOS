"use client";

import { useCallback, useState } from "react";

/** Which language the editor is currently writing in. */
export type AuthoringLanguage = "en" | "es";

/** What {@link useLanguageToggle} returns. */
export interface LanguageToggleState {
  /** The language the editor's fields are bound to. */
  lang: AuthoringLanguage;
  /** Switches to the other one. */
  toggle: () => void;
}

/**
 * Which language a fursona's content is being written in.
 *
 * One toggle rather than two sets of fields: a section with eight text fields
 * would otherwise put sixteen inputs on the screen.
 *
 * **This is not the interface language.** next-intl decides what the app says;
 * this decides which of a person's own fields they are editing. Tying them
 * would mean somebody reading the hub in Spanish could not start writing in
 * English without switching the whole interface — and the two choices have
 * nothing to do with each other.
 *
 * English is the starting side because a default has to be picked, not as a
 * statement about the audience; the interface itself falls back to Spanish.
 * Whichever side somebody is on, nothing anywhere nags about the other: an
 * unwritten `*_es` is an ordinary state, not an omission.
 *
 * @returns the current language and a way to switch it.
 */
export function useLanguageToggle(): LanguageToggleState {
  const [lang, setLang] = useState<AuthoringLanguage>("en");
  const toggle = useCallback(
    () => setLang((previous) => (previous === "en" ? "es" : "en")),
    [],
  );
  return { lang, toggle };
}
