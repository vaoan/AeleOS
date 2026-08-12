import { auth } from "@clerk/nextjs/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageShell } from "@/components/page-shell";
import { Link } from "@/i18n/navigation";

/**
 * The home page — the only route reachable without a session.
 *
 * Public by way of `PUBLIC_ROUTES`; changing that list is what makes a route
 * reachable signed-out, not anything here.
 *
 * @returns the home page.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tNebula = await getTranslations("nebula");
  // Resolved on the server rather than with a client-side <Show>: the call to
  // action is the page's whole purpose, and rendering the wrong one first
  // would flash the wrong destination at every visitor.
  const { userId } = await auth();

  return (
    <PageShell toggleLabel={tNebula("toggle")}>
      <Card>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-lg text-[var(--ink-2)]">{t("tagline")}</p>
        <p className="mt-4 text-[var(--ink-2)]">{t("body")}</p>
        <div className="mt-6">
          <Link
            href={userId ? "/me" : "/sign-in"}
            className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[var(--on-accent)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {userId ? t("goToProfile") : t("signIn")}
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
