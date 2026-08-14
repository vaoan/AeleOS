import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/shared/infrastructure/i18n/navigation";
import { AppNav } from "@/shared/presentation/app-nav";
import { PageShell } from "@/shared/presentation/page-shell";
import { UserMenu } from "@/features/session";

/**
 * The shell for signed-in pages.
 *
 * **This layout protects.** It calls `auth.protect()` itself rather than
 * trusting the proxy, so a session is required by the resource and not only by
 * a path pattern.
 *
 * That is deliberate defence in depth, and Clerk's own reasoning for
 * deprecating `createRouteMatcher`: middleware matching can diverge from how
 * Next actually routes a request, leaving a protected resource reachable. This
 * repository has already seen that divergence — adding a `[locale]` segment
 * changed every path, and `PUBLIC_ROUTES` had to be widened to match. A route
 * the matcher misses is still protected here.
 *
 * The proxy check stays as the outer gate, because it redirects before any
 * rendering happens and keeps the sign-in bounce fast.
 *
 * It redirects to our own sign-in page, in the visitor's language, rather than
 * calling bare `auth.protect()`. That helper falls back to Clerk's hosted
 * Account Portal — measured, by making this route public in the proxy and
 * watching where the fallback sent the request — and nobody may land on a
 * Clerk-branded address.
 *
 * **It asks for the wide shell**, and the narrow one was close to a bug rather
 * than a preference. Every signed-in page took the `column` default: a 620px
 * measure with `justify-center`. That is what `PageShell` itself calls right
 * for a short card and wrong for a long list — and the fursona list, the
 * editor and its section stack are all long lists. On any ordinary screen they
 * used about a third of it and started below the fold.
 *
 * A page that wants a narrow measure can still have one: `Card` and the
 * editor's own column constrain themselves inside this. The shell's job is to
 * stop wasting the window, not to decide how wide a paragraph should be.
 *
 * It uses the same `PageShell` as the public pages — which now carries the
 * language and theme controls itself — and adds the user button,
 * so signing in changes what is on the page rather than what the page looks
 * like.
 *
 * It also fills the shell's two wayfinding slots, which only make sense once
 * somebody is signed in: the section links, and a wordmark pointing at `/me`
 * rather than the public home page. Both are supplied here rather than decided
 * inside the shell, because this is the layer that already knows there is a
 * session — it is the layer that required one.
 *
 * The `nav` labels are resolved here for the same reason the shell resolves its
 * own: `AppNav` is a client component, so its catalogue lookup has to happen on
 * the server, and this is the server component that renders it.
 *
 * @returns the signed-in shell.
 */
export default async function AppLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { userId } = await auth();
  if (!userId) {
    const { locale } = await params;
    redirect({ href: "/sign-in", locale });
  }

  // Resolved here rather than inside AppNav: that component is a client
  // component (the active section comes from the current path), and the
  // catalogue lookup belongs on the server where the locale already is.
  const t = await getTranslations("nav");

  return (
    <PageShell
      width="wide"
      trailing={<UserMenu />}
      homeHref="/me"
      nav={
        <AppNav
          labels={{
            ariaLabel: t("ariaLabel"),
            me: t("me"),
            fursonas: t("fursonas"),
          }}
        />
      }
    >
      {children}
    </PageShell>
  );
}
