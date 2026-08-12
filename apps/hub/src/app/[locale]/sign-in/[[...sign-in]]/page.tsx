import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageShell } from "@/components/page-shell";
import { SignInCard } from "@/components/sign-in-card";

/**
 * The sign-in page, rendering Clerk's component in our own shell.
 *
 * The optional catch-all segment is required by Clerk: it routes its own
 * sub-steps — factor-one, SSO callbacks — beneath this path. Narrowing the
 * route breaks those flows.
 *
 * Not a centred hero. It uses the same header, column and card as every other
 * page, because it is the first thing a new person sees and it has to look
 * like the product rather than a detour into someone else's service.
 *
 * The provider buttons are Clerk's and their number is not fixed here: the
 * development instance shows three, and production launches with Discord
 * alone. Fewer buttons after that switch is the plan, not a regression.
 *
 * @returns the sign-in page.
 */
export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("signIn");
  const tNebula = await getTranslations("nebula");

  return (
    <PageShell toggleLabel={tNebula("toggle")}>
      <Card>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 mb-6 text-[var(--ink-2)]">{t("subtitle")}</p>
        <SignInCard />
      </Card>
    </PageShell>
  );
}
