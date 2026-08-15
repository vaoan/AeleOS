import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, esES } from "@clerk/localizations";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { HtmlLang } from "@/shared/presentation/html-lang";
import { AppProviders } from "@/shared/presentation/app-providers";
import { NebulaCanvas } from "@/shared/presentation/nebula-canvas";
import { RouteProgress } from "@/shared/presentation/route-progress";
import { display, mono, sans } from "@/shared/infrastructure/fonts";
import { THEME_SCRIPT } from "@/shared/application/theme";
import { PAGE_THEME_SCRIPT } from "@/shared/application/page-theme";
import { routing } from "@/shared/infrastructure/i18n/routing";
import "@/app/globals.css";

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
 * **The root layout, and it lives inside `[locale]` on purpose.**
 *
 * There were two: an `app/layout.tsx` holding `<html>` and Clerk, with this one
 * nested beneath it. They are one now, because `next/root-params` can only
 * expose a segment that belongs to the ROOT layout — with `locale` one level
 * down, `import * as rootParams from "next/root-params"` failed the build with
 * "Export locale doesn't exist in target module". This is also next-intl's own
 * documented shape.
 *
 * What that bought: `requestLocale` and `setRequestLocale` are both deprecated,
 * and the second had to be called in every page before any translation was
 * read or that page silently lost static rendering — a step somebody had to
 * remember on each new route, whose only symptom was a slower page.
 *
 * Rejects an unknown locale with a 404 rather than falling back silently: the
 * segment is user-supplied, and quietly serving Spanish at `/fr/me` would make
 * a broken link look like a working page in the wrong language. The request
 * config underneath still falls back rather than throwing; the two layers are
 * deliberate and different.
 *
 * `ClerkProvider` sits outside `<html>` deliberately: it must enclose the whole
 * tree so that server components can read the session during render.
 *
 * The three font variables go on `<html>` rather than `<body>` because
 * `globals.css` styles `body` with `var(--font-sans)` — a variable set on the
 * same element would work, but the wider scope also lets Clerk's portalled
 * elements, which mount outside `body`'s subtree, inherit the same faces.
 *
 * **Two pre-paint scripts, and both must stay inline and synchronous.** The
 * first decides light or dark; the second decides whether a page that has an
 * owner's theme should wear it. Deferring either, moving it into a component,
 * or letting React apply it after hydration reintroduces a frame of the wrong
 * palette — and on a themed page that frame is the whole design changing under
 * the visitor. They are module constants with no interpolation, which is what
 * makes `dangerouslySetInnerHTML` safe here. Because the first sets
 * `data-theme` on `<html>` before hydration, that element carries
 * `suppressHydrationWarning` — scoped to its own attributes, so it cannot mask
 * a mismatch inside the page.
 *
 * Clerk's own strings are localised here rather than per component, because
 * every Clerk surface — the sign-in form, the account menu — has to speak the
 * same language as the page around it. Without this the form reads "Email
 * address" and "Continue" on an otherwise Spanish page.
 *
 * `NebulaCanvas` is mounted here rather than per page because it is the
 * window's background, not any page's content: a page that forgot it would lose
 * the design. `body` is `isolate` so the canvas's negative z-index stays behind
 * this app's content instead of competing with whatever a page renders.
 *
 * **`HtmlLang` stays**, even though this layout now renders `lang` itself. A
 * layout is not re-mounted across a navigation, so the document could otherwise
 * keep declaring the language it was first served with — the bug that component
 * was written for. It costs one effect and guards a fixed regression.
 *
 * `AppProviders` sits inside `NextIntlClientProvider` so that anything it
 * renders can still read translations, and wraps every localised page. It
 * carries every client provider a hook below here might need — the query client
 * and the nuqs adapter — and it is one component rather than two because the
 * second was once forgotten: `/fursonas` shipped using URL state with no
 * adapter mounted, and threw at every signed-in visitor. It adds no markup; a
 * page that uses no hook is unaffected by its presence.
 *
 * `RouteProgress` is mounted here for the same reason it listens on the
 * document: one bar serves the whole app, and it must survive the navigations
 * it reports on. Its label is resolved here because it is a client component,
 * so the catalogue lookup belongs on the server where the locale already is.
 *
 * @returns the whole document, for one locale.
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
  // Resolved here rather than inside RouteProgress: that component is a client
  // component, so its catalogue lookup belongs on the server, where the locale
  // already is. Same reason the shell resolves its own control labels.
  const t = await getTranslations("controls");

  return (
    <ClerkProvider localization={locale === "en" ? enUS : esES}>
      <html
        lang={locale}
        className={`${display.variable} ${sans.variable} ${mono.variable}`}
        // The theme script sets `data-theme` here before React hydrates, so the
        // client element legitimately carries an attribute the server did not
        // render. This suppresses that one expected mismatch; it applies only
        // to this element's own attributes, not to any subtree, so it cannot
        // hide a real hydration bug in the page.
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
          {/* Whether to wear the author's theme on a page that has one. Both
              scripts are module constants with no interpolation, which is what
              makes injecting them safe — see their own notes. */}
          <script dangerouslySetInnerHTML={{ __html: PAGE_THEME_SCRIPT }} />
        </head>
        {/* `isolate` gives the canvas its own stacking context, so its -z-10
            stays behind this app's content rather than competing with whatever
            a page happens to render. */}
        <body className="isolate min-h-screen antialiased">
          <NebulaCanvas />
          <NextIntlClientProvider>
            <AppProviders>
              <HtmlLang locale={locale} />
              <RouteProgress label={t("loading")} />
              {children}
            </AppProviders>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
