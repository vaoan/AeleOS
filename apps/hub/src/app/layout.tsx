import { ClerkProvider } from "@clerk/nextjs";
import { enUS, esES } from "@clerk/localizations";
import { getLocale } from "next-intl/server";
import { NebulaCanvas } from "@/shared/presentation/nebula-canvas";
import { display, mono, sans } from "@/shared/infrastructure/fonts";
import { THEME_SCRIPT } from "@/shared/application/theme";
import "./globals.css";

/**
 * The root layout, wrapping every page in Clerk's provider.
 *
 * `ClerkProvider` sits outside `<html>` deliberately: it must enclose the whole
 * tree so that server components can read the session during render.
 *
 * The three font variables go on `<html>` rather than `<body>` because
 * `globals.css` styles `body` with `var(--font-sans)` — a variable set on the
 * same element would work, but the wider scope also lets Clerk's portalled
 * elements, which mount outside `body`'s subtree, inherit the same faces.
 *
 * The theme script is inline and synchronous, and must stay that way. Deferring
 * it, moving it to a component, or letting React apply the theme after
 * hydration all reintroduce a light-themed first frame for every dark-mode
 * visitor. It is a module constant with no interpolation, which is what makes
 * `dangerouslySetInnerHTML` safe here. Because it sets `data-theme` on `<html>`
 * before hydration, that element carries `suppressHydrationWarning` — scoped to
 * its own attributes, so it cannot mask a mismatch inside the page.
 *
 * Clerk's own strings are localised here rather than per component, because
 * every Clerk surface — the sign-in form, the account menu — has to speak the
 * same language as the page around it. Without this the form reads "Email
 * address" and "Continue" on an otherwise Spanish page.
 *
 * `lang` comes from the negotiated locale rather than a constant. It was
 * hardcoded to "es" while every string was English, which told screen readers
 * and translation tools the wrong language on every page.
 *
 * Metadata lives in the locale layout, not here, because a title has to be
 * translated and this layout sits above the locale segment.
 *
 * `NebulaCanvas` is mounted here rather than per page because it is the
 * window's background, not any page's content: a page that forgot it would
 * lose the design. `body` is `isolate` so the canvas's negative z-index stays
 * behind this app's content instead of competing with whatever a page renders.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

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
        </head>
        {/* `isolate` gives the canvas its own stacking context, so its -z-10
            stays behind this app's content rather than competing with whatever
            a page happens to render. */}
        <body className="isolate min-h-screen antialiased">
          <NebulaCanvas />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
