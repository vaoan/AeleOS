import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HtmlLang } from "@/shared/presentation/html-lang";
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

  return (
    <NextIntlClientProvider>
      <HtmlLang locale={locale} />
      {children}
    </NextIntlClientProvider>
  );
}
