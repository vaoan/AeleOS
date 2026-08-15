import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
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
 * **The locale is read from Next's own root params**, not from a value passed
 * down. `requestLocale` was next-intl's workaround for a segment a Server
 * Component could not otherwise see, and it is deprecated now that
 * `next/root-params` exists — which also means `setRequestLocale` no longer has
 * to be called in every page before any translation is read. That call was a
 * step somebody had to remember on every new route, and forgetting it opted the
 * page out of static rendering silently.
 *
 * **An unrecognised locale still falls back to the default rather than
 * throwing**, and the layer above still 404s. The two are deliberate and
 * different: `[locale]/layout.tsx` refuses `/fr/me`, because quietly serving
 * Spanish there would make a broken link look like a working page in the wrong
 * language. This is the belt underneath that, so a value which somehow reaches
 * the config renders a page rather than a 500. next-intl's own example calls
 * `notFound()` here; we do not, on purpose.
 */
export default getRequestConfig(async () => {
  const requested = await rootParams.locale();
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const catalogue = await loadMessages(locale);
  return { locale, messages: catalogue.default };
});
