import { providerOrigins } from "./embed-providers";

/**
 * Every origin this platform is willing to put in a frame.
 *
 * It lives in `shared/` rather than beside the embed resolver because **two
 * unrelated things depend on it and neither owns it**: the resolver builds
 * player addresses on these origins, and the content security policy allows
 * frames from them. Putting it in the actors feature would make `shared/csp.ts`
 * import a feature, which inverts the dependency rule the lint config enforces
 * — and the rule is right here, because this is a statement about the platform
 * rather than about fursonas.
 *
 * **It is derived from `EMBED_PROVIDERS` rather than listed.** The two used to
 * be separate lists pinned to each other by tests on both sides; deriving makes
 * the agreement structural instead of asserted, so a provider added to the
 * table is allowed in `frame-src` in the same edit. A host left here after its
 * provider was removed is now impossible rather than merely tested for.
 *
 * The import is RELATIVE, and that is load-bearing: `next.config.ts` imports
 * `csp.ts`, which imports this file, and Next transpiles that config without
 * the app's path aliases. An `@/` import builds under Vitest and then fails the
 * production build with MODULE_NOT_FOUND.
 */
export const PLAYER_ORIGINS: readonly string[] = providerOrigins();
