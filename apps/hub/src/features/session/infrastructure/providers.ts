import type { useSignIn } from "@clerk/nextjs";

/**
 * The OAuth strategy names Clerk accepts, derived from the call we make.
 *
 * Read off `signIn.sso()` rather than imported from a Clerk types package,
 * because the package holding that union is not a direct dependency and is not
 * resolvable under pnpm's strict layout. Deriving it also means it cannot drift:
 * if Clerk changes the parameter, this stops compiling.
 *
 * `enterprise_sso` is excluded — it is a different flow with different
 * parameters, and nothing here should be able to name it by accident.
 */
type SocialStrategy = Exclude<
  Parameters<ReturnType<typeof useSignIn>["signIn"]["sso"]>[0]["strategy"],
  "enterprise_sso"
>;

/**
 * A social provider the hub can sign in with.
 *
 * `strategy` is typed from Clerk's own union rather than a template literal, so
 * a provider Clerk does not support fails to compile instead of failing when
 * somebody clicks it.
 */
export interface Provider {
  /** Stable key, used for the test id and the brand mark. */
  id: "discord" | "google" | "facebook";
  /** Clerk's OAuth strategy name. */
  strategy: SocialStrategy;
  /** The provider's own name. Not translated — it is a proper noun. */
  name: string;
}

/**
 * The providers offered on the sign-in page, in the order they appear.
 *
 * Discord is first deliberately: it is the community's own home, it is the
 * connection most people already have, and it is the **only** one production
 * launches with. Google and Facebook follow later, so this list shrinking is
 * the plan rather than a regression.
 *
 * Adding one here is not enough on its own — the matching connection has to be
 * enabled in the Clerk dashboard, or the button appears and then fails.
 */
export const PROVIDERS: readonly Provider[] = [
  { id: "discord", strategy: "oauth_discord", name: "Discord" },
  { id: "google", strategy: "oauth_google", name: "Google" },
  { id: "facebook", strategy: "oauth_facebook", name: "Facebook" },
];
