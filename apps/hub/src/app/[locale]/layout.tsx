import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HtmlLang } from "@/shared/presentation/html-lang";
import { AppProviders } from "@/shared/presentation/app-providers";
import { RouteProgress } from "@/shared/presentation/route-progress";
import { routing } from "@/shared/infrastructure/i18n/routing";

/**
 * Pre-renders one route per supported locale.
 *
 * Without this every localised page renders on demand, which turns the whole
 * app dynamic and gives up static rendering for pages that never change.
 *
 * @returns one params object per locale.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The page title and description, in the visitor's language.
 *
 * @returns metadata for this locale.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title"), description: t("description") };
}

/**
 * The layout every localised page renders inside.
 *
 * Rejects an unknown locale with a 404 rather than falling back silently: the
 * segment is user-supplied, and quietly serving Spanish at `/fr/me` would make
 * a broken link look like a working page in the wrong language.
 *
 * `setRequestLocale` must be called before any translation is read, or the
 * page opts out of static rendering.
 *
 * `HtmlLang` is here rather than in the root layout because the root sits above
 * this segment and is not re-rendered when the language control navigates
 * between locales — the document would keep declaring the language it was first
 * served with.
 *
 * `AppProviders` sits inside `NextIntlClientProvider` so that anything it
 * renders can still read translations, and wraps every localised page. It
 * carries every client provider a hook below here might need — the query
 * client and the nuqs adapter — and it is one component rather than two
 * because the second was once forgotten: `/fursonas` shipped using URL state
 * with no adapter mounted, and threw at every signed-in visitor. It adds no
 * markup; a page that uses no hook is unaffected by its presence.
 *
 * `RouteProgress` is mounted here for the same reason it listens on the
 * document: one bar serves the whole app, and it must survive the navigations
 * it reports on. Its label is resolved here because it is a client component,
 * so the catalogue lookup belongs on the server where the locale already is.
 *
 * @returns the localised subtree.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale)) notFound();
  setRequestLocale(locale);

  // Resolved here rather than inside RouteProgress: that component is a client
  // component, so its catalogue lookup belongs on the server, where the locale
  // already is. Same reason the shell resolves its own control labels.
  const t = await getTranslations("controls");

  return (
    <NextIntlClientProvider>
      <AppProviders>
        <HtmlLang locale={locale} />
        <RouteProgress label={t("loading")} />
        {children}
      </AppProviders>
    </NextIntlClientProvider>
  );
}
