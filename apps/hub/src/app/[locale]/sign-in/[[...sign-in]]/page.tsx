import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageShell } from "@/components/page-shell";
import { SignInForm } from "@/components/sign-in-form";
import { SsoCallback } from "@/components/sso-callback";
import { PROVIDERS, type Provider } from "@/lib/providers";
import { tid } from "@/lib/test-id";

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
 * Not a centred hero: it uses the same header, column and card as every other
 * page, because it is the first thing a new person sees and it has to look like
 * the product rather than a detour into somebody else's service.
 *
 * @returns the sign-in page, or the callback handler on the return leg.
 */
export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string; "sign-in"?: string[] }>;
}) {
  const resolved = await params;
  const { locale } = resolved;
  setRequestLocale(locale);
  const t = await getTranslations("signIn");

  const afterSignInUrl = `/${locale}/me`;

  if (resolved["sign-in"]?.[0] === CALLBACK_SEGMENT) {
    return (
      <PageShell toggleLabel={(await getTranslations("nebula"))("toggle")}>
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

  return (
    <PageShell toggleLabel={(await getTranslations("nebula"))("toggle")}>
      <Card>
        <h1
          className="font-display text-2xl font-bold tracking-tight"
          {...tid("sign-in-title")}
        >
          {t("title")}
        </h1>
        <p className="mt-1 mb-6 text-[var(--ink-2)]">{t("subtitle")}</p>
        <SignInForm
          callbackUrl={`/${locale}/sign-in/${CALLBACK_SEGMENT}`}
          afterSignInUrl={afterSignInUrl}
          labels={labels}
          errorLabel={t("error")}
        />
      </Card>
    </PageShell>
  );
}
