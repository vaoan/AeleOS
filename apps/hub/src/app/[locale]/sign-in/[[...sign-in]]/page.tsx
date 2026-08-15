import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageShell } from "@/shared/presentation/page-shell";
import {
  PROVIDERS,
  SignInForm,
  SsoCallback,
  type Provider,
} from "@/features/session";
import { tid } from "@/shared/infrastructure/test-id";
import { resolveAfterSignInUrl } from "@/shared/infrastructure/request-locale";

/** The catch-all segment Clerk returns to after a provider redirect. */
const CALLBACK_SEGMENT = "sso-callback";

/**
 * The sign-in page.
 *
 * The buttons are ours, not Clerk's `<SignIn />`. That component owns its own
 * DOM and insists on an email field, a password path and a sign-up link — none
 * of which exist in a social-login-first product with no passwords. Clerk still
 * does the authentication; only the interface is ours.
 *
 * The optional catch-all segment stays because the provider redirect returns to
 * `/sign-in/sso-callback`. Narrowing the route breaks the round trip.
 *
 * The header and its language, theme and nebula controls come from the shell,
 * so somebody can change language before signing in rather than after.
 *
 * Not a centred hero: it uses the same header, column and card as every other
 * page, because it is the first thing a new person sees and it has to look like
 * the product rather than a detour into somebody else's service.
 *
 * Where it sends someone once signed in is not always the profile: a
 * `redirect_url` query parameter — set by `signInUrlFor` when the proxy sent
 * a visitor here, or carried by whoever linked to `/sign-in` directly — is
 * resolved through `resolveAfterSignInUrl` and used for **both** sign-in
 * paths, the buttons and the SSO callback. Missing either would leave the
 * social-login path silently returning everyone to `/me`.
 *
 * `callbackUrl` carries the same `redirect_url` too, appended when there is a
 * real destination. It has to: Clerk uses `callbackUrl` directly, unresolved,
 * for the *first-time* social-login leg — a new person who has no session yet
 * and needs a sign-up step — while `afterSignInUrl` only ever reaches Clerk
 * for a *returning* one. Without it, every new user's destination was lost on
 * exactly the leg that mattered, silently landing them on `/me`.
 *
 * `searchParams`'s `redirect_url` is typed as Next actually reports it —
 * `string | string[]`, an array when the query key repeats — rather than
 * narrowed to `string`, so a crafted `?redirect_url=a&redirect_url=b` cannot
 * quietly type-check its way past `resolveAfterSignInUrl`'s own runtime check
 * and crash the one page that must always render.
 *
 * It paints nothing of its own: Clerk's form carries the colours, mapped from the same tokens in `clerkAppearanceFor`, so sign-in cannot drift from the app around it.
 *
 * @returns the sign-in page, or the callback handler on the return leg.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; "sign-in"?: string[] }>;
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const resolved = await params;
  const { locale } = resolved;
  setRequestLocale(locale);
  const t = await getTranslations("signIn");

  const { redirect_url: redirectUrl } = await searchParams;
  const afterSignInUrl = resolveAfterSignInUrl(redirectUrl, locale);

  if (resolved["sign-in"]?.[0] === CALLBACK_SEGMENT) {
    return (
      <PageShell>
        <Card>
          <p {...tid("sso-callback")}>{t("completing")}</p>
          <SsoCallback afterSignInUrl={afterSignInUrl} />
        </Card>
      </PageShell>
    );
  }

  const labels = Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider.id,
      t("continueWith", { provider: provider.name }),
    ]),
  ) as Record<Provider["id"], string>;

  const fallbackUrl = `/${locale}/me`;
  const callback = new URL(
    `/${locale}/sign-in/${CALLBACK_SEGMENT}`,
    "https://h.invalid",
  );
  if (afterSignInUrl !== fallbackUrl) {
    callback.searchParams.set("redirect_url", afterSignInUrl);
  }
  const callbackUrl = `${callback.pathname}${callback.search}`;

  return (
    <PageShell>
      <Card>
        <h1
          className="font-display text-2xl font-bold tracking-tight"
          {...tid("sign-in-title")}
        >
          {t("title")}
        </h1>
        <p className="mt-1 mb-6 text-(--ink-2)">{t("subtitle")}</p>
        <SignInForm
          callbackUrl={callbackUrl}
          afterSignInUrl={afterSignInUrl}
          labels={labels}
          errorLabel={t("error")}
        />
      </Card>
    </PageShell>
  );
}
