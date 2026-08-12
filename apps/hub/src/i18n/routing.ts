import { defineRouting } from "next-intl/routing";

/**
 * Builds the locale routing configuration.
 *
 * Mirrors Libra's `shared/i18n/createAppRouting` so the two apps read the same
 * and a person moving between the repositories does not have to relearn the
 * layer. It lives in the app rather than a shared package only because AeleOS
 * ships a single app; a package with one consumer would be the speculative
 * kind this repo declines to build.
 *
 * Both values are environment-driven so a deployment can change them without a
 * code change. AeleOS's defaults differ from Libra's on purpose: this is a
 * Colombian community, so Spanish is the fallback rather than English.
 *
 * Locale detection is left at next-intl's default, which reads
 * `Accept-Language`. The effect is that a visitor gets their browser's language
 * when it is one we support, and Spanish when it is not.
 *
 * @returns the routing configuration shared by the proxy, the navigation
 * helpers and the request config.
 */
export function createAppRouting() {
  return defineRouting({
    locales: (process.env.NEXT_PUBLIC_SUPPORTED_LOCALES || "es,en").split(","),
    defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE || "es",
  });
}

/**
 * The routing configuration for this app.
 *
 * A module-level singleton because the proxy, the layout and the request config
 * must agree; building it twice would let an environment change apply to some
 * of them and not others.
 */
export const routing = createAppRouting();
