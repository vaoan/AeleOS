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
 * The two are pinned to each other by tests on both sides. A provider added to
 * the resolver without this list would resolve correctly and then be blocked by
 * the browser — an empty box on somebody's page with nothing in the network tab
 * to explain it. A host left here after its provider was removed would be a
 * frame origin nobody meant to keep allowing.
 */
export const PLAYER_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
] as const;
