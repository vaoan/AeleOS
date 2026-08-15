import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Loads the message catalogue for a locale.
 *
 * @param locale - a locale already validated against {@link routing}.
 * @returns the catalogue module.
 */
async function loadMessages(locale: string) {
  return import(`./messages/${locale}.json`);
}

/**
 * Resolves the locale and messages for each request.
 *
 * Mirrors Libra's `createAppRequestConfig`. An unrecognised locale falls back
 * to the default rather than throwing: the segment comes from the URL, so a
 * hand-typed or stale link must render a page in Spanish rather than a 500.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && routing.locales.includes(requested)
      ? requested
      : routing.defaultLocale;

  const catalogue = await loadMessages(locale);
  return { locale, messages: catalogue.default };
});
