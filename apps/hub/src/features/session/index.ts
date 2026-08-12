/**
 * The session feature's public API — signing in, signing out, and deciding
 * which routes need a session at all.
 *
 * Everything outside this feature imports from here and never from a file
 * inside it. That is what lets the layers below be rearranged without a
 * caller noticing, and it is enforced by ESLint rather than by convention.
 */
export {
  SignInForm,
  type SignInFormProps,
} from "@/features/session/presentation/sign-in-form";
export {
  SsoCallback,
  type SsoCallbackProps,
} from "@/features/session/presentation/sso-callback";
export {
  SignOutControl,
  type SignOutControlProps,
} from "@/features/session/presentation/sign-out-button";
export { UserMenu } from "@/features/session/presentation/user-menu";
export { isPublicRoute } from "@/features/session/infrastructure/public-routes";
export {
  PROVIDERS,
  type Provider,
} from "@/features/session/infrastructure/providers";
